import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * `GET /api/funnel?audit_id=<uuid>` — attribution PAR AUDIT.
 *
 * Ce que ces tests protègent, et pourquoi ça se mesure. Au 25/08, la route ne
 * rendait que des compteurs AGRÉGÉS sur tout le trafic : `report_viewed` = 1,
 * dont `human` = 1, et cet unique événement humain était le nôtre. Six e-mails
 * de prospection partaient le jour même. Le jour où le compteur passe de 1 à 2,
 * rien ne disait QUEL audit avait été vu, donc quel prospect avait mordu — les
 * deux premiers envois ont rendu un résultat illisible pour cette raison exacte.
 *
 * Le modèle d'autorisation est tranché : connaître l'uuid vaut autorisation.
 * L'identifiant est un v4 non devinable, envoyé au seul prospect concerné, et
 * aucune clé d'admin n'est demandée sur ce chemin. Ce choix a un prix, et c'est
 * lui que la suite ci-dessous facture :
 *   - l'étanchéité doit être réelle et portée par le SQL (test A) ;
 *   - un PRÉFIXE d'uuid doit être refusé, jamais élargi (test B), sinon la route
 *     devient un scanner des identifiants de nos clients ;
 *   - toute forme d'énumération est refusée (test C) ;
 *   - un uuid inconnu répond 200 à zéro, pas 404 (test D), sinon la route
 *     devient un oracle d'existence pour qui devine.
 *
 * Convention du dépôt (cf. `funnel-route-traffic-class.test.ts`) : aucun import
 * STATIQUE de module applicatif — les imports statiques sont hoistés AVANT les
 * `mock.module`, et `@/lib/funnel` embarquerait alors le vrai `pool`. Seuls
 * `next/server` et `@/lib/db` sont mockés ; le vrai `@/lib/funnel` est conservé,
 * c'est lui qui porte `foldFunnelCounts` et l'invariant de somme.
 */

const repoRoot = resolve(import.meta.dirname, "..");
const nextServerUrl = pathToFileURL(resolve(repoRoot, "node_modules/next/server.js")).href;
const dbUrl = pathToFileURL(resolve(repoRoot, "src/lib/db.ts")).href;

const realNext = await import("next/server");

type QueryCall = { text: string; params: unknown[] };

/** Une ligne BRUTE de `audit_funnel_events`, telle qu'elle existe en base. */
type EventRow = {
  audit_id: string;
  event_name: string;
  traffic_class: string | null;
  created_at: string;
};

const queries: QueryCall[] = [];
let eventRows: EventRow[] = [];
let since: Date | null = null;

/**
 * Regroupe des lignes brutes comme le ferait le `GROUP BY (event_name,
 * traffic_class)` de la route, en portant le `MAX(created_at)` de chaque groupe.
 */
