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

// MODIFIÉ LE 22/09/2026 (pivot offre services) — JUSTIFICATION, ligne à ligne.
// La home ne publie plus deux plans payants mais UN seul, « Fait pour toi ».
// Les deux assertions `trackCheckoutOpened("monitor_9eur"|"agent_19eur")` ne
// pouvaient plus passer : ce code n'existe plus dans `HomeClient.tsx` (les
// branches étaient devenues mortes, `tsc` les signalait). Elles sont remplacées
// par l'étiquette du plan réellement publié. L'invariant du 07/09 — la caisse
// de la home est MESURABLE, pas un `<a href>` nu — est intégralement conservé :
// l'événement, la source, le beacon et la navigation native sont toujours
// exigés ci-dessous.
test("la home émet checkout_opened pour le plan payant publié", () => {
  assert.match(source, /event_name: "checkout_opened"/);
  assert.match(source, /trackCheckoutOpened\("service_69eur"/);
  assert.match(source, /source: "pricing_card"/);
});

// AJOUTÉ LE 22/09/2026. Le corollaire du fail-safe de `checkout-links.ts` : tant
// que `NEXT_PUBLIC_SERVICE_CHECKOUT_URL` n'est pas renseignée, le bouton mène au
// diagnostic gratuit et N'ÉMET PAS `checkout_opened`. Un compteur de caisse qui
// bouge sans caisse est pire qu'un compteur à zéro : il ferait croire à une
// intention d'achat là où il n'y a qu'un lien d'ancre.
test("aucun checkout_opened n'est émis quand la caisse n'est pas configurée", () => {
  assert.match(source, /isCheckoutConfigured\(SERVICE_CHECKOUT_URL\)/);
  assert.match(source, /tier\.href === "service" && serviceCheckout/);
  assert.match(source, /serviceCheckout \? SERVICE_CHECKOUT_URL : "#audit"/);
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
  const onClick = source.match(/onClick=\{\(\) => \{[\s\S]*?trackCheckoutOpened\("service_69eur"[\s\S]*?\}\}/);
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

// MODIFIÉ LE 22/09/2026 — JUSTIFICATION : deux plans payants, un seul désormais.
// Le contrat testé reste le même : chaque plan payant de la copy porte un `href`
// que `HomeClient.tsx` sait router vers une caisse. Un `href` inconnu rendrait
// un lien mort sans que rien n'échoue — c'est ce que ce test empêche.
test("le plan payant de la copy porte un href que la home sait router", () => {
  for (const locale of ["en", "fr"] as const) {
    const paid = homeCopy[locale].pricingTiers.filter((tier) => tier.plan !== "free");
    assert.equal(paid.length, 1, `${locale}: un seul plan payant publié`);
    assert.deepEqual(paid.map((tier) => tier.href), ["service"]);
  }
});
