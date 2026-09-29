/**
 * OFFRE « CONNECTE TA FICHE GOOGLE » (GO Charles, 29/09/2026).
 * Le seul geste du cabinet : nous ajouter comme administrateur de sa fiche
 * Google. Plus de DNS, plus de « page hébergée » vendue comme cœur de l'offre.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildWelcomeEmail, gbpManagerEmail, gbpManagerSteps } from "@/lib/gbp-onboarding";
import { SERVICE_OFFER_COPY } from "@/lib/plan-promises";
import { homeCopy } from "@/lib/i18n";
import { serviceValuePlan } from "@/app/audit/[id]/report-insights";

test("onboarding — adresse d'invitation configurable, jamais vide", () => {
  assert.equal(gbpManagerEmail({}), "hello@getpick.ai");
  assert.equal(gbpManagerEmail({ GBP_MANAGER_EMAIL: " agent@getpick.ai " }), "agent@getpick.ai");
  assert.equal(gbpManagerEmail({ GBP_MANAGER_EMAIL: "oops" }), "hello@getpick.ai");
});

test("onboarding — les étapes suivent les libellés Google et donnent le rôle Administrateur", () => {
  const steps = gbpManagerSteps("agent@getpick.ai").join(" | ");
  assert.match(steps, /Utilisateurs et accès/);
  assert.match(steps, /Administrateur/);
  assert.match(steps, /agent@getpick\.ai/);
});

test("bienvenue — le mail de paiement donne le geste, le lien, et rien de technique", () => {
  const mail = buildWelcomeEmail({ customerEmail: "c@x.fr", managerEmail: "agent@getpick.ai" });
  assert.match(mail.subject, /une seule étape/);
  assert.match(mail.text, /administrateur de ta fiche Google/);
  assert.match(mail.text, /\/connecter/);
  assert.doesNotMatch(mail.text, /DNS|CNAME|code|coller/i);
});

test("offre — le geste unique est écrit partout, et plus aucun réglage DNS n'est vendu", () => {
  const surfaces = JSON.stringify([SERVICE_OFFER_COPY, homeCopy]);
  assert.match(SERVICE_OFFER_COPY.fr.body, /administrateur de ta fiche Google/);
  assert.doesNotMatch(surfaces, /réglage DNS|DNS setting|ai\.toncabinet\.fr|ai\.yourfirm\.com/);
});

test("rapport — le calendrier commence par le geste Google, sans DNS", () => {
  const plan = serviceValuePlan({
    brandName: "Cabinet Durand",
    engineName: "Gemini",
    lostQuestions: ["q1", "q2"],
    questionCount: 6,
    rival: null,
    topRivals: [],
    monthlyPriceEur: 69,
    recheckEvery: "tous les mois",
    locale: "fr",
  });
  assert.equal(plan.steps[0].when, "Jour 1");
  assert.match(plan.steps[0].what, /fiche Google/);
  assert.doesNotMatch(JSON.stringify(plan.steps), /DNS/);
});
