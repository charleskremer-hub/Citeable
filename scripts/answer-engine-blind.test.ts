import { strict as assert } from "node:assert";
import { test } from "node:test";

import { answerEnginePrompt } from "../src/lib/audit-engine";

const QUESTION = "Quels sont les meilleurs condiments artisanaux a offrir a un passionne de gastronomie ?";

test("LE BUG DU 30/07 : le nom de la marque auditee ne part JAMAIS avec la question", () => {
  const prompt = answerEnginePrompt(QUESTION);
  // Un vrai acheteur ne dit pas au moteur quelle marque il espere voir.
  for (const leak of ["Audited brand", "Audited domain", "audited_brand", "ABIES LAGRIMUS", "abieslagrimus.com"]) {
    assert.ok(!prompt.includes(leak), `fuite dans le prompt : "${leak}"`);
  }
});

test("la question de l'acheteur, elle, est bien transmise", () => {
  assert.ok(answerEnginePrompt(QUESTION).includes(QUESTION));
});

test("le prompt ne demande plus au modele de s'auto-evaluer", () => {
  const prompt = answerEnginePrompt(QUESTION).toLowerCase();
  // « Include X only if you would genuinely recommend it » et
  // « audited_brand_sentiment » etaient les deux formes de l'auto-evaluation.
  assert.ok(!prompt.includes("only if you would"), "l'instruction d'auto-inclusion subsiste");
  assert.ok(!prompt.includes("sentiment"), "le sentiment auto-declare subsiste");
});

test("le contrat de sortie reste recommended_brands, classe du meilleur au moins bon", () => {
  const prompt = answerEnginePrompt(QUESTION);
  assert.ok(prompt.includes("recommended_brands"));
  assert.ok(/best first/i.test(prompt), "l'ordre de presentation doit etre demande");
});

test("une question vide ne fabrique pas un prompt invalide", () => {
  const prompt = answerEnginePrompt("");
  assert.ok(prompt.includes("recommended_brands"));
  assert.ok(!prompt.includes("undefined"));
});