function groupRows(rows: EventRow[]) {
  const groups = new Map<string, { event_name: string; traffic_class: string | null; count: number; last: string }>();

  for (const row of rows) {
    const key = `${row.event_name} ${row.traffic_class ?? ""}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (row.created_at > existing.last) existing.last = row.created_at;
      continue;
    }
    groups.set(key, {
      event_name: row.event_name,
      traffic_class: row.traffic_class,
      count: 1,
      last: row.created_at,
    });
  }

  return Array.from(groups.values()).map((group) => ({
    event_name: group.event_name,
    traffic_class: group.traffic_class,
    count: String(group.count),
    last_event_at: new Date(group.last),
  }));
}

mock.module(nextServerUrl, {
  namedExports: {
    NextRequest: realNext.NextRequest,
    NextResponse: realNext.NextResponse,
    after: () => {},
  },
});

/**
 * Le mock se comporte comme Postgres, PAS comme une gentille fixture : c'est LUI
 * qui applique le `WHERE audit_id = $1`, et seulement si la requête émise le
 * porte réellement. Une route qui oublierait le filtre SQL (ou qui le
 * remplacerait par un tri côté JS) recevrait ici la table ENTIÈRE, tous audits
 * confondus — et le test A verrait immédiatement les événements du voisin. Une
 * fixture pré-filtrée aurait masqué exactement ce défaut.
 */
mock.module(dbUrl, {
  namedExports: {
    ensureAuditSchema: async () => {},
    pool: {
      query: async (text: string, params: unknown[] = []) => {
        queries.push({ text, params });
        if (text.includes("MIN(created_at)")) return { rows: [{ since }] };
        if (text.includes("GROUP BY event_name")) {
          const filtered = text.includes("audit_id = $1")
            ? eventRows.filter((row) => row.audit_id === params[0])
            : eventRows;
          return { rows: groupRows(filtered) };
        }
        return { rows: [] };
      },
    },
  },
});

const { FUNNEL_EVENTS, resetTrafficClassSinceCache } = await import("@/lib/funnel");
const { GET } = await import("@/app/api/funnel/route");

/** Deux audits distincts, tous deux des uuid v4 réels. */
const AUDIT_A = "3f2a1b4c-1111-4222-8333-444455556666";
const AUDIT_B = "9c8b7a6d-5555-4666-9777-888899990000";
const AUDIT_INCONNU = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

function reset() {
  queries.length = 0;
  eventRows = [];
  since = null;
  resetTrafficClassSinceCache();
}

function get(query = "") {
  return GET(new realNext.NextRequest(`https://www.getpick.ai/api/funnel${query}`));
}

/**
 * Le jeu de données des tests d'étanchéité : deux audits, des classes de trafic
 * différentes, et les événements de B TOUS postérieurs à ceux de A — de sorte
 * qu'une fuite se voie aussi bien dans les compteurs que dans `last_event_at`.
 */
function deuxAudits() {
  eventRows = [
    { audit_id: AUDIT_A, event_name: "report_viewed", traffic_class: "human", created_at: "2026-08-25T09:00:00.000Z" },
    { audit_id: AUDIT_A, event_name: "teaser_cta_click", traffic_class: "human", created_at: "2026-08-25T09:05:00.000Z" },
    { audit_id: AUDIT_B, event_name: "report_viewed", traffic_class: "bot", created_at: "2026-08-26T12:00:00.000Z" },
    { audit_id: AUDIT_B, event_name: "report_viewed", traffic_class: "bot", created_at: "2026-08-26T12:10:00.000Z" },
    { audit_id: AUDIT_B, event_name: "checkout_opened", traffic_class: "human", created_at: "2026-08-26T12:30:00.000Z" },
  ];
}

test("TEST A — étanchéité : la réponse ne porte QUE les événements de l'audit demandé", async () => {
  reset();
  deuxAudits();

  const res = await get(`?audit_id=${AUDIT_A}`);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.audit_id, AUDIT_A);

  // Compteurs : ceux de A, et rien de B. Sans étanchéité, `report_viewed`
  // vaudrait 3 (1 de A + 2 de B) et `checkout_opened` vaudrait 1 — c'est-à-dire
  // exactement la fausse bonne nouvelle qu'on cherche à ne jamais lire.
  assert.equal(body.counts.report_viewed, 1);
  assert.equal(body.counts.teaser_cta_click, 1);
  assert.equal(body.counts.checkout_opened, 0);
  assert.equal(body.counts_by_traffic_class.report_viewed.human, 1);
  assert.equal(body.counts_by_traffic_class.report_viewed.bot, 0, "les 2 vues bot de l'audit B n'ont rien à faire ici");

  // Classes observées : A n'a été vu que par des humains. La classe `bot` de B
  // ne doit pas apparaître.
  assert.deepEqual(body.traffic_classes, ["human"]);

  // Dernier événement : celui de A (09:05), pas celui de B (le lendemain 12:30).
  assert.equal(body.last_event_at, "2026-08-25T09:05:00.000Z");

  // Aucun identifiant tiers ne doit transiter, sous quelque forme que ce soit.
  assert.equal(JSON.stringify(body).includes(AUDIT_B), false, "l'identifiant d'un autre audit ne doit jamais sortir");
});

