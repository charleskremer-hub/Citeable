import { pool } from "./db";
import { createFixedWindowLimiter } from "./rate-limit";
import {
  CLASSIFIED_TRAFFIC_CLASSES_PREDICATE_SQL,
  TRAFFIC_CLASSES,
  requestTrafficClass,
  trafficClassOrUnknown,
  type TrafficClass,
} from "./traffic-filter";

export const FUNNEL_EVENTS = [
  "audit_started",
  "audit_completed",
  "report_viewed",
  // Le lien de prospection a été OUVERT : émis côté SERVEUR par la page
  // `/audit/<id>`, AVANT le rendu, et UNIQUEMENT quand le jeton de partage
  // signé est valide (voir `recordReportLinkOpened` plus bas).
  //
  // POURQUOI IL EXISTE alors que `report_viewed` mesure déjà une ouverture de
  // rapport. `report_viewed` part d'un beacon CLIENT (`ReportViewBeacon`).
  // Entre « l'email est parti » et « le rapport est compté », quatre issues
  // rendent EXACTEMENT le même chiffre 0 : jamais délivré, délivré mais jamais
  // ouvert, ouvert mais jamais cliqué, ou CLIQUÉ avec l'événement perdu (JS
  // désactivé, beacon bloqué, onglet fermé avant l'exécution, webview
  // restrictive). La quatrième est un faux négatif sur le seul signal que nous
  // ayons : un prospect qui clique et dont le beacon ne part pas est
  // enregistré exactement comme un prospect qui n'a jamais cliqué. Mesure du
  // 26/08/2026 : les 2 seuls prospects démarchés (lot du 17/08) ont rendu 0
  // événement de toute nature, neuf jours après l'envoi — et les quatre issues
  // restaient indiscernables.
  //
  // IL NE REMPLACE PAS `report_viewed` ET NE L'ALIMENTE PAS. `report_viewed`
  // reste la north star et reste client. Les deux coexistent ; c'est leur
  // ÉCART qui est l'information.
  //
  // IL N'EST DÉLIBÉRÉMENT PAS DANS `CLIENT_FUNNEL_EVENTS` : il atterrit donc
  // dans `SERVER_ONLY_FUNNEL_EVENTS` (dérivé par filtrage), un navigateur ne
  // peut pas le forger via `POST /api/funnel`, et l'espace de nommage
  // `report_link_opened:` de sa clé de dédup devient protégé par
  // `reachesServerDedupeNamespace`.
  "report_link_opened",
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
 * Les événements que SEUL le serveur écrit. Leurs clés de dédup ont toutes la
 * forme `<event_name>:<id>` (`audit_started:<uuid>`, `audit_completed:<uuid>`,
 * `email_captured:<uuid>`, `followup_1_sent:<uuid>`…), et `dedupe_key` est
 * UNIQUE sur TOUTE la table `audit_funnel_events` — pas par événement.
 */
export const SERVER_ONLY_FUNNEL_EVENTS = FUNNEL_EVENTS.filter(
  (eventName) => !(CLIENT_FUNNEL_EVENTS as readonly string[]).includes(eventName)
) as readonly string[];

/**
 * Préfixe réservé aux clés client qui empiètent sur l'espace de nommage serveur.
 * Aucune clé légitime ne commence par là : `ReportViewBeacon` produit
 * `report_viewed:<auditId>:<sessionId>`.
 */
const CLIENT_DEDUPE_NAMESPACE = "client";

/**
 * La clé fournie par le client vise-t-elle l'espace de nommage d'un événement
 * SERVEUR ?
 *
 * Le scénario réel, reproduit en exécution : le demandeur d'un audit reçoit son
 * `audit_id` dans le 202 de `/api/run-audit`, et l'audit dure des dizaines de
 * secondes. Il poste pendant ce temps, avec un User-Agent de navigateur
 * ordinaire, `{"event_name":"report_viewed","dedupe_key":"audit_completed:<id>"}`.
 * La classe `human` n'étant pas préfixée, la clé partait telle quelle : la ligne
 * était écrite, puis `recordFunnelEvent({eventName:'audit_completed', …})`
 * tombait sur `ON CONFLICT (dedupe_key) DO NOTHING` et l'`audit_completed` réel
 * n'était JAMAIS écrit. `CLIENT_FUNNEL_EVENTS` empêche d'écrire un événement
 * serveur, pas d'en effacer un : le contrôle s'arrêtait une porte trop tôt.
 *
 * Le segment est lu avant le premier `:` — et la chaîne entière quand elle n'en
 * porte pas, ce qui ne peut correspondre à aucune clé serveur mais ne coûte rien
 * à couvrir.
 */
function reachesServerDedupeNamespace(clientDedupeKey: string): boolean {
  return SERVER_ONLY_FUNNEL_EVENTS.includes(clientDedupeKey.split(":", 1)[0]);
}

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
 * L'asymétrie ne coûte rien pour ce qu'elle protège — le slot humain contre une
 * consommation par un bot — mais elle laissait la classe `human` seule à ne
 * porter AUCUN préfixe, donc seule à pouvoir viser une clé serveur. D'où la
 * garde `reachesServerDedupeNamespace` : les clés humaines ordinaires passent
 * toujours octet pour octet (pas de rupture du `sessionStorage` au déploiement),
 * et les seules qui sont réécrites sont celles qu'aucun navigateur n'émet.
 *
 * Réécrire plutôt que refuser : l'événement reste ENREGISTRÉ et compté, il perd
 * seulement le droit de réclamer un slot qui n'est pas le sien. Jeter la ligne
 * réintroduirait le refus d'écriture silencieux que cette story supprime.
 */
export function namespacedDedupeKey(trafficClass: TrafficClass, clientDedupeKey: string | null): string | null {
  if (!clientDedupeKey) return null;
  // Les autres classes sont déjà préfixées par leur nom, qui n'est le nom
  // d'aucun événement : elles ne peuvent atteindre aucune clé serveur.
  if (trafficClass !== "human") return `${trafficClass}:${clientDedupeKey}`;
  return reachesServerDedupeNamespace(clientDedupeKey)
    ? `${CLIENT_DEDUPE_NAMESPACE}:${clientDedupeKey}`
    : clientDedupeKey;
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

/**
 * Forme EXACTE d'un `audit_id` : uuid v4 complet, ancré des deux côtés.
 *
 * Les identifiants d'audit sont produits par `gen_random_uuid()` côté Postgres
 * (voir `ensureAuditSchema`), qui rend toujours un v4 — d'où le `4` littéral en
 * position de version, plus strict que le `[1-5]` du chemin d'ÉCRITURE
 * `validUuid` ci-dessus. Le chemin d'écriture reste tolérant parce qu'il ne fait
 * que décider d'écrire `NULL` ou non ; le chemin de LECTURE, lui, sert
 * d'autorisation (connaître l'uuid vaut autorisation) et n'a aucune raison
 * d'accepter une forme que nous n'émettons pas.
 *
 * Les deux ancres `^` et `$` sont la garde essentielle : sans elles, un PRÉFIXE
 * (`3f2a`, `3f2a1b4c-`) ou un uuid tronqué passerait, et la route deviendrait un
 * scanner par préfixe sur les identifiants de nos clients. Une valeur qui n'est
 * pas un uuid v4 entier doit être REFUSÉE, jamais élargie en `LIKE` ni en
 * `startsWith`.
 */
export function isAuditUuidV4(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
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
 * Jour UTC d'un instant, au format `YYYY-MM-DD`.
 *
 * UTC et pas le fuseau du serveur : une fonction serverless peut être servie
 * depuis n'importe quelle région, et une frontière de jour flottante rendrait
 * la clé de dédup dépendante de l'endroit où la requête a atterri — donc deux
 * lignes pour la même ouverture selon l'humeur du routage.
 */
function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Clé de dédup d'une ouverture de lien :
 * `report_link_opened:<auditId>:<trafficClass>:<YYYY-MM-DD UTC>`.
 *
 * POURQUOI DÉDUPLIQUER — ce n'est pas un raffinement, c'est la condition pour
 * que l'événement veuille dire quelque chose. `src/app/audit/[id]/page.tsx`
 * porte `export const dynamic = "force-dynamic"` : le rendu serveur est
 * ré-exécuté à CHAQUE requête, et `AuditPoller` appelle `router.refresh()`
 * toutes les 3 secondes tant que l'audit n'est pas complet — soit ~20 rendus
 * serveur par minute sur un rapport en cours. C'est EXACTEMENT la panne de
 * juillet sur `report_viewed` (un F5 comptait une vue, nos propres
 * vérifications de liens ont injecté +10 vues en une matinée), documentée dans
 * le commentaire de retrait de `page.tsx`. Sans clé stable, ce compteur serait
 * un compteur de rendus, pas un compteur d'ouvertures.
 *
 * POURQUOI LA CLASSE DE TRAFIC EST DANS LA CLÉ — `recordFunnelEvent` fait
 * `ON CONFLICT (dedupe_key) DO NOTHING`, et `dedupe_key` est UNIQUE sur TOUTE
 * la table `audit_funnel_events`, pas par événement. Le scénario, déjà survenu
 * sur `report_viewed` et documenté sur `namespacedDedupeKey` : un contrôle
 * interne passé le matin s'approprie le slot du jour, et le
 * `ON CONFLICT DO NOTHING` avale silencieusement l'ouverture du prospect qui
 * suit. Nous ouvrons NOUS-MÊMES les liens de contrôle avec `gp_internal=1` ;
 * sans la classe dans la clé, nous détruirions la mesure le jour même de sa
 * création. Une ouverture par audit, PAR CLASSE, par jour UTC.
 *
 * POURQUOI LE JOUR ET PAS LA SESSION — il n'y a pas de session ici : l'écriture
 * précède tout code client, donc tout `sessionStorage`. Le jour UTC est la
 * granularité la plus fine qu'un chemin purement serveur puisse tenir sans
 * ré-ouvrir la porte au comptage de rendus. Un prospect qui revient le
 * lendemain produit une seconde ligne, ce qui est le comportement voulu.
 *
 * Le préfixe est le nom de l'événement : il place la clé dans l'espace de
 * nommage SERVEUR que `reachesServerDedupeNamespace` protège des clés client.
 */
export function reportLinkOpenedDedupeKey(auditId: string, trafficClass: TrafficClass, now: Date = new Date()): string {
  return `report_link_opened:${auditId}:${trafficClass}:${utcDay(now)}`;
}

/**
 * Enregistre l'ouverture d'un lien de rapport, côté SERVEUR, avant le rendu.
 *
 * `shareTokenValid` est passé par l'appelant plutôt que recalculé ici : la page
 * vérifie DÉJÀ le jeton pour décider de l'accès au rapport
 * (`resolveReportAccess`), et deux appels à `verifyAuditShareToken` pour la même
 * requête, c'est un HMAC inutile et surtout deux vérités possibles.
 *
 * SANS JETON VALIDE, RIEN N'EST ÉMIS. Ce compteur mesure les liens de
 * PROSPECTION, pas le trafic général de `/audit/<id>` : une visite sans jeton,
 * ou avec un jeton invalide ou expiré, ne dit rien de la campagne.
 *
 * LA CLASSE EST CALCULÉE ICI, côté serveur, par `requestTrafficClass` — comme
 * sur tous les autres chemins serveur (`/api/run-audit`). C'est ce qui fait que
 * le marquage `gp_internal=1` s'applique : nos propres ouvertures de contrôle
 * se classent `internal` et n'entrent pas dans le compteur humain.
 *
 * UNE PANNE DE MESURE NE DOIT JAMAIS CASSER LA PAGE D'UN PROSPECT.
 * `recordFunnelEvent` touche Postgres ; si la base tousse, un prospect qui a
 * cliqué son lien doit voir son rapport, pas une 500. D'où le `try/catch` qui
 * avale l'erreur et se contente de la journaliser — même principe que
 * `requestTrafficClass`, « volontairement gardé sans I/O ni await : une
 * exception ici ferait échouer une création d'audit pour un besoin de mesure ».
 *
 * L'appel est ATTENDU (`await`) et non laissé en fire-and-forget : en
 * serverless, une promesse non attendue peut être tuée avec le process, et
 * l'événement serait perdu de façon INTERMITTENTE — le pire des cas pour un
 * compteur, puisque le trou serait invisible.
 */
export async function recordReportLinkOpened({
  auditId,
  shareTokenValid,
  requestHeaders,
}: {
  auditId: string;
  shareTokenValid: boolean;
  requestHeaders: { get(name: string): string | null };
}): Promise<void> {
  if (!shareTokenValid) return;

  try {
    const { trafficClass } = requestTrafficClass(requestHeaders);
    await recordFunnelEvent({
      eventName: "report_link_opened",
      auditId,
      source: "audit_page",
      metadata: { trafficClass },
      dedupeKey: reportLinkOpenedDedupeKey(auditId, trafficClass),
    });
  } catch (error) {
    console.error("report_link_opened non enregistré (la page du prospect reste servie) :", error);
  }
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
