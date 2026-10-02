/**
 * ENTITÉS HTML ET CATÉGORIE — rejeu du Baromètre #1, 01/10/2026.
 *
 * Trois audits invalides (VENCEA, Mon Espace Compta, Fiaud-Laporte), attribués
 * à tort à un filtrage réseau : la sonde iad1/cdg1 a montré que la prod lit les
 * trois sites. Causes réelles, reproduites sur le HTML servi :
 *   - gabarit Les Echos Publishing : « 90000&#160;Belfort », « &agrave; » non
 *     décodés ⇒ code postal sans nom de commune ⇒ aucune ville ;
 *   - « Châteauroux » contient « tea » ⇒ règle « food & beverage ».
 * Fixtures = extraits du HTML réellement servi, zéro réseau.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { categoryFromHomepageText, decodeHtmlEntities, postalCandidates } from "@/lib/audit-engine";

const MEC_FOOTER = `<footer><p>Mon Espace Compta</p><p>46 avenue Jean Jaur&egrave;s</p><p>90000&#160;Belfort</p></footer>`;
const VENCEA_FOOTER = `<div>Parc Georges Besse - Immeuble Saga<br>30000&#160;NIMES</div><div>240 Avenue du golf<br>34670&#160;BAILLARGUES</div>`;

test("les entités numériques et accentuées sont décodées", () => {
  assert.equal(decodeHtmlEntities("Expert comptable &agrave; Belfort"), "Expert comptable à Belfort");
  assert.equal(decodeHtmlEntities("90000&#160;Belfort"), "90000 Belfort");
  assert.equal(decodeHtmlEntities("l&#039;article"), "l'article");
  assert.equal(decodeHtmlEntities("R&amp;D &amp;eacute;"), "R&D &eacute;", "&amp; décodé une seule fois");
});

test("code postal suivi de &#160; : la commune est lue (Mon Espace Compta, VENCEA)", () => {
  assert.equal(postalCandidates([{ html: MEC_FOOTER, weight: 1 }])[0]?.postal, "90000");
  assert.equal(postalCandidates([{ html: MEC_FOOTER, weight: 1 }])[0]?.commune, "Belfort");
  const vencea = postalCandidates([{ html: VENCEA_FOOTER, weight: 1 }]);
  assert.equal(vencea[0]?.postal, "30000");
  assert.equal(vencea[0]?.commune, "NIMES");
});

test("« Châteauroux » ne fait pas d'un cabinet comptable une marque de thé", () => {
  const title = "Fiaud - Laporte | Expertise comptable, gestion sociale à Saint-Maur, près de Châteauroux";
  assert.equal(categoryFromHomepageText(title, "fiaud-laporte.fr"), "accounting firm");
  assert.equal(categoryFromHomepageText("Salon de thé à Châteauroux, tea room", "x.fr"), "food & beverage");
});

test("un site qui se dit expert-comptable reste un cabinet comptable", () => {
  assert.equal(categoryFromHomepageText("VENCEA Expertise Comptable — bijoux de famille, patrimoine", "vencea.fr"), "accounting firm");
});

test("budget dépassé : l'adresse lue sur la home reste la ville (Mon Espace Compta, 02/10)", async () => {
  const { homeLocationFallback } = await import("@/lib/audit-engine");
  assert.equal(homeLocationFallback(MEC_FOOTER), "90000 Belfort");
  assert.equal(homeLocationFallback("<p>Aucune adresse ici</p>"), "");
});
