/**
 * Trois défauts relevés sur le rapport réel 9591fb6e (Cabinet R-P Avocats,
 * Nantes, 01/10/2026) — premier audit du test avocats.
 *
 * D1  ChatGPT citait 6 avocats (« Maître Brett Le Meur »…) et le rapport
 *     n'en affichait AUCUN : le filtre de noms n'acceptait que l'ASCII,
 *     tout nom accentué était jeté.
 * D2  « Quel est le meilleur avocat à Nantes pour un auteur présumé
 *     d'infraction ? » classée « Professions libérales » : le mot « avocat »
 *     (le prestataire cherché) servait de signal de profil client.
 * D3  « Gemini 0/4 · ChatGPT 0/3 » sans explication : un appel ChatGPT en
 *     échec fournisseur disparaissait du dénominateur en silence.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { filterStructuredCompetitorBrands } from "@/lib/audit-engine";
import { platformCoverage, questionNeed, type BoardRow } from "@/app/audit/[id]/report-insights";

const BRAND = "Cabinet R-P Avocats";
const DOMAIN = "cabinet-r-p-avocats.fr";

test("D1 — les noms accentués et « Maître X » sont gardés", () => {
  for (const name of ["Maître Brett Le Meur", "Maître Kévin Dounon-Bardot", "Clémentine Vendé", "Société Fiduciaire Nantaise", "Cabinet de Maître Dupont", "Cabinet Maître Stéphanie Rodrigues Devesas"]) {
    assert.deepEqual(filterStructuredCompetitorBrands([name], BRAND, DOMAIN), [name], name);
  }
});

test("D1 — les gardes historiques tiennent toujours", () => {
  for (const junk of ["best lawyers", "le meilleur avocat", "Top", "https://www.example.com", "Cabinet R-P Avocats"]) {
    assert.deepEqual(filterStructuredCompetitorBrands([junk], BRAND, DOMAIN), [], junk);
  }
});

test("D2 — une question pénale reste « Pénal », « avocat » seul ne dit pas le profil client", () => {
  assert.equal(questionNeed("Quel est le meilleur avocat à Nantes pour un auteur présumé d'infraction ?"), "Pénal");
  assert.equal(questionNeed("Quel avocat à Nantes contacter après une mise en examen ?"), "Pénal");
  assert.notEqual(questionNeed("Quel avocat à Nantes pour un litige commercial ?"), "Professions libérales");
  assert.equal(questionNeed("Quel expert-comptable pour un médecin libéral à Lyon ?"), "Professions libérales");
});

test("D3 — la couverture expose les questions interrogées, et l'écran les montre", () => {
  const row = (state: BoardRow["state"], cc: BoardRow["state"]): BoardRow => ({
    prompt: "q", state, rivals: [], pages: [], need: "Pénal", position: null,
    crossCheck: { engine: "ChatGPT", state: cc, rivals: [], position: null },
  });
  const coverage = platformCoverage([row("missing", "missing"), row("missing", "missing"), row("missing", "missing"), row("missing", "unchecked")], "Gemini");
  assert.deepEqual(coverage[1], { engine: "ChatGPT", cited: 0, checked: 3, asked: 4 });
  const board = readFileSync(resolve(import.meta.dirname, "../src/app/audit/[id]/QuestionBoard.tsx"), "utf8");
  assert.match(board, /item\.asked > item\.checked/);
  assert.match(board, /cross-check-unchecked/);
});

test("Titre du rapport : propre au cabinet, dans la langue du rapport, noindex", () => {
  const page = readFileSync(resolve(import.meta.dirname, "../src/app/audit/[id]/page.tsx"), "utf8") + readFileSync(resolve(import.meta.dirname, "../src/app/audit/[id]/report-metadata.ts"), "utf8");
  assert.match(page, /export async function generateMetadata/);
  assert.match(page, /ta visibilité dans l'IA · GetPick/);
  assert.match(page, /index: false/);
});

import { aiReadabilityItems, aiReadabilityScore } from "@/app/audit/[id]/ai-readability";
import { jsonLdScript, wpAnswerPage } from "@/lib/wp-connect";
import { aiSiteContent, schemaTypeForTrade } from "@/lib/ai-site";

test("Lisibilité IA — mesuré honnêtement : site injoignable = non mesuré, jamais un faux ✗", () => {
  const down = aiReadabilityItems({ llmsFound: false, structuredDataFound: null, crawlState: "unreachable", blocked: [] }, "fr");
  assert.deepEqual(aiReadabilityScore(down), { ok: 0, measured: 0 });
  const blocked = aiReadabilityItems({ llmsFound: false, structuredDataFound: true, crawlState: "blocked", blocked: ["GPTBot"] }, "fr");
  assert.deepEqual(aiReadabilityScore(blocked), { ok: 1, measured: 3 });
  assert.match(blocked.find((item) => item.key === "ai_crawlers")!.why, /GPTBot/);
  assert.ok(!JSON.stringify(blocked).includes("ai-catalog"), "ai-catalog.json n'est pas promis : sans effet sur une citation");
});

test("WordPress — la page publiée porte le JSON-LD, au bon type de métier, sans fermeture de balise injectable", () => {
  const site = aiSiteContent({ brandName: "Cabinet Test", domain: "test-avocat.fr", tradeLabel: "cabinet d'avocats", city: "Nantes", description: "Droit pénal </script><b>x", questions: ["Quel avocat pénaliste à Nantes ?"] });
  assert.equal(schemaTypeForTrade("cabinet d'avocats"), "LegalService");
  assert.equal(schemaTypeForTrade("cabinet d'expertise comptable"), "AccountingService");
  const page = wpAnswerPage(site, { tradeLabel: "cabinet d'avocats", city: "Nantes" });
  assert.match(page.content, /<script type="application\/ld\+json">/);
  assert.match(page.content, /"LegalService"/);
  assert.match(page.content, /"FAQPage"/);
  assert.equal((page.content.match(/<\/script>/g) ?? []).length, 1, "une seule fermeture : la description ne peut pas casser la balise");
  assert.ok(jsonLdScript({ a: "</script>" }).includes("\\u003c/script>"));
});

import { isRealLlmsTxt } from "@/app/audit/[id]/ai-crawlability";
test("llms.txt — une page HTML servie en 200 (soft 404) n'est pas un llms.txt", () => {
  assert.equal(isRealLlmsTxt("# www.cabinet-r-p-avocats.fr\n\n## Pages\n- [Droit](https://x)"), true);
  assert.equal(isRealLlmsTxt("<!DOCTYPE html><html><body>Page introuvable</body></html>"), false);
  assert.equal(isRealLlmsTxt("   \n"), false);
  assert.equal(isRealLlmsTxt(null), false);
});

test("Migrations : une seule fois par instance, jamais depuis le titre du rapport (500 aléatoires du 01/10)", () => {
  const db = readFileSync(resolve(import.meta.dirname, "../src/lib/db.ts"), "utf8");
  assert.match(db, /let schemaReady: Promise<void> \| null = null;/);
  assert.match(db, /if \(!schemaReady\)/);
  assert.match(db, /schemaReady = null;\s*throw error;/, "un échec doit pouvoir être retenté");
  const meta = readFileSync(resolve(import.meta.dirname, "../src/app/audit/[id]/report-metadata.ts"), "utf8");
  assert.doesNotMatch(meta, /ensureAuditSchema\(/);
});
