// Tests unitaires du diagnostic produit shopping IA (SKU phare + balisage
// Product + correctif JSON-LD). Fonctions pures importées du module réel,
// fixtures HTML inline, ZÉRO réseau. Lancer : npm test  (Node >= 23.6).
//
// Couvre AC1 (SKU nom+URL détectés), AC2 (balisage absent → correctif),
// AC3 (prix/devise repris exactement, jamais inventés ni arrondis),
// AC4 (aucune page produit → aucun lien → bloc muet), AC5 (non-ecommerce → vide),
// AC6 (≥12 tests sur fixtures : JSON-LD présent/absent/malformé, og:product,
// prix présent/absent, devise).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildProductJsonLdFix,
  extractProductLinks,
  parseProductPage,
  pickFlagshipSignal,
  type ProductSignal,
} from "@/lib/product-shopping";

const BASE = "https://acme-store.com";

// --- Fixtures ----------------------------------------------------------------

const jsonLdProductPage = (extra = "") => `<!doctype html><html><head>
  <title>Aurora Serum — Acme</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Aurora Vitamin C Serum",
    "offers": { "@type": "Offer", "price": "29.90", "priceCurrency": "EUR", "availability": "https://schema.org/InStock" }
  }
  </script>
  ${extra}
  </head><body><h1>Aurora Serum</h1></body></html>`;

const graphProductPage = `<!doctype html><html><head>
  <script type="application/ld+json">
  { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "name": "PDP" },
    { "@type": "Product", "name": "Nimbus Hoodie", "offers": { "@type": "Offer", "price": "89", "priceCurrency": "USD" } }
  ] }
  </script>
  </head><body></body></html>`;

// JSON-LD Product niché sous WebPage.mainEntity (pattern Google courant).
const mainEntityProductPage = `<!doctype html><html><head>
  <script type="application/ld+json">
  { "@context": "https://schema.org", "@type": "WebPage", "name": "PDP",
    "mainEntity": { "@type": "Product", "name": "Halo Ring",
      "offers": { "@type": "Offer", "price": "349", "priceCurrency": "USD" } } }
  </script>
  </head><body></body></html>`;

// JSON-LD Product niché sous ItemList.itemListElement[].item.
const itemListProductPage = `<!doctype html><html><head>
  <script type="application/ld+json">
  { "@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
    { "@type": "ListItem", "position": 1, "item": { "@type": "Product", "name": "Zephyr Tee" } }
  ] }
  </script>
  </head><body></body></html>`;

const noJsonLdWithOgPrice = `<!doctype html><html><head>
  <title>Cloud Sneaker — Acme</title>
  <meta property="og:title" content="Cloud Sneaker" />
  <meta property="og:price:amount" content="119.00" />
  <meta property="og:price:currency" content="GBP" />
  </head><body><h1>Cloud Sneaker</h1></body></html>`;

const noJsonLdWithProductPrice = `<!doctype html><html><head>
  <title>Meta Bag — Acme</title>
  <meta property="product:price:amount" content="240.50" />
  <meta property="product:price:currency" content="CHF" />
  </head><body></body></html>`;

const noJsonLdNoPrice = `<!doctype html><html><head>
  <title>Mystery Item — Acme</title>
  <meta property="og:title" content="Mystery Item" />
  </head><body><h1>Mystery Item</h1></body></html>`;

const malformedJsonLdPage = `<!doctype html><html><head>
  <title>Broken PDP — Acme</title>
  <meta property="og:title" content="Broken PDP" />
  <script type="application/ld+json">
  { "@type": "Product", "name": "Broken", "offers": { "price": }
  </script>
  </head><body></body></html>`;

const homeWithProductLinks = `<!doctype html><html><head><title>Acme</title></head><body>
  <nav><a href="/products">All products</a><a href="/collections/new">New</a></nav>
  <a href="/products/aurora-serum">Aurora Serum</a>
  <a href="https://acme-store.com/products/cloud-sneaker">Cloud Sneaker</a>
  <a href="/products/aurora-serum">Aurora (dup)</a>
  <a href="https://facebook.com/products/spam">Off-site</a>
</body></html>`;

