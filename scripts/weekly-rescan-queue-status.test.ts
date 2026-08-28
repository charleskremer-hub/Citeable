import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * `GET /api/cron/weekly-rescan` — le silence de la file doit s'expliquer.
 *
 * Le 28/08, un agent a lu `{"rescans": []}` et en a conclu « le moteur est
 * arrêté depuis 48 h ». C'était faux : la cadence est mensuelle, la file avait
 * été consommée, tout était reprogrammé. Rien dans la réponse ne distinguait
 * « rien à faire » de « en panne ». La route rend désormais `due_count`
 * (marques dues à l'instant de la requête) et `next_due_at` (prochaine
 * échéance, ISO) : une liste vide devient auto-explicative.
 *
 * Seuls `@/lib/db` et `@/lib/funnel` sont mockés — même liste FERMÉE de
 * `namedExports` que `weekly-rescan-traffic-class.test.ts` : on veut la VRAIE
 * route et le VRAI `@/lib/audit-engine`. `runQueuedAudit` s'arrête seul sur le
 * verrou consultatif (le `pool` mocké ne rend aucune ligne au-delà des cas
 * prévus).
 *
 * Garde 401 : la route rend 401 seulement si `CRON_SECRET` est DÉFINI et que la
 * requête ne le porte pas (`if (!expected) return true;`). Les tests passent la
 * garde en s'assurant que la variable est absente du process — on ne la mocke
 * pas, on ne la change pas.
 */

const repoRoot = resolve(import.meta.dirname, "..");
const dbUrl = pathToFileURL(resolve(repoRoot, "src/lib/db.ts")).href;
const funnelUrl = pathToFileURL(resolve(repoRoot, "src/lib/funnel.ts")).href;

type QueryCall = { text: string; params: unknown[] };

const queries: QueryCall[] = [];

const AUDIT_ID = "66666666-6666-4666-8666-666666666666";
const BRAND_NAME = "Acme";
const BRAND_URL = "https://acme.com";

// État configurable par test : la ligne d'agrégat (toujours UNE ligne en vrai
// Postgres, même registre vide) et les marques dues.
let statusRow: { due_count: number; next_due_at: Date | null } = { due_count: 0, next_due_at: null };
let dueRows: Array<{ id: string; email: string; brand_name: string; website_url: string; last_audit_id: string | null }> = [];

mock.module(dbUrl, {
  namedExports: {
    ensureAuditSchema: async () => {},
    pool: {
      query: async (text: string, params: unknown[] = []) => {
        queries.push({ text, params });
        // L'agrégat d'état : il contient `min(next_run_at)` — la requête de
        // consommation, elle, n'a pas d'agrégat.
        if (text.includes("min(next_run_at)")) return { rows: [statusRow] };
        if (text.includes("FROM monitored_brands") && text.includes("next_run_at <= now()")) {
          return { rows: dueRows };
        }
        if (text.includes("INSERT INTO audits")) return { rows: [{ id: AUDIT_ID }] };
        // `pg_try_advisory_lock` sans ligne → `runQueuedAudit` rend « running »
        // et s'arrête là, sans toucher au moteur d'audit.
        return { rows: [] };
      },
    },
  },
});

mock.module(funnelUrl, {
  namedExports: {
    recordFunnelEvent: async () => {},
  },
});

// La garde de la route lit `process.env.CRON_SECRET` : absente ⇒ autorisé.
delete process.env.CRON_SECRET;

const { NextRequest } = await import("next/server");
const { GET } = await import("@/app/api/cron/weekly-rescan/route");

function cronRequest() {
  return new NextRequest("http://localhost/api/cron/weekly-rescan");
}

function reset() {
  queries.length = 0;
  statusRow = { due_count: 0, next_due_at: null };
  dueRows = [];
}

test("aucune marque due — due_count = 0 ET next_due_at non nul : le silence s'explique", async () => {
  reset();
  statusRow = { due_count: 0, next_due_at: new Date("2026-09-27T07:00:00.000Z") };

  const response = await GET(cronRequest());
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.deepEqual(body.rescans, []);
  assert.equal(body.due_count, 0);
  // La prochaine échéance existe dès qu'une marque est surveillée : une liste
  // vide avec une date future dit « rien à faire », pas « en panne ».
  assert.equal(body.next_due_at, "2026-09-27T07:00:00.000Z");
});

test("une marque due — due_count >= 1, mesuré à l'instant de la requête (avant consommation)", async () => {
  reset();
  statusRow = { due_count: 1, next_due_at: new Date("2026-08-28T07:00:00.000Z") };
  dueRows = [
    {
      id: "55555555-5555-4555-8555-555555555555",
      email: "client@acme.com",
      brand_name: BRAND_NAME,
      website_url: BRAND_URL,
      last_audit_id: null,
    },
  ];

  const response = await GET(cronRequest());
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.ok(body.due_count >= 1, `due_count doit être >= 1 quand une marque est due (reçu : ${body.due_count})`);
  assert.equal(body.rescans.length, 1);

  // L'état est mesuré AVANT que `runDueWeeklyRescans` ne consomme la file :
  // l'agrégat doit précéder la requête de consommation.
  const statusIndex = queries.findIndex((query) => query.text.includes("min(next_run_at)"));
  const consumeIndex = queries.findIndex((query) => !query.text.includes("min(next_run_at)") && query.text.includes("next_run_at <= now()"));
  assert.ok(statusIndex !== -1, "l'agrégat d'état doit être interrogé");
  assert.ok(consumeIndex !== -1, "la file doit être consommée");
  assert.ok(statusIndex < consumeIndex, "due_count doit être mesuré avant la consommation de la file");
});

test("aucune donnée de marque dans la réponse — ni nom, ni URL (la fuite /api/funnel ne se rouvre pas ici)", async () => {
  reset();
  statusRow = { due_count: 1, next_due_at: new Date("2026-08-28T07:00:00.000Z") };
  dueRows = [
    {
      id: "55555555-5555-4555-8555-555555555555",
      email: "client@acme.com",
      brand_name: BRAND_NAME,
      website_url: BRAND_URL,
      last_audit_id: null,
    },
  ];

  const response = await GET(cronRequest());
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(serialized.includes(BRAND_NAME), false, "la réponse du cron ne doit pas porter le nom d'une marque surveillée");
  assert.equal(serialized.toLowerCase().includes("acme.com"), false, "la réponse du cron ne doit pas porter l'URL d'une marque surveillée");
  assert.equal(serialized.includes("client@acme.com"), false, "la réponse du cron ne doit pas porter l'email du client");
});

test("registre vide — next_due_at null, due_count 0, pas d'exception", async () => {
  reset();
  // Vrai Postgres : l'agrégat rend UNE ligne même sans aucune marque.
  statusRow = { due_count: 0, next_due_at: null };

  const response = await GET(cronRequest());
  assert.equal(response.status, 200);
  const body = await response.json();

  assert.deepEqual(body.rescans, []);
  assert.equal(body.due_count, 0);
  assert.equal(body.next_due_at, null);
});
