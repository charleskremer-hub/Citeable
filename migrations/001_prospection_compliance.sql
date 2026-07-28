-- ---------------------------------------------------------------------------
-- 001_prospection_compliance
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
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Registre de prospection -------------------------------------------------
CREATE TABLE IF NOT EXISTS prospection_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  brand_name TEXT,
  brand_domain TEXT,
  contact_name TEXT,
  -- D'où vient l'adresse. 'registre_certification' = annuaire d'adhérents type
  -- Cosmébio ; 'site_public' = publiée par la marque sur son propre site.
  source_kind TEXT NOT NULL DEFAULT 'site_public',
  source_url TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  legal_basis TEXT NOT NULL DEFAULT 'legitimate_interest',
  campaign_id TEXT,
  status TEXT NOT NULL DEFAULT 'sourced',
  first_contacted_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  contact_count INTEGER NOT NULL DEFAULT 0,
  -- Tenue par trigger : 3 ans après le dernier contact (recommandation CNIL
  -- pour la prospection B2B). Jamais saisie à la main.
  retention_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE prospection_contacts DROP CONSTRAINT IF EXISTS prospection_contacts_source_kind_check;
ALTER TABLE prospection_contacts ADD CONSTRAINT prospection_contacts_source_kind_check
  CHECK (source_kind IN ('site_public', 'annuaire_public', 'registre_certification', 'presse', 'reseau_social', 'manuel', 'import'));

ALTER TABLE prospection_contacts DROP CONSTRAINT IF EXISTS prospection_contacts_legal_basis_check;
ALTER TABLE prospection_contacts ADD CONSTRAINT prospection_contacts_legal_basis_check
  CHECK (legal_basis IN ('legitimate_interest', 'consent'));

ALTER TABLE prospection_contacts DROP CONSTRAINT IF EXISTS prospection_contacts_status_check;
ALTER TABLE prospection_contacts ADD CONSTRAINT prospection_contacts_status_check
  CHECK (status IN ('sourced', 'queued', 'contacted', 'replied', 'opted_out', 'bounced', 'suppressed'));

CREATE INDEX IF NOT EXISTS prospection_contacts_domain_idx ON prospection_contacts (brand_domain);
CREATE INDEX IF NOT EXISTS prospection_contacts_status_idx ON prospection_contacts (status, last_contacted_at DESC);
CREATE INDEX IF NOT EXISTS prospection_contacts_retention_idx ON prospection_contacts (retention_until);

CREATE OR REPLACE FUNCTION prospection_set_retention() RETURNS trigger AS $prospection$
BEGIN
  NEW.updated_at := now();
  -- 1095 jours = 3 ans. Le point de départ est le dernier contact s'il existe,
  -- la collecte sinon : une adresse sourcée jamais contactée se purge aussi.
  NEW.retention_until := (COALESCE(NEW.last_contacted_at, NEW.collected_at)::date + 1095);
  RETURN NEW;
END;
$prospection$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prospection_contacts_retention ON prospection_contacts;
CREATE TRIGGER prospection_contacts_retention
  BEFORE INSERT OR UPDATE ON prospection_contacts
  FOR EACH ROW EXECUTE FUNCTION prospection_set_retention();

-- 2. Oppositions -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prospection_opt_outs (
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  reason TEXT NOT NULL,
  source TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, value)
);

ALTER TABLE prospection_opt_outs DROP CONSTRAINT IF EXISTS prospection_opt_outs_kind_check;
ALTER TABLE prospection_opt_outs ADD CONSTRAINT prospection_opt_outs_kind_check
  CHECK (kind IN ('email', 'domain'));

ALTER TABLE prospection_opt_outs DROP CONSTRAINT IF EXISTS prospection_opt_outs_reason_check;
ALTER TABLE prospection_opt_outs ADD CONSTRAINT prospection_opt_outs_reason_check
  CHECK (reason IN ('unsubscribed', 'reply_stop', 'bounced', 'complaint', 'not_interested', 'wrong_person', 'manual', 'internal'));

CREATE INDEX IF NOT EXISTS prospection_opt_outs_created_idx ON prospection_opt_outs (created_at DESC);

-- Interrogée par tout chemin d'envoi. STABLE : utilisable dans un WHERE.
CREATE OR REPLACE FUNCTION prospection_is_suppressed(target_email TEXT) RETURNS BOOLEAN AS $prospection$
  SELECT EXISTS (
    SELECT 1 FROM prospection_opt_outs
    WHERE (kind = 'email' AND value = lower(target_email))
       OR (kind = 'domain' AND value = lower(split_part(target_email, '@', 2)))
  );
$prospection$ LANGUAGE sql STABLE;

-- 3. Journal des webhooks Instantly v2 ---------------------------------------
CREATE TABLE IF NOT EXISTS instantly_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ,
  workspace_id TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  lead_email TEXT,
  lead_domain TEXT,
  email_account TEXT,
  step TEXT,
  variant TEXT,
  is_first BOOLEAN,
  email_id TEXT,
  subject TEXT,
  -- Minimisation : on garde l'extrait de réponse, jamais le HTML ni le corps
  -- complet. Ce qu'on stocke doit servir à décider, pas à archiver la boîte mail
  -- d'un prospect.
  reply_snippet TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instantly_webhook_events_type_idx ON instantly_webhook_events (event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS instantly_webhook_events_lead_idx ON instantly_webhook_events (lead_email, occurred_at DESC);
CREATE INDEX IF NOT EXISTS instantly_webhook_events_campaign_idx ON instantly_webhook_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS instantly_webhook_events_received_idx ON instantly_webhook_events (received_at DESC);

-- 4. Reprise de l'existant ---------------------------------------------------
-- Les désinscriptions et la liste de suppression vivaient dans deux tables du
-- schéma d'audit. Elles restent en place (rien n'est cassé), mais elles sont
-- recopiées ici pour qu'il n'existe qu'UN endroit à interroger avant un envoi.
DO $prospection$
BEGIN
  IF to_regclass('public.audit_email_unsubscribes') IS NOT NULL THEN
    INSERT INTO prospection_opt_outs (kind, value, reason, source, created_at)
    SELECT 'email', lower(email), 'unsubscribed', 'audit_email_unsubscribes', created_at
    FROM audit_email_unsubscribes
    ON CONFLICT (kind, value) DO NOTHING;
  END IF;

  IF to_regclass('public.audit_email_suppression_list') IS NOT NULL THEN
    INSERT INTO prospection_opt_outs (kind, value, reason, source, created_at)
    SELECT kind, lower(value), 'internal', 'audit_email_suppression_list', created_at
    FROM audit_email_suppression_list
    ON CONFLICT (kind, value) DO NOTHING;
  END IF;
END
$prospection$;
