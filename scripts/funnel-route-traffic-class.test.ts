import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { CLASSIFIED_TRAFFIC_CLASSES_PREDICATE_SQL } from "@/lib/traffic-filter";

/**
 * `GET` et `POST /api/funnel`. Seuls `next/server` et `@/lib/db` sont mockés :
 * on veut le VRAI `@/lib/funnel` (c'est `foldFunnelCounts` qui rend l'invariant
 * de somme structurel, et `recordFunnelEvent` qui porte le `ON CONFLICT`). Les
 * écritures sont donc observées au niveau de `pool.query`, ce qui vérifie en
 * prime le `dedupe_key` réellement transmis.
 *
 * Aucun import STATIQUE de module applicatif ici : les imports statiques sont
 * hoistés avant les `mock.module`, et `@/lib/funnel` embarquerait alors le vrai
 * `pool` (tentative de connexion Postgres à l'écriture).
 *
 * UNE exception : `@/lib/traffic-filter`, qui ne dépend que de `node:crypto` —
 * il n'atteint ni `@/lib/db` ni `next/server`, donc le hoisting est sans effet.
 */

const repoRoot = resolve(import.meta.dirname, "..");
const nextServerUrl = pathToFileURL(resolve(repoRoot, "node_modules/next/server.js")).href;
const dbUrl = pathToFileURL(resolve(repoRoot, "src/lib/db.ts")).href;

const realNext = await import("next/server");

type QueryCall = { text: string; params: unknown[] };

const queries: QueryCall[] = [];
let groupedRows: { event_name: string; traffic_class: string | null; count: string }[] = [];
let since: Date | null = null;

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
        queries.push({ text, params });
        if (text.includes("GROUP BY event_name")) return { rows: groupedRows };
        if (text.includes("MIN(created_at)")) return { rows: [{ since }] };
        return { rows: [] };
      },
    },
  },
});

const {
  FUNNEL_EVENTS,
  MAX_CLIENT_FUNNEL_EVENTS_PER_MINUTE,
  SERVER_ONLY_FUNNEL_EVENTS,
  clientFunnelRateLimiter,
  resetTrafficClassSinceCache,
} = await import("@/lib/funnel");
const { GET, POST } = await import("@/app/api/funnel/route");

const GPT_BOT = "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function reset() {
  queries.length = 0;
  groupedRows = [];
  since = null;
  // Deux états de process à remettre à zéro, sinon les tests se contaminent :
  // le compteur de débit (les requêtes qui portent un `x-forwarded-for` y
  // laissent une fenêtre ; celles qui n'en portent pas ne sont plus comptées du
  // tout) et la mémoïsation de la date de rupture.
  clientFunnelRateLimiter.reset();
  resetTrafficClassSinceCache();
}

function postRequest(userAgent: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new realNext.NextRequest("https://www.getpick.ai/api/funnel", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": userAgent, ...extraHeaders },
    body: JSON.stringify(body),
  });
}

function insertedEvents() {
  return queries
    .filter((query) => query.text.includes("INSERT INTO audit_funnel_events"))
    .map((query) => ({
      eventName: query.params[0] as string,
      metadata: JSON.parse(query.params[3] as string) as Record<string, unknown>,
      dedupeKey: query.params[4] as string | null,
    }));
}

/**
 * AC2 — la metadata écrite ne porte aucune donnée personnelle.
 *
 * Même helper que `run-audit-traffic-class.test.ts` et
 * `capture-email-traffic-class.test.ts`. Il manquait ICI, sur la seule route qui
 * lisait vraiment les en-têtes du navigateur : le critère était couvert là où il
 * ne risquait rien.
 */
function assertNoPersonalData(metadata: Record<string, unknown> | undefined) {
  const keys = Object.keys(metadata ?? {});
  for (const forbidden of ["userAgent", "user_agent", "ip", "ipHash", "clientIp", "cookie", "referrer"]) {
    assert.equal(keys.includes(forbidden), false, `metadata ne doit pas contenir « ${forbidden} » : ${keys.join(", ")}`);
  }
}