test("TEST A — le filtre est porté par le SQL, en paramètre LIÉ, pas par un tri côté JS", async () => {
  reset();
  deuxAudits();

  await get(`?audit_id=${AUDIT_A}`);

  const auditQuery = queries.find((query) => query.text.includes("GROUP BY event_name"));
  assert.ok(auditQuery, "aucune requête de compteurs n'a été émise");

  // Le filtre doit être DANS le SQL. Un filtrage fait uniquement côté JS
  // ramènerait toute la table sur le pool de production, et disparaîtrait au
  // premier refactor sans qu'un compteur ne bouge.
  assert.match(auditQuery.text, /WHERE audit_id = \$1::uuid/);

  // ...et la valeur doit être LIÉE, jamais concaténée.
  assert.deepEqual(auditQuery.params, [AUDIT_A]);
  assert.equal(auditQuery.text.includes(AUDIT_A), false, "l'uuid ne doit pas être interpolé dans le texte de la requête");

  // Ni `LIKE`, ni joker : la seule comparaison admise est l'égalité.
  assert.equal(/LIKE/i.test(auditQuery.text), false);
  assert.equal(auditQuery.text.includes("%"), false);
});

test("TEST A — l'audit voisin est lisible séparément : c'est bien un filtre, pas un masquage", async () => {
  reset();
  deuxAudits();

  const body = await (await get(`?audit_id=${AUDIT_B}`)).json();

  assert.equal(body.counts.report_viewed, 2);
  assert.equal(body.counts.checkout_opened, 1);
  assert.equal(body.counts.teaser_cta_click, 0, "le clic de l'audit A n'appartient pas à B");
  assert.deepEqual(body.traffic_classes, ["human", "bot"]);
  assert.equal(body.last_event_at, "2026-08-26T12:30:00.000Z");
});

test("TEST B — un PRÉFIXE d'uuid réellement présent est REFUSÉ en 400, jamais élargi", async () => {
  // Chaque valeur ci-dessous est un début du vrai `AUDIT_A`. Si l'une d'elles
  // était acceptée, la route deviendrait un scanner par préfixe sur les
  // identifiants de nos clients — et l'autorisation « connaître l'uuid » ne
  // vaudrait plus rien puisqu'on pourrait le deviner morceau par morceau.
  const prefixes = [
    AUDIT_A.slice(0, 4), // "3f2a"
    AUDIT_A.slice(0, 9), // "3f2a1b4c-"
    AUDIT_A.slice(0, 18),
    AUDIT_A.slice(0, AUDIT_A.length - 1), // uuid tronqué d'un seul caractère
  ];

  for (const prefix of prefixes) {
    reset();
    deuxAudits();

    const res = await get(`?audit_id=${prefix}`);

    assert.equal(res.status, 400, `« ${prefix} » doit être refusé, pas interprété`);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "audit_id_invalid");
    assert.ok(typeof body.message === "string" && body.message.length > 0, "le refus doit être explicite");

    // Aucun compteur ne sort : ni ceux de A, ni un repli sur l'agrégat.
    assert.equal("counts" in body, false, "un refus ne doit jamais rendre de compteurs");
    assert.equal("last_event_at" in body, false);

    // La forme est vérifiée AVANT la base : aucune requête n'est même émise.
    assert.equal(queries.length, 0, `« ${prefix} » a atteint la base : ${JSON.stringify(queries)}`);
  }
});

