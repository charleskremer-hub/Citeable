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
  await pool.query(`ALTER TABLE audits ADD COLUMN IF NOT EXISTS followup_1_sent_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE audits ADD COLUMN IF NOT EXISTS followup_2_sent_at TIMESTAMPTZ`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_email_unsubscribes (
      email TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_email_sequence_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      step TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      send_started_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      provider_message_id TEXT,
      provider_status TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (audit_id, step)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS audit_email_sequence_due_idx ON audit_email_sequence_jobs (scheduled_at, sent_at, send_started_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS audit_email_sequence_audit_idx ON audit_email_sequence_jobs (audit_id)`);
  await pool.query(`
    UPDATE audits
    SET followup_1_sent_at = COALESCE(followup_1_sent_at, sent_jobs.sent_at)
    FROM audit_email_sequence_jobs sent_jobs
    WHERE sent_jobs.audit_id = audits.id
      AND sent_jobs.step = 'j1_value'
      AND sent_jobs.sent_at IS NOT NULL
  `);
  await pool.query(`
    UPDATE audits
    SET followup_2_sent_at = COALESCE(followup_2_sent_at, sent_jobs.sent_at)
    FROM audit_email_sequence_jobs sent_jobs
    WHERE sent_jobs.audit_id = audits.id
      AND sent_jobs.step = 'j3_offer'
      AND sent_jobs.sent_at IS NOT NULL
  `);
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
  await pool.query(`CREATE INDEX IF NOT EXISTS audits_followup_1_due_idx ON audits (created_at) WHERE score IS NOT NULL AND followup_1_sent_at IS NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS audits_followup_2_due_idx ON audits (created_at) WHERE score IS NOT NULL AND followup_2_sent_at IS NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS audits_brand_site_created_idx ON audits (lower(brand_name), website_url, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_funnel_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_name TEXT NOT NULL,
      audit_id UUID,
      source TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      dedupe_key TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE audit_funnel_events DROP CONSTRAINT IF EXISTS audit_funnel_events_event_name_check`);
  await pool.query(`
    ALTER TABLE audit_funnel_events
    ADD CONSTRAINT audit_funnel_events_event_name_check
    CHECK (event_name IN ('audit_started', 'audit_completed', 'report_viewed', 'teaser_cta_click', 'checkout_opened', 'followup_1_sent', 'followup_2_sent', 'followup_click'))
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS audit_funnel_events_created_idx ON audit_funnel_events (created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS audit_funnel_events_name_created_idx ON audit_funnel_events (event_name, created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS audit_funnel_events_audit_idx ON audit_funnel_events (audit_id, created_at DESC)`);
  await pool.query(`
    UPDATE monitored_brands
    SET next_run_at = GREATEST(next_run_at, COALESCE(last_run_at, created_at) + interval '30 days')
    WHERE active = true
  `);
  await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (email, brand_name, website_url)
        id, email, brand_name, website_url, created_at
      FROM audits
      WHERE score IS NOT NULL
      ORDER BY email, brand_name, website_url, created_at DESC
    )
    INSERT INTO monitored_brands (email, brand_name, website_url, last_audit_id, last_run_at, next_run_at)
    SELECT email, brand_name, website_url, id, created_at, created_at + interval '30 days'
    FROM latest
    ON CONFLICT (email, brand_name, website_url) DO NOTHING
  `);
}