test("AC4 — un report_viewed de crawler est ENREGISTRÉ et marqué bot, réponse 200", async () => {
  reset();
  const res = await POST(postRequest(GPT_BOT, { event_name: "report_viewed", dedupe_key: "report_viewed:abc:session-1" }));

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  // Avant cette story : recorded === 0 et l'événement disparaissait sans trace.
  assert.equal(body.recorded, 1);
  assert.equal(body.traffic_class, "bot");

  const written = insertedEvents();
  assert.equal(written.length, 1);
  assert.equal(written[0].eventName, "report_viewed");
  assert.equal(written[0].metadata.trafficClass, "bot");
  assertNoPersonalData(written[0].metadata);
});

test("AC2 — aucun UA, aucun referer, aucune empreinte d'IP n'est persisté, même pour nous", async () => {
  reset();
  // La requête exacte du finding : navigateur réel, cookie interne, referer de
  // webmail portant une adresse e-mail, IP transmise par le proxy.
  const res = await POST(
    postRequest(
      CHROME_MAC,
      { event_name: "report_viewed", metadata: { brandName: "Acme" } },
      {
        cookie: "gp_internal=1",
        referer: "https://mail.google.com/mail/u/0/?email=charles.kremer%40gmail.com#inbox/audit-abcd",
        "x-forwarded-for": "88.120.4.17",
      }
    )
  );

  assert.equal(res.status, 200);
  const written = insertedEvents();
  assert.equal(written.length, 1, "l'événement interne est bien ENREGISTRÉ (marquage, pas rejet)");
  assert.equal(written[0].metadata.trafficClass, "internal");
  assertNoPersonalData(written[0].metadata);
  // La metadata fonctionnelle du client survit, elle.
  assert.equal(written[0].metadata.brandName, "Acme");

  // Filet supplémentaire : rien de la requête ne doit se retrouver sérialisé,
  // sous quelque clé que ce soit.
  const serialized = JSON.stringify(written[0].metadata);
  for (const forbidden of ["charles.kremer", "mail.google.com", "Chrome/139", "88.120.4.17", "gp_internal"]) {
    assert.equal(serialized.includes(forbidden), false, `« ${forbidden} » ne doit pas être persisté : ${serialized}`);
  }
});

