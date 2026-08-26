import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * `report_link_opened` — le lien de prospection a été OUVERT.
 *
 * CE QUE CETTE SUITE PROTÈGE, ET LA MESURE QUI LA FONDE. Le 26/08/2026,
 * `GET /api/funnel?audit_id=<uuid>` rendait, pour les 2 seuls prospects
 * démarchés (lot du 17/08), 0 `report_viewed`, 0 `teaser_cta_click`,
 * 0 `checkout_opened` — zéro événement de toute nature, neuf jours après
 * l'envoi. Or l'instrumentation ne commençait qu'à l'ouverture du rapport, et
 * `report_viewed` est émis par un beacon CLIENT. Quatre issues rendaient donc
 * exactement le même chiffre 0 : jamais délivré, jamais ouvert, jamais cliqué,
 * ou CLIQUÉ avec l'événement perdu (JS coupé, beacon bloqué, onglet fermé trop
 * tôt, webview restrictive). La quatrième est un faux négatif sur le seul
 * signal que nous ayons.
 *
 * `report_viewed` NE BOUGE PAS : il reste la north star et reste client. C'est
 * l'ÉCART entre les deux séries qui devient lisible.
 *
 * POURQUOI LE COMPORTEMENT EST TESTÉ SUR `recordReportLinkOpened` ET LE CÂBLAGE
 * SUR LE TEXTE DE `page.tsx`. Le runner est `node --test` avec le type stripping
 * natif : il sait charger un `.ts`, PAS un `.tsx` (`ERR_UNKNOWN_FILE_EXTENSION`,
 * vérifié sur ce dépôt). Un RSC ne peut donc pas être importé ici. La règle
 * métier vit par conséquent dans `@/lib/funnel` — importable, mockable, testable
 * de bout en bout — et la page ne fait que l'appeler. Ce qui reste non
 * observable, c'est le CÂBLAGE : les tests « câblage » ci-dessous lisent la
 * source de `page.tsx` COMMENTAIRES RETIRÉS, de sorte que commenter l'émission
 * les fasse virer au rouge.
 *
 * Convention du dépôt (cf. `funnel-route-audit-id.test.ts`) : aucun import
 * STATIQUE de module applicatif — les imports statiques sont hoistés AVANT les
 * `mock.module`, et `@/lib/funnel` embarquerait alors le vrai `pool`.
 */

const repoRoot = resolve(import.meta.dirname, "..");
const nextServerUrl = pathToFileURL(resolve(repoRoot, "node_modules/next/server.js")).href;
const dbUrl = pathToFileURL(resolve(repoRoot, "src/lib/db.ts")).href;

const realNext = await import("next/server");

// Le secret doit exister AVANT tout appel à `verifyAuditShareToken` : sans lui,
// le module refuse de signer comme de vérifier (fail-safe fermé), et les tests
// « jeton valide » deviendraient des tests « jeton invalide » sans le dire.
process.env.AUDIT_SHARE_SECRET = "secret-de-test-report-link-opened";
// Déterminisme de la classification : aucune IP interne héritée de l'environnement.
process.env.INTERNAL_IPS = "";
delete process.env.IP_HASH_SALT;

type InsertedRow = { event_name: string; audit_id: string | null; source: string | null; metadata: Record<string, unknown>; dedupe_key: string | null };

/**
 * Le mock se comporte comme Postgres, pas comme une fixture complaisante : il
 * applique RÉELLEMENT `ON CONFLICT (dedupe_key) DO NOTHING`, sur une contrainte
 * UNIQUE portant sur TOUTE la table — pas par événement. C'est la seule façon
 * que les tests (d) et (e) mesurent le vrai comportement de la clé de dédup au
 * lieu de mesurer la gentillesse du mock.
 */
const rows: InsertedRow[] = [];
const dedupeKeys = new Set<string>();
let insertShouldThrow = false;
let since: Date | null = new Date("2026-07-29T00:00:00.000Z");

