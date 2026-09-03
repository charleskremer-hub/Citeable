import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * GARDE-FOU DE LA FILE DE RESCAN — « aucun appel d'API payant sur une cible qui
 * ne peut pas répondre ».
 *
 * Fait mesuré le 01/09 en production : la file porte une fixture de test
 * end-to-end (marque « E2E Check 1784708916 », site
 * `https://e2e-check-1784708916.com/`, domaine sans résolution DNS). Le cron
 * quotidien l'a traitée : ligne `audits` créée, `audit_started` émis, et surtout
 * des appels payants (Gemini, Serper) engagés sur un hôte qui ne répond pas.
 *
 * Ce que ce fichier prouve, dans l'ordre :
 *   1. la fixture est reconnue SANS SONDER LE RÉSEAU — `globalThis.fetch` appelé
 *      0 fois, donc coût strictement nul ;
 *   2. un hôte injoignable coûte EXACTEMENT 2 sondes HEAD (apex + www), qui ne
 *      sont ni Gemini ni Serper, et rien d'autre ;
 *   3. une cible saine passe comme avant — le garde-fou ne coupe pas un client.
 *
 * Dans les deux cas de saut : aucun `INSERT INTO audits`, aucun événement funnel,
 * et un `UPDATE monitored_brands SET active = false` — réversible, aucune ligne
 * supprimée.
 *
 * Comme `weekly-rescan-traffic-class.test.ts`, seuls `@/lib/db` et `@/lib/funnel`
 * sont mockés : on veut le VRAI `runDueWeeklyRescans`.
 */

const repoRoot = resolve(import.meta.dirname, "..");
const dbUrl = pathToFileURL(resolve(repoRoot, "src/lib/db.ts")).href;
const funnelUrl = pathToFileURL(resolve(repoRoot, "src/lib/funnel.ts")).href;

type RecordedEvent = { eventName: string; auditId?: string | null; source?: string | null; metadata?: Record<string, unknown> };
type QueryCall = { text: string; params: unknown[] };
type DueBrand = { id: string; email: string; brand_name: string; website_url: string; last_audit_id: string | null };

const events: RecordedEvent[] = [];
const queries: QueryCall[] = [];
const probes: string[] = [];

const AUDIT_ID = "77777777-7777-4777-8777-777777777777";
const BRAND_ID = "66666666-6666-4666-8666-666666666666";

let dueBrand: DueBrand = {
  id: BRAND_ID,
  email: "e2e@exemple.test",
  brand_name: "E2E Check 1784708916",
  website_url: "https://e2e-check-1784708916.com/",
  last_audit_id: null,
};

