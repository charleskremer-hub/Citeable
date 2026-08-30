import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * `POST /api/capture-email` — mêmes mocks que `run-audit-traffic-class.test.ts`
 * (voir l'en-tête de ce fichier pour le pourquoi). Un fichier par route :
 * `node --test` isole chaque fichier dans son process, alors que `mock.module`
 * est global au process.
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
          return { rows: [{ id: "44444444-4444-4444-8444-444444444444" }] };
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
    checkFreeAuditQuota: async () => (quotaAllowed ? { allowed: true } : { allowed: false, error: "Quota atteint", limitType: "domain", retryAfterHours: 24 }),
    findFreshFreeGeminiAudit: async () => cachedAudit,
    brandDedupeDomain: (url: string) => url,
    createCachedFreeAuditForLead: async (args: Record<string, unknown>) => {
      cachedLeadCalls.push(args);
      return { audit_id: "55555555-5555-4555-8555-555555555555", cached_from_audit_id: args.cachedAuditId, website_url: args.websiteUrl, score: 42, email_sent: true, email_error: undefined, scheduled_post_audit_emails: [] };
    },
    recipientLocaleFromSignals: () => "en",
    runQueuedAudit: async () => ({ status: "running" }),
    validateAuditInputAllowAnonymous: (payload: { email: string; brand_name: string; website_url: string }) => ({
      email: payload.email,
      brandName: payload.brand_name,
      websiteUrl: payload.website_url,
      anonymous: false,
    }),
  },
});

const { POST } = await import("@/app/api/capture-email/route");

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
  return new realNext.NextRequest("https://www.getpick.ai/api/capture-email", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": userAgent, ...extraHeaders },
    body: JSON.stringify({ email: "a@b.com", brand_name: "Acme", website_url: "https://acme.com" }),
  });
}

function assertNoPersonalData(metadata: Record<string, unknown> | undefined) {
  const keys = Object.keys(metadata ?? {});
  for (const forbidden of ["userAgent", "user_agent", "ip", "ipHash", "clientIp", "cookie", "referrer"]) {
    assert.equal(keys.includes(forbidden), false, `metadata ne doit pas contenir « ${forbidden} » : ${keys.join(", ")}`);
  }
}

test("AC1 — un crawler obtient le 201 habituel, avec audit_started marqué bot", async () => {
  reset();
  const res = await POST(request(GPT_BOT));

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.audit_id, "string");
  assert.equal(afterCallbacks.length, 1);

  // 2 depuis la commande CEO du 30/08 : le chemin nominatif émet aussi
  // `email_captured` (voir capture-email-email-captured.test.ts). Seul ce
  // COMPTE change ; les garanties de classe et d'absence de données
  // personnelles ci-dessous ne bougent pas.
  assert.equal(events.length, 2);
  assert.equal(events[0].eventName, "audit_started");
  assert.equal(events[0].metadata?.trafficClass, "bot");
  assertNoPersonalData(events[0].metadata);
});

test("AC1 — un navigateur donne le même 201, classé human", async () => {
  reset();
  const res = await POST(request(CHROME_MAC));

  assert.equal(res.status, 201);
  assert.equal(events[0].metadata?.trafficClass, "human");
});

test("AC1 — une IP interne classe internal sans changer le code HTTP", async () => {
  reset();
  process.env.INTERNAL_IPS = "88.120.4.17";
  try {
    const res = await POST(request(CHROME_MAC, { "x-forwarded-for": "88.120.4.17, 10.0.0.1" }));
    assert.equal(res.status, 201);
    assert.equal(events[0].metadata?.trafficClass, "internal");
  } finally {
    delete process.env.INTERNAL_IPS;
  }
});

test("AC1 — non-régression quota : un quota refusé renvoie toujours 429", async () => {
  reset();
  quotaAllowed = false;
  const res = await POST(request(GPT_BOT));

  assert.equal(res.status, 429);
  assert.equal(events.length, 0);
});

test("AC3 — la classe est persistée dans raw_results à l'INSERT", async () => {
  reset();
  await POST(request(GPT_BOT));

  const insert = queries.find((query) => query.text.includes("INSERT INTO audits"));
  assert.ok(insert);
  const rawResults = insert.params[4] as Record<string, unknown>;
  assert.equal(rawResults.trafficClass, "bot");
});

test("AC3 — chemin caché capture_email_cached : started et completed portent la même classe", async () => {
  reset();
  cachedAudit = { id: "66666666-6666-4666-8666-666666666666", website_url: "https://acme.com" };

  const res = await POST(request(GPT_BOT));
  assert.equal(res.status, 200);

  const started = events.find((event) => event.eventName === "audit_started");
  const completed = events.find((event) => event.eventName === "audit_completed");
  assert.ok(started && completed);
  assert.equal(started.metadata?.trafficClass, "bot");
  assert.equal(completed.metadata?.trafficClass, "bot");
  assert.equal(started.auditId, completed.auditId);
  assertNoPersonalData(started.metadata);
  assertNoPersonalData(completed.metadata);

  assert.equal(cachedLeadCalls.length, 1);
  assert.equal(cachedLeadCalls[0].trafficClass, "bot");
});
