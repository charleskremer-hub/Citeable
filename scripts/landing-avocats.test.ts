import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { homeCopy } from "../src/lib/i18n";
import { avocatsCopy } from "../src/lib/landing-avocats";

// Test avocats (01/10) : la page parle le métier, garde l'offre de la home, et
// ne promet rien que la déontologie des avocats interdit.

const strings = (value: unknown): string[] =>
  typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

test("la page avocats ne parle jamais d'expert-comptable", () => {
  const offender = strings(avocatsCopy).find((text) => /expert[-\s]?comptable/i.test(text));
  assert.equal(offender, undefined, `texte expert-comptable sur la page avocats : ${offender}`);
});

test("même offre, même caisse que la home", () => {
  const [, home] = homeCopy.fr.pricingTiers;
  const [, page] = avocatsCopy.pricingTiers;
  assert.equal(page.price, home.price);
  assert.equal(page.href, home.href);
  assert.equal(page.plan, home.plan);
  assert.equal(page.cta, home.cta);
});

// Revue du 08/10 (GO Charles) : vouvoiement, aucune affirmation non mesurée,
// pas de comparaison agence, validation avant publication annoncée.
test("vouvoiement : aucun tutoiement sur la page avocats", () => {
  // Bornes Unicode : « prête » ne doit pas matcher « te ».
  const tu = /(?<!\p{L})(tu|ton|ta|tes|toi|te|t'|fais|donne-nous|connecte-toi|réessaie|vérifie|indique|reviens|écris)(?!\p{L})/iu;
  const offender = strings(avocatsCopy).find((text) => tu.test(text.replace(/« [^»]* »/g, "")));
  assert.equal(offender, undefined, `tutoiement : ${offender}`);
});

test("ni « client perdu » ni comparaison avec une agence", () => {
  const offender = strings(avocatsCopy).find((text) => /perdu|agence|2 000|20 000|chaque jour, l'IA/i.test(text));
  assert.equal(offender, undefined, `affirmation retirée le 08/10 : ${offender}`);
});

test("la page annonce que rien n'est publié sans validation", () => {
  const all = strings(avocatsCopy).join(" ");
  assert.match(all, /brouillon/);
  assert.match(all, /sans votre validation/);
});

test("la FAQ répond à la déontologie et aux questions testées", () => {
  const questions = avocatsCopy.faqItems.map((item) => item.question);
  assert.ok(questions.includes("Et la déontologie ?"));
  assert.equal(questions.filter((q) => q === "Quelles questions testez-vous ?").length, 1);
  assert.match(avocatsCopy.heroTitle, /avocat/);
});

test("la promesse déontologique est tenue par l'agent de contenu", () => {
  const aiSite = readFileSync("src/lib/ai-site.ts", "utf8");
  assert.match(aiSite, /Aucune promesse de résultat/);
  assert.match(aiSite, /succès garanti\|résultat garanti/);
});

test("la page est déclarée au sitemap", () => {
  assert.match(readFileSync("src/app/sitemap.ts", "utf8"), /\/avocats`/);
});
