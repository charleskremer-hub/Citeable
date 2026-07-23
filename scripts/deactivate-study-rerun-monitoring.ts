/**
 * Nettoyage post re-run de l'étude — désactive le monitoring mensuel des
 * 21 marques auditées par scripts/rerun-study-2026-07.ts.
 *
 * Pourquoi : chaque audit complété passe par upsertMonitoredBrandForAudit
 * (src/lib/audit-engine.ts), qui crée/réactive une ligne monitored_brands
 * avec next_run_at = +30 jours. Sans ce nettoyage, les 21 marques du re-run
 * seraient re-auditées automatiquement chaque mois (~250 appels gpt-4o-mini
 * mensuels) pour des marques qui n'ont rien demandé. Décision : le re-run de
 * l'étude est un snapshot ponctuel, PAS un abonnement au monitoring — on
 * désactive (active = false) sans supprimer, pour garder l'historique.
 *
 * Les lignes sont ciblées par l'email exact du re-run (RUN_EMAIL, domaine
 * anonyme) : aucune marque inscrite par un vrai utilisateur n'est touchée.
 *
 * Usage (nécessite l'URL de la base Neon de prod) :
 *   DATABASE_URL="postgres://..." node scripts/deactivate-study-rerun-monitoring.ts
 * Dry-run (liste les lignes ciblées sans écrire) :
 *   DATABASE_URL="postgres://..." DRY_RUN=1 node scripts/deactivate-study-rerun-monitoring.ts
 *
 * Idempotent : re-exécuter ne change rien une fois les lignes désactivées.
 * À exécuter au déploiement de l'édition juillet 2026 — consigné dans
 * artifacts/study-rerun-2026-07/monitoring-cleanup.md.
 */

import { Pool } from "pg";
import { pathToFileURL } from "node:url";
import { RUN_EMAIL } from "./rerun-study-2026-07.ts";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[monitoring-cleanup] DATABASE_URL manquant — rien fait.");
    process.exit(1);
  }
  const dryRun = Boolean(process.env.DRY_RUN);
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const targeted = await pool.query<{ id: string; brand_name: string; active: boolean; next_run_at: string }>(
      `SELECT id, brand_name, active, next_run_at
       FROM monitored_brands
       WHERE email = $1
       ORDER BY brand_name`,
      [RUN_EMAIL]
    );
    console.log(`[monitoring-cleanup] ${targeted.rows.length} ligne(s) monitored_brands pour ${RUN_EMAIL} :`);
    console.table(targeted.rows);

    if (dryRun) {
      console.log("[monitoring-cleanup] DRY_RUN — aucune écriture.");
      return;
    }

    const updated = await pool.query<{ id: string; brand_name: string }>(
      `UPDATE monitored_brands
       SET active = false,
           updated_at = now()
       WHERE email = $1
         AND active = true
       RETURNING id, brand_name`,
      [RUN_EMAIL]
    );
    console.log(`[monitoring-cleanup] ${updated.rows.length} ligne(s) désactivée(s) :`);
    console.table(updated.rows);
  } finally {
    await pool.end();
  }
}

// Même garde d'exécution directe que le script de re-run : importable sans
// effet de bord (tests, outillage).
const isDirectRun = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
