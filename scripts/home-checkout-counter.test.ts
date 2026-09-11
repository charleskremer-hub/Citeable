// Verrou de l'invariant « la caisse est mesurable depuis la home ».
//
// Constat du 07/09/2026 : quatre sessions Stripe Checkout réelles (31/07, 27/08 ×3)
// pendant que `checkout_opened` restait à 0 — les deux boutons de prix de la home
// étaient des `<a href>` nus, aucun appel à /api/funnel. Le compteur ne pouvait
// structurellement jamais bouger ; un test unitaire vert ne prouvait rien.
//
// Ce fichier lit `HomeClient.tsx` EN SOURCE (composant client, jamais importé
// hors React) et verrouille la jointure : chaque plan payant émet
// `checkout_opened` avec son étiquette de plan, sans jamais se mettre entre
// l'acheteur et Stripe (pas de preventDefault, navigation native).
//
// Fonctions pures, ZÉRO réseau. Lancer : npm test  (Node >= 23.6).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { homeCopy } from "@/lib/i18n";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../src/app/HomeClient.tsx"), "utf8");

test("la home émet checkout_opened pour chacun des deux plans payants", () => {
  assert.match(source, /event_name: "checkout_opened"/);
  assert.match(source, /trackCheckoutOpened\("monitor_9eur"/);
  assert.match(source, /trackCheckoutOpened\("agent_19eur"/);
  assert.match(source, /source: "pricing_card"/);
});

// Le formulaire d'audit de la home utilise légitimement `e.preventDefault()` et
// `window.location.assign` (soumission puis redirection vers /audit/<id>) : la
// garantie « navigation native » se lit sur le CHEMIN DE CAISSE seul — la fonction
// `trackCheckoutOpened` et le `onClick` des boutons de prix — pas sur le fichier
// entier (11/09/2026 : l'assertion globale rendait le test rouge sur un composant
// correct).
function checkoutPath(): string {
  const fn = source.match(/function trackCheckoutOpened[\s\S]*?\n}\n/);
  assert.ok(fn, "trackCheckoutOpened introuvable dans HomeClient.tsx");
  const onClick = source.match(/onClick=\{\(\) => \{[\s\S]*?trackCheckoutOpened\("agent_19eur"[\s\S]*?\}\}/);
  assert.ok(onClick, "onClick des boutons de prix introuvable dans HomeClient.tsx");
  return fn[0] + onClick[0];
}

test("la mesure ne se met jamais entre l'acheteur et Stripe", () => {
  const path = checkoutPath();
  assert.doesNotMatch(path, /preventDefault/);
  assert.doesNotMatch(path, /window\.location\.assign/);
  assert.doesNotMatch(path, /await /);
  assert.match(path, /navigator\.sendBeacon\("\/api\/funnel"/);
  assert.match(path, /keepalive: true/);
});

test("les deux plans payants de la copy ont un bouton de prix qui pointe vers la caisse", () => {
  for (const locale of ["en", "fr"] as const) {
    const paid = homeCopy[locale].pricingTiers.filter((tier) => tier.plan !== "free");
    assert.equal(paid.length, 2, `${locale}: deux plans payants attendus`);
    assert.deepEqual(paid.map((tier) => tier.href).sort(), ["agent", "monitor"]);
  }
});