mock.module(dbUrl, {
  namedExports: {
    ensureAuditSchema: async () => {},
    pool: {
      query: async (text: string, params: unknown[] = []) => {
        queries.push({ text, params });
        if (text.includes("FROM monitored_brands") && text.includes("next_run_at <= now()")) {
          return { rows: [dueBrand] };
        }
        if (text.includes("INSERT INTO audits")) return { rows: [{ id: AUDIT_ID }] };
        // `pg_try_advisory_lock` sans ligne → `runQueuedAudit` rend « running »
        // et s'arrête là, sans toucher au moteur d'audit ni à aucune API payante.
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

const { runDueWeeklyRescans, e2eFixtureRescanSkip } = await import("@/lib/audit-engine");

// `assertWebsiteReachable` résout `fetch` sur `globalThis` À CHAQUE appel : c'est
// ce qui rend la substitution ci-dessous possible, et le comptage des sondes exact.
const realFetch = globalThis.fetch;

function stubFetch(reachable: boolean) {
  globalThis.fetch = (async (input: unknown) => {
    probes.push(String(input));
    if (!reachable) throw new TypeError("fetch failed");
    return { ok: true, status: 200 } as unknown as Response;
  }) as typeof globalThis.fetch;
}

function reset(brand: DueBrand) {
  dueBrand = brand;
  events.length = 0;
  queries.length = 0;
  probes.length = 0;
}

// Le processus de tests est partagé : `weekly-rescan-traffic-class.test.ts` sonde
// `https://acme.com` avec le VRAI `fetch`. On le restaure donc systématiquement.
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

const activeFalseUpdate = (query: QueryCall) =>
  query.text.includes("UPDATE monitored_brands") && query.text.includes("active = false");

test("fixture e2e — sautée sans INSERT, sans événement, et sans la moindre sonde réseau", async () => {
  reset({
    id: BRAND_ID,
    email: "e2e@exemple.test",
    brand_name: "E2E Check 1784708916",
    website_url: "https://e2e-check-1784708916.com/",
    last_audit_id: null,
  });
  stubFetch(false);

  const results = await runDueWeeklyRescans(2);

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "skipped");
  assert.equal(results[0].skip_reason, "e2e_fixture");
  assert.equal(results[0].audit_id, undefined);

  assert.equal(
    queries.some((query) => query.text.includes("INSERT INTO audits")),
    false,
    "aucune ligne audits ne doit être créée pour une fixture de test"
  );
  assert.equal(events.length, 0, "aucun événement funnel ne doit être émis");

  const update = queries.find(activeFalseUpdate);
  assert.ok(update, "la marque doit être marquée ignorée par active = false");
  assert.deepEqual(update.params, [BRAND_ID]);
  assert.equal(update.text.includes("DELETE"), false, "aucune donnée n'est effacée");

  // L'ASSERTION DE COÛT : la fixture est reconnue par son seul nom/domaine, donc
  // même la sonde HEAD (pourtant gratuite) n'est pas engagée.
  assert.equal(probes.length, 0, "la fixture doit être reconnue sans sonder le réseau");
});

test("hôte injoignable — sauté après exactement 2 sondes HEAD (apex + www), rien de payant", async () => {
  reset({
    id: BRAND_ID,
    email: "client@marque-disparue.test",
    brand_name: "Marque Disparue",
    website_url: "https://marque-disparue.test/",
    last_audit_id: null,
  });
  stubFetch(false);

  const results = await runDueWeeklyRescans(2);

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "skipped");
  assert.equal(results[0].skip_reason, "unreachable_host");
  assert.equal(results[0].audit_id, undefined);

  assert.equal(
    queries.some((query) => query.text.includes("INSERT INTO audits")),
    false,
    "aucune ligne audits ne doit être créée pour un hôte injoignable"
  );
  assert.equal(events.length, 0, "aucun événement funnel ne doit être émis");

  const update = queries.find(activeFalseUpdate);
  assert.ok(update, "la marque doit être marquée ignorée par active = false");
  assert.deepEqual(update.params, [BRAND_ID]);

  assert.equal(probes.length, 2, "apex puis www, et rien de plus");
  assert.deepEqual(probes, ["https://marque-disparue.test/", "https://www.marque-disparue.test/"]);
});

test("cible saine — le garde-fou ne coupe rien : INSERT audits et audit_started ont lieu", async () => {
  reset({
    id: BRAND_ID,
    email: "client@acme.com",
    brand_name: "Acme",
    website_url: "https://acme.com",
    last_audit_id: null,
  });
  stubFetch(true);

  const results = await runDueWeeklyRescans(2);

  assert.equal(results.length, 1);
  assert.notEqual(results[0].status, "skipped");

  const insert = queries.find((query) => query.text.includes("INSERT INTO audits"));
  assert.ok(insert, "une cible joignable doit toujours être auditée");

  const started = events.filter((event) => event.eventName === "audit_started");
  assert.equal(started.length, 1, "audit_started reste émis pour une vraie cible");
  assert.equal(started[0].auditId, AUDIT_ID);

  assert.equal(
    queries.some(activeFalseUpdate),
    false,
    "une cible saine ne doit jamais être désactivée"
  );

  // L'apex répond du premier coup : une seule sonde, `www` n'est pas tentée.
  assert.equal(probes.length, 1);
});

test("e2eFixtureRescanSkip — un domaine client qui contient « e2e » au milieu n'est PAS une fixture", () => {
  // Ce qui DOIT matcher : le motif réellement observé en base.
  assert.equal(e2eFixtureRescanSkip("E2E Check 1784708916", "https://e2e-check-1784708916.com/"), true);
  assert.equal(e2eFixtureRescanSkip("Marque quelconque", "https://e2e-check-42.com/"), true);
  assert.equal(e2eFixtureRescanSkip("Marque quelconque", "https://www.e2e-fixture.io/"), true);
  assert.equal(e2eFixtureRescanSkip("e2e-seed", "https://exemple.test/"), true);

  // Ce qui NE DOIT PAS matcher : un faux positif ici couperait un client payant.
  assert.equal(e2eFixtureRescanSkip("Reference2e2", "https://reference2e2.com"), false);
  assert.equal(e2eFixtureRescanSkip("Acme E2E Tools", "https://acme-e2etools.com"), false);
  assert.equal(e2eFixtureRescanSkip("Acme", "https://acme.com"), false);
  assert.equal(e2eFixtureRescanSkip("E2Everything", "https://e2everything.com"), false);
  assert.equal(e2eFixtureRescanSkip("Zone2e2", "https://sous-domaine.e2e-pas-le-premier.com"), false);
});
