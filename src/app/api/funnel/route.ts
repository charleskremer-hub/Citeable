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
 *
 * Ce plafond de débit est la seule chose de cette route qui puisse encore
 * détruire un événement sans trace : il est donc tenu de ne coûter QUE ce qu'un
 * appelant identifié écrit vraiment. Deux règles en découlent, chacune couvrant
 * un moyen de l'armer contre un tiers (voir le corps de `POST`) : on ne décompte
 * que les événements VALIDES, et on ne plafonne pas un appelant qu'on ne sait
 * pas attribuer.
 */
export async function POST(req: NextRequest) {
  await ensureAuditSchema();

  const payload = await req.json().catch(() => null);
  const submitted = Array.isArray(payload?.events) ? payload.events : [payload];
  const events = submitted.slice(0, MAX_CLIENT_FUNNEL_EVENTS_PER_REQUEST);

  // Le surplus au-delà du plafond de lot est COMPTÉ, pas seulement tranché.
  // Sans ce compteur, un POST de 25 événements valides répondait
  // `{recorded: 20, ignored: 0, throttled: 0}` : un appelant qui relit sa propre
  // réponse pour vérifier son envoi concluait au succès complet alors que 20 %
  // de son lot avait disparu. `recorded + ignored + throttled + dropped` vaut
  // désormais exactement le nombre d'événements soumis, quel que soit le chemin.
  const dropped = submitted.length - events.length;

  const { trafficClass } = requestTrafficClass(req.headers);

  type ClientFunnelEventBody = {
    event_name: (typeof CLIENT_FUNNEL_EVENTS)[number];
    audit_id?: unknown;
    source?: unknown;
    metadata?: unknown;
    dedupe_key?: unknown;
  };

  // Validation AVANT tout décompte de débit. Décompter d'abord rendait le
  // plafond armable CONTRE un tiers : 3 requêtes de 20 événements invalides
  // consommaient les 60 unités de la minute, et le `report_viewed` humain
  // suivant sortait en `{allowed: 0}` — un tiers éteignait la mesure d'une IP
  // partagée (NAT d'entreprise, VPN, 4G) sans qu'une seule ligne soit écrite.
  // Un événement invalide ne coûte ni INSERT ni ligne : il n'a rien à coûter au
  // plafond non plus. Le lot reste borné par le `.slice` ci-dessus, qui suffit à
  // ce que la validation elle-même ne soit pas un vecteur de charge.
  const valid: ClientFunnelEventBody[] = [];
  let ignored = 0;

  for (const item of events) {
    // Whitelist et non `isFunnelEventName` : un appelant anonyme ne doit pas
    // pouvoir écrire un `audit_started`, qui n'existe que côté serveur.
    if (!item || typeof item !== "object" || !isClientFunnelEventName((item as { event_name?: unknown }).event_name)) {
      ignored += 1;
      continue;
    }
    valid.push(item as ClientFunnelEventBody);
  }

  // Pas de clé de comptage = appelant non attribuable (aucun en-tête de proxy).
  // Le plafond se tait alors au lieu de retomber sur un seau unique partagé par
  // tous les visiteurs de l'instance. Cf. `requestRateLimitKey`.
  const rateLimitKey = requestRateLimitKey(req.headers);
  const { allowed, throttled } = rateLimitKey
    ? clientFunnelRateLimiter.take(rateLimitKey, valid.length)
    : { allowed: valid.length, throttled: 0 };

  let recorded = 0;

  for (const body of valid.slice(0, allowed)) {
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
      // Espace de nommage de la clé, côté serveur, sur deux fronts : un bot ne
      // peut plus consommer le slot de dédup d'un humain, et AUCUNE classe ne
      // peut viser une clé d'événement serveur (`audit_completed:<uuid>`…) pour
      // l'effacer via `ON CONFLICT DO NOTHING`. La clé d'une vue humaine
      // ordinaire est conservée octet pour octet — la dédup humaine traverse le
      // déploiement sans rupture. Détail dans `namespacedDedupeKey`.
      dedupeKey: namespacedDedupeKey(trafficClass, clientDedupeKey),
    });
    recorded += 1;
  }

  return NextResponse.json(
    { ok: true, recorded, ignored, throttled, dropped, traffic_class: trafficClass },
    { headers: { "Cache-Control": "no-store" } }
  );
}
