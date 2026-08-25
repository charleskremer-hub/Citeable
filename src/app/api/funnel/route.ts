import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import {
  CLIENT_FUNNEL_EVENTS,
  MAX_CLIENT_FUNNEL_EVENTS_PER_REQUEST,
  clientFunnelRateLimiter,
  foldFunnelCounts,
  isAuditUuidV4,
  isClientFunnelEventName,
  namespacedDedupeKey,
  readTrafficClassSince,
  recordFunnelEvent,
} from "@/lib/funnel";
import { TRAFFIC_CLASSES, requestRateLimitKey, requestTrafficClass } from "@/lib/traffic-filter";

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

type FunnelAuditCountRow = FunnelCountRow & {
  last_event_at: Date | string | null;
};

const AUDIT_ID_PARAM = "audit_id";

/**
 * Compteurs d'UN SEUL audit. `audit_id = $1::uuid` — valeur LIÉE, jamais
 * concaténée, et de toute façon validée avant d'arriver ici.
 *
 * Pas de fenêtre 14 jours sur ce chemin, contrairement à l'agrégat : la question
 * posée n'est pas « que se passe-t-il en ce moment ? » mais « ce prospect-là
 * a-t-il ouvert SON rapport ? ». Une fenêtre glissante ferait disparaître la
 * réponse au bout de deux semaines, c'est-à-dire exactement au moment où on
 * relit le résultat d'une campagne. L'index `audit_funnel_events_audit_idx
 * (audit_id, created_at DESC)` sert cette requête sans Seq Scan.
 */
const FUNNEL_COUNTS_BY_AUDIT_SQL = `SELECT event_name, metadata->>'trafficClass' AS traffic_class,
            COUNT(*)::text AS count, MAX(created_at) AS last_event_at
     FROM audit_funnel_events
     WHERE audit_id = $1::uuid
     GROUP BY event_name, metadata->>'trafficClass'`;

type AuditIdSelection =
  | { kind: "absent" }
  | { kind: "refused"; error: string; message: string }
  | { kind: "one"; auditId: string };

/**
 * Lit `audit_id` dans la query string, ou REFUSE.
 *
 * Trois sorties, jamais un repli silencieux :
 *   - absent  → l'appelant veut l'agrégat, comportement historique intact ;
 *   - refusé  → 400 explicite (préfixe, uuid partiel, liste, joker, répétition) ;
 *   - un seul → uuid v4 complet, prêt à être lié en paramètre.
 *
 * Ce qui compte ici, c'est que le refus soit un REFUS. Élargir un préfixe en
 * `LIKE`, ou retomber sur les compteurs agrégés quand la valeur est douteuse,
 * transformerait la route en balayage des identifiants de nos clients ou
 * répondrait à côté de la question posée — dans les deux cas sans que l'appelant
 * puisse s'en apercevoir.
 */
function readAuditIdParam(searchParams: URLSearchParams): AuditIdSelection {
  const enumeration = {
    kind: "refused",
    error: "audit_id_enumeration",
    message: `Un seul « ${AUDIT_ID_PARAM} » par requête. Ni liste, ni tableau, ni valeurs séparées par des virgules, ni joker.`,
  } as const;

  // Toute clé qui RESSEMBLE à `audit_id` sans l'être exactement (`audit_id[]`,
  // `audit_id[0]`, `audit_ids`) est une façon d'en passer plusieurs. Sans ce
  // contrôle, `getAll("audit_id")` ne les voit pas et la requête retomberait sur
  // les compteurs agrégés — un refus déguisé en réponse.
  for (const key of Array.from(searchParams.keys())) {
    const normalized = key.toLowerCase();
    if (normalized.startsWith(AUDIT_ID_PARAM) && normalized !== AUDIT_ID_PARAM) return enumeration;
  }

  const values = searchParams.getAll(AUDIT_ID_PARAM);
  if (values.length === 0) return { kind: "absent" };
  if (values.length > 1) return enumeration;

  const raw = values[0];
  // Séparateurs AVANT la validation de forme, uniquement pour rendre le motif
  // « j'en demande plusieurs » sous son vrai nom plutôt que sous « mal formé ».
  if (/[,;\s]/.test(raw)) return enumeration;

  if (!isAuditUuidV4(raw)) {
    return {
      kind: "refused",
      error: "audit_id_invalid",
      message: `« ${AUDIT_ID_PARAM} » doit être un uuid v4 COMPLET. Un préfixe ou un uuid tronqué est refusé, jamais interprété comme un début d'identifiant.`,
    };
  }

  return { kind: "one", auditId: raw };
}

