import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * Test de la route `POST /api/run-audit` sous le runner natif.
 *
 * Trois mocks sont indispensables :
 *  - `next/server` : hors contexte de requête, `after()` lève « was called
 *    outside a request scope », la route tomberait dans son `catch` et
 *    renverrait 500 au lieu de 202. On ré-exporte les vrais NextRequest /
 *    NextResponse et on remplace `after` par une collecte.
 *  - `@/lib/db` : aucune base ici.
 *  - `@/lib/audit-engine` : éviter d'embarquer le moteur (4 700 lignes, appels
 *    réseau Gemini). Le même mock couvre `audit-engine` importé par la route.
 *
 * Les mocks doivent être posés AVANT le premier `import()` de la route : le
 * cache ESM interdit de re-mocker après coup.
 */

const repoRoot = resolve(import.meta.dirname, "..");
const nextServerUrl = pathToFileURL(resolve(repoRoot, "node_modules/next/server.js")).href;
const dbUrl = pathToFileURL(resolve(repoRoot, "src/lib/db.ts")).href;
const funnelUrl = pathToFileURL(resolve(repoRoot, "src/lib/funnel.ts")).href;
const auditEngineUrl = pathToFileURL(resolve(repoRoot, "src/lib/audit-engine.ts")).href;

const realNext = await import("next/server");

type RecordedEvent = { eventName: string; auditId?: string | null; source?: string | null; metadata?: Record<string, unknown> };
type QueryCall = { text: string; params: unknown[] };

const events: RecordedEvent[] = [];
const queries: QueryCall[] = [];
const afterCallbacks: unknown[] = [];
const cachedLeadCalls: Record<string, unknown>[] = [];

// Scénario pilotable par test (le cache ESM fige les modules, pas ces variables).
let cachedAudit: { id: string; website_url: string } | null = null;
let quotaAllowed = true;

mock.module(nextServerUrl, {
  namedExports: {
    NextRequest: realNext.NextRequest,
    NextResponse: realNext.NextResponse,
    after: (callback: unknown) => {
      afterCallbacks.push(callback);
    },
  },
});

mock.module(dbUrl, {
  namedExports: {
    ensureAuditSchema: async () => {},
    pool: {
      query: async (text: string, params: unknown[] = []) => {
        queries.push({ text, params });
        if (text.includes("INSERT INTO audits")) {
          return { rows: [{ id: "11111111-1111-4111-8111-111111111111" }] };
        }
        return { rows: [] };
      },
    },
  },
});

mock.module(funnelUrl, {
  namedExports: {
    recordFunnelEvent: async (event: RecordedEvent) => {
      events.push(event);
    },
  },
});

mock.module(auditEngineUrl, {
  namedExports: {
    auditTierFromPayload: () => "free",
    resolveAuditTier: () => ({ tier: "free", requested: "free", downgradedFrom: null }),
    checkFreeAuditQuota: async () => (quotaAllowed ? { allowed: true } : { allowed: false, error: "Quota atteint", limitType: "email", retryAfterHours: 24 }),
    findFreshFreeGeminiAudit: async () => cachedAudit,
    brandDedupeDomain: (url: string) => url,
    createCachedFreeAuditForLead: async (args: Record<string, unknown>) => {
      cachedLeadCalls.push(args);
      return { audit_id: "22222222-2222-4222-8222-222222222222", cached_from_audit_id: args.cachedAuditId, website_url: args.websiteUrl, score: 42, email_sent: true, email_error: undefined, scheduled_post_audit_emails: [] };
    },
    recipientLocaleFromSignals: () => "en",
    runQueuedAudit: async () => ({ status: "running" }),
    validateAuditInput: (payload: { email: string; brand_name: string; website_url: string }) => ({
      email: payload.email,
      brandName: payload.brand_name,
      websiteUrl: payload.website_url,
    }),
  },
});

const { POST } = await import("@/app/api/run-audit/route");

const GPT_BOT = "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function reset() {
  events.length = 0;
  queries.length = 0;
  afterCallbacks.length = 0;
  cachedLeadCalls.length = 0;
  cachedAudit = null;
  quotaAllowed = true;
}

