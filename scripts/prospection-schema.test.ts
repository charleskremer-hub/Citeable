import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PROSPECTION_COMPLIANCE_SQL, PROSPECTION_MIGRATION_VERSION } from "@/lib/prospection-schema";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(resolve(root, `migrations/${PROSPECTION_MIGRATION_VERSION}.sql`), "utf8");

test("la migration est la copie exacte de la source de vérité", () => {
  // Le SQL est écrit une fois, dans le module TS, et régénéré vers le .sql par
  // `node scripts/emit-migration.mjs`. Si quelqu'un édite le .sql à la main, la
  // base et le runtime divergent en silence — c'est ce test qui l'empêche.
  assert.ok(
    migration.includes(PROSPECTION_COMPLIANCE_SQL.trim()),
    "migrations/001_prospection_compliance.sql a divergé de src/lib/prospection-schema.ts — relancer `node scripts/emit-migration.mjs`"
  );
});

test("le fichier de migration se signale comme généré", () => {
  assert.match(migration, /FICHIER GÉNÉRÉ/);
  assert.match(migration, /scripts\/emit-migration\.mjs/);
});

test("la migration est rejouable — tout est créé sous condition", () => {
  // Elle est exécutée deux fois par construction : par le runner de migrations,
  // et par ensureProspectionSchema() à chaque démarrage de process.
  const creations = PROSPECTION_COMPLIANCE_SQL.match(/^CREATE TABLE.*$/gm) ?? [];
  assert.ok(creations.length >= 3);
  for (const line of creations) {
    assert.match(line, /IF NOT EXISTS/, line);
  }

  for (const line of PROSPECTION_COMPLIANCE_SQL.match(/^CREATE INDEX.*$/gm) ?? []) {
    assert.match(line, /IF NOT EXISTS/, line);
  }

  // Les contraintes CHECK ne connaissent pas IF NOT EXISTS : elles doivent être
  // supprimées avant d'être posées, sinon un second passage échoue.
  const added = PROSPECTION_COMPLIANCE_SQL.match(/ADD CONSTRAINT (\w+)/g) ?? [];
  assert.ok(added.length > 0);
  for (const entry of added) {
    const name = entry.replace("ADD CONSTRAINT ", "");
    assert.ok(
      PROSPECTION_COMPLIANCE_SQL.includes(`DROP CONSTRAINT IF EXISTS ${name}`),
      `contrainte ${name} posée sans DROP IF EXISTS préalable — la migration ne serait pas rejouable`
    );
  }

  // Idem pour le trigger.
  assert.match(PROSPECTION_COMPLIANCE_SQL, /DROP TRIGGER IF EXISTS prospection_contacts_retention/);
});

test("les trois tables de la couche conformité sont présentes", () => {
  for (const table of ["prospection_contacts", "prospection_opt_outs", "instantly_webhook_events"]) {
    assert.ok(PROSPECTION_COMPLIANCE_SQL.includes(`CREATE TABLE IF NOT EXISTS ${table}`), table);
  }
});

test("le journal des webhooks est dédupliqué par contrainte, pas par convention", () => {
  assert.match(PROSPECTION_COMPLIANCE_SQL, /dedupe_key TEXT NOT NULL UNIQUE/);
});

test("les oppositions sont uniques par (kind, value) et n'ont pas d'échéance de purge", () => {
  assert.match(PROSPECTION_COMPLIANCE_SQL, /PRIMARY KEY \(kind, value\)/);
  // Une opposition qui expire est une opposition qu'on va violer : la table ne
  // doit porter aucune colonne de rétention.
  const optOutBlock = PROSPECTION_COMPLIANCE_SQL.split("CREATE TABLE IF NOT EXISTS prospection_opt_outs")[1]?.split(");")[0] ?? "";
  assert.ok(optOutBlock.length > 0);
  assert.equal(optOutBlock.includes("retention_until"), false);
});

test("la rétention du registre est tenue par trigger, jamais à la main", () => {
  assert.match(PROSPECTION_COMPLIANCE_SQL, /CREATE OR REPLACE FUNCTION prospection_set_retention/);
  assert.match(PROSPECTION_COMPLIANCE_SQL, /COALESCE\(NEW\.last_contacted_at, NEW\.collected_at\)::date \+ 1095/);
});

test("la reprise de l'existant ne casse pas sur une base fraîche", () => {
  // audit_email_unsubscribes / audit_email_suppression_list sont créées par
  // ensureAuditSchema(), qui peut n'avoir jamais tourné sur une base neuve.
  for (const table of ["audit_email_unsubscribes", "audit_email_suppression_list"]) {
    assert.ok(
      PROSPECTION_COMPLIANCE_SQL.includes(`to_regclass('public.${table}') IS NOT NULL`),
      `reprise de ${table} non gardée`
    );
  }
});
