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

test("la migration est tenue sous un verrou consultatif partagé par toutes les instances (bug prod 02/10)", async () => {
  // Instance avec une vraie session : le verrou doit encadrer TOUT le DDL.
  const log: string[] = [];
  const db = await import("@/lib/db");
  const pool = db.pool as unknown as { connect?: unknown; query: (t: string) => Promise<unknown> };
  const originalQuery = pool.query.bind(pool);
  pool.query = async (text: string) => {
    log.push(text);
    return originalQuery(text);
  };
  pool.connect = async () => ({
    query: async (text: string) => {
      log.push(text);
      return { rows: [], rowCount: 0 };
    },
    release: () => log.push("RELEASE"),
  });
  try {
    db.resetAuditSchemaForTests();
    await db.ensureAuditSchema();
    assert.match(log[0], /pg_advisory_lock/);
    const unlock = log.findIndex((t) => /pg_advisory_unlock/.test(t));
    assert.ok(unlock > 1, "le déverrouillage vient après le DDL");
    assert.ok(log.slice(1, unlock).some((t) => /CREATE TABLE IF NOT EXISTS audits/.test(t)));
    assert.equal(log.at(-1), "RELEASE");
  } finally {
    delete pool.connect;
  }
});
