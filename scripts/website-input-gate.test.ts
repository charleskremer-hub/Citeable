/**
 * Porte d'entree du champ << site >> — recette du chantier du 28/08.
 *
 * Le 27/08, `joliusliu@gmail.com` saisi dans le champ site a coute 5 questions
 * Gemini + 1 appel Serper, une ligne `audits`, des evenements funnel et un
 * rapport 0/100 sur une categorie inventee (audit
 * bbab1971-a5ff-4f3a-84bb-072468a4580a). Ces tests verifient le contrat du
 * refus : sur une entree refusee, ZERO appel reseau sortant, ZERO ligne
 * `audits`/`email_captures`, ZERO evenement funnel — et une reponse 422 avec un
 * code stable que le front mappe vers un message localise.
 *
 * Mocks : memes patterns que `capture-email-traffic-class.test.ts` pour
 * `next/server`, `db` et `funnel` (mock.module). `audit-engine` N'EST PAS
 * mocke : c'est lui qu'on teste. Le reseau est mocke en remplacant
 * `globalThis.fetch` — le gate le resout a chaque appel, chaque sonde est donc
 * comptee, et TOUT appel inattendu rejette.
 *
 * Lancer via `node scripts/run-tests.mjs` (jamais isole : les alias `@/...`
 * ne resolvent que sous le loader du runner).
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const nextServerUrl = pathToFileURL(resolve(repoRoot, "node_modules/next/server.js")).href;
const dbUrl = pathToFileURL(resolve(repoRoot, "src/lib/db.ts")).href;
const funnelUrl = pathToFileURL(resolve(repoRoot, "src/lib/funnel.ts")).href;

const realNext = await import("next/server");

type RecordedEvent = { eventName: string; auditId?: string | null; source?: string | null };
type QueryCall = { text: string; params: unknown[] };

const events: RecordedEvent[] = [];
const queries: QueryCall[] = [];
const afterCallbacks: unknown[] = [];

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
          return { rows: [{ id: "66666666-6666-4666-8666-666666666666" }] };
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

/**
 * Le reseau sortant, sous controle total :
 *   - "forbidden"   : le test EXIGE zero appel — tout fetch est enregistre et
 *                     rejete, et l'assertion `fetchCalls.length === 0` echoue ;
 *   - "unreachable" : DNS/HTTP mort sur tous les hotes (apex ET www) ;
 *   - "reachable"   : l'hote repond 200 a la sonde HEAD.
 */
type FetchMode = "forbidden" | "unreachable" | "reachable";
let fetchMode: FetchMode = "forbidden";
const fetchCalls: string[] = [];

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = input instanceof Request ? input.url : String(input);
  fetchCalls.push(url);
  if (fetchMode === "reachable") {
    return new Response(null, { status: 200 });
  }
  throw new TypeError(`fetch failed (${fetchMode}): ${url}`);
}) as typeof fetch;

const { POST: postCaptureEmail } = await import("@/app/api/capture-email/route");
const { POST: postRunAudit } = await import("@/app/api/run-audit/route");

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

function reset(mode: FetchMode) {
  events.length = 0;
  queries.length = 0;
  afterCallbacks.length = 0;
  fetchCalls.length = 0;
  fetchMode = mode;
}