test("AC4 — la clé d'une vue HUMAINE est transmise telle quelle, octet pour octet", async () => {
  reset();
  // Cette clé vit dans le `sessionStorage` du navigateur (`gp_sid`) et survit
  // donc à un déploiement. La préfixer aurait produit une SECONDE ligne pour la
  // même session et le même audit dès le premier F5 après mise en production —
  // un sur-comptage de `report_viewed.human`, la seule série de référence.
  const clientKey = "report_viewed:abc:session-1";
  await POST(postRequest(CHROME_MAC, { event_name: "report_viewed", dedupe_key: clientKey }));

  const written = insertedEvents();
  assert.equal(written.length, 1);
  assert.equal(written[0].dedupeKey, clientKey);
  for (const query of queries.filter((call) => call.text.includes("INSERT INTO audit_funnel_events"))) {
    assert.match(query.text, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
  }
});

test("AC4 — un bot ne peut pas voler le slot de dédup partagé d'un humain", async () => {
  reset();
  // `ReportViewBeacon` retombe sur cette clé PARTAGÉE quand `sessionStorage` est
  // refusé : sans espace de nommage, le contrôle headless du matin ferait
  // disparaître la vue du prospect de l'après-midi via `ON CONFLICT DO NOTHING`.
  const shared = "report_viewed:abc:nosession-2026-07-29";
  await POST(postRequest("HeadlessChrome/139.0.0.0", { event_name: "report_viewed", dedupe_key: shared }));
  await POST(postRequest(CHROME_MAC, { event_name: "report_viewed", dedupe_key: shared }));

  const written = insertedEvents();
  assert.equal(written.length, 2);
  assert.equal(written[0].dedupeKey, `bot:${shared}`);
  assert.equal(written[1].dedupeKey, shared);
  assert.notEqual(written[0].dedupeKey, written[1].dedupeKey, "les deux classes ne doivent pas partager un slot");
});

test("AC4 — un événement interne est lui aussi isolé du slot humain", async () => {
  reset();
  const shared = "report_viewed:abc:nosession-2026-07-29";
  await POST(postRequest(CHROME_MAC, { event_name: "report_viewed", dedupe_key: shared }, { cookie: "gp_internal=1" }));

  const written = insertedEvents();
  assert.equal(written[0].metadata.trafficClass, "internal");
  assert.equal(written[0].dedupeKey, `internal:${shared}`);
});

test("AC4 — la dédup intra-classe est inchangée : même classe, même clé, même slot", async () => {
  reset();
  await POST(postRequest(CHROME_MAC, { event_name: "report_viewed", dedupe_key: "report_viewed:abc:session-1" }));
  await POST(postRequest(CHROME_MAC, { event_name: "report_viewed", dedupe_key: "report_viewed:abc:session-1" }));

  const written = insertedEvents();
  assert.equal(written.length, 2);
  // Deux INSERT partent, la base en garde un : c'est le `ON CONFLICT` qui dédup,
  // et il ne peut le faire que si la clé est identique d'un octet à l'autre.
  assert.equal(written[0].dedupeKey, written[1].dedupeKey);
});

test("sécurité — un client ne peut pas EFFACER un audit_completed en squattant sa clé", async () => {
  reset();
  // Le finding, reproduit tel quel : le demandeur reçoit son `audit_id` dans le
  // 202 de `/api/run-audit`, l'audit dure des dizaines de secondes, il poste
  // pendant ce temps un `report_viewed` avec la clé du `audit_completed` à
  // venir, depuis un Chrome ordinaire. La classe `human` n'étant pas préfixée,
  // la clé partait telle quelle et le `ON CONFLICT DO NOTHING` faisait ensuite
  // disparaître l'`audit_completed` réel.
  const auditId = "3f2a1b4c-1111-4222-8333-444455556666";
  const serverKey = `audit_completed:${auditId}`;

  const res = await POST(
    postRequest(CHROME_MAC, { event_name: "report_viewed", audit_id: auditId, dedupe_key: serverKey })
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  // L'événement est ENREGISTRÉ — on ne réintroduit pas un rejet silencieux.
  assert.equal(body.recorded, 1);
  assert.equal(body.traffic_class, "human");

  const written = insertedEvents();
  assert.equal(written.length, 1);
  assert.equal(written[0].eventName, "report_viewed");
  assert.notEqual(written[0].dedupeKey, serverKey, "la clé serveur ne doit jamais être atteignable depuis le client");
  assert.equal(written[0].dedupeKey, `client:${serverKey}`);
});

test("sécurité — aucune clé d'événement serveur n'est atteignable, quelle que soit la classe", async () => {
  reset();
  const auditId = "3f2a1b4c-1111-4222-8333-444455556666";
  const serverKeys = SERVER_ONLY_FUNNEL_EVENTS.map((eventName) => `${eventName}:${auditId}`);

  for (const [userAgent, extra] of [
    [CHROME_MAC, {}],
    [GPT_BOT, {}],
    [CHROME_MAC, { cookie: "gp_internal=1" }],
  ] as const) {
    for (const serverKey of serverKeys) {
      await POST(postRequest(userAgent, { event_name: "report_viewed", dedupe_key: serverKey }, extra));
    }
  }

  const written = insertedEvents();
  assert.equal(written.length, serverKeys.length * 3);
  for (const event of written) {
    assert.equal(
      serverKeys.includes(event.dedupeKey ?? ""),
      false,
      `la clé « ${event.dedupeKey} » est un slot serveur`
    );
  }
});

test("sécurité — un événement SERVEUR posté par un client anonyme n'est jamais écrit", async () => {
  reset();
  const res = await POST(
    postRequest(CHROME_MAC, {
      events: [
        { event_name: "audit_started" },
        { event_name: "audit_completed" },
        { event_name: "email_captured" },
        { event_name: "followup_1_sent" },
        { event_name: "report_viewed", dedupe_key: "report_viewed:abc:session-1" },
      ],
    })
  );

  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.recorded, 1, "seul l'événement navigateur est retenu");
  assert.equal(body.ignored, 4);

  const written = insertedEvents();
  assert.equal(written.length, 1);
  assert.equal(written[0].eventName, "report_viewed");
});

test("sécurité — un lot d'événements est plafonné, l'écriture en masse est coupée", async () => {
  reset();
  const res = await POST(
    postRequest(CHROME_MAC, {
      events: Array.from({ length: 5000 }, () => ({ event_name: "report_viewed" })),
    })
  );

  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.recorded <= 20, `au plus 20 événements par requête, reçu ${body.recorded}`);
  assert.equal(insertedEvents().length, body.recorded);
});