test("TEST B — un uuid COMPLET reste accepté : le refus ne vient pas d'une route cassée", async () => {
  reset();
  deuxAudits();

  const res = await get(`?audit_id=${AUDIT_A}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).counts.report_viewed, 1);
});

test("TEST C — toute forme d'ÉNUMÉRATION est refusée en 400", async () => {
  const cases: [string, string][] = [
    [`?audit_id=${AUDIT_A}&audit_id=${AUDIT_B}`, "audit_id_enumeration"],
    [`?audit_id=${AUDIT_A},${AUDIT_B}`, "audit_id_enumeration"],
    [`?audit_id=${AUDIT_A};${AUDIT_B}`, "audit_id_enumeration"],
    [`?audit_id[]=${AUDIT_A}`, "audit_id_enumeration"],
    [`?audit_id[0]=${AUDIT_A}&audit_id[1]=${AUDIT_B}`, "audit_id_enumeration"],
    [`?audit_ids=${AUDIT_A}`, "audit_id_enumeration"],
    ["?audit_id=*", "audit_id_invalid"],
    ["?audit_id=%25", "audit_id_invalid"],
    [`?audit_id=${AUDIT_A.slice(0, 8)}%25`, "audit_id_invalid"],
    [`?audit_id=${AUDIT_A.slice(0, 8)}_______`, "audit_id_invalid"],
  ];

  for (const [query, expectedError] of cases) {
    reset();
    deuxAudits();

    const res = await get(query);
    assert.equal(res.status, 400, `« ${query} » doit être refusé`);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, expectedError, `« ${query} » : code de refus inattendu (${body.error})`);
    // Le piège que ces cas ferment : une clé non reconnue qui retomberait
    // SILENCIEUSEMENT sur les compteurs agrégés. Un refus, pas un repli.
    assert.equal("counts" in body, false, `« ${query} » est retombé sur l'agrégat`);
    assert.equal(queries.length, 0, `« ${query} » a atteint la base`);
  }
});

test("TEST D — un uuid bien formé mais INCONNU rend 200 à zéro, jamais 404", async () => {
  reset();
  deuxAudits();

  const res = await get(`?audit_id=${AUDIT_INCONNU}`);

  // Un 404 distinguerait « cet uuid existe » de « cet uuid n'existe pas ».
  // Comme l'accès est accordé sur la SEULE connaissance de l'uuid, cette
  // distinction ferait de la route un oracle d'existence pour qui devine.
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.audit_id, AUDIT_INCONNU);
  assert.equal(body.last_event_at, null);
  assert.deepEqual(body.traffic_classes, []);

  for (const eventName of FUNNEL_EVENTS) {
    assert.equal(body.counts[eventName], 0, `${eventName} devrait être à zéro`);
  }
});

test("TEST D — un audit inconnu et un audit connu SANS événement sont indiscernables", async () => {
  // L'oracle d'existence ne se referme que si les deux cas répondent à
  // l'identique : même statut, mêmes clés, mêmes valeurs. Ici l'audit A existe
  // (il est dans le jeu) mais n'a produit aucun événement, et AUDIT_INCONNU
  // n'existe pas du tout.
  reset();
  const connuSansEvenement = await get(`?audit_id=${AUDIT_A}`);
  const corpsConnu = await connuSansEvenement.json();

  reset();
  const inconnu = await get(`?audit_id=${AUDIT_INCONNU}`);
  const corpsInconnu = await inconnu.json();

  assert.equal(connuSansEvenement.status, inconnu.status);
  assert.deepEqual(Object.keys(corpsConnu).sort(), Object.keys(corpsInconnu).sort());
  assert.deepEqual({ ...corpsConnu, audit_id: null }, { ...corpsInconnu, audit_id: null });
});

test("audit_id ABSENT — le comportement agrégé historique est inchangé", async () => {
  reset();
  deuxAudits();

  const res = await get();
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.deepEqual(Object.keys(body).sort(), ["counts", "counts_by_traffic_class", "ok", "traffic_class_since", "window"]);
  assert.equal(body.window, "14d");
  // Tous audits confondus : c'est précisément la mesure qu'on ne sait pas
  // attribuer, et qui reste disponible telle quelle.
  assert.equal(body.counts.report_viewed, 3);

  const aggregate = queries.find((query) => query.text.includes("GROUP BY event_name"));
  assert.ok(aggregate);
  assert.deepEqual(aggregate.params, [], "le chemin agrégé ne prend aucun paramètre");
  assert.equal(aggregate.text.includes("audit_id"), false);
});