/**
 * Horodatage du dernier événement de l'audit, ou `null`. Les lignes viennent
 * d'un `GROUP BY`, chacune portant le `MAX(created_at)` de son groupe : le
 * maximum des maxima est le dernier événement de l'audit.
 */
function latestEventAt(rows: FunnelAuditCountRow[]): string | null {
  let latest: number | null = null;

  for (const row of rows) {
    if (!row.last_event_at) continue;
    const time = new Date(row.last_event_at).getTime();
    if (!Number.isFinite(time)) continue;
    if (latest === null || time > latest) latest = time;
  }

  return latest === null ? null : new Date(latest).toISOString();
}

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
 *
 * `?audit_id=<uuid>` (25/08) rend les compteurs D'UN SEUL audit.
 *
 * Le problème qu'il règle est une mesure, pas une intuition : les compteurs sont
 * agrégés sur tout le trafic, donc le jour où `report_viewed.human` passe de 1 à
 * 2, RIEN ne dit quel audit a été vu, donc quel prospect a mordu. Les deux
 * premiers e-mails de prospection ont rendu un résultat illisible pour cette
 * raison exacte.
 *
 * Modèle d'autorisation : CONNAÎTRE L'UUID VAUT AUTORISATION. L'identifiant est
 * un v4 non devinable, émis par nous, envoyé au seul prospect concerné ; aucune
 * clé d'administration n'est demandée sur ce chemin, ce qui le rend utilisable
 * depuis un run d'agent sans secret (le mode `detail=1` global, lui, exige
 * toujours `x-funnel-key`, et n'est pas atteignable ici : ce chemin sort AVANT).
 *
 * Ce que ce chemin n'expose PAS, et pour cause : ni `metadata`, ni `source`, ni
 * `id` de ligne, ni le moindre événement brut. Des compteurs, les classes de
 * trafic observées, et la date du dernier événement. Le nom de marque audité,
 * les scores et les URL de rapports restent derrière la clé d'admin.
 */
export async function GET(req: NextRequest) {
  await ensureAuditSchema();

  const selection = readAuditIdParam(req.nextUrl.searchParams);

  if (selection.kind === "refused") {
    return NextResponse.json(
      { ok: false, error: selection.error, message: selection.message },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (selection.kind === "one") {
    const auditResult = await pool.query<FunnelAuditCountRow>(FUNNEL_COUNTS_BY_AUDIT_SQL, [selection.auditId]);
    const { counts, countsByTrafficClass } = foldFunnelCounts(auditResult.rows);

    // Classes réellement OBSERVÉES sur cet audit. `unknown` y figure quand
    // l'événement est antérieur à `traffic_class_since` : ça veut dire NON
    // CLASSÉ, jamais « non humain », et encore moins « humain ». D'où la
    // publication de la date de rupture juste en dessous, sans quoi un
    // `unknown` isolé est illisible.
    const observedTrafficClasses = TRAFFIC_CLASSES.filter((trafficClass) =>
      Object.values(countsByTrafficClass).some((bucket) => bucket[trafficClass] > 0)
    );

    const trafficClassSince = await readTrafficClassSince();

    // 200 avec des compteurs à ZÉRO pour un uuid bien formé mais inconnu — et
    // surtout PAS un 404.
    //
    // Un 404 distinguerait « cet uuid existe » de « cet uuid n'existe pas ».
    // Comme on vient d'accorder l'accès sur la SEULE connaissance de l'uuid,
    // cette distinction ferait de la route un oracle d'existence pour qui
    // devine : la réponse ne doit rien dire de plus que ce que l'appelant sait
    // déjà. « Aucun événement » et « aucun audit » se répondent donc de façon
    // strictement identique — même statut, même forme, mêmes zéros. C'est aussi
    // la bonne réponse fonctionnelle : un audit tout juste envoyé et pas encore
    // ouvert est un audit à zéro, pas une erreur.
    return NextResponse.json(
      {
        ok: true,
        audit_id: selection.auditId,
        // Pas de fenêtre glissante ici : voir `FUNNEL_COUNTS_BY_AUDIT_SQL`.
        window: "all",
        counts,
        counts_by_traffic_class: countsByTrafficClass,
        traffic_classes: observedTrafficClasses,
        traffic_class_since: trafficClassSince ? new Date(trafficClassSince).toISOString() : null,
        last_event_at: latestEventAt(auditResult.rows),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

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