test("sécurité — le DÉBIT d'un même appelant est plafonné, pas seulement le lot", async () => {
  reset();
  // Le scénario du finding : une boucle qui rejoue indéfiniment un lot de 20
  // `report_viewed` avec un User-Agent de navigateur, donc classés `human`.
  // Sans plafond de débit, 500 requêtes = 10 000 lignes dans la colonne sur
  // laquelle un arbitrage de sprint se prend.
  const flood = { events: Array.from({ length: 20 }, () => ({ event_name: "report_viewed" })) };

  let recorded = 0;
  let throttled = 0;
  for (let index = 0; index < 500; index += 1) {
    const body = await (await POST(postRequest(CHROME_MAC, flood, { "x-forwarded-for": "203.0.113.9" }))).json();
    assert.equal(body.ok, true, "la route répond toujours 200 : un 4xx ferait réessayer le crawler");
    recorded += body.recorded;
    throttled += body.throttled;
  }

  assert.equal(recorded, MAX_CLIENT_FUNNEL_EVENTS_PER_MINUTE, "au plus une fenêtre de débit sur 10 000 événements postés");
  assert.equal(recorded + throttled, 10_000, "tout ce qui n'est pas écrit est compté comme rejeté");
  assert.equal(insertedEvents().length, recorded, "rien n'est écrit en base au-delà du plafond");
});

test("sécurité — des événements INVALIDES ne consomment pas le débit d'un tiers", async () => {
  reset();
  // Le finding : `.take()` était appelé AVANT la validation. Trois requêtes de
  // 20 événements invalides consommaient les 60 unités de la minute, et le
  // `report_viewed` humain suivant sortait en `{allowed: 0}` — un tiers
  // éteignait la mesure d'une IP partagée (NAT d'entreprise, VPN, 4G) sans
  // qu'une seule ligne soit écrite nulle part.
  const ip = { "x-forwarded-for": "203.0.113.9" };
  const garbage = { events: Array.from({ length: 20 }, () => ({ event_name: "audit_started" })) };

  for (let index = 0; index < 3; index += 1) {
    const body = await (await POST(postRequest(CHROME_MAC, garbage, ip))).json();
    assert.equal(body.recorded, 0);
    assert.equal(body.ignored, 20);
    assert.equal(body.throttled, 0, "un événement qui n'écrit rien ne doit rien coûter au plafond");
  }

  const humaine = await (
    await POST(postRequest(CHROME_MAC, { event_name: "report_viewed", dedupe_key: "report_viewed:abc:vraie-vue" }, ip))
  ).json();

  assert.equal(humaine.recorded, 1, "la vue humaine qui suit 60 invalides doit être écrite");
  assert.equal(humaine.throttled, 0);
  assert.equal(insertedEvents().length, 1);
});

