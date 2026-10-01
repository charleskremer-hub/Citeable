import { strict as assert } from "node:assert";
import { test } from "node:test";

import { isAuditedBrandName, mentionsBrandOrDomain, professionalCoreName } from "../src/lib/audit-engine";

// Mesuré en prod le 01/10 (audit 9cb5f131) : saisi « Pierre Lebrun Avocat »,
// Gemini cite « Cabinet Pierre Lebrun » — compté « pas cité ». Faux négatif qui
// ment au prospect sur la seule chose qu'il vient vérifier.

test("le cas mesure : « Cabinet Pierre Lebrun » est bien le cabinet audite", () => {
  assert.ok(isAuditedBrandName("Cabinet Pierre Lebrun", "Pierre Lebrun Avocat", "pierrelebrun-avocat.fr"));
  assert.ok(mentionsBrandOrDomain("recommended_brands: Cabinet Pierre Lebrun, Cabinet Florine Michel", "Pierre Lebrun Avocat", "pierrelebrun-avocat.fr"));
});

test("Maitre, avocate, SELARL, expert-comptable, notaire : retires des deux cotes", () => {
  assert.ok(isAuditedBrandName("Me Virginie Audureau", "Virginie Audureau Avocate", "audureau-virginie-avocat.fr"));
  assert.ok(isAuditedBrandName("SELARL Hayot", "Cabinet Hayot", "hayot.fr"));
  assert.ok(isAuditedBrandName("Merisier Expert-Comptable", "Cabinet Merisier", "merisier.fr"));
  assert.ok(isAuditedBrandName("Office notarial Dupuy", "Dupuy Notaires", "dupuy.notaires.fr"));
});

test("un confrere reste un confrere", () => {
  assert.equal(isAuditedBrandName("Cabinet Florine Michel", "Pierre Lebrun Avocat", "pierrelebrun-avocat.fr"), false);
  assert.equal(isAuditedBrandName("Cabinet Duriez Avocats", "Pierre Lebrun Avocat", "pierrelebrun-avocat.fr"), false);
  assert.equal(mentionsBrandOrDomain("recommended_brands: Cabinet Florine Michel", "Pierre Lebrun Avocat", "pierrelebrun-avocat.fr"), false);
});

test("un nom reduit a des mots de metier ne matche rien", () => {
  assert.equal(professionalCoreName("Avocats Associés"), "");
  assert.equal(professionalCoreName("Cabinet"), "");
  assert.equal(isAuditedBrandName("Cabinet d'avocats", "Avocats Associés", "x-avocats.fr"), false);
});

import { categoryFromHomepageText } from "../src/lib/audit-engine";

test("categorie : un site d'avocats qui cite un expert-comptable reste un cabinet d'avocats", () => {
  const jm = "Cabinet d'avocats droit du travail Bordeaux. Nos avocats vous accompagnent. Avocat en droit social, avocats associés. En lien avec votre expert-comptable.";
  assert.equal(categoryFromHomepageText(jm, "jm-avocats.com"), "law firm");
});

test("categorie : un expert-comptable qui cite un avocat partenaire reste comptable", () => {
  const ec = "Cabinet d'expertise comptable à Lyon. Votre expert-comptable pour TPE. Experts-comptables associés, en lien avec votre avocat.";
  assert.equal(categoryFromHomepageText(ec, "cabinet-ec.fr"), "accounting firm");
});