// Home mêlant pages utilitaires (panier, carte cadeau) et un vrai SKU.
const homeWithUtilityLinks = `<!doctype html><html><head><title>Acme</title></head><body>
  <a href="/shop/cart">Cart</a>
  <a href="/products/gift-card">Gift card</a>
  <a href="/account/login">Login</a>
  <a href="/products/real-hero">Real hero</a>
</body></html>`;

const homeNoProductLinks = `<!doctype html><html><head><title>Acme Blog</title></head><body>
  <nav><a href="/about">About</a><a href="/blog">Blog</a><a href="/contact">Contact</a></nav>
</body></html>`;

// Home dont les liens /shop|/p pointent vers des collections/catégories (sale, new,
// mens…) et un seul vrai SKU. Les collections n'ont pas de JSON-LD Product.
const homeWithCollectionLinks = `<!doctype html><html><head><title>Acme</title></head><body>
  <a href="/shop/sale">Sale</a>
  <a href="/shop/new">New in</a>
  <a href="/shop/mens">Men</a>
  <a href="/p/best-sellers">Best sellers</a>
  <a href="/shop/aurora-serum">Aurora Serum</a>
</body></html>`;

// JSON-LD Product SANS champ name, page sans og:title ni <title>.
const jsonLdNoNameNoTitle = `<!doctype html><html><head>
  <script type="application/ld+json">
  { "@context": "https://schema.org", "@type": "Product", "offers": { "@type": "Offer", "price": "10" } }
  </script>
  </head><body></body></html>`;

const saasHome = `<!doctype html><html><head><title>Flowbase — Analytics for teams</title></head><body>
  <nav><a href="/pricing">Pricing</a><a href="/docs">Docs</a><a href="/login">Log in</a></nav>
  <h1>Ship analytics faster</h1><a href="/signup">Start free trial</a>
</body></html>`;

// --- AC1 : JSON-LD Product détecté (nom + url) -------------------------------

test("AC1 — JSON-LD Product valide → hasProductJsonLd + name détectés", () => {
  const signal = parseProductPage(jsonLdProductPage(), `${BASE}/products/aurora-serum`);
  assert.equal(signal.hasProductJsonLd, true);
  assert.equal(signal.name, "Aurora Vitamin C Serum");
  assert.equal(signal.url, `${BASE}/products/aurora-serum`);
});

test("AC1 — JSON-LD @graph contenant Product → détecté", () => {
  const signal = parseProductPage(graphProductPage, `${BASE}/products/nimbus`);
  assert.equal(signal.hasProductJsonLd, true);
  assert.equal(signal.name, "Nimbus Hoodie");
});

test("AC1 — Product niché sous WebPage.mainEntity → détecté (descente générique)", () => {
  const signal = parseProductPage(mainEntityProductPage, `${BASE}/products/halo-ring`);
  assert.equal(signal.hasProductJsonLd, true);
  assert.equal(signal.name, "Halo Ring");
  assert.equal(signal.priceAmount, "349");
});

test("AC1 — Product niché sous ItemList.itemListElement[].item → détecté", () => {
  const signal = parseProductPage(itemListProductPage, `${BASE}/products/zephyr-tee`);
  assert.equal(signal.hasProductJsonLd, true);
  assert.equal(signal.name, "Zephyr Tee");
});

// --- AC2 : balisage absent → correctif non vide ------------------------------

test("AC2 — page sans JSON-LD Product → markup absent + correctif généré", () => {
  const signal = parseProductPage(noJsonLdWithOgPrice, `${BASE}/products/cloud-sneaker`);
  assert.equal(signal.hasProductJsonLd, false);
  const fix = buildProductJsonLdFix(signal, "Acme");
  assert.ok(fix.length > 0);
  const parsed = JSON.parse(fix);
  assert.equal(parsed["@type"], "Product");
});

// --- AC6 : JSON-LD malformé → pas de crash, traité comme absent --------------