mock.module(nextServerUrl, {
  namedExports: {
    NextRequest: realNext.NextRequest,
    NextResponse: realNext.NextResponse,
    after: () => {},
  },
});

mock.module(dbUrl, {
  namedExports: {
    ensureAuditSchema: async () => {},
    pool: {
      query: async (text: string, params: unknown[] = []) => {
        if (text.includes("INSERT INTO audit_funnel_events")) {
          if (insertShouldThrow) throw new Error("Postgres tousse (simulé)");
          const dedupeKey = (params[4] as string | null) ?? null;
          if (dedupeKey !== null && dedupeKeys.has(dedupeKey)) return { rows: [] };
          if (dedupeKey !== null) dedupeKeys.add(dedupeKey);
          rows.push({
            event_name: params[0] as string,
            audit_id: (params[1] as string | null) ?? null,
            source: (params[2] as string | null) ?? null,
            metadata: JSON.parse(params[3] as string) as Record<string, unknown>,
            dedupe_key: dedupeKey,
          });
          return { rows: [] };
        }
        if (text.includes("MIN(created_at)")) return { rows: [{ since }] };
        if (text.includes("GROUP BY event_name")) {
          const auditId = text.includes("audit_id = $1") ? (params[0] as string) : null;
          const groups = new Map<string, { event_name: string; traffic_class: string | null; count: number }>();
          for (const row of rows) {
            if (auditId !== null && row.audit_id !== auditId) continue;
            const trafficClass = (row.metadata.trafficClass as string | undefined) ?? null;
            const key = `${row.event_name} ${trafficClass ?? ""}`;
            const existing = groups.get(key);
            if (existing) existing.count += 1;
            else groups.set(key, { event_name: row.event_name, traffic_class: trafficClass, count: 1 });
          }
          return {
            rows: Array.from(groups.values()).map((group) => ({
              event_name: group.event_name,
              traffic_class: group.traffic_class,
              count: String(group.count),
              last_event_at: new Date("2026-08-26T10:00:00.000Z"),
            })),
          };
        }
        return { rows: [] };
      },
    },
  },
});

const {
  CLIENT_FUNNEL_EVENTS,
  FUNNEL_EVENTS,
  SERVER_ONLY_FUNNEL_EVENTS,
  namespacedDedupeKey,
  recordReportLinkOpened,
  reportLinkOpenedDedupeKey,
  resetTrafficClassSinceCache,
} = await import("@/lib/funnel");
const { AUDIT_SHARE_TOKEN_PARAM, signAuditShareToken, verifyAuditShareToken } = await import("@/lib/audit-share-token");
const { CLASSIFIED_TRAFFIC_CLASSES, TRAFFIC_CLASSES } = await import("@/lib/traffic-filter");
const { GET } = await import("@/app/api/funnel/route");

const AUDIT_ID = "3f2a1b4c-1111-4222-8333-444455556666";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const GPT_BOT = "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)";

/** Les en-têtes tels que la page les passe : un objet à `get(name)`. */
function requestHeaders(values: Record<string, string>) {
  const normalized = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: (name: string) => normalized.get(name.toLowerCase()) ?? null };
}

const humanHeaders = () => requestHeaders({ "user-agent": CHROME_MAC, "x-forwarded-for": "203.0.113.9" });
const internalHeaders = () => requestHeaders({ "user-agent": CHROME_MAC, cookie: "gp_internal=1", "x-forwarded-for": "203.0.113.9" });
const botHeaders = () => requestHeaders({ "user-agent": GPT_BOT, "x-forwarded-for": "203.0.113.9" });

function reset() {
  rows.length = 0;
  dedupeKeys.clear();
  insertShouldThrow = false;
  since = new Date("2026-07-29T00:00:00.000Z");
  resetTrafficClassSinceCache();
}

/** Les seules lignes qui nous intéressent : celles du nouvel événement. */
const linkOpenedRows = () => rows.filter((row) => row.event_name === "report_link_opened");

// --- (a) Un lien signé VALIDE émet l'événement ------------------------------

