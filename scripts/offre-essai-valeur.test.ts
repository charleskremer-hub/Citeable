/**
 * ESSAI GRATUIT + VALEUR DANS LE RAPPORT + DROIT OUVERT AU PAIEMENT — 28/09/2026.
 *
 * Demandes de Charles : « un essai gratuit puis 69 euros » ; « valoriser mieux
 * ce que le client obtiendrait comme résultat » ; « sois plus exigeant sur le
 * produit qui répond bien à l'ICP ».
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SERVICE_OFFER_COPY, SERVICE_TRIAL_DAYS, SERVICE_TRIAL_LABEL, SERVICE_PLAN_PRICE_EUR } from "@/lib/plan-promises";
import { serviceValuePlan, ACCOUNTING_CLIENT_ANNUAL_FEES_EUR } from "@/app/audit/[id]/report-insights";
import { webhookWriteFor, planFromStripeObject } from "@/lib/stripe-webhook";
import { buildCheckoutAlert } from "@/lib/lead-alert";
import { homeCopy } from "@/lib/i18n";

test("offre — l'essai est dans le badge, le bouton et la ligne de réassurance, FR et EN", () => {
  assert.equal(SERVICE_TRIAL_DAYS, 14);
  assert.equal(SERVICE_TRIAL_LABEL.fr, `14 jours gratuits, puis ${SERVICE_PLAN_PRICE_EUR} € HT/mois`);
  for (const locale of ["fr", "en"] as const) {
    const copy = SERVICE_OFFER_COPY[locale];
    assert.match(copy.badge, /14/);
    assert.match(copy.cta, /14/);
    assert.match(copy.emailCta, /14/);
    assert.match(copy.trialLine, new RegExp(String(SERVICE_PLAN_PRICE_EUR)));
  }
});

test("ICP — plus aucune promesse d'annuaires/avis (l'off-site est désactivé) sur les surfaces publiques", () => {
  const surfaces = [
    JSON.stringify(homeCopy),
    JSON.stringify(SERVICE_OFFER_COPY),
    readFileSync("public/llms.txt", "utf8"),
  ].join("\n");
  for (const banned of [/sources que l'IA croit/i, /sources AI trusts/i, /te place sur les/i, /places you on the/i]) {
    assert.doesNotMatch(surfaces, banned, `promesse non tenue encore publiée : ${banned}`);
  }
});

test("ICP — les exemples d'adresse parlent à un cabinet, pas à une marque", () => {
  assert.doesNotMatch(JSON.stringify(homeCopy.fr), /marque\.com/);
});

const base = {
  brandName: "Gendrot",
  engineName: "Gemini",
  lostQuestions: ["quel expert-comptable choisir à Palaiseau pour la création d'une SCI familiale ?", "q2", "q3"],
  questionCount: 6,
  rival: { name: "Fiducial", prompt: "quel expert-comptable choisir à Palaiseau pour la création d'une SCI familiale ?", replacement: true },
  topRivals: ["Fiducial", "In Extenso", "Dougs", "KPMG"],
  category: "accounting firm",
  monthlyPriceEur: SERVICE_PLAN_PRICE_EUR,
  recheckEvery: "tous les mois",
  locale: "fr" as const,
};

test("rapport — l'objectif est écrit sur SA question et SON confrère", () => {
  const plan = serviceValuePlan(base);
  assert.match(plan.objective, /Palaiseau/);
  assert.match(plan.objective, /Fiducial/);
  assert.match(plan.objective, /que ce soit Gendrot/);
});

test("rapport — la valeur en euros est sourcée, calculée, et réservée aux cabinets comptables", () => {
  const plan = serviceValuePlan(base);
  assert.ok(plan.value);
  assert.match(plan.value.text, /2\s000 à 5\s000 €/);
  const years = Math.floor(ACCOUNTING_CLIENT_ANNUAL_FEES_EUR.low / (SERVICE_PLAN_PRICE_EUR * 12));
  assert.match(plan.value.text, new RegExp(`plus de ${years} ans`));
  assert.match(plan.value.source, /l-expert-comptable\.com/);
  assert.equal(serviceValuePlan({ ...base, category: "law firm" }).value, undefined);
});

test("rapport — le calendrier ne promet que ce qui est livré, sans geste client", () => {
  const plan = serviceValuePlan(base);
  const all = plan.steps.map((step) => `${step.when} ${step.what}`).join(" | ");
  assert.match(all, /Sous 48 h/);
  assert.match(all, /ces 3 questions/);
  assert.match(all, /Fiducial, In Extenso, Dougs/);
  assert.doesNotMatch(all, /KPMG/, "trois confrères maximum");
  // Annuaires : livrés par GetPick depuis le 29/09 (accès fiche Google) — plus bannis.
  assert.doesNotMatch(all, /colle|JSON-LD|llms\.txt|robots|DNS/i);
});

test("rapport — sans rival nommable, pas de nom inventé", () => {
  const plan = serviceValuePlan({ ...base, rival: null, topRivals: [] });
  assert.doesNotMatch(plan.objective, /Fiducial/);
  assert.match(plan.objective, /ne te cite pas sur 3 des 6 questions/);
  // 29/09 : « ne te cite sur aucune de ces 1 question » vu en prod (Gendrot, 5/6) — jamais plus.
  const one = serviceValuePlan({ ...base, rival: null, topRivals: [], lostQuestions: ["q"] });
  assert.match(one.objective, /ne te cite pas sur 1 des 6 questions/);
  assert.doesNotMatch(one.objective, /aucune de ces 1/);
  const all = serviceValuePlan({ ...base, rival: null, topRivals: [], lostQuestions: ["a", "b", "c", "d", "e", "f"] });
  assert.match(all.objective, /aucune des 6 questions/);
});

// --- Le paiement ouvre VRAIMENT le droit ------------------------------------

test("webhook — la session de paiement écrit la ligne complète, droit OUVERT (plus de statut « complete »)", () => {
  const write = webhookWriteFor(
    "checkout.session.completed",
    { mode: "subscription", subscription: "sub_1", status: "complete", customer: "cus_1" },
    "cabinet@exemple.fr",
  );
  assert.deepEqual(write, { kind: "full", email: "cabinet@exemple.fr", subscriptionId: "sub_1", plan: "service", status: "active" });
});

test("webhook — l'événement d'abonnement met à jour sans email, avec le vrai statut d'essai", () => {
  const write = webhookWriteFor(
    "customer.subscription.created",
    { id: "sub_1", status: "trialing", items: { data: [{ price: { id: "price_x", unit_amount: SERVICE_PLAN_PRICE_EUR * 100, currency: "eur", recurring: { interval: "month" } } }] } },
    null,
  );
  assert.deepEqual(write, { kind: "partial", subscriptionId: "sub_1", plan: "service", status: "trialing" });
});

test("webhook — le prix 69 € sans métadonnée est reconnu ; un autre montant ne l'est pas", () => {
  const item = (unit_amount: number) => ({ items: { data: [{ price: { id: "price_x", unit_amount, currency: "eur", recurring: {} } }] } });
  assert.equal(planFromStripeObject(item(SERVICE_PLAN_PRICE_EUR * 100)), "service");
  assert.equal(planFromStripeObject(item(4900)), null);
});

test("webhook — résiliation et paiement non rattachable", () => {
  assert.equal((webhookWriteFor("customer.subscription.deleted", { id: "sub_1", status: "active" }, null) as { status: string }).status, "canceled");
  assert.equal(webhookWriteFor("checkout.session.completed", { mode: "subscription", subscription: "sub_1" }, null).kind, "skip");
  assert.equal(webhookWriteFor("checkout.session.completed", { mode: "payment", subscription: null }, "a@b.fr").kind, "skip");
});

test("alerte — un paiement sans droit ouvert est signalé comme tel", () => {
  assert.match(buildCheckoutAlert({ email: null, plan: null, status: "complete", subscriptionId: null, skipped: true }).subject, /SANS droit/);
  const ok = buildCheckoutAlert({ email: "c@x.fr", plan: "service", status: "x", subscriptionId: "sub_1", skipped: false });
  assert.match(ok.subject, /Nouvelle souscription : c@x\.fr/);
  assert.match(ok.text, /48 h/);
});

test("paiement — le lien Stripe porte le diagnostic et l'email (le paiement retrouve toujours le cabinet)", async () => {
  const { checkoutHrefWithContext } = await import("@/lib/checkout-links");
  const url = new URL(checkoutHrefWithContext("https://buy.stripe.com/abc123", "dcb7e940-4de9-4746-b7ae-30b266b1e771", "contact@cabinet.fr"));
  assert.equal(url.searchParams.get("client_reference_id"), "dcb7e940-4de9-4746-b7ae-30b266b1e771");
  assert.equal(url.searchParams.get("prefilled_email"), "contact@cabinet.fr");
  assert.equal(checkoutHrefWithContext("/fr#pricing", "dcb7e940-4de9-4746-b7ae-30b266b1e771", "a@b.fr"), "/fr#pricing");
  assert.equal(new URL(checkoutHrefWithContext("https://buy.stripe.com/abc123", "pas-un-id", null)).search, "");
});
