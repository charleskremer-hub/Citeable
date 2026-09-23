/**
 * LE DIAGNOSTIC GRATUIT PARLE LE MÉTIER QUE LA LANDING VEND — LOT F.
 *
 * Commande CEO du 23/09 (`outbound/COMMANDE_PRODUIT_2026-09-23.md`), fondée sur
 * TROIS AUDITS GRATUITS RÉELS lancés en production à 07:04–07:06Z sur Excilio
 * (Bordeaux), Kapsens (Nantes) et Inoxem (Lyon) : les trois sont ressortis
 * `icp_segment = small_brand_ecommerce`, `buyerIntent = "best brand of
 * [product]"`, avec des `fixes` en anglais parlant de *product listicles* et de
 * *marketplaces* — et `inoxem.fr` classé **web agency**.
 *
 * La table ci-dessous est une TABLE DE CAS RÉELS, comme la commande l'exige :
 * les textes sont les `<title>` réellement servis, cités dans la commande. Ils
 * sont des fixtures, donc le test ne fait aucun appel réseau.
 *
 * OÙ LA PREUVE S'ARRÊTE : ce test exerce l'inférence de catégorie, le choix du
 * segment et la rédaction des correctifs. Il n'exerce PAS `inferCategory`,
 * qui interroge le site et peut préférer une réponse du modèle. La
 * `Definition of done` de la commande — les trois domaines relancés en gratuit
 * — exige la production ; elle n'est pas atteignable depuis un run qui ne peut
 * pas déployer, et elle reste due.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFixes,
  categoryFromHomepageText,
  detectIcpSegment,
  isServiceCategory,
  SERVICE_CATEGORIES,
  type AuditCheckResult,
} from "@/lib/audit-engine";

const CABINETS = [
  {
    domaine: "inoxem.fr",
    // Le cas qui a échoué en production le 23/09.
    texte: "Expert comptable Lyon — Cabinet d'expertise comptable pour TPE-PME. Nous accompagnons les dirigeants. Voir notre site internet.",
  },
  { domaine: "excilio.fr", texte: "Excilio, expert-comptable à Bordeaux pour freelances, TPE et startups." },
  { domaine: "kapsens.com", texte: "Kapsens, cabinet comptable spécialisé e-commerce à Nantes. Expertise comptable et fiscalité." },
] as const;

test("catégorie — les trois cabinets réels du 23/09 sont des cabinets, 3 fois sur 3", () => {
  for (const { domaine, texte } of CABINETS) {
    assert.equal(categoryFromHomepageText(texte, domaine), "accounting firm", `${domaine}`);
  }
});

test("catégorie — « expert comptable » avec une espace n'est plus lu comme une agence web", () => {
  // La régression exacte : le trait d'union était facultatif, l'espace non.
  assert.equal(
    categoryFromHomepageText("Expert comptable Lyon. Nous refaisons aussi votre site internet.", "inoxem.fr"),
    "accounting firm"
  );
  // Et une vraie agence web reste une agence web.
  assert.equal(
    categoryFromHomepageText("Agence web à Lyon : création de site internet, SEO et design.", "exemple.fr"),
    "web agency"
  );
});

test("segment — un métier de service ne retombe plus sur le segment marque", () => {
  const segment = detectIcpSegment("accounting firm");
  assert.equal(segment.key, "service_professional");
  assert.doesNotMatch(segment.buyerIntent, /brand|product/i, "le buyerIntent vend encore un produit");
  assert.match(segment.buyerIntent, /\[métier\]/, "le buyerIntent doit être paramétré par le métier");
  for (const focus of segment.remediationFocus) {
    assert.doesNotMatch(focus, /product page|fiche produit/i, `remediationFocus hors-site attendu : « ${focus} »`);
  }
});

test("segment — une marque reste une marque : le défaut est inchangé", () => {
  assert.equal(detectIcpSegment("DTC footwear brand").key, "small_brand_ecommerce");
  assert.equal(detectIcpSegment(undefined).key, "small_brand_ecommerce");
  assert.equal(detectIcpSegment("").key, "small_brand_ecommerce");
  assert.equal(isServiceCategory("accounting firm"), true);
  assert.equal(isServiceCategory("beauty brand"), false);
});

test("segment — toute catégorie de service produite par l'inférence est dans la liste", () => {
  // Le piège : ajouter un métier à la table de catégories sans l'ajouter ici
  // le ferait retomber silencieusement sur le segment marque.
  const CATEGORIES_DE_SERVICE_ATTENDUES = [
    "plumber",
    "electrician",
    "dentist",
    "law firm",
    "accounting firm",
    "real estate agency",
    "web agency",
    "hair salon",
    "fitness coach",
    "auto repair shop",
    "architecture firm",
  ];
  for (const categorie of CATEGORIES_DE_SERVICE_ATTENDUES) {
    assert.ok(SERVICE_CATEGORIES.has(categorie), `« ${categorie} » manque à SERVICE_CATEGORIES`);
  }
  assert.equal(SERVICE_CATEGORIES.size, CATEGORIES_DE_SERVICE_ATTENDUES.length);
});

const checksFaibles: AuditCheckResult[] = [
  { check: "structured_data", score: 0, maxScore: 25, detail: "" },
  { check: "search_visibility", score: 0, maxScore: 25, detail: "" },
  { check: "technical_seo", score: 0, maxScore: 15, detail: "" },
  { check: "ai_visibility", score: 0, maxScore: 35, detail: "" },
  { check: "wikipedia", score: 0, maxScore: 20, detail: "" },
];

test("correctifs — un audit fr rend des correctifs en français, jamais en anglais", () => {
  // PREMIÈRE VERSION DE CE TEST : un ban de verbes anglais capitalisés
  // (`Earn|Publish|Complete|…`). La mutation MF3 — servir la table anglaise à
  // un audit `fr` — **est passée verte** : mes correctifs anglais commencent
  // par « GetPick publishes… », « GetPick builds… », donc aucun des verbes
  // bannis n'apparaît sous la forme bannie. *Un ban de mots est un test qui a
  // l'air d'un test.* Le verrou porte désormais sur ce qui distingue
  // réellement les deux langues, et sur le fait que les deux tables NE SE
  // RECOUVRENT PAS.
  const fr = buildFixes(checksFaibles, detectIcpSegment("accounting firm"), "accounting firm", "fr");
  const en = buildFixes(checksFaibles, detectIcpSegment("accounting firm"), "accounting firm", "en");
  assert.ok(fr.length > 0 && en.length > 0);
  assert.equal(fr.length, en.length, "les deux langues doivent couvrir les mêmes cas");
  for (const fix of fr) {
    assert.ok(!en.includes(fix), `correctif servi à l'identique dans les deux langues : « ${fix} »`);
    assert.match(fix, /[àâçéèêôûù]|\b(ton|ta|tes|hors de|a ta place|à ta place)\b/i, `correctif sans marqueur français : « ${fix} »`);
    assert.doesNotMatch(fix, /product listicle|marketplace|product page/i, `vocabulaire produit : « ${fix} »`);
  }
  for (const fix of en) {
    assert.doesNotMatch(fix, /\bque tes\b|\bhors de ton\b|\bta place\b/i, `correctif français servi en anglais : « ${fix} »`);
  }
});

test("correctifs — ils décrivent ce que GETPICK fait, jamais un geste demandé au client", () => {
  // La landing en production jure « zéro geste technique ». Un correctif à
  // l'impératif contredit l'offre vendue, et c'est le point 4 de la commande.
  for (const locale of ["fr", "en"] as const) {
    const fixes = buildFixes(checksFaibles, detectIcpSegment("accounting firm"), "accounting firm", locale);
    assert.ok(fixes.length > 0, locale);
    for (const fix of fixes) {
      assert.match(fix, /GetPick/, `${locale} — le correctif doit nommer qui fait le travail : « ${fix} »`);
      assert.doesNotMatch(fix, /^(Add|Publish|Complete|Create|Earn|Build|Maintain|Ajoute|Publie|Complète|Crée|Construis)\b/, `${locale} — impératif adressé au client : « ${fix} »`);
    }
  }
});

test("correctifs — une marque garde exactement les correctifs d'avant", () => {
  // Le lot ne doit rien changer pour l'ICP historique : les rapports déjà en
  // base et les marques restent servis à l'identique.
  const fixes = buildFixes(checksFaibles, detectIcpSegment("DTC footwear brand"), "DTC footwear brand", "fr");
  assert.match(fixes.join(" | "), /Add Organization JSON-LD/);
  assert.match(fixes.join(" | "), /product listicles/);
});
