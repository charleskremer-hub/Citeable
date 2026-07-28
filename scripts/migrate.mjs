#!/usr/bin/env node
/**
 * Applique les migrations SQL versionnées de `migrations/` sur DATABASE_URL.
 *
 *   DATABASE_URL="postgres://…" node scripts/migrate.mjs          # applique le reste
 *   DATABASE_URL="postgres://…" node scripts/migrate.mjs --dry    # liste sans écrire
 *
 * Le schéma d'audit historique reste géré par `ensureAuditSchema()` (DDL
 * idempotent rejouée à chaque requête API) : ce runner ne le remplace pas et ne
 * le touche pas. Il existe pour les objets qu'on veut pouvoir dater et tracer —
 * une couche de conformité doit pouvoir répondre à « depuis quand ».
 *
 * Chaque migration tourne dans SA PROPRE transaction, et le fichier n'est marqué
 * appliqué que si la transaction passe. Une migration qui échoue à mi-chemin ne
 * laisse donc jamais la base à moitié migrée avec une ligne qui prétend le
 * contraire.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const dryRun = process.argv.includes("--dry");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL manquant. Rien n'a été appliqué.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
});

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  const applied = new Set((await pool.query("SELECT version FROM schema_migrations")).rows.map((row) => row.version));

  let count = 0;

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) {
      console.log(`= ${version} (déjà appliquée)`);
      continue;
    }

    if (dryRun) {
      console.log(`~ ${version} (à appliquer — mode --dry, rien n'est écrit)`);
      continue;
    }

    const sql = await readFile(join(migrationsDir, file), "utf8");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
      await client.query("COMMIT");
      count += 1;
      console.log(`+ ${version} appliquée`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error(`! ${version} a échoué — rien n'a été écrit pour cette migration.`);
      throw error;
    } finally {
      client.release();
    }
  }

  console.log(dryRun ? "Mode --dry : aucune écriture." : `${count} migration(s) appliquée(s).`);
} finally {
  await pool.end();
}