test("AC6 — JSON-LD Product malformé → pas de crash, hasProductJsonLd=false", () => {
  const signal = parseProductPage(malformedJsonLdPage, `${BASE}/products/broken`);
  assert.equal(signal.hasProductJsonLd, false);
  assert.equal(signal.name, "Broken PDP");
});

// --- AC3 : prix repris EXACTEMENT (jamais arrondi ni inventé) ----------------

test("AC3 — prix depuis offers.price/priceCurrency repris exactement", () => {
  const signal = parseProductPage(jsonLdProductPage(), `${BASE}/products/aurora-serum`);
  assert.equal(signal.priceAmount, "29.90"); // le zéro final est préservé
  assert.equal(signal.priceCurrency, "EUR");
  assert.equal(signal.availability, "https://schema.org/InStock");
});

test("AC3 — prix depuis og:price:amount + og:price:currency (sans JSON-LD)", () => {
  const signal = parseProductPage(noJsonLdWithOgPrice, `${BASE}/products/cloud-sneaker`);
  assert.equal(signal.priceAmount, "119.00");
  assert.equal(signal.priceCurrency, "GBP");
});

test("AC3 — prix depuis product:price:amount repris", () => {
  const signal = parseProductPage(noJsonLdWithProductPrice, `${BASE}/products/meta-bag`);
  assert.equal(signal.priceAmount, "240.50");
});

test("AC3 — devise préservée telle quelle (CHF ≠ défaut)", () => {
  const signal = parseProductPage(noJsonLdWithProductPrice, `${BASE}/products/meta-bag`);
  assert.equal(signal.priceCurrency, "CHF");
});

test("AC3 — page sans prix → correctif SANS clé price inventée", () => {
  const signal = parseProductPage(noJsonLdNoPrice, `${BASE}/products/mystery`);
  assert.equal(signal.priceAmount, undefined);
  const parsed = JSON.parse(buildProductJsonLdFix(signal, "Acme"));
  assert.equal("price" in parsed.offers, false);
  assert.equal("priceCurrency" in parsed.offers, false);
  // availability est un défaut neutre éditable, pas un prix inventé
  assert.equal(parsed.offers.availability, "https://schema.org/InStock");
});

// --- extractProductLinks -----------------------------------------------------

test("AC1 — extractProductLinks sur home avec /products/<slug> → liens absolus dédupliqués", () => {
  const links = extractProductLinks(homeWithProductLinks, BASE);
  assert.ok(links.length >= 1);
  assert.ok(links.every((l) => l.startsWith("https://acme-store.com/products/")));
  // dédup : aurora-serum n'apparaît qu'une fois
  assert.equal(links.filter((l) => l.endsWith("/products/aurora-serum")).length, 1);
  // le lien de nav nu `/products` (collection) et l'off-site sont exclus
  assert.ok(!links.some((l) => l === "https://acme-store.com/products"));
  assert.ok(!links.some((l) => l.includes("facebook.com")));
});

test("AC4 — extractProductLinks sur home sans lien produit → []", () => {
  assert.deepEqual(extractProductLinks(homeNoProductLinks, BASE), []);
});

test("finding#3 — pages utilitaires (cart/gift-card/login) exclues, seul le vrai SKU reste", () => {
  const links = extractProductLinks(homeWithUtilityLinks, BASE);
  assert.deepEqual(links, ["https://acme-store.com/products/real-hero"]);
  assert.ok(!links.some((l) => l.includes("/cart")));
  assert.ok(!links.some((l) => l.includes("gift-card")));
  assert.ok(!links.some((l) => l.includes("/login")));
});

// --- pickFlagshipSignal : le verdict suit la couverture markup, pas l'ordre ---

test("finding#2 — un SKU balisé prime, même s'il arrive APRÈS un candidat non balisé", () => {
  const giftCard: ProductSignal = { name: "Gift card", url: `${BASE}/products/gift-card`, hasProductJsonLd: false };
  const realHero: ProductSignal = { name: "Real Hero", url: `${BASE}/products/real-hero`, hasProductJsonLd: true };
  const flagship = pickFlagshipSignal([giftCard, realHero]);
  assert.equal(flagship?.url, `${BASE}/products/real-hero`);
  assert.equal(flagship?.hasProductJsonLd, true);
});