test("sécurité — un appelant NON attribuable n'est pas plafonné avec tous les autres", async () => {
  reset();
  // Sans en-tête de proxy, `requestRateLimitKey` retombait sur la clé littérale
  // « no-ip » : TOUS les visiteurs de l'instance partageaient un seul seau de 60
  // par minute. Le 61ᵉ `report_viewed` humain de la minute disparaissait sans
  // trace — le refus d'écriture silencieux que cette story supprime.
  const lot = { events: Array.from({ length: 20 }, () => ({ event_name: "report_viewed" })) };

  let recorded = 0;
  for (let index = 0; index < 10; index += 1) {
    const body = await (await POST(postRequest(CHROME_MAC, lot))).json();
    assert.equal(body.throttled, 0);
    recorded += body.recorded;
  }

  assert.equal(recorded, 200, "aucun plafond ne s'applique à un appelant qu'on ne sait pas attribuer");
  assert.equal(insertedEvents().length, 200);
});

test("la réponse rend compte de TOUT ce qui a été soumis, y compris le surplus tranché", async () => {
  reset();
  // Le finding : le `.slice(0, 20)` était appliqué avant tout comptage. Un POST
  // de 25 événements valides répondait `{recorded: 20, ignored: 0, throttled: 0}`
  // — un appelant qui relit sa réponse pour vérifier son envoi concluait au
  // succès complet alors que 20 % de son lot avait disparu sans trace.
  const submitted = 25;
  const body = await (
    await POST(
      postRequest(CHROME_MAC, { events: Array.from({ length: submitted }, () => ({ event_name: "report_viewed" })) })
    )
  ).json();

  assert.equal(body.recorded, 20);
  assert.equal(body.dropped, 5, "le surplus au-delà du plafond de lot doit être compté");
  assert.equal(
    body.recorded + body.ignored + body.throttled + body.dropped,
    submitted,
    "recorded + ignored + throttled + dropped doit valoir le nombre d'événements soumis"
  );
  assert.equal(insertedEvents().length, body.recorded);
});

test("l'invariant de comptage tient sur les 4 chemins à la fois", async () => {
  reset();
  // Un seul lot qui exerce en même temps : le surplus tranché, les invalides,
  // le plafond de débit et les écritures réussies.
  const ip = { "x-forwarded-for": "198.51.100.77" };
  await POST(
    postRequest(CHROME_MAC, { events: Array.from({ length: 20 }, () => ({ event_name: "report_viewed" })) }, ip)
  ); // consomme 20 des 60 unités

  const submitted = 60;
  const mixed = Array.from({ length: submitted }, (_unused, index) =>
    index % 4 === 0 ? { event_name: "audit_started" } : { event_name: "report_viewed" }
  );
  const body = await (await POST(postRequest(CHROME_MAC, { events: mixed }, ip))).json();

  assert.equal(body.dropped, 40, "60 soumis, 20 traités");
  assert.equal(body.ignored, 5, "un quart des 20 traités sont des événements serveur");
  assert.equal(
    body.recorded + body.ignored + body.throttled + body.dropped,
    submitted,
    `comptage incohérent : ${JSON.stringify(body)}`
  );
});

test("sécurité — le plafond de débit est par appelant, pas global", async () => {
  reset();
  const lot = { events: Array.from({ length: 20 }, () => ({ event_name: "report_viewed" })) };

  for (let index = 0; index < 10; index += 1) {
    await POST(postRequest(CHROME_MAC, lot, { "x-forwarded-for": "203.0.113.9" }));
  }
  // Un autre visiteur, derrière une autre IP, ne doit pas payer pour le premier.
  const other = await (
    await POST(postRequest(CHROME_MAC, lot, { "x-forwarded-for": "198.51.100.4" }))
  ).json();

  assert.equal(other.recorded, 20);
  assert.equal(other.throttled, 0);
});