test("(a) une requête sur un lien signé valide émet report_link_opened", async () => {
  reset();

  // Le jeton est signé puis VÉRIFIÉ par le vrai module : on ne se contente pas
  // de passer `true`, sinon le test ne dirait rien du chemin réel.
  const token = signAuditShareToken(AUDIT_ID);
  const shareTokenValid = verifyAuditShareToken(AUDIT_ID, token);
  assert.equal(shareTokenValid, true, "le jeton fraîchement signé doit être valide");
  assert.equal(AUDIT_SHARE_TOKEN_PARAM, "k");

  await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid, requestHeaders: humanHeaders() });

  assert.equal(linkOpenedRows().length, 1, "un lien de prospection valide DOIT produire exactement un report_link_opened");
  assert.equal(linkOpenedRows()[0].audit_id, AUDIT_ID, "l'événement porte l'audit_id du lien");
});

test("(a) report_viewed n'est ni remplacé ni alimenté : aucune autre ligne n'est écrite", async () => {
  reset();
  await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: humanHeaders() });

  assert.deepEqual(
    rows.map((row) => row.event_name),
    ["report_link_opened"],
    "ce chemin n'écrit QUE report_link_opened — la north star reste au beacon client"
  );
});

// --- (b) La classe de trafic est calculée côté serveur, jamais unknown -------

test("(b) l'événement porte une classe de trafic calculée côté serveur, jamais absente ni unknown", async () => {
  reset();
  await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: humanHeaders() });

  const [row] = linkOpenedRows();
  assert.ok(row, "l'événement doit exister avant qu'on puisse parler de sa classe");

  const trafficClass = row.metadata.trafficClass;
  assert.notEqual(trafficClass, undefined, "metadata.trafficClass ne doit jamais être absente");
  assert.notEqual(
    trafficClass,
    "unknown",
    "`unknown` est une valeur de LECTURE pour l'historique non classé : une classification qui aboutit ne doit jamais la produire"
  );
  assert.ok(
    (CLASSIFIED_TRAFFIC_CLASSES as readonly string[]).includes(trafficClass as string),
    `la classe doit être une classe RÉELLEMENT classifiée (${CLASSIFIED_TRAFFIC_CLASSES.join(", ")}), reçu : ${String(trafficClass)}`
  );
  assert.equal(trafficClass, "human", "un Chrome ordinaire sans cookie interne est un humain");

  // La fenêtre de classification couvre bien l'instant : un `unknown` ne
  // pourrait donc pas être excusé par « la classification n'existait pas
  // encore ».
  assert.ok(since !== null && since.getTime() < Date.now(), "la fenêtre de classification doit couvrir l'instant du test");
});

test("(b) le marquage gp_internal=1 classe internal, et un crawler classe bot", async () => {
  reset();
  await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: internalHeaders() });
  await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: botHeaders() });

  const classes = linkOpenedRows().map((row) => row.metadata.trafficClass);
  assert.deepEqual(classes, ["internal", "bot"], "nos propres ouvertures ne doivent pas entrer dans le compteur humain");
});

test("(b) la metadata ne porte aucune donnée personnelle", async () => {
  reset();
  await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: humanHeaders() });

  const keys = Object.keys(linkOpenedRows()[0].metadata);
  for (const forbidden of ["userAgent", "user_agent", "ip", "ipHash", "clientIp", "cookie", "referrer", "shareToken", "k"]) {
    assert.equal(keys.includes(forbidden), false, `metadata ne doit pas contenir « ${forbidden} » : ${keys.join(", ")}`);
  }
});

// --- (c) Sans jeton valide, RIEN ---------------------------------------------

test("(c) une visite SANS jeton n'émet pas report_link_opened", async () => {
  reset();
  const shareTokenValid = verifyAuditShareToken(AUDIT_ID, undefined);
  assert.equal(shareTokenValid, false);

  await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid, requestHeaders: humanHeaders() });
  assert.equal(linkOpenedRows().length, 0, "ce compteur mesure les liens de PROSPECTION, pas le trafic général");
});

