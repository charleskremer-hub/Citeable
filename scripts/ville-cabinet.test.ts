/**
 * VILLE DU CABINET — boucle qualité du 29/09/2026.
 *
 * Mesuré sur les 20 cabinets du lot 1 (15 joignables depuis le bac à sable) :
 * ville juste sur la home pour 7 seulement. Audit Conseil (Valence) était
 * interrogé sur Rennes ; AFRZ, Exadour, Cartesia, Fiaud-Laporte n'avaient pas
 * de ville ⇒ « près de chez moi » ⇒ Gemini répond « précisez votre ville »,
 * aucune recherche, score affiché quand même. Après correctif : 14/15.
 * Fixtures = extraits du HTML réellement servi, zéro réseau.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  communeNameFromText,
  contactPageCandidates,
  inferLocationFromHomepage,
  pickOfficialCommune,
  postalCandidates,
} from "@/lib/audit-engine";

const AFRZ_MENTIONS = `<main><h1>Mentions légales</h1><p>PUBLICATION : AFRZ, 9 rue du Docteur Roux, 01000 Bourg en Bresse, sarl à capital variable</p>
<p>HÉBERGEUR : OVH – 2 rue Kellermann – 59100 Roubaix – France</p></main>`;
const AFRZ_HOME = `<footer>AFRZ<br>9 rue du Docteur Roux<br>01000 - Bourg en Bresse<br>Tél. : +33 675 900 340</footer>`;
const EXADOUR_CONTACT = `<p>12 avenue Bertrand Barère 65000 Tarbes</p><p>Cette page vous permet de nous écrire.</p>`;
const AUDIT_CONSEIL_HOME = `<h1>Expert-comptable Drôme Ardèche</h1><footer>26000 Valence ——— 07500 Guilherand-Granges ——— Bureau 26000 Valence</footer>`;

test("l'adresse de l'hébergeur n'est jamais la ville du cabinet (OVH, Roubaix)", () => {
  const [first, ...rest] = postalCandidates([{ html: AFRZ_MENTIONS, weight: 2 }]);
  assert.equal(first.postal, "01000");
  assert.ok(!rest.some((c) => c.postal === "59100"), "Roubaix (hébergeur) ne doit pas être candidat");
});

test("« 01000 - Bourg en Bresse » (tiret, espaces) → commune officielle Bourg-en-Bresse, pas Saint-Denis-lès-Bourg", () => {
  const [first] = postalCandidates([{ html: AFRZ_HOME, weight: 1 }]);
  assert.equal(first.postal, "01000");
  assert.equal(pickOfficialCommune(["Bourg-en-Bresse", "Saint-Denis-lès-Bourg"], first.read), "Bourg-en-Bresse");
});

test("« 65000 Tarbes Cette page… » → Tarbes, pas « Tarbes Cette »", () => {
  const [first] = postalCandidates([{ html: EXADOUR_CONTACT, weight: 2 }]);
  assert.equal(first.commune, "Tarbes");
  assert.equal(communeNameFromText("Belfort Te"), "Belfort");
  assert.equal(communeNameFromText("Joué-lès-Tours Tél"), "Joué-lès-Tours");
  assert.equal(communeNameFromText("La Rochelle, France"), "La Rochelle");
});

test("le code postal le plus fréquent l'emporte (Audit Conseil : Valence, pas Guilherand-Granges ni Rennes)", () => {
  const [first] = postalCandidates([{ html: AUDIT_CONSEIL_HOME, weight: 1 }]);
  assert.equal(first.postal, "26000");
  assert.equal(inferLocationFromHomepage(`26000 Valence · Expert-comptable Rennes Lyon Paris`), "Valence");
});

test("commune officielle : préfixe sur mot entier, sinon seule commune du code, sinon rien", () => {
  assert.equal(pickOfficialCommune(["Tours"], "Tours Tél 02"), "Tours");
  assert.equal(pickOfficialCommune(["Saint-Maur", "Saint-Maur-des-Fossés"], "Saint Maur des Fossés"), "Saint-Maur-des-Fossés");
  assert.equal(pickOfficialCommune(["Albi"], "ALBI, France"), "Albi");
  assert.equal(pickOfficialCommune(["A", "B"], "Ailleurs"), null);
  assert.equal(pickOfficialCommune([], "Tours"), null);
});

test("pages contact / mentions légales : même site uniquement, 2 au plus", () => {
  const html = `<a href="/contact/">Nous contacter</a><a href="https://facebook.com/contact">fb</a><a href="/mentions-legales/">Mentions légales</a><a href="/blog">Blog</a>`;
  const urls = contactPageCandidates(html, "https://www.exadour.fr/");
  assert.deepEqual(urls, ["https://www.exadour.fr/contact/", "https://www.exadour.fr/mentions-legales/"]);
});

test("ville composée lue en entier sur la home (« Bourg-en-Bresse », pas « Bourg »)", () => {
  assert.equal(inferLocationFromHomepage("Cabinet · 01000 Bourg-en-Bresse · Tél"), "Bourg-en-Bresse");
  assert.equal(inferLocationFromHomepage("37300 Joué-lès-Tours"), "Joué-lès-Tours");
  assert.equal(inferLocationFromHomepage("17000 La Rochelle"), "La Rochelle");
});

test("catégorie — toutes les variantes comptables ramenées au cabinet (30/09 : « accounting services » ⇒ questions nationales interdites)", async () => {
  const { canonicalCategory } = await import("@/lib/audit-engine");
  for (const raw of ["accounting services", "online accounting services", "Accounting firm", "bookkeeping", "cabinet d'expertise comptable"]) {
    assert.equal(canonicalCategory(raw), "accounting firm", raw);
  }
  assert.equal(canonicalCategory("fashion jewelry"), "fashion jewelry");
});