function request(path: "capture-email" | "run-audit", body: Record<string, unknown>) {
  return new realNext.NextRequest(`https://www.getpick.ai/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": CHROME_MAC },
    body: JSON.stringify(body),
  });
}

/** Le contrat du refus : rien n'est parti, rien n'est ecrit, rien n'est emis. */
function assertNothingSpentNothingWritten() {
  assert.deepEqual(events, [], "aucun evenement funnel ne doit etre emis sur une entree refusee");
  assert.deepEqual(queries, [], "aucune requete SQL (ni audits, ni email_captures) sur une entree refusee");
  assert.equal(afterCallbacks.length, 0, "aucun audit ne doit etre mis en file (donc aucun appel Gemini/Serper)");
}

// --- (a) une adresse email dans le champ site ------------------------------

test("AC1 — capture-email refuse une adresse email AVANT tout appel reseau et toute ecriture", async () => {
  reset("forbidden");
  const res = await postCaptureEmail(
    request("capture-email", { email: "lead@example.com", brand_name: "Jolius", website_url: "joliusliu@gmail.com" })
  );

  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error_code, "website_looks_like_email");
  assert.equal(typeof body.error, "string");
  assert.equal(fetchCalls.length, 0, `aucun appel reseau sortant ne doit partir : ${fetchCalls.join(", ")}`);
  assertNothingSpentNothingWritten();
});

test("AC1 — run-audit refuse la meme entree, meme contrat", async () => {
  reset("forbidden");
  const res = await postRunAudit(
    request("run-audit", { email: "lead@example.com", brand_name: "Jolius", website_url: "joliusliu@gmail.com" })
  );

  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error_code, "website_looks_like_email");
  assert.equal(fetchCalls.length, 0, `aucun appel reseau sortant ne doit partir : ${fetchCalls.join(", ")}`);
  assertNothingSpentNothingWritten();
});

// --- (b) une URL a identifiants --------------------------------------------

test("AC1bis — une URL a identifiants (https://user@host) est refusee, sans sonde ni ecriture", async () => {
  reset("forbidden");
  const res = await postCaptureEmail(
    request("capture-email", { email: "lead@example.com", brand_name: "Jolius", website_url: "https://joliusliu@gmail.com" })
  );

  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error_code, "website_credentials");
  assert.equal(fetchCalls.length, 0, `aucun appel reseau sortant ne doit partir : ${fetchCalls.join(", ")}`);
  assertNothingSpentNothingWritten();
});

// --- (c) un hote injoignable sur l'apex ET sur www --------------------------

test("AC2 — un hote injoignable (apex ET www morts) est refuse et aucune ligne audits n'est creee", async () => {
  reset("unreachable");
  const res = await postCaptureEmail(
    request("capture-email", { email: "lead@example.com", brand_name: "Fantome", website_url: "marque-inexistante-9f3k.com" })
  );

  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error_code, "website_unreachable");
  // La sonde a bien tente l'apex PUIS www — et rien d'autre.
  assert.deepEqual(fetchCalls, [
    "https://marque-inexistante-9f3k.com/",
    "https://www.marque-inexistante-9f3k.com/",
  ]);
  assertNothingSpentNothingWritten();
});

// --- non-regression : un hote valide passe la porte -------------------------

test("AC3 — un hote qui repond passe la porte : capture-email demarre l'audit comme avant", async () => {
  reset("reachable");
  const res = await postCaptureEmail(
    request("capture-email", { email: "lead@example.com", brand_name: "Acme", website_url: "https://acme.com" })
  );

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.audit_id, "66666666-6666-4666-8666-666666666666");
  assert.ok(queries.some((q) => q.text.includes("INSERT INTO email_captures")), "le lead est enregistre");
  assert.ok(queries.some((q) => q.text.includes("INSERT INTO audits")), "la ligne audits est creee");
  assert.ok(events.some((e) => e.eventName === "audit_started"), "audit_started est emis");
  assert.equal(afterCallbacks.length, 1, "l'audit est mis en file apres la reponse");
});

test("AC3 — un hote qui repond passe la porte : run-audit demarre l'audit comme avant", async () => {
  reset("reachable");
  const res = await postRunAudit(
    request("run-audit", { email: "lead@example.com", brand_name: "Acme", website_url: "https://acme.com" })
  );

  assert.equal(res.status, 202);
  const body = await res.json();
  assert.equal(body.audit_id, "66666666-6666-4666-8666-666666666666");
  assert.ok(queries.some((q) => q.text.includes("INSERT INTO audits")), "la ligne audits est creee");
  assert.ok(events.some((e) => e.eventName === "audit_started"), "audit_started est emis");
  assert.equal(afterCallbacks.length, 1, "l'audit est mis en file apres la reponse");
});