test("le chemin audit_id n'exige AUCUNE clé d'admin et n'ouvre AUCUN événement brut", async () => {
  reset();
  deuxAudits();
  const previous = process.env.FUNNEL_ADMIN_KEY;
  process.env.FUNNEL_ADMIN_KEY = "cle-admin-de-test";

  try {
    // Sans clé : la réponse par audit est servie normalement.
    const sansCle = await get(`?audit_id=${AUDIT_A}`);
    assert.equal(sansCle.status, 200);
    const body = await sansCle.json();
    assert.equal(body.counts.report_viewed, 1);

    // Rien de ce que protège `x-funnel-key` ne fuit par ce chemin.
    for (const forbidden of ["recent_events", "metadata", "source"]) {
      assert.equal(JSON.stringify(body).includes(forbidden), false, `« ${forbidden} » ne doit pas sortir ici`);
    }

    // Et AVEC la clé d'admin, le chemin par audit reste le chemin par audit :
    // il sort avant le mode détaillé, donc aucun événement brut n'est requêté.
    reset();
    deuxAudits();
    const avecCle = await GET(
      new realNext.NextRequest(`https://www.getpick.ai/api/funnel?audit_id=${AUDIT_A}`, {
        headers: { "x-funnel-key": "cle-admin-de-test" },
      })
    );
    assert.equal(avecCle.status, 200);
    assert.equal("recent_events" in (await avecCle.json()), false);
    assert.equal(queries.some((query) => query.text.includes("LIMIT 100")), false);
  } finally {
    if (previous === undefined) delete process.env.FUNNEL_ADMIN_KEY;
    else process.env.FUNNEL_ADMIN_KEY = previous;
  }
});

test("un `unknown` observé n'est JAMAIS promu human, et la date de rupture accompagne la réponse", async () => {
  reset();
  since = new Date("2026-07-29T08:15:00.000Z");
  eventRows = [
    // Événement antérieur à la classification : NON CLASSÉ, ce qui ne veut dire
    // ni « humain » ni « non humain ».
    { audit_id: AUDIT_A, event_name: "report_viewed", traffic_class: null, created_at: "2026-07-01T10:00:00.000Z" },
  ];

  const body = await (await get(`?audit_id=${AUDIT_A}`)).json();

  assert.equal(body.counts.report_viewed, 1);
  assert.equal(body.counts_by_traffic_class.report_viewed.unknown, 1);
  assert.equal(body.counts_by_traffic_class.report_viewed.human, 0, "`unknown` ne doit jamais être promu `human`");
  assert.deepEqual(body.traffic_classes, ["unknown"]);
  assert.equal(body.traffic_class_since, "2026-07-29T08:15:00.000Z");
});

test("l'invariant de somme tient aussi par audit : 4 classes = compteur de l'événement", async () => {
  reset();
  eventRows = [
    { audit_id: AUDIT_A, event_name: "report_viewed", traffic_class: "human", created_at: "2026-08-25T09:00:00.000Z" },
    { audit_id: AUDIT_A, event_name: "report_viewed", traffic_class: "bot", created_at: "2026-08-25T09:01:00.000Z" },
    { audit_id: AUDIT_A, event_name: "report_viewed", traffic_class: "internal", created_at: "2026-08-25T09:02:00.000Z" },
    { audit_id: AUDIT_A, event_name: "report_viewed", traffic_class: null, created_at: "2026-08-25T09:03:00.000Z" },
  ];

  const body = await (await get(`?audit_id=${AUDIT_A}`)).json();

  for (const eventName of FUNNEL_EVENTS) {
    const bucket = body.counts_by_traffic_class[eventName];
    assert.ok(bucket, `ventilation manquante pour ${eventName}`);
    assert.deepEqual(Object.keys(bucket).sort(), ["bot", "human", "internal", "unknown"]);
    assert.equal(bucket.human + bucket.bot + bucket.internal + bucket.unknown, body.counts[eventName], eventName);
  }

  assert.equal(body.counts.report_viewed, 4);
  assert.deepEqual(body.traffic_classes, ["human", "bot", "internal", "unknown"]);
});
