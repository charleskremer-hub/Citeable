// Tests de non-régression du correctif catégorie du 23/07/2026.
// Cas réels mesurés sur le run outbound (20 audits) : Dear Muesli (granola) auditée
// en « DTC footwear brand », Les Toiles du Large (sacs en voile recyclée) en
// « food & beverage », Nénés Paris (lingerie) étiquetée « analytics platform ».
// Lancer : npm test  (Node >= 23.6, aucun réseau — tout est déterministe).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  compareCategoryPerception,
  countCategoryDivergentQuestions,
  resolveHomepageCategory,
} from "./audit-engine";

// --- Cas réels du run du 23/07 ------------------------------------------------

test("Les Toiles du Large (sacs en voile de bateau) n'est plus food & beverage", () => {
  const category = resolveHomepageCategory(
    "Les Toiles du Large",
    "lestoilesdularge.fr",
    "Sacs et accessoires fabriqués à la main en voile de bateau recyclée à Saint-Malo. Bagagerie durable, cabas et sacoches."
  );

  assert.equal(category, "bags and accessories brand");
});

test("« bateau » ne déclenche plus la règle food via le substring « tea »", () => {
  const category = resolveHomepageCategory(
    "Atelier du Bateau",
    "atelierdubateau.fr",
    "objets décoratifs en bois de bateau"
  );

  assert.notEqual(category, "food & beverage");
});

test("Dear Muesli (granola, boutique en ligne) n'est plus une marque de chaussures", () => {
  const category = resolveHomepageCategory(
    "Dear Muesli",
    "dearmuesli.com",
    "Granola bio et muesli artisanal pour le petit-déjeuner. Boutique en ligne — online store powered by Shopify."
  );

  assert.equal(category, "food & beverage");
});

test("collision tech-stack sans règle produit : plus jamais « DTC footwear brand » en dur", () => {
  // Signal produit (« food ») + match ecommerce, mais aucune règle produit ne matche :
  // l'ancien code renvoyait « DTC footwear brand » codé en dur.
  const category = resolveHomepageCategory(
    "Marque Test",
    "marquetest.fr",
    "healthy food shop — online store powered by Shopify"
  );

  assert.notEqual(category, "DTC footwear brand");
});

test("Nénés Paris (lingerie + bandeau cookies) n'est plus une analytics platform", () => {
  const category = resolveHomepageCategory(
    "Nénés Paris",
    "nenesparis.fr",
    "Lingerie et maillots de bain fabriqués en France. Nous utilisons des cookies Google Analytics pour mesurer l'audience."
  );

  assert.equal(category, "lingerie and swimwear brand");
});

// --- Garde-fous sur les matcheurs bruités -------------------------------------

test("un bandeau cookies seul ne fait pas une analytics platform", () => {
  const category = resolveHomepageCategory(
    "Marque Test",
    "marquetest.fr",
    "nous utilisons des cookies google analytics pour mesurer l'audience"
  );

  assert.notEqual(category, "analytics platform");
});

test("un vrai SaaS analytics reste détecté", () => {
  const category = resolveHomepageCategory(
    "MetricsCo",
    "metricsco.io",
    "The product analytics platform for SaaS teams"
  );

  assert.equal(category, "analytics platform");
});

test("un formulaire newsletter ne fait ni un email marketing platform ni un creator", () => {
  const category = resolveHomepageCategory(
    "Marque Test",
    "marquetest.fr",
    "inscrivez-vous à la newsletter pour recevoir nos offres"
  );

  assert.notEqual(category, "email marketing platform");
  assert.notEqual(category, "creator");
});

test("un vrai outil d'email marketing reste détecté", () => {
  const category = resolveHomepageCategory(
    "MailCo",
    "mailco.io",
    "email marketing automation for B2B startups"
  );

  assert.equal(category, "email marketing platform");
});

test("des liens sociaux en pied de page ne font pas un creator", () => {
  const category = resolveHomepageCategory(
    "Marque Test",
    "marquetest.fr",
    "suivez-nous sur instagram tiktok et youtube"
  );

  assert.notEqual(category, "creator");
});

test("un vrai créateur de contenu reste détecté", () => {
  const category = resolveHomepageCategory(
    "Jane Doe",
    "janedoe.tv",
    "content creator and youtuber — tech reviews"
  );

  assert.equal(category, "creator");
});

// --- Régressions : les cas qui marchaient doivent continuer de marcher --------

test("marque de sneakers durable sur Shopify : toujours DTC footwear brand", () => {
  const category = resolveHomepageCategory(
    "Allbirds",
    "allbirds.com",
    "sustainable sneakers and wool shoes — online store powered by Shopify"
  );

  assert.equal(category, "DTC footwear brand");
});

test("sac à dos FR : la règle backpack gagne sur la règle bags", () => {
  const category = resolveHomepageCategory(
    "RandoCo",
    "randoco.fr",
    "sacs à dos de randonnée et équipement outdoor"
  );

  assert.equal(category, "backpacks and outdoor gear");
});

// --- Cohérence règle/IA (compareCategoryPerception alimente le cross-check) ---

test("lingerie vs analytics platform : mismatch → le garde-fou préfère l'IA", () => {
  assert.equal(compareCategoryPerception("lingerie", "analytics platform").status, "mismatch");
});

test("lingerie vs lingerie and swimwear brand : match — pas de bascule inutile", () => {
  assert.equal(compareCategoryPerception("lingerie", "lingerie and swimwear brand").status, "match");
});

test("granola vs food & beverage : trop large pour trancher — pas de bascule", () => {
  assert.equal(compareCategoryPerception("granola", "food & beverage").status, "not_enough_signal");
});

test("tote bags vs bags and accessories brand : match via le groupe de synonymes", () => {
  assert.equal(compareCategoryPerception("tote bags", "bags and accessories brand").status, "match");
});

// --- Tripwire divergence label/questions (cas Nénés Paris) --------------------

test("questions lingerie vs label analytics : toutes comptées divergentes", () => {
  const questions = [
    "Quelle est la meilleure marque de lingerie française ?",
    "Quel maillot de bain choisir pour cet été ?",
    "Quelle marque de sous-vêtements est fiable ?",
  ];

  assert.equal(countCategoryDivergentQuestions(questions, "analytics platform"), 3);
});

test("questions chaussures vs label footwear : zéro divergence", () => {
  const questions = [
    "Which sustainable sneaker brands are worth the price?",
    "What is the best walking shoe brand for everyday wear?",
  ];

  assert.equal(countCategoryDivergentQuestions(questions, "DTC footwear brand"), 0);
});

test("catégorie trop large (food & beverage) : le tripwire refuse de juger", () => {
  const questions = ["Quelle est la meilleure marque de granola bio ?"];

  assert.equal(countCategoryDivergentQuestions(questions, "food & beverage"), 0);
});