test("AC4 — anti-usurpation : un client qui se déclare human reste classé bot", async () => {
  reset();
  const res = await POST(
    postRequest(GPT_BOT, { event_name: "report_viewed", metadata: { trafficClass: "human", campaign: "x" } })
  );

  assert.equal(res.status, 200);
  const written = insertedEvents();
  assert.equal(written.length, 1);
  assert.equal(written[0].metadata.trafficClass, "bot", "la classe serveur doit écraser celle du client");
  // La metadata client légitime n'est pas perdue pour autant.
  assert.equal(written[0].metadata.campaign, "x");
});

test("AC5 — la réponse publique ventile les 9 événements en 4 classes, et la somme colle", async () => {
  reset();
  groupedRows = [
    { event_name: "audit_started", traffic_class: "human", count: "12" },
    { event_name: "audit_started", traffic_class: "bot", count: "130" },
    { event_name: "audit_started", traffic_class: null, count: "5" },
    { event_name: "report_viewed", traffic_class: "internal", count: "9" },
  ];
  since = new Date("2026-07-29T08:15:00.000Z");

  const res = await GET(new realNext.NextRequest("https://www.getpick.ai/api/funnel"));
  assert.equal(res.status, 200);
  const body = await res.json();

  for (const eventName of FUNNEL_EVENTS) {
    const bucket = body.counts_by_traffic_class[eventName];
    assert.ok(bucket, `ventilation manquante pour ${eventName}`);
    assert.deepEqual(Object.keys(bucket).sort(), ["bot", "human", "internal", "unknown"]);
    assert.equal(bucket.human + bucket.bot + bucket.internal + bucket.unknown, body.counts[eventName], eventName);
  }

  assert.equal(body.counts.audit_started, 147);
  assert.equal(body.counts_by_traffic_class.audit_started.human, 12);
  assert.equal(body.counts_by_traffic_class.audit_started.bot, 130);
  assert.equal(body.counts_by_traffic_class.audit_started.unknown, 5);
  assert.equal(body.counts_by_traffic_class.report_viewed.internal, 9);
});

test("AC5 — la réponse publique n'expose toujours aucun identifiant", async () => {
  reset();
  groupedRows = [{ event_name: "audit_started", traffic_class: "human", count: "1" }];

  const res = await GET(new realNext.NextRequest("https://www.getpick.ai/api/funnel"));
  const body = await res.json();

  assert.deepEqual(Object.keys(body).sort(), ["counts", "counts_by_traffic_class", "ok", "traffic_class_since", "window"]);
  const serialized = JSON.stringify(body);
  for (const forbidden of ["recent_events", "audit_id", "metadata", "source", "userAgent", "ipHash"]) {
    assert.equal(serialized.includes(forbidden), false, `la réponse publique ne doit pas contenir « ${forbidden} »`);
  }
  // Aucune requête d'événements bruts n'est même émise en mode public.
  assert.equal(queries.some((query) => query.text.includes("LIMIT 100")), false);
});

test("AC6 — traffic_class_since est l'ISO du premier événement classé, null s'il n'y en a aucun", async () => {
  reset();
  since = new Date("2026-07-29T08:15:00.000Z");
  let body = await (await GET(new realNext.NextRequest("https://www.getpick.ai/api/funnel"))).json();
  assert.equal(body.traffic_class_since, "2026-07-29T08:15:00.000Z");

  reset();
  since = null;
  body = await (await GET(new realNext.NextRequest("https://www.getpick.ai/api/funnel"))).json();
  assert.equal(body.traffic_class_since, null);
});

test("AC6 — la date de rupture est cherchée sur toute la table, pas sur la fenêtre 14 jours", async () => {
  reset();
  await GET(new realNext.NextRequest("https://www.getpick.ai/api/funnel"));

  const sinceQuery = queries.find((query) => query.text.includes("MIN(created_at)"));
  assert.ok(sinceQuery);
  assert.equal(sinceQuery.text.includes("14 days"), false, "la date de rupture ne doit pas être bornée à 14 jours");
});