test("(c) un jeton falsifié, signé pour un AUTRE audit, ou expiré n'émet rien", async () => {
  reset();
  const autreAudit = "9c8b7a6d-5555-4666-9777-888899990000";
  const passe = Date.now() - 1_000;

  const jetons = [
    ["falsifié", "9999999999.signature-bidon"],
    ["signé pour un autre audit", signAuditShareToken(autreAudit)],
    // Signé pour 1 jour, mais évalué 2 jours plus tard : expiré.
    ["expiré", signAuditShareToken(AUDIT_ID, 1, passe - 2 * 86_400_000)],
  ] as const;

  for (const [libelle, token] of jetons) {
    const shareTokenValid = verifyAuditShareToken(AUDIT_ID, token);
    assert.equal(shareTokenValid, false, `un jeton ${libelle} ne doit pas être valide`);
    await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid, requestHeaders: humanHeaders() });
  }

  assert.equal(linkOpenedRows().length, 0);
});

// --- (d) Deux rendus successifs, une seule ligne ------------------------------

test("(d) deux rendus serveur le même jour, même audit, même classe ⇒ UNE seule ligne", async () => {
  reset();

  // Le scénario réel : `force-dynamic` + `router.refresh()` d'AuditPoller toutes
  // les 3 secondes, soit ~20 rendus serveur par minute sur un rapport en cours.
  for (let index = 0; index < 20; index += 1) {
    await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: humanHeaders() });
  }

  assert.equal(linkOpenedRows().length, 1, "sans dédup, ce compteur compte des RENDUS, pas des ouvertures — la panne de juillet");
});

test("(d) la clé de dédup a la forme report_link_opened:<auditId>:<trafficClass>:<YYYY-MM-DD UTC>", () => {
  const key = reportLinkOpenedDedupeKey(AUDIT_ID, "human", new Date("2026-08-26T23:59:59.000Z"));
  assert.equal(key, `report_link_opened:${AUDIT_ID}:human:2026-08-26`);

  // Le jour est en UTC, pas dans le fuseau du serveur : une fonction serverless
  // peut être servie depuis n'importe quelle région.
  assert.equal(
    reportLinkOpenedDedupeKey(AUDIT_ID, "human", new Date("2026-08-27T00:00:01.000Z")),
    `report_link_opened:${AUDIT_ID}:human:2026-08-27`
  );
});

// --- (e) La classe est DANS la clé : internal ne mange pas le slot de human ---

test("(e) une ouverture internal puis une ouverture human le même jour ⇒ DEUX lignes distinctes", async () => {
  reset();

  // L'ordre est celui du piège : notre contrôle interne passe le MATIN, le
  // prospect ouvre APRÈS. Si la classe n'était pas dans la clé, le
  // `ON CONFLICT DO NOTHING` avalerait silencieusement l'ouverture du prospect
  // — et nous détruirions la mesure le jour même de sa création.
  await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: internalHeaders() });
  await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: humanHeaders() });

  const observed = linkOpenedRows();
  assert.equal(observed.length, 2, "le contrôle interne ne doit jamais s'approprier le slot du prospect");
  assert.deepEqual(observed.map((row) => row.metadata.trafficClass), ["internal", "human"]);
  assert.notEqual(observed[0].dedupe_key, observed[1].dedupe_key, "deux classes ⇒ deux clés");
});

test("(e) la classe de trafic est réellement présente dans la clé de dédup", () => {
  const keys = TRAFFIC_CLASSES.map((trafficClass) => reportLinkOpenedDedupeKey(AUDIT_ID, trafficClass, new Date("2026-08-26T10:00:00.000Z")));
  assert.equal(new Set(keys).size, TRAFFIC_CLASSES.length, "chaque classe doit produire une clé distincte");
  for (const trafficClass of TRAFFIC_CLASSES) {
    assert.ok(
      reportLinkOpenedDedupeKey(AUDIT_ID, trafficClass, new Date("2026-08-26T10:00:00.000Z")).includes(`:${trafficClass}:`),
      `la classe ${trafficClass} doit apparaître dans la clé`
    );
  }
});

