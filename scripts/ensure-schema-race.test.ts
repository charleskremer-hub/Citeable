import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * `ensureAuditSchema()` face à une création d'index CONCURRENTE.
 *
 * Le scénario : `ensureAuditSchema()` est appelée en tête de `POST
 * /api/run-audit`. `CREATE INDEX IF NOT EXISTS` teste puis crée, sans verrou
 * entre les deux — au premier déploiement qui ajoute un index, deux lambdas
 * simultanées passent le test et la seconde lève `23505` sur
 * `pg_class_relname_nsp_index`. Sans tolérance, `ensureAuditSchema()` rejetait,
 * le `catch` global de la route répondait 500, et un VRAI demandeur se voyait
 * refuser son audit pour un besoin de mesure.
 *
 * Le `pg.Pool` est remplacé au niveau du module : on n'ouvre aucune connexion.
 */

const repoRoot = resolve(import.meta.dirname, "..");
const pgUrl = pathToFileURL(resolve(repoRoot, "node_modules/pg/lib/index.js")).href;

type PgError = Error & { code: string };

function pgError(code: string, message: string): PgError {
  return Object.assign(new Error(message), { code });
}

const executed: string[] = [];
let failNextMatching: { pattern: RegExp; error: PgError } | null = null;

class FakePool {
  async query(text: string) {
    executed.push(text);
    if (failNextMatching && failNextMatching.pattern.test(text)) {
      const { error } = failNextMatching;
      failNextMatching = null;
      throw error;
    }
    return { rows: [], rowCount: 0 };
  }
}

mock.module(pgUrl, { namedExports: { Pool: FakePool } });

const { ensureAuditSchema: ensureAuditSchemaOnce, resetAuditSchemaForTests } = await import("@/lib/db");
// Chaque scénario rejoue la migration : on oublie la mémorisation par instance.
const ensureAuditSchema = () => {
  resetAuditSchemaForTests();
  return ensureAuditSchemaOnce();
};

function reset() {
  executed.length = 0;
  failNextMatching = null;
}

test("une course de catalogue sur un index NON unique ne fait pas échouer le schéma", async () => {
  reset();
  // L'erreur exacte que lève la seconde lambda.
  failNextMatching = {
    pattern: /CREATE INDEX IF NOT EXISTS audit_funnel_events_classified_created_idx/,
    error: pgError(
      "23505",
      'duplicate key value violates unique constraint "pg_class_relname_nsp_index"'
    ),
  };

  await assert.doesNotReject(ensureAuditSchema());
  // Le reste du schéma continue de s'exécuter : l'erreur est avalée, pas
  // propagée en abandonnant les instructions suivantes.
  assert.ok(
    executed.some((sql) => sql.includes("UPDATE monitored_brands")),
    "les instructions postérieures à l'index doivent avoir tourné"
  );
});

test("« relation already exists » (42P07) est tolérée de la même façon", async () => {
  reset();
  failNextMatching = {
    pattern: /CREATE INDEX IF NOT EXISTS audit_funnel_events_created_idx/,
    error: pgError("42P07", 'relation "audit_funnel_events_created_idx" already exists'),
  };

  await assert.doesNotReject(ensureAuditSchema());
});

test("toute AUTRE erreur remonte : on ne transforme pas une panne en silence", async () => {
  reset();
  failNextMatching = {
    pattern: /CREATE INDEX IF NOT EXISTS audit_funnel_events_classified_created_idx/,
    error: pgError("42501", "permission denied for table audit_funnel_events"),
  };

  await assert.rejects(ensureAuditSchema(), /permission denied/);
});

test("les index UNIQUES ne sont PAS couverts : leur 23505 peut venir des données", async () => {
  reset();
  // « Key (email, step) is duplicated » porte AUSSI le code 23505. L'avaler
  // masquerait un vrai problème de données derrière une course de catalogue.
  failNextMatching = {
    pattern: /CREATE UNIQUE INDEX IF NOT EXISTS audit_email_delivery_one_step_per_prospect_idx/,
    error: pgError(
      "23505",
      "could not create unique index. Key (email, step)=(a@b.fr, j1_value) is duplicated"
    ),
  };

  await assert.rejects(ensureAuditSchema(), /could not create unique index/);
});

test("premier démarrage après un changement : DROP + CREATE puis empreinte posée en commentaire (bug prod 02/10)", async () => {
  reset();
  // La doublure renvoie zéro ligne à la lecture d'empreinte : rien n'est encore marqué.
  await ensureAuditSchema();
  assert.ok(executed.some((s) => /DROP INDEX IF EXISTS audit_email_delivery_one_step_per_prospect_idx/.test(s)));
  assert.ok(executed.some((s) => /COMMENT ON INDEX audit_email_delivery_one_step_per_prospect_idx IS 'getpick:/.test(s)));
  assert.ok(executed.some((s) => /COMMENT ON CONSTRAINT audit_funnel_events_event_name_check/.test(s)));
});

test("une VRAIE violation d'unicité (données) sur un index unique remonte, une course de catalogue non", async () => {
  reset();
  failNextMatching = {
    pattern: /CREATE UNIQUE INDEX IF NOT EXISTS audit_email_delivery_one_day_per_prospect_idx/,
    error: Object.assign(pgError("23505", 'duplicate key value violates unique constraint "pg_class_relname_nsp_index"'), { constraint: "pg_class_relname_nsp_index" }),
  };
  await assert.doesNotReject(ensureAuditSchema());

  reset();
  failNextMatching = {
    pattern: /CREATE UNIQUE INDEX IF NOT EXISTS audit_email_delivery_one_day_per_prospect_idx/,
    error: Object.assign(pgError("23505", 'could not create unique index "audit_email_delivery_one_day_per_prospect_idx"'), { constraint: "audit_email_delivery_one_day_per_prospect_idx" }),
  };
  await assert.rejects(ensureAuditSchema());
});

test("« constraint already exists » (42710) laissée par l'instance voisine est tolérée", async () => {
  reset();
  failNextMatching = {
    pattern: /ADD CONSTRAINT audit_funnel_events_event_name_check/,
    error: pgError("42710", 'constraint "audit_funnel_events_event_name_check" for relation "audit_funnel_events" already exists'),
  };
  await assert.doesNotReject(ensureAuditSchema());
});

test("objet supprimé par l'instance voisine pendant le remplacement (42P01 / 42704) : toléré (prod 02/10)", async () => {
  reset();
  failNextMatching = {
    pattern: /COMMENT ON INDEX audit_email_delivery_one_brand_step_day_idx/,
    error: pgError("42P01", 'relation "audit_email_delivery_one_brand_step_day_idx" does not exist'),
  };
  await assert.doesNotReject(ensureAuditSchema());
  reset();
  failNextMatching = {
    pattern: /COMMENT ON CONSTRAINT audit_funnel_events_event_name_check/,
    error: pgError("42704", 'constraint "audit_funnel_events_event_name_check" for table "audit_funnel_events" does not exist'),
  };
  await assert.doesNotReject(ensureAuditSchema());
});
