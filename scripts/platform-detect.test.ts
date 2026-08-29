// Verrou du LOT 2a (commande CEO/Charles du 28/08/2026) : la plateforme est
// détectée depuis le HTML déjà crawlé, et EN CAS DE DOUTE elle vaut "inconnu"
// — jamais une plateforme devinée. Un pas-à-pas Shopify affiché à un site
// WooCommerce détruit plus de confiance qu'une absence de guide.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { detectPlatform, KNOWN_PLATFORMS } from "@/lib/platform-detect";

test("chaque plateforme est reconnue sur sa balise generator", () => {
  const cases: Array<[string, string]> = [
    ["shopify", '<meta name="generator" content="Shopify">'],
    ["woocommerce", '<meta name="generator" content="WooCommerce 8.9">'],
    ["wix", '<meta name="generator" content="Wix.com Website Builder">'],
    ["squarespace", '<meta name="generator" content="Squarespace">'],
    ["prestashop", '<meta name="generator" content="PrestaShop">'],
  ];
  for (const [expected, meta] of cases) {
    assert.equal(detectPlatform(`<html><head>${meta}</head><body>shop</body></html>`), expected);
  }
});

test("la balise generator est reconnue dans les deux ordres d'attributs", () => {
  assert.equal(detectPlatform('<meta content="Shopify" name="generator">'), "shopify");
});

test("chaque plateforme est reconnue sur ses chemins d'assets caractéristiques", () => {
  const cases: Array<[string, string]> = [
    ["shopify", '<link href="https://cdn.shopify.com/s/files/1/theme.css">'],
    ["woocommerce", '<script src="/wp-content/plugins/woocommerce/assets/js/cart.js"></script>'],
    ["wix", '<script src="https://static.parastorage.com/services/wix-thunderbolt/app.js"></script>'],
    ["squarespace", '<img src="https://images.squarespace-cdn.com/content/abc/photo.jpg">'],
    ["prestashop", "<script>var prestashop = {};</script>"],
  ];
  for (const [expected, html] of cases) {
    assert.equal(detectPlatform(`<html><body>${html}</body></html>`), expected);
  }
});

test("aucun signal => inconnu (HTML vide, nul, ou site custom)", () => {
  assert.equal(detectPlatform(null), "inconnu");
  assert.equal(detectPlatform(undefined), "inconnu");
  assert.equal(detectPlatform(""), "inconnu");
  assert.equal(detectPlatform("   "), "inconnu");
  assert.equal(detectPlatform("<html><head><title>Ma marque</title></head><body>Boutique maison</body></html>"), "inconnu");
});

test("signaux de DEUX plateformes => inconnu, le doute l'emporte", () => {
  const conflicted =
    '<html><body><link href="https://cdn.shopify.com/a.css"><script src="/wp-content/plugins/woocommerce/x.js"></script></body></html>';
  assert.equal(detectPlatform(conflicted), "inconnu");
});

test("un lien éditorial vers shopify.com ne classe PAS le site (signal faible ignoré)", () => {
  const blogMention = '<html><body><a href="https://www.shopify.com/blog/seo">comparatif Shopify</a></body></html>';
  assert.equal(detectPlatform(blogMention), "inconnu");
});

test("un vrai gabarit Shopify (generator + CDN) reste shopify, pas un conflit", () => {
  const shopify =
    '<html><head><meta name="generator" content="Shopify"><link href="https://cdn.shopify.com/s/x.css"></head><body><script>Shopify.theme = {id: 1};</script></body></html>';
  assert.equal(detectPlatform(shopify), "shopify");
});

test("KNOWN_PLATFORMS couvre exactement les cinq plateformes de la commande", () => {
  assert.deepEqual([...KNOWN_PLATFORMS].sort(), ["prestashop", "shopify", "squarespace", "wix", "woocommerce"]);
});
