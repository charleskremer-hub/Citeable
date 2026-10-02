import { Pool } from "pg";
import { CLASSIFIED_TRAFFIC_CLASSES_PREDICATE_SQL } from "./traffic-filter";
import { RECHECK_INTERVAL_DAYS } from "./plan-promises";

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

/**
 * `CREATE INDEX IF NOT EXISTS`, tolérant à une création CONCURRENTE.
 *
 * `IF NOT EXISTS` teste l'existence puis crée, sans verrou entre les deux. Deux
 * instances lambda qui exécutent `ensureAuditSchema()` dans la même fenêtre — le
 * premier déploiement après l'ajout d'un index, typiquement — passent toutes
 * deux le test, et la seconde lève `duplicate key value violates unique
 * constraint "pg_class_relname_nsp_index"` (23505) ou `relation already exists`
 * (42P07).
 *
 * Sans cette garde, `ensureAuditSchema()` rejetait, le `catch` global de
 * `/api/run-audit` répondait 500, et un VRAI demandeur se voyait refuser son
 * audit pour un besoin de mesure — ce que le périmètre de la story interdit
 * explicitement (« aucun audit refusé, aucun code HTTP changé »).
 *
 * On n'avale que ces deux codes, et seulement pour un DDL déjà idempotent par
 * intention : l'index existe alors bel et bien, ce qui est exactement le
 * résultat attendu. Toute autre erreur (droits, syntaxe, disque) remonte.
 *
 * Les `CREATE UNIQUE INDEX` ne passent VOLONTAIREMENT pas par ici. Postgres y
 * lève aussi `23505` quand la construction échoue parce que les DONNÉES violent
 * l'unicité (« Key ... is duplicated ») : avaler ce code sur un index unique
 * masquerait un vrai problème de données derrière une course de catalogue. Un
 * index non unique n'a aucune unicité à violer, donc son `23505` ne peut venir
 * que de `pg_class` — l'ambiguïté n'existe pas.
 */
const CONCURRENT_DDL_RACE_CODES = new Set(["23505", "42P07"]);

async function createIndexIfNotExists(sql: string) {
  try {
    await pool.query(sql);
  } catch (error) {
    if (CONCURRENT_DDL_RACE_CODES.has((error as { code?: string })?.code ?? "")) return;
    throw error;
  }
}

/**
 * MIGRATIONS : UNE FOIS PAR INSTANCE, JAMAIS EN CONCURRENCE (bug prod 01/10/2026).
 *
 * `ensureAuditSchema` était rejouée à CHAQUE requête (≈ 40 requêtes DDL). Le 01/10, le
 * titre du rapport (`generateMetadata`) l'a appelée EN PARALLÈLE du rendu de la
 * page : deux salves de CREATE/ALTER concurrentes → erreurs Postgres aléatoires
 * (« tuple concurrently updated »…) → ~23 % de 500 mesurés sur /audit/[id].
 * Désormais : une promesse unique par instance ; en cas d'échec elle est
 * oubliée pour que la requête suivante retente.
 */
let schemaReady: Promise<void> | null = null;

/**
 * MIGRATIONS : UNE SEULE INSTANCE À LA FOIS, TOUTES INSTANCES CONFONDUES (bug prod 02/10/2026).
 *
 * La promesse ci-dessus ne sérialise qu'À L'INTÉRIEUR d'une instance. Quand
 * plusieurs lambdas démarrent à froid dans la même seconde — un scanner de
 * messagerie qui ouvre tous les liens d'un lot de prospection, plusieurs
 * prospects qui cliquent —, chacune rejoue ses `DROP INDEX` / `CREATE UNIQUE
 * INDEX` / `DROP CONSTRAINT` / `ADD CONSTRAINT` en même temps que les autres :
 * 23505 sur `pg_class_relname_nsp_index`, 42710 « constraint already exists »
 * → la page /audit/[id] répond 500 au prospect. Mesuré le 02/10 : 7 rapports
 * sur 15 en 500 sous 15 requêtes simultanées.
 *
 * Un verrou consultatif Postgres, tenu par une connexion dédiée pendant toute
 * la migration, fait attendre les autres instances : elles rejouent ensuite des
 * DDL idempotents sur un schéma déjà à jour, sans course.
 */
const SCHEMA_MIGRATION_LOCK_KEY = 7_340_215_002; // constante arbitraire propre à GetPick