test("AC6 — la date de rupture ignore la valeur littérale « unknown », qui est réellement écrite", async () => {
  reset();
  await GET(new realNext.NextRequest("https://www.getpick.ai/api/funnel"));

  const sinceQuery = queries.find((query) => query.text.includes("MIN(created_at)"));
  assert.ok(sinceQuery);
  // `IS NOT NULL` retiendrait un `audit_completed` marqué 'unknown' par
  // `completeQueuedAudit` (audit mis en file avant le 29/07, terminé après) et
  // publierait une rupture pointant sur un événement NON classé.
  assert.equal(sinceQuery.text.includes("IS NOT NULL"), false);
  assert.equal(sinceQuery.text.includes("'unknown'"), false);
  for (const klass of ["human", "bot", "internal"]) {
    assert.ok(sinceQuery.text.includes(`'${klass}'`), `la classe ${klass} doit être dans le prédicat`);
  }
});

test("perf — le prédicat est un littéral IN, sinon l'index partiel ne peut pas être utilisé", async () => {
  reset();
  await GET(new realNext.NextRequest("https://www.getpick.ai/api/funnel"));

  const sinceQuery = queries.find((query) => query.text.includes("MIN(created_at)"));
  assert.ok(sinceQuery);
  // `= ANY($1::text[])` empêche Postgres de reconnaître le prédicat de
  // `audit_funnel_events_classified_created_idx` : Seq Scan de toute la table à
  // chaque GET public, sans clé d'accès.
  assert.equal(sinceQuery.text.includes("ANY("), false);
  assert.deepEqual(sinceQuery.params, []);
  assert.ok(sinceQuery.text.includes(CLASSIFIED_TRAFFIC_CLASSES_PREDICATE_SQL));
  assert.equal(CLASSIFIED_TRAFFIC_CLASSES_PREDICATE_SQL, "metadata->>'trafficClass' IN ('human', 'bot', 'internal')");

  // `@/lib/db` est mocké ici : on vérifie sur la SOURCE que l'index existe et
  // qu'il est écrit avec la même constante que la requête — c'est cette identité
  // littérale qui permet à Postgres de reconnaître le prédicat partiel.
  const dbSource = await readFile(resolve(repoRoot, "src/lib/db.ts"), "utf8");
  assert.match(dbSource, /CREATE INDEX IF NOT EXISTS audit_funnel_events_classified_created_idx/);
  assert.match(dbSource, /ON audit_funnel_events \(created_at\)/);
  assert.ok(
    dbSource.includes("WHERE ${CLASSIFIED_TRAFFIC_CLASSES_PREDICATE_SQL}"),
    "le prédicat de l'index doit venir de la constante partagée, pas d'une copie"
  );
});

test("perf — une date de rupture non nulle n'est plus jamais recalculée", async () => {
  reset();
  since = new Date("2026-07-29T08:15:00.000Z");

  await GET(new realNext.NextRequest("https://www.getpick.ai/api/funnel"));
  const firstPass = queries.filter((query) => query.text.includes("MIN(created_at)")).length;

  queries.length = 0;
  const body = await (await GET(new realNext.NextRequest("https://www.getpick.ai/api/funnel"))).json();

  assert.equal(firstPass, 1);
  // Valeur monotone : `created_at` vaut `now()` à l'insertion, aucun événement
  // postérieur ne peut être plus ancien que le premier événement classé.
  assert.equal(queries.filter((query) => query.text.includes("MIN(created_at)")).length, 0);
  assert.equal(body.traffic_class_since, "2026-07-29T08:15:00.000Z");
});

test("perf — l'absence de rupture n'est PAS mémorisée, sinon elle le serait à vie", async () => {
  reset();
  since = null;

  let body = await (await GET(new realNext.NextRequest("https://www.getpick.ai/api/funnel"))).json();
  assert.equal(body.traffic_class_since, null);

  since = new Date("2026-07-29T08:15:00.000Z");
  body = await (await GET(new realNext.NextRequest("https://www.getpick.ai/api/funnel"))).json();
  assert.equal(body.traffic_class_since, "2026-07-29T08:15:00.000Z", "le premier événement classé doit être vu");
});
