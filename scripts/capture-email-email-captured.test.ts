import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * `POST /api/capture-email` — `email_captured` compte les deux chemins de
 * réclamation, ou aucun (commande CEO des 29-30/08/2026).
 *
 * Le trou mesuré : le chemin par lequel un visiteur donne son adresse à la
 * porte — celui qu'a pris l'unique humain du mois — écrivait `audit_started`
 * et `audit_completed`, jamais `email_captured`. Le jour où la prospection
 * reprend, les rapports s'ouvriraient et les paiements ne viendraient pas sans
 * qu'on sache si l'adresse a été donnée.
 *
 * Mêmes mocks que `capture-email-traffic-class.test.ts` (un fichier par
 * route : `node --test` isole chaque fichier dans son process, `mock.module`
 * est global au process).
 */

const repoRoot = resolve(import.meta.dirname, "..");
const nextServerUrl = pathToFileURL(resolve(repoRoot, "node_modules/next/server.js")).href;
const dbUrl = pathToFileURL(resolve(repoRoot, "src/lib/db.ts")).href;
const funnelUrl = pathToFileURL(resolve(repoRoot, "src/lib/funnel.ts")).href;
const auditEngineUrl = pathToFileURL(resolve(repoRoot, "src/lib/audit-engine.ts")).href;

const realNext = await import("next/server");

type RecordedEvent = {
  eventName: string;
  auditId?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
};

const events: RecordedEvent[] = [];
const afterCallbacks: unknown[] = [];

let cachedAudit: { id: string; website_url: string } | null = null;
let anonymousMode = false;
let leadAuditCounter = 0;

mock.module(nextServerUrl, {
  namedExports: {
    NextRequest: realNext.NextRequest,
    NextResponse: realNext.NextResponse,
    after: (callback: unknown) => {
      afterCallbacks.push(callback);
    },
  },
});

let freshAuditCounter = 0;

