/**
 * Contrat de la brique 1 du moteur off-site : la page-réponse hébergée.
 *
 * Fonctions PURES (slug, ville, copy) prouvées par exécution ; page serveur et
 * sitemap prouvés par CONTRAT DE SOURCE (le runner `node --test` ne transforme
 * pas le JSX — même technique que report-page-contract.test.ts).
 *
 * Invariants gardés :
 *   - slug lisible ET réversible sans migration ;
 *   - la page émet du JSON-LD, un canonical /reponses/, et reste `noindex` tant
 *     qu'elle n'est pas publiée (answer_page_published_at) ;
 *   - la page ne porte AUCUN paiement/gating (c'est un actif public citable,
 *     pas le rapport payant) ;
 *   - le sitemap ne liste QUE les pages publiées.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cityFromPrompts, hostedAnswerCopy, hostedAnswerPageSlug, kebab, shortIdFromSlug } from "@/lib/hosted-answer-page";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function stripped(relPath: string) {
  return readFileSync(resolve(repoRoot, relPath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

test("slug — lisible et réversible sans migration", () => {
  const slug = hostedAnswerPageSlug("Cabinet Durand & Fils", UUID);
  assert.ok(slug.startsWith("cabinet-durand-fils-"), `slug lisible attendu, lu: ${slug}`);
  assert.equal(shortIdFromSlug(slug), "a1b2c3d4", "on doit retrouver le préfixe d'UUID depuis le slug");
});

test("slug — kebab robuste aux accents et à la ponctuation", () => {
  assert.equal(kebab("Éxpert Comptable Nantes !!"), "expert-comptable-nantes");
  assert.equal(kebab(""), "cabinet");
});

test("shortIdFromSlug — rejette un suffixe non hexadécimal", () => {
  assert.equal(shortIdFromSlug("cabinet-durand"), null);
  assert.equal(shortIdFromSlug("cabinet-zzzzzzzz"), null, "8 lettres non-hex ne sont pas un id");
  assert.equal(shortIdFromSlug("cabinet-a1b2c3d4"), "a1b2c3d4");
});

test("cityFromPrompts — extrait la ville nommée, ignore « près de chez moi »", () => {
  assert.equal(
    cityFromPrompts([
      "meilleur expert-comptable à Nantes",
      "expert-comptable pour freelance à Nantes",
      "comptable près de chez moi",
    ]),
    "Nantes",
  );
  assert.equal(cityFromPrompts(["comptable près de chez moi", "meilleur comptable local"]), null);
});

test("hostedAnswerCopy (fr) — copy française, dérivée des faits réels", () => {
  const prompts = [
    "meilleur expert-comptable à Nantes",
    "expert-comptable pour SAS à Nantes",
    "comptable pour freelance à Nantes",
  ];
  const copy = hostedAnswerCopy("fr", {
    brandName: "Cabinet Durand",
    category: "accounting firm",
    city: "Nantes",
    description: "cabinet d'expertise comptable pour indépendants et TPE",
    competitors: ["Dougs", "Numbr"],
    prompts,
  });

  assert.equal(copy.faq.length, prompts.length, "une réponse par question d'achat");
  assert.ok(copy.title.includes("Cabinet Durand"), "le titre nomme le client");
  assert.ok(copy.title.includes("Nantes"), "le titre porte l'ancrage local");
  assert.ok(/Quand un client demande/.test(copy.directAnswer), "réponse directe en français");
  for (const item of copy.faq) {
    assert.ok(item.answer.includes("Cabinet Durand"), "chaque réponse nomme le client");
  }
  assert.ok(copy.faq[0].answer.includes("Dougs"), "les confrères réellement cités sont nommés");
  // Garde-fou zéro chiffre inventé : la copy ne doit pas introduire de nombre
  // qui n'était pas dans les entrées (description/questions sans chiffre ici).
  const allText = [copy.title, copy.directAnswer, copy.competitorsIntro, ...copy.faq.map((f) => f.answer)].join(" ");
  assert.equal(/\d/.test(allText), false, "aucun chiffre ne doit apparaître s'il n'était pas dans les faits");
});

test("hostedAnswerCopy (en) — bascule anglaise", () => {
  const copy = hostedAnswerCopy("en", {
    brandName: "Durand & Co",
    category: "accounting firm",
    city: "Nantes",
    description: "",
    competitors: [],
    prompts: ["best accountant in Nantes"],
  });
  assert.ok(/When a client asks/.test(copy.directAnswer), "réponse directe en anglais");
  assert.ok(copy.faq[0].answer.includes("Durand & Co"));
});

// ---- Contrats de source (JSX non exécutable) ----

const page = stripped("src/app/reponses/[slug]/page.tsx");

test("page — dynamique, 404 propre, adossée au générateur d'assets", () => {
  assert.match(page, /force-dynamic/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /generateGeoAgentAssetsFromAudit/);
});

test("page — émet le JSON-LD et un canonical /reponses/", () => {
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /\/reponses\//);
  assert.match(page, /hostedAnswerPageSlug/);
});

test("page — noindex tant que non publiée", () => {
  assert.match(page, /answer_page_published_at/);
  assert.match(page, /index:\s*false/);
});

test("page — actif public citable : aucun paiement ni gating", () => {
  assert.equal(/checkout|stripe|PaidReport|resolveReportAccess|entitlement/i.test(page), false,
    "la page-réponse hébergée ne doit contenir aucune caisse ni verrou d'accès");
});

test("sitemap — ne liste que les pages publiées", () => {
  const sitemap = stripped("src/app/sitemap.ts");
  assert.match(sitemap, /answer_page_published_at IS NOT NULL/);
  assert.match(sitemap, /\/reponses\//);
});

test("db — colonne de publication idempotente", () => {
  const db = stripped("src/lib/db.ts");
  assert.match(db, /ADD COLUMN IF NOT EXISTS answer_page_published_at/);
});
