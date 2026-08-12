/**
 * `basedOn` des actions du moteur (lot « les actions 2 et 3 portent leur
 * impact mesuré ») : chaque action de `buildPlainActions` liste les questions
 * d'achat qui la JUSTIFIENT, dérivées des données réelles de l'audit — pour
 * que `actionImpact()` mesure l'impact des 3 fixes affichés, pas seulement du
 * premier. Trois règles, chacune testée ici, dans les trois familles ICP :
 *   - les actions 2 et 3 portent `basedOn` quand la donnée les soutient
 *     (2e action : questions où des concurrents sont cités ; 3e action :
 *     questions perdues où la marque n'est pas citée) ;
 *   - aucune action ne référence une question qui ne la soutient pas
 *     (et jamais une question non vérifiée) ;
 *   - une action sans donnée de soutien reste SANS `basedOn` et son impact
 *     reste « non mesuré » — rien de fabriqué, jamais.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildPlainActions } from "@/lib/audit-engine";
import type { BuyerIntentPromptResult, IcpSegmentMetadata } from "@/lib/audit-engine";
import { actionImpact, rankActionsByImpact } from "@/app/audit/[id]/report-insights";

function question(prompt: string, brandMentioned: boolean, competitors: string[] = [], available = true): BuyerIntentPromptResult {
  return {
    prompt,
    available,
    brandMentioned,
    competitors,
    surfaces: [
      {
        surface: "gemini",
        reachable: available,
        brandMentioned,
        competitors,
        rawAnswerSnippet: "",
        kind: "ai_engine",
        status: available ? "checked" : "failed",
        engine: "Gemini",
      },
    ],
  };
}

// `buildPlainActions` ne lit que `segment.key` : on construit les segments
// inline plutôt que d'exporter ICP_SEGMENTS juste pour un test.
const SEGMENTS: IcpSegmentMetadata[] = [
  { key: "small_brand_ecommerce", label: "Small brand / ecommerce", buyerIntent: "", remediationFocus: [] },
  { key: "local_independent", label: "Local independent", buyerIntent: "", remediationFocus: [] },
  { key: "creator_influencer", label: "Creator / influencer", buyerIntent: "", remediationFocus: [] },
];

// Le jeu de données de référence : deux perdues (une contestée, une sans
// concurrent), deux gagnées (une contestée, une tranquille), une non vérifiée.
function auditQuestions() {
  return [
    question("perdue avec concurrents", false, ["Typology"]),
    question("perdue sans concurrent", false),
    question("gagnée contestée", true, ["Melvita"]),
    question("gagnée tranquille", true),
    question("jamais vérifiée", false, ["Respire"], false),
  ];
}

test("actions 2 et 3 : `basedOn` posé quand la donnée les soutient, dans les trois familles", () => {
  for (const segment of SEGMENTS) {
    const actions = buildPlainActions(auditQuestions(), "savons solides", [], segment);

    assert.equal(actions.length, 3, segment.key);
    // 1re action : les questions testées, texte repris tel quel (comportement conservé).
    assert.deepEqual(actions[0].basedOn, ["perdue avec concurrents", "perdue sans concurrent", "gagnée contestée", "gagnée tranquille"], segment.key);
    // 2e action (mentions tierces) : les questions où l'audit a VU des concurrents cités.
    assert.deepEqual(actions[1].basedOn, ["perdue avec concurrents", "gagnée contestée"], segment.key);
    // 3e action (preuves) : les questions perdues, marque non citée.
    assert.deepEqual(actions[2].basedOn, ["perdue avec concurrents", "perdue sans concurrent"], segment.key);
  }
});

test("les 3 fixes affichés portent un impact MESURÉ, dérivé du recouvrement basedOn × questions perdues", () => {
  for (const segment of SEGMENTS) {
    const questions = auditQuestions();
    const actions = buildPlainActions(questions, "savons solides", [], segment);

    // Impact par action, reproductible depuis les données : 2 questions perdues au total.
    assert.deepEqual(actionImpact(actions[0], questions), { measured: true, addressedLostCount: 2, lostCount: 2 }, segment.key);
    assert.deepEqual(actionImpact(actions[1], questions), { measured: true, addressedLostCount: 1, lostCount: 2 }, segment.key);
    assert.deepEqual(actionImpact(actions[2], questions), { measured: true, addressedLostCount: 2, lostCount: 2 }, segment.key);

    // Et à l'écran : les 3 fixes affichés sont tous mesurés — plus aucun
    // « Impact non mesuré » quand la donnée existe.
    const ranked = rankActionsByImpact(actions, questions);
    assert.equal(ranked.length, 3, segment.key);
    for (const item of ranked) assert.equal(item.impact.measured, true, `${segment.key} : ${item.action.title}`);
  }
});

test("aucune action ne référence une question qui ne la soutient pas (ni une question non vérifiée)", () => {
  for (const segment of SEGMENTS) {
    const questions = auditQuestions();
    const actions = buildPlainActions(questions, "savons solides", [], segment);

    // Les ensembles de soutien, recalculés indépendamment depuis les données.
    const tested = questions.filter((item) => item.available).map((item) => item.prompt);
    const contested = questions.filter((item) => item.available && item.competitors.length > 0).map((item) => item.prompt);
    const lost = questions.filter((item) => item.available && !item.brandMentioned).map((item) => item.prompt);
    const supportSets = [tested, contested, lost];

    actions.forEach((action, index) => {
      for (const prompt of action.basedOn ?? []) {
        assert.ok(supportSets[index].includes(prompt), `${segment.key} : « ${prompt} » ne soutient pas « ${action.title} »`);
        assert.notEqual(prompt, "jamais vérifiée", `${segment.key} : question non vérifiée dans « ${action.title} »`);
      }
    });

    // Contre-exemples explicites : une perdue sans concurrent ne soutient pas
    // l'action « mentions tierces » ; une gagnée ne soutient pas l'action « preuves ».
    assert.ok(!actions[1].basedOn?.includes("perdue sans concurrent"), segment.key);
    assert.ok(!actions[2].basedOn?.includes("gagnée contestée"), segment.key);
    assert.ok(!actions[2].basedOn?.includes("gagnée tranquille"), segment.key);
  }
});

test("sans donnée de soutien : pas de `basedOn`, impact « non mesuré » — rien de fabriqué", () => {
  for (const segment of SEGMENTS) {
    // Audit entièrement gagné, aucun concurrent : rien ne soutient les actions 2 et 3.
    const wonQuestions = [question("gagnée un", true), question("gagnée deux", true)];
    const wonActions = buildPlainActions(wonQuestions, "savons solides", [], segment);

    assert.deepEqual(wonActions[0].basedOn, ["gagnée un", "gagnée deux"], segment.key);
    assert.equal(wonActions[1].basedOn, undefined, segment.key);
    assert.equal(wonActions[2].basedOn, undefined, segment.key);
    assert.deepEqual(actionImpact(wonActions[1], wonQuestions), { measured: false }, segment.key);
    assert.deepEqual(actionImpact(wonActions[2], wonQuestions), { measured: false }, segment.key);

    // Aucune question vérifiée : AUCUNE action ne porte de `basedOn` — jamais
    // un tableau vide, jamais une question non vérifiée repêchée.
    const uncheckedActions = buildPlainActions([question("jamais vérifiée", false, ["Respire"], false)], "savons solides", [], segment);
    for (const action of uncheckedActions) {
      assert.equal(action.basedOn, undefined, `${segment.key} : ${action.title}`);
      assert.deepEqual(actionImpact(action, []), { measured: false }, segment.key);
    }
  }
});

test("le paramètre `competitors` (concurrents globaux de l'audit) ne fabrique pas de soutien par question", () => {
  // Des concurrents trouvés au niveau de l'audit, mais AUCUN cité sur une
  // question : l'action « mentions tierces » reste sans `basedOn` — le soutien
  // vient des questions elles-mêmes, pas d'une liste globale.
  const questions = [question("perdue sans concurrent", false)];
  const actions = buildPlainActions(questions, "savons solides", ["Typology", "Melvita"]);

  assert.equal(actions[1].basedOn, undefined);
  assert.deepEqual(actionImpact(actions[1], questions), { measured: false });
  // La 3e action, elle, est soutenue par la question perdue : impact mesuré.
  assert.deepEqual(actions[2].basedOn, ["perdue sans concurrent"]);
  assert.deepEqual(actionImpact(actions[2], questions), { measured: true, addressedLostCount: 1, lostCount: 1 });
});
