import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

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

const { FUNNEL_EVENTS } = await import("@/lib/funnel");
const { GET, POST } = await import("@/app/api/funnel/route");

const GPT_BOT = "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function reset() {
  queries.length = 0;
  groupedRows = [];
  since = null;
}

function postRequest(userAgent: string, body: unknown) {
  return new realNext.NextRequest("https://www.getpick.ai/api/funnel", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": userAgent },
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
});

test("AC4 — le dedupe_key transmis est celui du client, inchangé", async () => {
  reset();
  await POST(postRequest(CHROME_MAC, { event_name: "report_viewed", dedupe_key: "report_viewed:abc:session-1" }));
  await POST(postRequest(CHROME_MAC, { event_name: "report_viewed", dedupe_key: "report_viewed:abc:session-1" }));

  const written = insertedEvents();
  assert.equal(written.length, 2);
  // La dédup est faite par `ON CONFLICT (dedupe_key) DO NOTHING` en base : ce que
  // ce test verrouille est que la clé transmise n'a pas bougé d'un octet.
  assert.equal(written[0].dedupeKey, "report_viewed:abc:session-1");
  assert.equal(written[1].dedupeKey, written[0].dedupeKey);
  for (const query of queries.filter((call) => call.text.includes("INSERT INTO audit_funnel_events"))) {
    assert.match(query.text, /ON CONFLICT \(dedupe_key\) DO NOTHING/);
  }
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
  assert.match(sinceQuery.text, /trafficClass' IS NOT NULL/);
});
