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
  assert.deepEqual(avocatsCopy.pricingTiers, homeCopy.fr.pricingTiers);
  assert.equal(avocatsCopy.pricingGuarantee, homeCopy.fr.pricingGuarantee);
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
