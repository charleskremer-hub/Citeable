/**
 * Tests de la garde anti-écho de l'exemple de format du prompt moteur.
 *
 * Contexte : lors du re-run du 23/07/2026, gpt-4o-mini a recopié mot pour mot
 * l'exemple JSON du prompt ("On","Hoka","Veja" + sa justification) dans 29
 * réponses sur 252, comptées à tort « marque non citée ». L'exemple utilise
 * désormais des placeholders détectables et cette garde invalide toute
 * réponse qui les recopie.
 *
 * Exécution : npm test (node --test, type stripping natif de Node >= 22.6).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PROMPT_EXAMPLE_BRAND_PLACEHOLDERS,
  PROMPT_EXAMPLE_CATEGORY,
  PROMPT_EXAMPLE_SENTIMENT_REASON,
  answerEchoesPromptExample,
  matchesLegacyPromptExample,
} from "../src/lib/prompt-example-echo.ts";

test("une réponse qui recopie les marques placeholder est un écho", () => {
  assert.equal(answerEchoesPromptExample([...PROMPT_EXAMPLE_BRAND_PLACEHOLDERS], "great value", "sneakers"), true);
  // Même un seul placeholder mélangé à de vraies marques invalide la réponse.
  assert.equal(answerEchoesPromptExample(["CeraVe", PROMPT_EXAMPLE_BRAND_PLACEHOLDERS[0]], "great value", "skincare"), true);
  // Variantes de casse et d'espaces produites par un modèle.
  assert.equal(answerEchoesPromptExample(["example brand one"], "great value", "skincare"), true);
  assert.equal(answerEchoesPromptExample(["EXAMPLEBRANDTWO"], "great value", "skincare"), true);
});

test("une réponse qui recopie la justification ou la catégorie de l'exemple est un écho", () => {
  assert.equal(answerEchoesPromptExample(["CeraVe"], PROMPT_EXAMPLE_SENTIMENT_REASON, "skincare"), true);
  assert.equal(answerEchoesPromptExample(["CeraVe"], "  Example Reason Phrase  ", "skincare"), true);
  assert.equal(answerEchoesPromptExample(["CeraVe"], "well reviewed", PROMPT_EXAMPLE_CATEGORY), true);
});

test("une vraie recommandation n'est jamais flaguée", () => {
  assert.equal(answerEchoesPromptExample(["CeraVe", "Neutrogena"], "widely recommended by dermatologists", "skincare"), false);
  // L'ancien trio de l'exemple ("On","Hoka","Veja") est une réponse légitime
  // pour une marque de chaussures : la garde ne cible que les placeholders,
  // qui eux ne peuvent pas être une vraie recommandation.
  assert.equal(answerEchoesPromptExample(["On", "Hoka", "Veja"], "popular for comfort", "running shoes"), false);
  assert.equal(answerEchoesPromptExample([], undefined, undefined), false);
});

test("la signature legacy exige le trio exact ET la justification recopiée", () => {
  // L'artefact des données collectées avant le correctif : trio dans le même
  // ordre + justification de l'ancien exemple, mot pour mot.
  assert.equal(matchesLegacyPromptExample(["On", "Hoka", "Veja"], "described as a trusted premium option"), true);
  assert.equal(matchesLegacyPromptExample(["On", "Hoka", "Veja"], "Described as a trusted premium option "), true);
  // Trio seul avec une justification différente : réponse légitime possible
  // pour une marque de chaussures — pas un écho.
  assert.equal(matchesLegacyPromptExample(["On", "Hoka", "Veja"], "popular for comfort"), false);
  // Justification recopiée mais marques différentes : pas la signature.
  assert.equal(matchesLegacyPromptExample(["CeraVe"], "described as a trusted premium option"), false);
  // Ordre différent : pas la signature (l'écho est une recopie byte à byte).
  assert.equal(matchesLegacyPromptExample(["Veja", "Hoka", "On"], "described as a trusted premium option"), false);
});
