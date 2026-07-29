import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * `runDueWeeklyRescans` — le 5ᵉ chemin d'audit, celui qui n'a AUCUNE requête
 * entrante à classer.
 *
 * Il est déclenché par le cron quotidien (`vercel.json` → `/api/cron/weekly-rescan`
 * à `0 7 * * *`, qui appelle `runDueWeeklyRescans(2)`). Avant ce correctif il
 * insérait un audit dont `raw_results` ne portait aucune classe, donc
 * `completeQueuedAudit` publiait un `audit_completed` en `unknown` — sur une
 * fenêtre pourtant entièrement postérieure à `traffic_class_since` — et sans
 * `audit_started` correspondant, ce qui donnait un ratio completed/started > 1
 * inexplicable pour l'agent qui lit `/api/funnel`.
 *
 * Seuls `@/lib/db` et `@/lib/funnel` sont mockés : on veut le VRAI
 * `runDueWeeklyRescans`. `runQueuedAudit` s'arrête tout seul sur le verrou
 * consultatif (le `pool` mocké ne rend aucune ligne), ce qui suffit : tout ce que
 * ce test observe est écrit AVANT.
 */

const repoRoot = resolve(import.meta.dirname, "..");
const dbUrl = pathToFileURL(resolve(repoRoot, "src/lib/db.ts")).href;
const funnelUrl = pathToFileURL(resolve(repoRoot, "src/lib/funnel.ts")).href;

type RecordedEvent = { eventName: string; auditId?: string | null; source?: string | null; metadata?: Record<string, unknown> };
type QueryCall = { text: string; params: unknown[] };

const events: RecordedEvent[] = [];
const queries: QueryCall[] = [];

const AUDIT_ID = "44444444-4444-4444-8444-444444444444";

mock.module(dbUrl, {
  namedExports: {
    ensureAuditSchema: async () => {},
    pool: {
      query: async (text: string, params: unknown[] = []) => {
        queries.push({ text, params });
        if (text.includes("FROM monitored_brands") && text.includes("next_run_at <= now()")) {
          return {
            rows: [
              {
                id: "55555555-5555-4555-8555-555555555555",
                email: "client@acme.com",
                brand_name: "Acme",
                website_url: "https://acme.com",
                last_audit_id: null,
              },
            ],
          };
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
    recordFunnelEvent: async (event: RecordedEvent) => {
      events.push(event);
    },
  },
});

const { runDueWeeklyRescans } = await import("@/lib/audit-engine");

test("AC3 — le rescan hebdo écrit sa classe dans raw_results, jamais unknown", async () => {
  events.length = 0;
  queries.length = 0;

  const results = await runDueWeeklyRescans(2);
  assert.equal(results.length, 1);

  const insert = queries.find((query) => query.text.includes("INSERT INTO audits"));
  assert.ok(insert, "l'INSERT audits doit avoir eu lieu");
  const rawResults = insert.params[6] as Record<string, unknown>;
  assert.equal(rawResults.runType, "weekly_rescan");
  // C'est notre propre cron : « est-ce nous ? oui ». Pas `unknown`, pas `human`.
  assert.equal(rawResults.trafficClass, "internal");
});

test("AC3 — le rescan hebdo émet un audit_started, pour que completed/started reste lisible", async () => {
  events.length = 0;
  queries.length = 0;

  await runDueWeeklyRescans(2);

  const started = events.filter((event) => event.eventName === "audit_started");
  assert.equal(started.length, 1, "un audit_completed sans audit_started rend le ratio inexplicable");
  assert.equal(started[0].auditId, AUDIT_ID);
  assert.equal(started[0].source, "weekly_rescan");
  assert.equal(started[0].metadata?.trafficClass, "internal");

  const keys = Object.keys(started[0].metadata ?? {});
  for (const forbidden of ["userAgent", "user_agent", "ip", "ipHash", "clientIp", "cookie", "referrer"]) {
    assert.equal(keys.includes(forbidden), false, `metadata ne doit pas contenir « ${forbidden} »`);
  }
});
