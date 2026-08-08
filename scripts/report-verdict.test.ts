/**
 * Le verdict du rapport VERROUILLÉ (lot P1 « verdict en trois blocs ») :
 * la phrase est construite depuis les données réelles de l'audit, et RIEN
 * d'autre. Deux interdits absolus, chacun testé ici :
 *   - jamais un nom de concurrent inventé (repli sans nom si les données ne
 *     nomment personne) ;
 *   - jamais un concurrent qui ne vient pas des questions PERDUES — un
 *     concurrent cité sur une question gagnée est du détail, il reste sous la
 *     porte.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { BuyerIntentPromptResult } from "@/lib/audit-engine";
import { lockedVerdictHeadline, lostBuyerQuestions, verdictCompetitors } from "@/app/audit/[id]/report-insights";

function question(prompt: string, brandMentioned: boolean, competitors: string[]): BuyerIntentPromptResult {
  return {
    prompt,
    available: true,
    brandMentioned,
    competitors,
    surfaces: [
      {
        surface: "gemini",
        reachable: true,
        brandMentioned,
        competitors,
        rawAnswerSnippet: "",
        kind: "ai_engine",
        status: "checked",
        engine: "Gemini",
      },
    ],
  };
}

test("lostBuyerQuestions ne retient que les questions vérifiées où la marque manque", () => {
  const questions = [
    question("perdue-1", false, ["Typology"]),
    question("gagnée", true, ["Melvita"]),
    { ...question("indisponible", false, []), available: false },
  ];

  assert.deepEqual(
    lostBuyerQuestions(questions).map((item) => item.prompt),
    ["perdue-1"]
  );
});

test("verdictCompetitors : uniquement les concurrents des questions perdues, les plus cités d'abord, 3 max", () => {
  const questions = [
    question("perdue-1", false, ["Typology", "Melvita"]),
    question("perdue-2", false, ["Typology", "Aroma-Zone"]),
    question("perdue-3", false, ["Typology", "Melvita", "Quatrième"]),
    // Concurrent d'une question GAGNÉE : c'est du détail, il ne sort pas dans le verdict.
    question("gagnée", true, ["SousLaPorte"]),
  ];

  assert.deepEqual(verdictCompetitors(questions), ["Typology", "Melvita", "Aroma-Zone"]);
  assert.ok(!verdictCompetitors(questions).includes("SousLaPorte"));
});

test("marque jamais citée + concurrents nommés : « recommande X, Y et Z. Pas {marque}. »", () => {
  const headline = lockedVerdictHeadline({
    brandName: "Pure & Wild",
    engineName: "ChatGPT",
    questionCount: 12,
    brandMentionCount: 0,
    lostCount: 12,
    competitors: ["Typology", "Melvita", "Aroma-Zone"],
    locale: "fr",
  });

  assert.equal(headline, "Sur 12 questions d'achat, ChatGPT recommande Typology, Melvita et Aroma-Zone. Pas Pure & Wild.");
});

test("repli sans concurrent identifiable : aucun nom inventé", () => {
  const headline = lockedVerdictHeadline({
    brandName: "Pure & Wild",
    engineName: "Gemini",
    questionCount: 12,
    brandMentionCount: 0,
    lostCount: 12,
    competitors: [],
    locale: "fr",
  });

  assert.equal(headline, "Sur 12 questions d'achat, Gemini ne recommande jamais Pure & Wild.");
});

test("marque citée sur une partie des questions : le verdict le dit, sans exagérer", () => {
  const headline = lockedVerdictHeadline({
    brandName: "Oliveto",
    engineName: "Gemini",
    questionCount: 12,
    brandMentionCount: 4,
    lostCount: 8,
    competitors: ["Typology"],
    locale: "fr",
  });

  assert.equal(
    headline,
    "Sur 12 questions d'achat, Gemini ne cite Oliveto que sur 4. Sur les questions perdues, il recommande Typology."
  );
});

test("aucune question perdue : verdict positif, le détail reste l'argument", () => {
  const headline = lockedVerdictHeadline({
    brandName: "Oliveto",
    engineName: "Gemini",
    questionCount: 12,
    brandMentionCount: 12,
    lostCount: 0,
    competitors: [],
    locale: "fr",
  });

  assert.equal(
    headline,
    "Sur 12 questions d'achat, Gemini cite Oliveto sur 12. Le rapport complet montre lesquelles, et qui d'autre est cité."
  );
});

test("aucune question vérifiable : phrase neutre, aucun chiffre inventé", () => {
  const headline = lockedVerdictHeadline({
    brandName: "Oliveto",
    engineName: "Gemini",
    questionCount: 0,
    brandMentionCount: 0,
    lostCount: 0,
    competitors: [],
    locale: "fr",
  });

  assert.equal(headline, "L'audit de Oliveto est terminé, mais aucune question d'achat n'a pu être vérifiée.");
});

test("variante anglaise : même structure, même honnêteté", () => {
  const headline = lockedVerdictHeadline({
    brandName: "Pure & Wild",
    engineName: "ChatGPT",
    questionCount: 12,
    brandMentionCount: 0,
    lostCount: 12,
    competitors: ["Typology", "Melvita"],
    locale: "en",
  });

  assert.equal(headline, "Across 12 buyer questions, ChatGPT recommends Typology and Melvita. Not Pure & Wild.");
});