// --- (f) Serveur-seul, jamais client -----------------------------------------

test("(f) report_link_opened est dans FUNNEL_EVENTS, ABSENT de CLIENT_FUNNEL_EVENTS, donc SERVER_ONLY", () => {
  assert.ok((FUNNEL_EVENTS as readonly string[]).includes("report_link_opened"));
  assert.equal(
    (CLIENT_FUNNEL_EVENTS as readonly string[]).includes("report_link_opened"),
    false,
    "l'ajouter à CLIENT_FUNNEL_EVENTS laisserait un navigateur forger cet événement via POST /api/funnel"
  );
  assert.ok(
    SERVER_ONLY_FUNNEL_EVENTS.includes("report_link_opened"),
    "SERVER_ONLY_FUNNEL_EVENTS est DÉRIVÉ : la constante doit y atterrir toute seule"
  );
});

test("(f) l'espace de nommage report_link_opened: est protégé des clés client", () => {
  // Une clé client qui viserait le slot serveur est RÉÉCRITE, pas jetée :
  // l'événement reste compté, il perd seulement le droit de réclamer un slot qui
  // n'est pas le sien.
  const forgee = `report_link_opened:${AUDIT_ID}:human:2026-08-26`;
  assert.equal(namespacedDedupeKey("human", forgee), `client:${forgee}`);
  assert.equal(namespacedDedupeKey("bot", forgee), `bot:${forgee}`);
});

// --- (g) Lisible par GET /api/funnel?audit_id=<uuid> --------------------------

test("(g) GET /api/funnel?audit_id=<uuid> rend report_link_opened dans counts ET counts_by_traffic_class", async () => {
  reset();
  await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: internalHeaders() });
  await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: humanHeaders() });

  const res = await GET(new realNext.NextRequest(`https://www.getpick.ai/api/funnel?audit_id=${AUDIT_ID}`));
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.audit_id, AUDIT_ID);
  assert.equal(body.counts.report_link_opened, 2, "les deux ouvertures doivent être comptées");
  assert.equal(body.counts_by_traffic_class.report_link_opened.human, 1);
  assert.equal(body.counts_by_traffic_class.report_link_opened.internal, 1);
  assert.equal(body.counts_by_traffic_class.report_link_opened.bot, 0);
  assert.equal(
    body.counts_by_traffic_class.report_link_opened.unknown,
    0,
    "aucune ouverture ne doit retomber sur `unknown` : la classe est écrite à l'insertion"
  );

  // Invariant structurel de `foldFunnelCounts` : la somme des 4 classes fait le total.
  const parClasse = body.counts_by_traffic_class.report_link_opened as Record<string, number>;
  assert.equal(Object.values(parClasse).reduce((total, value) => total + value, 0), body.counts.report_link_opened);

  // La north star reste distincte et à zéro : l'écart entre les deux séries est
  // précisément l'information que cette story crée.
  assert.equal(body.counts.report_viewed, 0);
  assert.ok(body.traffic_classes.includes("human") && body.traffic_classes.includes("internal"));
});

test("(g) l'agrégat sans audit_id porte lui aussi report_link_opened", async () => {
  reset();
  await recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: humanHeaders() });

  const res = await GET(new realNext.NextRequest("https://www.getpick.ai/api/funnel"));
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.counts.report_link_opened, 1);
  assert.equal(body.counts_by_traffic_class.report_link_opened.human, 1);
});

// --- Robustesse : une panne de mesure ne casse pas la page d'un prospect -----

test("une panne de base ne remonte AUCUNE exception à la page", async () => {
  reset();
  insertShouldThrow = true;

  // Si cet appel rejetait, le RSC tomberait en erreur et le prospect qui a
  // cliqué son lien verrait une 500 au lieu de son rapport.
  await assert.doesNotReject(() =>
    recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: humanHeaders() })
  );
  assert.equal(linkOpenedRows().length, 0);
});

