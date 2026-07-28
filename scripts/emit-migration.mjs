#!/usr/bin/env node
/**
 * Régénère `migrations/001_prospection_compliance.sql` depuis la source de vérité
 * `src/lib/prospection-schema.ts`.
 *
 *   node scripts/emit-migration.mjs
 *
 * Le SQL est écrit UNE fois, dans le module TypeScript, parce que le runtime doit
 * pouvoir le rejouer sans lire le disque (`ensureProspectionSchema()`). Le fichier
 * `.sql` en est la copie versionnée, celle qu'on applique et qu'on date.
 * `scripts/prospection-schema.test.ts` échoue si les deux divergent — donc si
 * quelqu'un édite le `.sql` à la main, les tests le disent.
 */
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Import direct du .ts : Node retire les annotations de type depuis la 22.18,
// donc aucune compilation n'est nécessaire pour lire la constante.
const { PROSPECTION_COMPLIANCE_SQL, PROSPECTION_MIGRATION_VERSION } = await import(
  pathToFileURL(resolve(root, "src/lib/prospection-schema.ts")).href
);

const header = `-- ---------------------------------------------------------------------------
-- ${PROSPECTION_MIGRATION_VERSION}
--
-- FICHIER GÉNÉRÉ — ne pas éditer à la main.
-- Source : src/lib/prospection-schema.ts  ·  Régénérer : node scripts/emit-migration.mjs
--
-- Couche de conformité de la prospection sortante (RGPD, recommandation CNIL
-- pour la prospection B2B) :
--   1. prospection_contacts      registre — provenance, base légale, purge à 3 ans
--   2. prospection_opt_outs      oppositions, jamais purgées
--   3. instantly_webhook_events  journal des envois et des retours, dédupliqué
--
-- Idempotente : rejouable sans effet de bord.
-- ---------------------------------------------------------------------------
`;

const target = resolve(root, `migrations/${PROSPECTION_MIGRATION_VERSION}.sql`);
await writeFile(target, `${header}${PROSPECTION_COMPLIANCE_SQL.trimStart()}`, "utf8");
console.log(`écrit : migrations/${PROSPECTION_MIGRATION_VERSION}.sql`);