mock.module(dbUrl, {
  namedExports: {
    ensureAuditSchema: async () => {},
    pool: {
      query: async (text: string) => {
        if (text.includes("INSERT INTO audits")) {
          freshAuditCounter += 1;
          return { rows: [{ id: `44444444-4444-4444-8444-44444444444${freshAuditCounter}` }] };
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
    checkFreeAuditQuota: async () => ({ allowed: true }),
    findFreshFreeGeminiAudit: async () => cachedAudit,
    brandDedupeDomain: (url: string) => url,
    createCachedFreeAuditForLead: async (args: Record<string, unknown>) => {
      leadAuditCounter += 1;
      return {
        // Un id NEUF par lead, comme dans la vraie implémentation : le chemin
        // caché INSÈRE une nouvelle ligne `audits` à chaque soumission. C'est
        // précisément pourquoi une clé de dédup portée par l'auditId ne
        // dédupliquerait rien ici.
        audit_id: `55555555-5555-4555-8555-55555555555${leadAuditCounter}`,
        cached_from_audit_id: args.cachedAuditId,
        website_url: args.websiteUrl,
        score: 42,
        email_sent: true,
        email_error: undefined,
        scheduled_post_audit_emails: [],
      };
    },
    recipientLocaleFromSignals: () => "en",
    runQueuedAudit: async () => ({ status: "running" }),
    validateAuditInputAllowAnonymous: (payload: { email: string; brand_name: string; website_url: string }) => ({
      email: anonymousMode ? "anon-1234@anonymous.citeable.invalid" : payload.email,
      brandName: payload.brand_name,
      websiteUrl: payload.website_url,
      anonymous: anonymousMode,
    }),
  },
});

const { POST } = await import("@/app/api/capture-email/route");

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function reset() {
  events.length = 0;
  afterCallbacks.length = 0;
  cachedAudit = null;
  anonymousMode = false;
}

function request(userAgent: string = CHROME_MAC, email = "prospect@marque.fr") {
  return new realNext.NextRequest("https://www.getpick.ai/api/capture-email", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": userAgent },
    body: JSON.stringify({ email, brand_name: "Acme", website_url: "https://acme.com" }),
  });
}

function captured() {
  return events.filter((event) => event.eventName === "email_captured");
}

function assertNoPersonalData(event: RecordedEvent) {
  const keys = Object.keys(event.metadata ?? {});
  for (const forbidden of ["userAgent", "user_agent", "ip", "ipHash", "clientIp", "cookie", "referrer", "email"]) {
    assert.equal(keys.includes(forbidden), false, `metadata ne doit pas contenir « ${forbidden} » : ${keys.join(", ")}`);
  }
  // La clé de dédup ne porte pas l'adresse en clair : la table funnel ne
  // stocke aucune donnée personnelle, l'adresse vit dans `email_captures`.
  assert.equal((event.dedupeKey ?? "").includes("prospect@marque.fr"), false, "l'email en clair n'a rien à faire dans la clé de dédup");
  assert.equal((event.dedupeKey ?? "").includes("prospect"), false, "un fragment de l'email en clair n'a rien à faire dans la clé de dédup");
}

test("AC1 — un email réel émet exactement un email_captured, avec sa classe de trafic", async () => {
  reset();
  const res = await POST(request());
  assert.equal(res.status, 201);
  const body = await res.json();

  const capturedEvents = captured();
  assert.equal(capturedEvents.length, 1, `attendu 1 email_captured, obtenu ${capturedEvents.length}`);
  const event = capturedEvents[0];
  assert.equal(event.metadata?.trafficClass, "human");
  assert.equal(event.auditId, body.audit_id, "l'événement doit être rattaché à l'audit créé, pour l'attribution nominative");
  assert.equal(event.source, "capture_email");
  assert.match(event.dedupeKey ?? "", /^email_captured:capture:[0-9a-f]{32}:\d{4}-\d{2}-\d{2}$/, "clé attendue : email_captured:capture:<hash>:<jour UTC>");
  assertNoPersonalData(event);
});

test("AC2 — le chemin anonyme n'émet jamais email_captured, le chemin nominatif toujours", async () => {
  reset();
  anonymousMode = true;
  const anonRes = await POST(request());
  assert.equal(anonRes.status, 201);
  assert.equal(captured().length, 0, "un audit anonyme ne capture aucune adresse : l'email est collecté plus tard par /api/claim-audit");
  // L'audit anonyme, lui, démarre bien : on ne casse pas le flux sans friction.
  assert.equal(events.some((event) => event.eventName === "audit_started"), true);

  anonymousMode = false;
  await POST(request());
  assert.equal(captured().length, 1, "le même formulaire avec un email réel émet l'événement — c'est le « si et seulement si » de la commande");
});

test("AC3 — double soumission ⇒ une seule ligne : la clé de dédup est identique sur les deux chemins", async () => {
  reset();
  // 1re soumission : chemin frais (aucun audit en cache).
  const first = await POST(request());
  assert.equal(first.status, 201);
  // 2e soumission, même adresse : chemin caché — la vraie implémentation clone
  // l'audit source dans une NOUVELLE ligne `audits`, l'auditId change donc.
  cachedAudit = { id: "66666666-6666-4666-8666-666666666666", website_url: "https://acme.com" };
  const second = await POST(request());
  assert.equal(second.status, 200);

  const capturedEvents = captured();
  assert.equal(capturedEvents.length, 2, "les deux soumissions passent par recordFunnelEvent…");
  assert.notEqual(capturedEvents[0].auditId, capturedEvents[1].auditId, "précondition : les deux soumissions créent bien deux audits distincts");
  assert.equal(
    capturedEvents[0].dedupeKey,
    capturedEvents[1].dedupeKey,
    "…mais portent la MÊME clé : ON CONFLICT (dedupe_key) DO NOTHING n'écrit qu'une ligne — le compteur mesure les adresses données, pas les clics"
  );
  assert.equal(capturedEvents[1].source, "capture_email_cached");
  // Aucune collision possible avec /api/claim-audit (`email_captured:<uuid>`) :
  // le segment `capture:` n'est pas un uuid.
  assert.doesNotMatch(capturedEvents[0].dedupeKey ?? "", /^email_captured:[0-9a-f-]{36}$/);
});
