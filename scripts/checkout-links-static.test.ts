// Le lien de caisse doit survivre au bundle client — tripwire de source.
//
// POURQUOI CE TEST EXISTE (14/09/2026). `src/lib/checkout-links.ts` lisait ses URLs
// par indexation dynamique `process.env[name]`. Next.js n'inline une variable
// `NEXT_PUBLIC_*` dans le bundle client QUE si elle apparait en toutes lettres :
// le serveur rendait le bon `href`, le client lisait "". Le bouton de prix mourait
// au premier re-rendu de la home (une frappe dans le formulaire d'audit suffit).
// Preuve mesuree : `checkout_opened` du 14/09 06:57 UTC avec `checkout_url: ""`,
// et aucun chunk client servi en production ne contenait l'URL Stripe.
//
// Aucun test d'execution ne peut voir ce defaut : en Node, `process.env[name]`
// fonctionne parfaitement. Le seul instrument qui le voit est la SOURCE.
// ZERO base, ZERO reseau. Lancer : npm test.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(resolve(here, "../src/lib/checkout-links.ts"), "utf8");

// On teste le CODE, pas la prose : un commentaire qui cite la forme interdite pour
// expliquer pourquoi elle est interdite ne doit pas faire echouer le tripwire.
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// 22/09/2026 : `NEXT_PUBLIC_SERVICE_CHECKOUT_URL` rejoint la liste avec le plan
// unique « Fait pour toi ». C'est la variable du SEUL bouton d'achat publie sur
// la home : si Next cesse de l'inliner, le pivot perd sa caisse en silence,
// exactement comme le 14/09. Les quatre autres restent verrouillees : la page
// de rapport sert encore Monitor et Agent.
const VARIABLES = [
  "NEXT_PUBLIC_SERVICE_CHECKOUT_URL",
  "NEXT_PUBLIC_MONITOR_CHECKOUT_URL",
  "NEXT_PUBLIC_AGENT_CHECKOUT_URL",
  "NEXT_PUBLIC_MONITOR_TEST_CHECKOUT_URL",
  "NEXT_PUBLIC_AGENT_TEST_CHECKOUT_URL",
];

test("aucune indexation dynamique de process.env — sinon le bundle client perd l'URL", () => {
  const dynamique = /process\.env\s*\[/.test(CODE);
  assert.equal(
    dynamique,
    false,
    "process.env[...] detecte dans checkout-links.ts : le lien de caisse sera vide cote client",
  );
});

for (const variable of VARIABLES) {
  test(`${variable} est lue en toutes lettres`, () => {
    assert.ok(
      CODE.includes(`process.env.${variable}`),
      `${variable} doit etre lue via process.env.${variable}, seule forme inlinee par Next.js`,
    );
  });
}

test("le fail-safe reste dans un seul sens : variable absente => pas de caisse", async () => {
  const { isCheckoutConfigured } = await import("@/lib/checkout-links");
  assert.equal(isCheckoutConfigured(""), false);
  assert.equal(isCheckoutConfigured("   "), false);
  assert.equal(isCheckoutConfigured("checkout.nanocorp.so/x"), false);
  assert.equal(isCheckoutConfigured("http://buy.stripe.com/x"), false);
  assert.equal(isCheckoutConfigured("https://buy.stripe.com/x"), true);
});