function request(userAgent: string, extraHeaders: Record<string, string> = {}) {
  return new realNext.NextRequest("https://www.getpick.ai/api/run-audit", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": userAgent, ...extraHeaders },
    body: JSON.stringify({ email: "a@b.com", brand_name: "Acme", website_url: "https://acme.com" }),
  });
}

/** AC2 — la metadata écrite ne porte aucune donnée personnelle. */
function assertNoPersonalData(metadata: Record<string, unknown> | undefined) {
  const keys = Object.keys(metadata ?? {});
  for (const forbidden of ["userAgent", "user_agent", "ip", "ipHash", "clientIp", "cookie", "referrer"]) {
    assert.equal(keys.includes(forbidden), false, `metadata ne doit pas contenir « ${forbidden} » : ${keys.join(", ")}`);
  }
}

test("AC1 — un crawler obtient la MÊME réponse qu'un navigateur, et son audit_started est marqué bot", async () => {
  reset();
  const res = await POST(request(GPT_BOT));

  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(typeof body.audit_id, "string");
  assert.ok(body.audit_id.length > 0);
  assert.equal(body.status, "running");
  // Aucun 4xx/429 ajouté : l'audit part quand même en tâche de fond.
  assert.equal(afterCallbacks.length, 1);

  assert.equal(events.length, 1);
  assert.equal(events[0].eventName, "audit_started");
  assert.equal(events[0].metadata?.trafficClass, "bot");
  assertNoPersonalData(events[0].metadata);
});

test("AC1 — un navigateur donne exactement la même réponse HTTP, classée human", async () => {
  reset();
  const res = await POST(request(CHROME_MAC));

  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.status, "running");
  assert.equal(body.audit_tier, "free");
  assert.equal(events[0].metadata?.trafficClass, "human");
  assertNoPersonalData(events[0].metadata);
});

test("AC1 — le cookie interne classe internal, sans changer le code HTTP", async () => {
  reset();
  const res = await POST(request(CHROME_MAC, { cookie: "gp_internal=1" }));

  assert.equal(res.status, 202);
  assert.equal(events[0].metadata?.trafficClass, "internal");
});

test("AC1 — non-régression quota : un quota refusé renvoie toujours 429", async () => {
  reset();
  quotaAllowed = false;
  const res = await POST(request(GPT_BOT));

  assert.equal(res.status, 429);
  const body = await res.json();
  assert.equal(body.limit_type, "email");
  // Rien n'est écrit quand le quota refuse — comportement inchangé.
  assert.equal(events.length, 0);
});

test("AC3 — la classe est persistée dans raw_results à l'INSERT, pour l'audit_completed à venir", async () => {
  reset();
  await POST(request(GPT_BOT));

  const insert = queries.find((query) => query.text.includes("INSERT INTO audits"));
  assert.ok(insert, "l'INSERT audits doit avoir eu lieu");
  const rawResults = insert.params[4] as Record<string, unknown>;
  assert.equal(rawResults.trafficClass, "bot");
});

test("AC3 — chemin caché run_audit_cached : started et completed portent la même classe", async () => {
  reset();
  cachedAudit = { id: "33333333-3333-4333-8333-333333333333", website_url: "https://acme.com" };

  const res = await POST(request(GPT_BOT));
  assert.equal(res.status, 200);

  const started = events.find((event) => event.eventName === "audit_started");
  const completed = events.find((event) => event.eventName === "audit_completed");
  assert.ok(started && completed);
  assert.equal(started.metadata?.trafficClass, "bot");
  assert.equal(completed.metadata?.trafficClass, "bot");
  assert.equal(started.metadata?.trafficClass, completed.metadata?.trafficClass);
  assert.equal(started.auditId, completed.auditId);
  assertNoPersonalData(started.metadata);
  assertNoPersonalData(completed.metadata);

  // Risque 5 : le clone ne doit pas hériter de la classe de l'auditeur d'origine.
  assert.equal(cachedLeadCalls.length, 1);
  assert.equal(cachedLeadCalls[0].trafficClass, "bot");
});
