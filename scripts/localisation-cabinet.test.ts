/**
 * LOCAL OU EN LIGNE ? — boucle qualité du 28/09/2026, témoin Excilio.
 *
 * Constaté en prod (audit a27e78dc) : 6 questions sur 6 sans ville (« dans ma
 * région », « près de chez moi ») et des rivaux nationaux (Dougs, Keobiz).
 * Deux causes, deux verrous :
 *   1. la ville n'était que dans le JSON-LD `PostalAddress`, jamais lu ;
 *   2. Excilio est un cabinet « 100 % digital » : lui poser des questions de
 *      proximité le mesure contre une concurrence qu'il ne vise pas.
 * Fixtures = HTML réellement servi (extraits), zéro réseau.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { extractHomepageSignals, extractPostalAddress, inferLocationFromHomepage, isOnlineServiceFirm } from "@/lib/audit-engine";

const EXCILIO = `<html><head><title>Expert-comptable N°1 du E-commerce et Métiers du Web</title>
<meta name="description" content="Cabinet 100% digital spécialisé e-commerce et métiers du web. Pennylane, Shopify, Amazon : on connaît votre stack.">
<script type="application/ld+json">{"@type":"AccountingService","name":"Excilio","address":{"@type":"PostalAddress","streetAddress":"29 Rue du Colisée","addressLocality":"Paris","postalCode":"75008","addressCountry":"FR"}}</script>
</head><body><h1>Cabinet expert-comptable spécialisé en e-commerce</h1></body></html>`;

const LOCAL = `<html><head><title>Cabinet Gendrot — expertise comptable</title>
<script type="application/ld+json">{"@type":"AccountingService","address":{"@type":"PostalAddress","addressLocality":"Palaiseau","postalCode":"91120"}}</script>
</head><body><h1>Votre expert-comptable de proximité</h1></body></html>`;

test("adresse — la ville du JSON-LD PostalAddress est lue", () => {
  assert.equal(extractPostalAddress(EXCILIO), "75008 Paris");
  assert.equal(extractPostalAddress(LOCAL), "91120 Palaiseau");
  assert.equal(extractPostalAddress("<html></html>"), "");
});

test("adresse — elle arrive jusqu'à la ville utilisée dans les questions", () => {
  assert.equal(inferLocationFromHomepage(extractHomepageSignals(LOCAL)), "Palaiseau");
  assert.equal(inferLocationFromHomepage(extractHomepageSignals(EXCILIO)), "Paris");
});

test("cabinet en ligne — détecté, donc jamais interrogé sur la proximité", () => {
  assert.equal(isOnlineServiceFirm(extractHomepageSignals(EXCILIO)), true);
  assert.equal(isOnlineServiceFirm(extractHomepageSignals(LOCAL)), false);
  assert.equal(isOnlineServiceFirm("Expert-comptable en ligne pour freelances"), true);
  assert.equal(isOnlineServiceFirm("Cabinet d'expertise comptable à Lyon, accompagnement des TPE"), false);
});
