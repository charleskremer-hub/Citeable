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
import {
  lockedVerdictHeadline,
  lostBuyerQuestions,
  verdictCompetitors,
  verdictCompetitorThreshold,
} from "@/app/audit/[id]/report-insights";

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

// MODIFIÉ le 14/08/2026, et le motif compte plus que l'assertion.
// Ce test verrouillait `["Typology", "Melvita", "Aroma-Zone"]`, donc il
// verrouillait Aroma-Zone : cité sur UNE seule question perdue sur 4 vérifiées.
// C'est précisément le « rival d'une question perdue » que la règle du 30/07
// interdit de nommer, et il partait dans le H1 du verdict. L'ancienne assertion
// gravait le défaut dans la suite de tests — la corriger était le seul moyen de
// corriger le produit. Le reste du contrat est inchangé et toujours vérifié ici :
// questions perdues uniquement, les plus cités d'abord, 3 max.
test("verdictCompetitors : concurrents des questions perdues, plancher de stabilité franchi, les plus cités d'abord, 3 max", () => {
  const questions = [
    question("perdue-1", false, ["Typology", "Melvita"]),
    question("perdue-2", false, ["Typology", "Aroma-Zone"]),
    question("perdue-3", false, ["Typology", "Melvita", "Quatrième"]),
    // Concurrent d'une question GAGNÉE : c'est du détail, il ne sort pas dans le verdict.
    question("gagnée", true, ["SousLaPorte"]),
  ];

  // 4 questions vérifiées -> plancher = max(2, ceil(4/3)) = 2 questions distinctes.
  assert.equal(verdictCompetitorThreshold(4), 2);
  // Typology 3/4, Melvita 2/4 -> nommés. Aroma-Zone 1/4 et Quatrième 1/4 -> écartés.
  assert.deepEqual(verdictCompetitors(questions), ["Typology", "Melvita"]);
  assert.ok(!verdictCompetitors(questions).includes("Aroma-Zone"));
  assert.ok(!verdictCompetitors(questions).includes("SousLaPorte"));
});

test("verdictCompetitors : aucun rival ne franchit le plancher -> on ne nomme personne", () => {
  // Le cas qui produisait un nom fabriqué : 12 questions perdues, 12 rivaux
  // distincts cités une fois chacun. Rien n'est structurel, donc rien n'est nommé.
  const questions = Array.from({ length: 12 }, (_, index) => question(`perdue-${index}`, false, [`Rival${index}`]));

  assert.equal(verdictCompetitorThreshold(12), 4);
  assert.deepEqual(verdictCompetitors(questions), []);
});

test("verdictCompetitors : un rival cité deux fois dans la MÊME question ne compte qu'une fois", () => {
  const questions = [
    question("perdue-1", false, ["Typology", "Typology"]),
    question("perdue-2", false, ["Melvita"]),
  ];

  // Typology n'occupe qu'1 question sur 2 -> plancher 2 non franchi, malgré 2 occurrences.
  assert.deepEqual(verdictCompetitors(questions), []);
});

test("verdictCompetitorThreshold : un tiers des questions vérifiées, jamais moins de 2", () => {
  assert.equal(verdictCompetitorThreshold(0), 2);
  assert.equal(verdictCompetitorThreshold(3), 2);
  assert.equal(verdictCompetitorThreshold(6), 2);
  assert.equal(verdictCompetitorThreshold(12), 4);
  assert.equal(verdictCompetitorThreshold(21), 7);
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
