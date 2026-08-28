/**
 * Défaut n°2 du test de bout en bout du 28/08 : UN PROSPECT NE RECEVAIT QU'UN
 * SEUL RAPPORT D'AUDIT, À VIE — ET UN CLIENT AUSSI.
 *
 * L'index unique `audit_email_delivery_one_step_per_prospect_idx` portait sur
 * `(email, step)` sans date. Voulu contre le spam prospect ; mais un CLIENT
 * abonné qui relance un audit ne recevait jamais son second rapport.
 *
 * Le correctif : le garde distingue prospect et client.
 *   - `claimEmailDelivery` écrit l'audience dans la ligne (`client` si
 *     `entitlementForEmail` — table `subscriptions` — rend un droit actif) ;
 *   - l'index « à vie » ne porte plus que sur `audience = 'prospect'` ;
 *   - FAIL-SAFE : audience indécidable (base en panne) = prospect.
 *
 * Le `pg.Pool` est remplacé au niveau du module : aucune connexion ouverte.
 * Mutation : retirer le prédicat d'audience de l'index, ou l'écriture de
 * l'audience dans le claim, remet ces tests au rouge.
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const pgUrl = pathToFileURL(resolve(repoRoot, "node_modules/pg/lib/index.js")).href;

type QueryCall = { text: string; params: unknown[] };

const executed: QueryCall[] = [];
// Scénario pilotable par test (le cache ESM fige les modules, pas ces variables).
let subscriptionRows: { plan: string; status: string }[] = [];
let failSubscriptionQuery = false;

class FakePool {
  async query(text: string, params: unknown[] = []) {
    executed.push({ text, params });
    if (text.includes("FROM subscriptions")) {
      if (failSubscriptionQuery) throw new Error("connection refused");
      return { rows: subscriptionRows, rowCount: subscriptionRows.length };
    }
    if (text.includes("INSERT INTO audit_email_delivery_log") && text.includes("'claimed'")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
}

mock.module(pgUrl, { namedExports: { Pool: FakePool } });

const { ensureAuditSchema } = await import("@/lib/db");
const { claimEmailDelivery } = await import("@/lib/audit-engine");

function reset() {
  executed.length = 0;
  subscriptionRows = [];
  failSubscriptionQuery = false;
}

const lastClaimInsert = () =>
  [...executed].reverse().find((call) => call.text.includes("INSERT INTO audit_email_delivery_log") && call.text.includes("'claimed'"));

// --- Le schéma : l'index « à vie » ne vaut que pour les prospects -------------

test("le garde à vie est un index PARTIEL sur audience = 'prospect', posé par DROP + CREATE", async () => {
  reset();
  await ensureAuditSchema();
  const sql = executed.map((call) => call.text);

  assert.ok(
    sql.some((text) => text.includes("ALTER TABLE audit_email_delivery_log ADD COLUMN IF NOT EXISTS audience")),
    "la colonne audience doit être posée par ensureAuditSchema (défaut 'prospect' pour l'existant)"
  );

  const dropIdx = sql.findIndex((text) => text.includes("DROP INDEX IF EXISTS audit_email_delivery_one_step_per_prospect_idx"));
  const createIdx = sql.findIndex(
    (text) =>
      text.includes("CREATE UNIQUE INDEX IF NOT EXISTS audit_email_delivery_one_step_per_prospect_idx") &&
      text.includes("audience = 'prospect'")
  );
  assert.ok(createIdx !== -1, "l'index (email, step) doit porter le prédicat audience = 'prospect' — sans lui, un client ne reçoit qu'un rapport à vie");
  assert.ok(dropIdx !== -1 && dropIdx < createIdx, "l'ancienne définition (sans prédicat) doit être DROPpée avant le CREATE, comme le CHECK des événements");

  // Les dédups du JOUR restent intactes : elles valent pour tout le monde.
  assert.ok(
    sql.some((text) => text.includes("audit_email_delivery_one_day_per_prospect_idx") && !text.includes("audience")),
    "le plafond « un email par adresse et par jour » n'est pas touché"
  );
});

// --- Le claim : l'audience est mesurée et écrite ------------------------------

test("un CLIENT abonné est claimé avec audience 'client' : son second rapport peut partir", async () => {
  reset();
  subscriptionRows = [{ plan: "monitor_9eur", status: "active" }];

  const claim = await claimEmailDelivery({
    auditId: "00000000-0000-4000-8000-00000000000a",
    email: "client@marque.fr",
    websiteUrl: "https://marque.fr",
    step: "audit_result",
    subject: "Ton rapport",
  });

  assert.equal(claim.allowed, true);
  const insert = lastClaimInsert();
  assert.ok(insert, "le claim doit écrire une ligne dans audit_email_delivery_log");
  assert.ok(insert.text.includes("audience"), "l'INSERT du claim doit porter la colonne audience");
  assert.ok(insert.params.includes("client"), "un abonné actif doit être enregistré comme client");
});

test("un PROSPECT sans abonnement reste claimé 'prospect' : l'anti-spam à vie tient", async () => {
  reset();
  subscriptionRows = [];

  await claimEmailDelivery({
    email: "prospect@marque.fr",
    websiteUrl: "https://marque.fr",
    step: "audit_result",
    subject: "Ton rapport",
  });

  const insert = lastClaimInsert();
  assert.ok(insert);
  assert.ok(insert.params.includes("prospect"));
  assert.ok(!insert.params.includes("client"));
});

test("un abonnement RÉSILIÉ ne fait pas un client", async () => {
  reset();
  subscriptionRows = [{ plan: "monitor_9eur", status: "canceled" }];

  await claimEmailDelivery({ email: "ex-client@marque.fr", websiteUrl: "https://marque.fr", step: "audit_result", subject: "x" });

  const insert = lastClaimInsert();
  assert.ok(insert);
  assert.ok(insert.params.includes("prospect"), "un statut non-entitling (canceled) redevient prospect");
});

test("FAIL-SAFE — audience indécidable (base en panne) = prospect, jamais une exception", async () => {
  reset();
  failSubscriptionQuery = true;

  const claim = await claimEmailDelivery({ email: "qui-sait@marque.fr", websiteUrl: "https://marque.fr", step: "audit_result", subject: "x" });

  assert.equal(claim.allowed, true, "la panne de la table subscriptions ne doit pas bloquer l'envoi");
  const insert = lastClaimInsert();
  assert.ok(insert);
  assert.ok(insert.params.includes("prospect"), "indécidable = prospect : l'anti-spam prime");
});
