/**
 * Contrat de l'endpoint de publication de la page-réponse.
 *
 * Invariants :
 *   - protégé par la clé admin (FUNNEL_ADMIN_KEY), comparaison à temps constant ;
 *   - ne modifie que l'état de publication (answer_page_published_at), jamais les
 *     données client ;
 *   - refuse un audit non terminé (score IS NOT NULL).
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function stripped(relPath: string) {
  return readFileSync(resolve(repoRoot, relPath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const route = stripped("src/app/api/admin/publish-answer-page/route.ts");

test("publish — protégé par la clé admin", () => {
  assert.match(route, /FUNNEL_ADMIN_KEY/);
  assert.match(route, /secretMatches/);
  assert.match(route, /401/);
});

test("publish — ne touche QUE l'état de publication", () => {
  assert.match(route, /answer_page_published_at/);
  assert.match(route, /UPDATE audits/);
  // aucune écriture d'une autre colonne métier
  assert.equal(/SET\s+(brand_name|website_url|raw_results|score)/.test(route), false);
});

test("publish — exige un audit terminé", () => {
  assert.match(route, /score IS NOT NULL/);
});
