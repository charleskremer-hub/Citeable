import { pool } from "./db";
import { createFixedWindowLimiter } from "./rate-limit";
import {
  CLASSIFIED_TRAFFIC_CLASSES_PREDICATE_SQL,
  TRAFFIC_CLASSES,
  trafficClassOrUnknown,
  type TrafficClass,
} from "./traffic-filter";

export const FUNNEL_EVENTS = [
  "audit_started",
  "audit_completed",
  "report_viewed",
  // Audit sans friction : l'audit démarre sans email, le lead est capturé plus
  // tard sur le rapport en échange du détail (voir /api/claim-audit).
  "email_captured",
  "teaser_cta_click",
  "checkout_opened",
  "followup_1_sent",
  "followup_2_sent",
  "followup_click",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

/**
 * Les seuls événements qu'un NAVIGATEUR a le droit d'émettre sur
 * `POST /api/funnel`.
 *
 * Cette route ne peut pas être authentifiée : elle est appelée par
 * `navigator.sendBeacon` depuis la page publique du rapport. Tant que le POST
 * JETAIT les événements non humains, un tiers ne pouvait au pire que gonfler un
 * total déjà considéré comme bruité ; depuis qu'il MARQUE (29/07), le même tiers
 * écrit dans la colonne `human` sur laquelle un arbitrage de sprint se prend.
 *
 * On restreint donc la surface à ce que le navigateur émet réellement
 * (`ReportViewBeacon`, `FunnelCheckoutLink`). `audit_started`,
 * `audit_completed`, `email_captured` et les `followup_*` sont écrits par des
 * chemins SERVEUR et ne doivent jamais pouvoir l'être depuis l'extérieur.
 *
 * Ça ne rend pas le compteur infalsifiable — un `report_viewed` reste forgeable
 * avec un User-Agent de navigateur — mais ça retire du champ atteignable les
 * compteurs de haut de funnel (les 147 `audit_started`), et le plafond de lot
 * ci-dessous coupe l'écriture en masse en une requête.
 */
export const CLIENT_FUNNEL_EVENTS = ["report_viewed", "teaser_cta_click", "checkout_opened"] as const;

export type ClientFunnelEventName = (typeof CLIENT_FUNNEL_EVENTS)[number];

export function isClientFunnelEventName(value: unknown): value is ClientFunnelEventName {
  return typeof value === "string" && (CLIENT_FUNNEL_EVENTS as readonly string[]).includes(value);
}

/**
 * Plafond d'événements traités par requête. Le plus gros lot légitime en vaut 2
 * (`teaser_cta_click` + `checkout_opened` de `FunnelCheckoutLink`) ; 20 laisse
 * toute la marge nécessaire sans permettre d'insérer 5 000 lignes en un appel.
 */
export const MAX_CLIENT_FUNNEL_EVENTS_PER_REQUEST = 20;

/**
 * Plafond d'événements ACCEPTÉS par appelant et par minute sur
 * `POST /api/funnel`.
 *
 * Le plafond par requête ci-dessus ne borne qu'un lot ; rien n'empêchait une
 * boucle de rejouer ce lot indéfiniment. Depuis que le POST MARQUE au lieu de
 * JETER, ces lignes atterrissent dans la colonne `human` — celle sur laquelle un
 * arbitrage de sprint se prend. On borne donc aussi le DÉBIT.
 *
 * 60/minute est très au-dessus de tout usage réel : un lecteur émet 1
 * `report_viewed` par session et par rapport, et 2 événements par clic de
 * checkout. Même un bureau entier derrière une seule IP publique n'en approche
 * pas, au volume actuel (60 `report_viewed` en 14 jours). Un `curl` en boucle,
 * lui, passe de « 10 000 lignes en quelques secondes » à 60 par minute et par
 * instance.
 */
export const MAX_CLIENT_FUNNEL_EVENTS_PER_MINUTE = 60;

export const clientFunnelRateLimiter = createFixedWindowLimiter({
  limit: MAX_CLIENT_FUNNEL_EVENTS_PER_MINUTE,
  windowMs: 60_000,
});

/**
 * Espace de nommage de la clé de dédup selon la classe CONSTATÉE côté serveur.
 *
 * Le problème réglé : `ReportViewBeacon` retombe sur la clé PARTAGÉE
 * `report_viewed:<auditId>:nosession-<jour>` dès que `sessionStorage` est refusé
 * (navigation privée stricte, webview, politique d'entreprise). Tant que le POST
 * jetait les bots, celui-ci ne consommait pas la clé ; depuis qu'il écrit, un
 * contrôle headless interne passé le matin s'approprierait le slot du jour et le
 * `ON CONFLICT DO NOTHING` avalerait silencieusement la vue du prospect qui suit.
 *
 * Pourquoi `human` n'est PAS préfixée. Préfixer les quatre classes changeait la
 * clé des vues humaines, alors que cette clé vit dans le `sessionStorage` du
 * navigateur (`gp_sid`) et survit donc à un déploiement. Un onglet ouvert avant
 * la mise en production et rafraîchi après aurait produit une SECONDE ligne pour
 * la même session et le même audit — un sur-comptage de la seule série qui sert
 * de référence, invisible parce qu'attendu par ailleurs (le total bondit
 * légitimement quand les bots deviennent persistés). Laisser la classe `human`
 * sur la clé du client rend le changement neutre quel que soit l'ordre des
 * déploiements, et supprime le besoin d'une migration des clés existantes.
 *
 * L'asymétrie ne coûte rien : ce qu'on protège, c'est le slot humain contre une
 * consommation par un bot, et c'est exactement ce que le préfixe non-humain fait.
 */
export function namespacedDedupeKey(trafficClass: TrafficClass, clientDedupeKey: string | null): string | null {
  if (!clientDedupeKey) return null;
  return trafficClass === "human" ? clientDedupeKey : `${trafficClass}:${clientDedupeKey}`;
}

type RecordFunnelEventArgs = {
  eventName: FunnelEventName;
  auditId?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
};

export function isFunnelEventName(value: unknown): value is FunnelEventName {
  return typeof value === "string" && FUNNEL_EVENTS.includes(value as FunnelEventName);
}

function validUuid(value: string | null | undefined) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function recordFunnelEvent({ eventName, auditId, source, metadata = {}, dedupeKey }: RecordFunnelEventArgs) {
  const safeAuditId = validUuid(auditId) ? auditId : null;
  const safeSource = source?.trim().slice(0, 120) || null;
  const safeDedupeKey = dedupeKey?.trim().slice(0, 240) || null;

  await pool.query(
    `INSERT INTO audit_funnel_events (event_name, audit_id, source, metadata, dedupe_key)
     VALUES ($1, $2::uuid, $3, $4::jsonb, $5)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [eventName, safeAuditId, safeSource, JSON.stringify(metadata), safeDedupeKey]
  );
}

/**
 * Date du PREMIER événement classé, sur la table entière.
 *
 * `IS NOT NULL` ne conviendrait pas : `unknown` est une valeur réellement ÉCRITE
 * (un audit mis en file avant le 29/07 et terminé après retombe dessus via
 * `trafficClassOrUnknown`). La rupture doit pointer sur le premier événement
 * CLASSÉ, donc sur une des trois classes que produit une classification.
 *
 * La liste est interpolée en littéral et non passée en paramètre : c'est la
 * condition pour que Postgres reconnaisse le prédicat de l'index partiel
 * `audit_funnel_events_classified_created_idx` (voir `ensureAuditSchema`) et
 * réponde par une lecture d'index au lieu d'un Seq Scan de toute la table à
 * chaque `GET /api/funnel` — route publique, `no-store`, sans clé d'accès. Les
 * valeurs viennent d'une constante du module, pas d'une entrée.
 */
export const TRAFFIC_CLASS_SINCE_SQL = `SELECT MIN(created_at) AS since
     FROM audit_funnel_events
     WHERE ${CLASSIFIED_TRAFFIC_CLASSES_PREDICATE_SQL}`;

/**
 * Mémoïsation volontairement asymétrique : on ne mémorise QUE la valeur non
 * nulle.
 *
 * Une fois le premier événement classé écrit, `MIN(created_at)` est monotone —
 * `created_at` vaut `now()` à l'insertion, aucune ligne postérieure ne peut être
 * plus ancienne. Le cache ne peut donc pas devenir faux. Il le deviendrait si
 * quelqu'un rétro-classait des lignes historiques ; c'est précisément ce que la
 * règle de lecture interdit (l'historique reste `unknown`, jamais promu).
 *
 * `null` n'est pas mémorisé : ce serait figer « pas encore de rupture » pour
 * toute la vie de l'instance, y compris après le premier événement classé.
 */
let trafficClassSinceCache: Date | null = null;

export function resetTrafficClassSinceCache() {
  trafficClassSinceCache = null;
}

export async function readTrafficClassSince(): Promise<Date | null> {
  if (trafficClassSinceCache) return trafficClassSinceCache;

  const result = await pool.query<{ since: Date | null }>(TRAFFIC_CLASS_SINCE_SQL);
  const since = result.rows[0]?.since ?? null;
  if (since) trafficClassSinceCache = new Date(since);

  return trafficClassSinceCache;
}

export type FunnelCounts = Record<FunnelEventName, number>;
export type FunnelCountsByTrafficClass = Record<FunnelEventName, Record<TrafficClass, number>>;

/**
 * Replie les lignes d'un `GROUP BY (event_name, traffic_class)` en deux vues.
 *
 * `counts[event]` est DÉRIVÉ de la somme des 4 classes, jamais compté à part :
 * l'invariant `human + bot + internal + unknown === counts[event]` est alors
 * structurel et ne peut pas dériver entre deux requêtes SQL.
 *
 * Toute classe non reconnue — clé absente sur l'historique d'avant le 29/07,
 * casse différente, valeur envoyée par un client — est repliée sur `unknown`.
 * Aucune ligne n'est jamais promue `human` par défaut.
 */
export function foldFunnelCounts(
  rows: { event_name: string; traffic_class: string | null; count: string | number }[]
): { counts: FunnelCounts; countsByTrafficClass: FunnelCountsByTrafficClass } {
  const countsByTrafficClass = Object.fromEntries(
    FUNNEL_EVENTS.map((eventName) => [eventName, Object.fromEntries(TRAFFIC_CLASSES.map((klass) => [klass, 0]))])
  ) as FunnelCountsByTrafficClass;

  for (const row of rows) {
    if (!isFunnelEventName(row.event_name)) continue;

    const value = Number(row.count);
    if (!Number.isFinite(value)) continue;

    countsByTrafficClass[row.event_name][trafficClassOrUnknown(row.traffic_class)] += value;
  }

  const counts = Object.fromEntries(
    FUNNEL_EVENTS.map((eventName) => [
      eventName,
      TRAFFIC_CLASSES.reduce((total, klass) => total + countsByTrafficClass[eventName][klass], 0),
    ])
  ) as FunnelCounts;

  return { counts, countsByTrafficClass };
}
