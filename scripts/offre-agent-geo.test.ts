/**
 * OFFRE « AGENT GEO » (GO Charles, 30/09/2026) — remplace « Connecte ta fiche
 * Google ». Fondée sur le baromètre #0 : Gemini cite un cabinet quand il a lu
 * SON site (22/24) ; la fiche Google n'apparaît pas dans les pages lues.
 * Le seul geste : transférer un email à son webmaster (une ligne DNS).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SERVICE_OFFER_COPY } from "@/lib/plan-promises";
import { homeCopy } from "@/lib/i18n";
import { serviceValuePlan } from "@/app/audit/[id]/report-insights";
import { aiSiteAnswersPrompt, buildGeoWelcomeEmail, parseAiSiteAnswers } from "@/lib/ai-site";

test("offre — agent GEO, publication sur le domaine du cabinet, geste = transférer un email", () => {
  assert.match(SERVICE_OFFER_COPY.fr.body, /agent GEO/);
  assert.match(SERVICE_OFFER_COPY.fr.body, /ai\.toncabinet\.fr/);
  assert.match(SERVICE_OFFER_COPY.fr.body, /transférer un email à ton webmaster/);
  const surfaces = JSON.stringify([SERVICE_OFFER_COPY, homeCopy]);
  assert.doesNotMatch(surfaces, /administrateur de ta fiche Google|manager of your Google Business Profile/);
});

test("rapport — le calendrier : l'agent écrit, puis publication sur SON domaine", () => {
  const plan = serviceValuePlan({
    brandName: "Cabinet Durand", engineName: "Gemini", lostQuestions: ["q1", "q2"], questionCount: 6,
    rival: null, topRivals: [], monthlyPriceEur: 69, recheckEvery: "tous les mois", locale: "fr", brandDomain: "cabinet-durand.fr",
  });
  assert.match(plan.steps[0].what, /agent GEO écrit/);
  assert.match(plan.steps[1].what, /ai\.cabinet-durand\.fr/);
  assert.match(plan.steps[1].what, /webmaster/);
});

test("agent de contenu — consigne sans invention ni superlatif, réponses filtrées", () => {
  const prompt = aiSiteAnswersPrompt({ brandName: "Cabinet Durand", tradeLabel: "cabinet d'expertise comptable", city: "Troyes", domain: "cabinet-durand.fr", questions: ["q1"], siteText: "Cabinet à Troyes, TPE et artisans." });
  assert.match(prompt, /N'invente aucun chiffre/);
  assert.match(prompt, /Pas de superlatif/);
  const ok = parseAiSiteAnswers('{"summary":"s","services":["Paie"],"answers":[{"question":"q1","answer":"Le Cabinet Durand, à Troyes, accompagne les TPE et les artisans pour leur comptabilité, d\'après son site."},{"question":"q2","answer":"Le Cabinet Durand est le meilleur cabinet de Troyes pour toutes les entreprises de la région, sans exception."}]}');
  assert.ok(ok);
  assert.equal(ok.answers.length, 1, "la réponse avec superlatif est écartée");
  assert.deepEqual(ok.services, ["Paie"]);
  assert.equal(parseAiSiteAnswers("pas du json"), null);
});

test("bienvenue — le mail donne le message webmaster prêt à transférer, ou demande le site", () => {
  const withSite = buildGeoWelcomeEmail({ domain: "cabinet-durand.fr", onboardingUrl: "https://www.getpick.ai/brancher/cabinet-durand.fr?k=x" });
  assert.match(withSite.text, /ai\.cabinet-durand\.fr/);
  assert.match(withSite.text, /CNAME/);
  assert.match(withSite.text, /transférer le message ci-dessous à ton webmaster/);
  const without = buildGeoWelcomeEmail({ domain: null, onboardingUrl: null });
  assert.match(without.text, /adresse de ton site/);
});
