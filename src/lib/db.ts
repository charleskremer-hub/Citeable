import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}

export async function ensureAuditSchema() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_captures (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT now(),
      source VARCHAR(100) DEFAULT 'landing_page'
    )
  `);
  await pool.query(`ALTER TABLE email_captures ADD COLUMN IF NOT EXISTS brand_name TEXT`);
  await pool.query(`ALTER TABLE email_captures ADD COLUMN IF NOT EXISTS website_url TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      brand_name TEXT NOT NULL,
      website_url TEXT NOT NULL,
      score INTEGER,
      engines_checked JSONB,
      competitors_found JSONB,
      fixes JSONB,
      raw_results JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE audits ADD COLUMN IF NOT EXISTS monitored_brand_id UUID`);
  await pool.query(`ALTER TABLE audits ADD COLUMN IF NOT EXISTS run_type TEXT DEFAULT 'manual'`);
  await pool.query(`ALTER TABLE audits ADD COLUMN IF NOT EXISTS previous_audit_id UUID`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitored_brands (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      brand_name TEXT NOT NULL,
      website_url TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      last_audit_id UUID,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (email, brand_name, website_url)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS monitored_brands_due_idx ON monitored_brands (active, next_run_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS audits_brand_site_created_idx ON audits (lower(brand_name), website_url, created_at DESC)`);
  await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (email, brand_name, website_url)
        id, email, brand_name, website_url, created_at
      FROM audits
      WHERE score IS NOT NULL
      ORDER BY email, brand_name, website_url, created_at DESC
    )
    INSERT INTO monitored_brands (email, brand_name, website_url, last_audit_id, last_run_at, next_run_at)
    SELECT email, brand_name, website_url, id, created_at, created_at + interval '7 days'
    FROM latest
    ON CONFLICT (email, brand_name, website_url) DO NOTHING
  `);
}