async function runAuditSchemaMigrationsLocked() {
  // Les doublures de `pg.Pool` des tests n'exposent que `query` : sans
  // `connect`, il n'y a pas de session où tenir un verrou, on migre directement.
  if (typeof (pool as { connect?: unknown }).connect !== "function") {
    return runAuditSchemaMigrations();
  }
  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock($1)`, [SCHEMA_MIGRATION_LOCK_KEY]);
    try {
      await runAuditSchemaMigrations();
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [SCHEMA_MIGRATION_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

export function ensureAuditSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = runAuditSchemaMigrationsLocked().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

/** Tests uniquement : oublie la migration mémorisée pour pouvoir la rejouer. */
export function resetAuditSchemaForTests() {
  schemaReady = null;
}

async function runAuditSchemaMigrations() {
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
  await pool.query(`ALTER TABLE audits ADD COLUMN IF NOT EXISTS dedupe_domain TEXT`);
  await pool.query(`UPDATE audits SET dedupe_domain = lower(split_part(regexp_replace(regexp_replace(website_url, '^https?://', ''), '^www\\.', ''), '/', 1)) WHERE dedupe_domain IS NULL`);
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS audits_dedupe_domain_created_idx ON audits (dedupe_domain, created_at DESC)`);
  // Page-réponse hébergée (moteur off-site). NULL = la page existe mais n'est PAS
  // indexable ni au sitemap (noindex) ; une date = publiée par GetPick pour un
  // client. On ne met JAMAIS en indexation les milliers de diagnostics anonymes :
  // la publication est un geste explicite, pas un effet de bord de l'audit.
  await pool.query(`ALTER TABLE audits ADD COLUMN IF NOT EXISTS answer_page_published_at TIMESTAMPTZ`);
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS audits_answer_page_published_idx ON audits (answer_page_published_at) WHERE answer_page_published_at IS NOT NULL`);
  // Présence off-site (brique 2) : statut par source d'annuaire/avis pour un
  // audit. Une ligne par (audit, source) ; l'absence de ligne = 'not_started'.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_sites (
      domain TEXT PRIMARY KEY,
      audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending_dns',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      live_at TIMESTAMPTZ,
      indexnow_pinged_at TIMESTAMPTZ
    )
  `);
  await pool.query(`ALTER TABLE ai_sites ADD COLUMN IF NOT EXISTS content JSONB`);
  await pool.query(`ALTER TABLE ai_sites ADD COLUMN IF NOT EXISTS content_generated_at TIMESTAMPTZ`);
  // « Connecter mon site » (29/09) : l'agent publie directement sur le WordPress
  // du cabinet. Secret chiffré (AES-256-GCM), jamais en clair.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cms_connections (
      domain TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      site_url TEXT NOT NULL,
      rest_url TEXT NOT NULL,
      user_login TEXT NOT NULL,
      secret_enc TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'connected',
      page_id INTEGER,
      page_url TEXT,
      published_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // llms.txt à la racine du site connecté (01/10/2026) : already_present | activated | live | no_permission | failed:<détail>.
  await pool.query(`ALTER TABLE cms_connections ADD COLUMN IF NOT EXISTS llms_txt_status TEXT`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offsite_presence (
      audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
      source_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (audit_id, source_key)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_email_unsubscribes (
      email TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_email_suppression_list (
      kind TEXT NOT NULL CHECK (kind IN ('email', 'domain')),
      value TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (kind, value)
    )
  `);
  await pool.query(
    `INSERT INTO audit_email_suppression_list (kind, value, reason)
     VALUES
       ('domain', 'keyban.fr', 'internal Keyban domain'),
       ('domain', 'getciteable.nanocorp.app', 'internal Citeable/NanoCorp domain'),
       ('domain', 'nanocorp.app', 'internal NanoCorp domain'),
       ('email', 'charles@getciteable.nanocorp.app', 'Charles internal address')
     ON CONFLICT (kind, value) DO NOTHING`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_email_delivery_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      audit_id UUID REFERENCES audits(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      brand_domain TEXT,
      step TEXT NOT NULL,
      send_day DATE NOT NULL DEFAULT CURRENT_DATE,
      subject TEXT,
      status TEXT NOT NULL,
      reason TEXT,
      provider_message_id TEXT,
      provider_status TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // PROSPECT vs CLIENT (défaut n°2 du test de bout en bout du 28/08). Le garde
  // « une étape par adresse, à vie » est voulu contre le spam PROSPECT ; mais un
  // CLIENT abonné qui relance un audit doit recevoir chacun de ses rapports.
  // L'audience est écrite par `claimEmailDelivery` (audit-engine.ts, via la
  // table `subscriptions`), et l'index à vie ne porte plus que sur les lignes
  // `audience = 'prospect'`. Pattern DROP + CREATE, comme le CHECK des
  // événements funnel plus bas : l'ancienne définition ne porte pas le prédicat
  // et `IF NOT EXISTS` seul ne re-créerait jamais l'index avec le bon WHERE.
  await pool.query(`ALTER TABLE audit_email_delivery_log ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'prospect'`);
  // LOT G1 (25/09/2026) — LE DIAGNOSTIC QUE L'UTILISATEUR DEMANDE LUI-MEME SORT
  // DES TROIS GARDES ANTI-SPAM.
  //
  // Mesure en production le 25/09 (CEO, 07:03-07:04Z, trois audits `free`) :
  // une adresse JAMAIS VUE s'est vu refuser son PREMIER diagnostic sur
  // `inoxem.fr` et `kapsens.com`. Ce n'est pas l'index a vie `(email, step)`
  // qui a tire, c'est `(brand_domain, step, send_day)` — dont la cle ne
  // contient PAS le destinataire. Consequence :
  //
  //   LE PREMIER QUI DEMANDE UN DIAGNOSTIC SUR UN DOMAINE, UN JOUR DONNE, EST
  //   LE SEUL A LE RECEVOIR. TOUS LES SUIVANTS RECOIVENT LE SILENCE.
  //
  // Deux personnes de la meme entreprise qui testent le meme jour : une seule
  // recoit. Et un audit lance le matin pour preparer une prospection coupe le
  // prospect qui demande son propre diagnostic l'apres-midi.
  //
  // Les trois gardes ont ete poses contre le spam de prospection NON
  // SOLLICITEE. Ils restent entiers pour les etapes non sollicitees
  // (`j1_value`, `j3_offer`, `weekly_monitoring`) : c'est la qu'ils protegent.
  // Le pas `audit_result` — reclame par l'utilisateur en tapant son adresse sur
  // la landing — recoit sa propre regle, et LE DESTINATAIRE EST DANS LA CLE :
  // une livraison par (adresse, domaine de marque, jour).
  //
  // DROP + CREATE obligatoire, jamais `IF NOT EXISTS` seul : un index deja
  // present ne verrait pas son predicat mis a jour, et la migration passerait
  // en silence en laissant le defaut en place.
  await pool.query(`DROP INDEX IF EXISTS audit_email_delivery_one_step_per_prospect_idx`);
  await pool.query(`DROP INDEX IF EXISTS audit_email_delivery_one_day_per_prospect_idx`);
  await pool.query(`DROP INDEX IF EXISTS audit_email_delivery_one_brand_step_day_idx`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS audit_email_delivery_one_step_per_prospect_idx ON audit_email_delivery_log (email, step) WHERE status IN ('claimed', 'sent', 'failed') AND audience = 'prospect' AND step <> 'audit_result'`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS audit_email_delivery_one_day_per_prospect_idx ON audit_email_delivery_log (email, send_day) WHERE status IN ('claimed', 'sent', 'failed') AND step <> 'audit_result'`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS audit_email_delivery_one_brand_step_day_idx ON audit_email_delivery_log (brand_domain, step, send_day) WHERE brand_domain IS NOT NULL AND status IN ('claimed', 'sent', 'failed') AND step <> 'audit_result'`);
  // LA REGLE PROPRE AU DIAGNOSTIC DEMANDE. `brand_domain IS NOT NULL` reprend
  // le predicat de l'index de marque : une ligne sans domaine lisible n'est
  // dedupliquee par aucun de ces index — c'est assume, le plafond quotidien de
  // l'audit gratuit (`FREE_AUDIT_EMAIL_DAILY_LIMIT`) tient ce cas en amont.
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS audit_email_delivery_requested_audit_recipient_day_idx ON audit_email_delivery_log (email, brand_domain, step, send_day) WHERE step = 'audit_result' AND brand_domain IS NOT NULL AND status IN ('claimed', 'sent', 'failed')`);
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS audit_email_delivery_email_created_idx ON audit_email_delivery_log (email, created_at DESC)`);
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
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS audit_email_sequence_due_idx ON audit_email_sequence_jobs (scheduled_at, sent_at, send_started_at)`);
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS audit_email_sequence_audit_idx ON audit_email_sequence_jobs (audit_id)`);
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
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS monitored_brands_due_idx ON monitored_brands (active, next_run_at)`);
  // LOT A (commande du 20/09) — les questions d'une marque surveillée sont
  // stockées à la première exécution et rejouées telles quelles ensuite.
  //
  // Table séparée plutôt qu'une colonne sur `monitored_brands` : la ligne de
  // surveillance est mise à jour à CHAQUE rescan (`last_run_at`,
  // `next_run_at`), le jeu de questions ne doit bouger que sur un déclencheur
  // explicite. Deux durées de vie différentes, deux tables — une colonne
  // partagée invite à réécrire le jeu par inadvertance dans un `UPDATE` qui
  // visait l'échéance.
  //
  // `ON DELETE CASCADE` : un désabonnement supprime la marque ET ses
  // questions, aucun orphelin à nettoyer plus tard.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS monitored_brand_prompts (
      monitored_brand_id UUID PRIMARY KEY REFERENCES monitored_brands (id) ON DELETE CASCADE,
      prompts JSONB NOT NULL,
      category TEXT NOT NULL,
      prompt_count INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS audits_followup_1_due_idx ON audits (created_at) WHERE score IS NOT NULL AND followup_1_sent_at IS NULL`);
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS audits_followup_2_due_idx ON audits (created_at) WHERE score IS NOT NULL AND followup_2_sent_at IS NULL`);
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS audits_brand_site_created_idx ON audits (lower(brand_name), website_url, created_at DESC)`);
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS audits_domain_score_created_idx ON audits (dedupe_domain, created_at DESC) WHERE score IS NOT NULL`);
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
  // La liste est répétée ici en littéral SQL et NON importée de `FUNNEL_EVENTS`
  // (`./funnel` importe `pool` d'ici : l'import inverse ferait un cycle). Elle
  // doit donc être tenue à jour à la main à chaque ajout d'événement — un oubli
  // ne se voit pas au type-check, il se voit en production sous la forme d'une
  // violation de contrainte sur l'INSERT. Le `DROP … IF EXISTS` juste au-dessus
  // fait que la migration est appliquée par le simple déploiement : chaque
  // `ensureAuditSchema` recrée la contrainte à jour.
  await pool.query(`ALTER TABLE audit_funnel_events DROP CONSTRAINT IF EXISTS audit_funnel_events_event_name_check`);
  await pool.query(`
    ALTER TABLE audit_funnel_events
    ADD CONSTRAINT audit_funnel_events_event_name_check
    CHECK (event_name IN ('audit_started', 'audit_completed', 'report_viewed', 'report_link_opened', 'email_captured', 'teaser_cta_click', 'checkout_opened', 'followup_1_sent', 'followup_2_sent', 'followup_click'))
  `);
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS audit_funnel_events_created_idx ON audit_funnel_events (created_at DESC)`);
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS audit_funnel_events_name_created_idx ON audit_funnel_events (event_name, created_at DESC)`);
  await createIndexIfNotExists(`CREATE INDEX IF NOT EXISTS audit_funnel_events_audit_idx ON audit_funnel_events (audit_id, created_at DESC)`);
  // Sert `traffic_class_since` (voir `TRAFFIC_CLASS_SINCE_SQL`). Sans lui, chaque
  // `GET /api/funnel` — public, `no-store`, sans clé — déclenchait un Seq Scan de
  // toute la table sur `metadata->>'trafficClass'`, sur le même pool Neon que
  // `/api/run-audit`, et la table grossit désormais plus vite qu'avant (les
  // événements bots/internes sont persistés au lieu d'être jetés).
  //
  // Index PARTIEL et sur `created_at` : le prédicat doit être écrit exactement
  // comme celui de la requête (d'où la constante partagée
  // `CLASSIFIED_TRAFFIC_CLASSES_PREDICATE_SQL`), et la colonne indexée doit être
  // celle du `MIN()` pour que Postgres réponde par la première entrée de l'index.
  await createIndexIfNotExists(`
    CREATE INDEX IF NOT EXISTS audit_funnel_events_classified_created_idx
    ON audit_funnel_events (created_at)
    WHERE ${CLASSIFIED_TRAFFIC_CLASSES_PREDICATE_SQL}
  `);
  await pool.query(`
    UPDATE monitored_brands
    SET next_run_at = GREATEST(next_run_at, COALESCE(last_run_at, created_at) + interval '${RECHECK_INTERVAL_DAYS} days')
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
    SELECT email, brand_name, website_url, id, created_at, created_at + interval '${RECHECK_INTERVAL_DAYS} days'
    FROM latest
    ON CONFLICT (email, brand_name, website_url) DO NOTHING
  `);
}
