import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import {
  CLIENT_FUNNEL_EVENTS,
  MAX_CLIENT_FUNNEL_EVENTS_PER_REQUEST,
  clientFunnelRateLimiter,
  foldFunnelCounts,
  isClientFunnelEventName,
  namespacedDedupeKey,
  readTrafficClassSince,
  recordFunnelEvent,
} from "@/lib/funnel";
import { requestRateLimitKey, requestTrafficClass } from "@/lib/traffic-filter";

export const dynamic = "force-dynamic";

type FunnelCountRow = {
  event_name: string;
  traffic_class: string | null;
  count: string;
};

type FunnelEventRow = {
  id: string;
  event_name: string;
  audit_id: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
};

/**
 * Comparaison à temps constant pour éviter de laisser fuiter la clé octet par octet.
 */
function secretMatches(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * GET public = compteurs agrégés UNIQUEMENT.
 *
 * `recent_events` exposait 100 événements bruts (audit_id, source, metadata →
 * noms de marques auditées, scores, URLs de rapports) à qui appelait l'URL :
 * fuite business + données clients identifiables (RGPD). Les compteurs suffisent
 * au monitoring et ne révèlent aucun client.
 *
 * `counts_by_traffic_class` (29/07) reste dans le lot public : c'est un compteur
 * de plus, sans identifiant, sans metadata, sans IP ni User-Agent. Il répond à la
 * seule question qui rendait les compteurs bruts inexploitables — « ces audits
 * sont-ils des humains ? » — sans rien ouvrir de nouveau.
 *
 * Le détail reste accessible avec le header `x-funnel-key` == FUNNEL_ADMIN_KEY.
 * Si la variable d'env n'est pas définie, le mode détaillé est simplement
 * indisponible — jamais ouvert par défaut.
 */
export async function GET(req: NextRequest) {
  await ensureAuditSchema();

  const adminKey = process.env.FUNNEL_ADMIN_KEY;
  const detailed = secretMatches(req.headers.get("x-funnel-key"), adminKey);

  // Une seule requête groupée : `counts` est DÉRIVÉ de la ventilation par
  // `foldFunnelCounts`, donc la somme des 4 classes ne peut pas diverger du total.
  const countsResult = await pool.query<FunnelCountRow>(
    `SELECT event_name, metadata->>'trafficClass' AS traffic_class, COUNT(*)::text AS count
     FROM audit_funnel_events
     WHERE created_at >= now() - interval '14 days'
     GROUP BY event_name, metadata->>'trafficClass'`
  );

  const { counts, countsByTrafficClass } = foldFunnelCounts(countsResult.rows);

  // Date de rupture de mesure, sur la table ENTIÈRE et non sur 14 jours : aucun
  // ratio humain/total calculé à cheval sur cette date ne veut dire quoi que ce
  // soit, puisque tout ce qui précède compte en `unknown`. Requête, index partiel
  // et mémoïsation : voir `readTrafficClassSince`.
  const trafficClassSince = await readTrafficClassSince();

  const trafficBreakdown = {
    counts_by_traffic_class: countsByTrafficClass,
    traffic_class_since: trafficClassSince ? new Date(trafficClassSince).toISOString() : null,
  };

  if (!detailed) {
    return NextResponse.json(
      { ok: true, window: "14d", counts, ...trafficBreakdown },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const recentResult = await pool.query<FunnelEventRow>(
    `SELECT id, event_name, audit_id, source, metadata, created_at
     FROM audit_funnel_events
     ORDER BY created_at DESC
     LIMIT 100`
  );

  return NextResponse.json(
    {
      ok: true,
      window: "14d",
      counts,
      ...trafficBreakdown,
      recent_events: recentResult.rows.map((row) => ({
        id: row.id,
        event_name: row.event_name,
        audit_id: row.audit_id,
        source: row.source,
        metadata: row.metadata ?? {},
        created_at: row.created_at.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * POST = enregistrement des événements émis par le NAVIGATEUR.
 *
 * Cette route est le point d'entrée client du funnel. Depuis le 29/07 elle
 * MARQUE au lieu de JETER : les événements serveur (`audit_started`,
 * `audit_completed`) portent eux aussi leur `trafficClass`, et le tri se fait à
 * la LECTURE (`counts_by_traffic_class`). Refuser l'écriture ici revenait à
 * filtrer le numérateur sans filtrer le dénominateur, et à détruire une donnée
 * qu'aucun traitement a posteriori ne pouvait reconstituer.
 *
 * Aucune erreur HTTP n'est renvoyée : un crawler qui reçoit un 4xx réessaie, et
 * un navigateur interne n'a rien à corriger. On répond 200 avec la classe
 * retenue.
 *
 * Ce qui est écrit : le nom de l'événement, l'audit, la source, la metadata
 * fonctionnelle du client, et la classe. RIEN d'autre — pas de User-Agent, pas
 * de `referer`, pas d'empreinte d'IP. Marquer la classe n'exige aucune de ces
 * trois données, et le `referer` d'un rapport ouvert depuis une webmail porte
 * régulièrement une adresse e-mail réelle dans sa query string. La classe est le
 * RÉSULTAT de la lecture de ces en-têtes ; l'en-tête lui-même n'a pas à survivre
 * dans une table qu'on agrège pendant des mois.
 *
 * Ne rien persister sur l'appelant prive en revanche l'admin de la trace qui
 * permettait de dater et qualifier une écriture en masse a posteriori. La
 * réponse n'est pas de réintroduire cette trace — c'est de rendre l'écriture en
 * masse impossible : plafond par requête (`MAX_CLIENT_FUNNEL_EVENTS_PER_REQUEST`)
 * ET plafond de débit par appelant (`clientFunnelRateLimiter`), ce dernier compté
 * en mémoire avec une clé à sel éphémère, jamais écrite nulle part. Un flood
 * absent vaut mieux qu'un flood documenté.
 */
export async function POST(req: NextRequest) {
  await ensureAuditSchema();

  const payload = await req.json().catch(() => null);
  const events = (Array.isArray(payload?.events) ? payload.events : [payload]).slice(
    0,
    MAX_CLIENT_FUNNEL_EVENTS_PER_REQUEST
  );

  const { trafficClass } = requestTrafficClass(req.headers);

  // Le débit est décompté AVANT de savoir si les événements sont valides : un
  // appelant qui inonde la route de payloads invalides consomme quand même du
  // pool Postgres et du temps de fonction.
  const { allowed, throttled } = clientFunnelRateLimiter.take(requestRateLimitKey(req.headers), events.length);

  let recorded = 0;
  let ignored = 0;

  for (const item of events.slice(0, allowed)) {
    // Whitelist et non `isFunnelEventName` : un appelant anonyme ne doit pas
    // pouvoir écrire un `audit_started`, qui n'existe que côté serveur.
    if (!item || typeof item !== "object" || !isClientFunnelEventName((item as { event_name?: unknown }).event_name)) {
      ignored += 1;
      continue;
    }

    const body = item as {
      event_name: (typeof CLIENT_FUNNEL_EVENTS)[number];
      audit_id?: unknown;
      source?: unknown;
      metadata?: unknown;
      dedupe_key?: unknown;
    };

    const clientDedupeKey = typeof body.dedupe_key === "string" ? body.dedupe_key : null;

    await recordFunnelEvent({
      eventName: body.event_name,
      auditId: typeof body.audit_id === "string" ? body.audit_id : null,
      source: typeof body.source === "string" ? body.source : "client",
      metadata: {
        ...(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {}),
        // APRÈS le spread de la metadata client, et jamais avant : sinon un
        // crawler se déclare `human` en envoyant `metadata: { trafficClass:
        // "human" }` et la mesure ne vaut plus rien. La classe est constatée
        // côté serveur, jamais auto-déclarée.
        trafficClass,
      },
      // Espace de nommage de la clé par classe, côté serveur : un bot ne peut
      // plus consommer le slot de dédup d'un humain, et la clé du client est
      // conservée telle quelle pour la classe `human` — donc la dédup humaine
      // traverse le déploiement sans rupture. Détail dans `namespacedDedupeKey`.
      dedupeKey: namespacedDedupeKey(trafficClass, clientDedupeKey),
    });
    recorded += 1;
  }

  return NextResponse.json(
    { ok: true, recorded, ignored, throttled, traffic_class: trafficClass },
    { headers: { "Cache-Control": "no-store" } }
  );
}