test("une classification qui lève ne casse pas la page non plus", async () => {
  reset();
  const headersQuiLevent = {
    get() {
      throw new Error("en-têtes indisponibles (simulé)");
    },
  };

  await assert.doesNotReject(() =>
    recordReportLinkOpened({ auditId: AUDIT_ID, shareTokenValid: true, requestHeaders: headersQuiLevent })
  );
  assert.equal(linkOpenedRows().length, 0);
});

// --- Câblage de la page (source, commentaires retirés) ------------------------

/**
 * Source de `page.tsx` DÉBARRASSÉE de ses commentaires.
 *
 * Sans ce nettoyage, commenter l'émission — la mutation exacte que la suite doit
 * détecter — laisserait le texte `recordReportLinkOpened(` dans le fichier et
 * les assertions ci-dessous resteraient vertes. Un test de câblage qui survit à
 * la suppression de ce qu'il câble ne mesure rien.
 */
const pageSource = (() => {
  const raw = readFileSync(resolve(repoRoot, "src/app/audit/[id]/page.tsx"), "utf8");
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
})();

test("(a) câblage — page.tsx émet réellement l'événement, avant le rendu", () => {
  assert.match(
    pageSource,
    /import \{ recordReportLinkOpened \} from "@\/lib\/funnel";/,
    "page.tsx doit importer l'émetteur depuis @/lib/funnel"
  );
  assert.match(
    pageSource,
    /await recordReportLinkOpened\(\{/,
    "l'émission doit être présente ET attendue : en serverless une promesse non attendue peut être tuée avec le process"
  );
});

test("(c) câblage — l'émission est conditionnée au jeton, et le jeton n'est vérifié qu'UNE fois", () => {
  const appel = pageSource.match(/await recordReportLinkOpened\(\{[\s\S]*?\}\);/);
  assert.ok(appel, "l'appel à recordReportLinkOpened doit exister");
  assert.match(appel[0], /shareTokenValid/, "la validité du jeton doit être passée à l'émetteur");
  assert.match(appel[0], /auditId: audit\.id/, "l'événement doit porter l'audit_id du lien");
  assert.match(appel[0], /requestHeaders: await headers\(\)/, "la classe doit être calculée sur les en-têtes de LA requête servie");

  const verifications = pageSource.match(/verifyAuditShareToken\(/g) ?? [];
  assert.equal(
    verifications.length,
    1,
    "un seul appel à verifyAuditShareToken par requête : deux vérifications, c'est un HMAC inutile et deux vérités possibles"
  );
  assert.match(pageSource, /const shareTokenValid = verifyAuditShareToken\(audit\.id, shareToken\);/);
  assert.match(pageSource, /shareTokenValid,\n\s*\}\);/, "resolveReportAccess doit réutiliser la MÊME const");
});

test("report_viewed n'est pas réintroduit côté serveur dans page.tsx", () => {
  assert.equal(
    /recordFunnelEvent\(/.test(pageSource),
    false,
    "aucun appel direct à recordFunnelEvent dans le RSC : c'est la panne de juillet (un F5 = une vue)"
  );
  assert.equal(pageSource.includes('"report_viewed"'), false, "report_viewed reste au beacon client");
});

// --- Migration : la contrainte CHECK doit connaître le nouvel événement -------

test("la contrainte CHECK sur event_name accepte report_link_opened", () => {
  const dbSource = readFileSync(resolve(repoRoot, "src/lib/db.ts"), "utf8");
  const check = dbSource.match(/CHECK \(event_name IN \(([^)]*)\)\)/);
  assert.ok(check, "la contrainte audit_funnel_events_event_name_check doit exister");

  const autorises = check[1].split(",").map((value) => value.trim().replace(/^'|'$/g, ""));
  for (const eventName of FUNNEL_EVENTS) {
    assert.ok(
      autorises.includes(eventName),
      `« ${eventName} » est dans FUNNEL_EVENTS mais absent de la contrainte CHECK : tout INSERT échouerait en production`
    );
  }
});