test("finding#2 — aucun markup nulle part → premier candidat joignable retenu (absent)", () => {
  const a: ProductSignal = { name: "A", url: `${BASE}/products/a`, hasProductJsonLd: false };
  const b: ProductSignal = { name: "B", url: `${BASE}/products/b`, hasProductJsonLd: false };
  assert.equal(pickFlagshipSignal([a, b])?.url, `${BASE}/products/a`);
});

test("finding#2 — liste vide → null (muet sans signal)", () => {
  assert.equal(pickFlagshipSignal([]), null);
});

test("AC5 — home SaaS non e-commerce → aucun lien produit ([])", () => {
  assert.deepEqual(extractProductLinks(saasHome, "https://flowbase.com"), []);
});

test("finding — slugs de collection (/shop/sale, /shop/mens…) exclus, seul le vrai SKU reste", () => {
  const links = extractProductLinks(homeWithCollectionLinks, BASE);
  assert.deepEqual(links, ["https://acme-store.com/shop/aurora-serum"]);
  assert.ok(!links.some((l) => /\/(sale|new|mens|best-sellers)\b/.test(l)));
});

// --- buildProductJsonLdFix ---------------------------------------------------

test("AC2/AC3 — buildProductJsonLdFix : JSON parsable, brand=marque, price=valeur brute", () => {
  const signal: ProductSignal = {
    name: "Cloud Sneaker",
    url: `${BASE}/products/cloud-sneaker`,
    priceAmount: "119.00",
    priceCurrency: "GBP",
    hasProductJsonLd: false,
  };
  const parsed = JSON.parse(buildProductJsonLdFix(signal, "Acme"));
  assert.equal(parsed["@context"], "https://schema.org");
  assert.equal(parsed["@type"], "Product");
  assert.equal(parsed.name, "Cloud Sneaker");
  assert.equal(parsed.brand.name, "Acme");
  assert.equal(parsed.offers.price, "119.00"); // valeur brute, non arrondie
  assert.equal(parsed.offers.priceCurrency, "GBP");
});

test("AC2 — buildProductJsonLdFix : name vide → repli sur le nom de marque", () => {
  const signal: ProductSignal = { name: "", url: `${BASE}/products/x`, hasProductJsonLd: false };
  const parsed = JSON.parse(buildProductJsonLdFix(signal, "Acme"));
  assert.equal(parsed.name, "Acme");
});

// --- finding : name JSON-LD absent + page sans titre → repli url (jamais vide) ---

test("finding — Product sans name + page sans og:title/title → name = url (AC1, jamais vide)", () => {
  const signal = parseProductPage(jsonLdNoNameNoTitle, `${BASE}/products/no-name`);
  assert.equal(signal.hasProductJsonLd, true);
  assert.equal(signal.name, `${BASE}/products/no-name`);
  assert.notEqual(signal.name, "");
});

// --- finding : correctif sûr à coller dans <script> (échappement < > &) -------

test("finding — buildProductJsonLdFix échappe </script> : aucun < > & littéral, reparse à l'identique", () => {
  const hostileName = 'Cool Shoes</script><img src=x onerror=alert(1)> & more';
  const signal: ProductSignal = { name: hostileName, url: `${BASE}/products/x`, hasProductJsonLd: false };
  const fix = buildProductJsonLdFix(signal, "Acme");
  // Aucun caractère qui pourrait fermer/ouvrir une balise ou une entité une fois collé.
  assert.ok(!fix.includes("<"));
  assert.ok(!fix.includes(">"));
  assert.ok(!fix.includes("&"));
  assert.ok(!fix.toLowerCase().includes("</script>"));
  // Le JSON reste valide et reparse EXACTEMENT au nom d'origine (échappement \\uXXXX réversible).
  assert.equal(JSON.parse(fix).name, hostileName);
});
