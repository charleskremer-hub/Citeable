// Diagnostic produit shopping IA : détection du SKU phare + balisage Product +
// correctif JSON-LD prêt à coller. Volontairement PAGE-ONLY et ADDITIF :
//
//   • Aucune donnée ne rentre dans `checks`/`computeScore` (zéro impact scoring).
//   • Muet sans signal : `detectProductShopping` rend `null` s'il n'y a aucune
//     page produit détectable — on n'invente jamais de verdict (même discipline
//     que `categoryPerception`/`youtubeTip`).
//   • Prix JAMAIS inventé ni arrondi : on reprend la string brute détectée sur la
//     page (JSON-LD `offers.price` ou meta og:/product: price). Aucun `Number()`.
//
// Module auto-suffisant (ses propres helpers regex) pour ne pas dépendre des
// internes privés d'`audit-engine.ts`.

const USER_AGENT = "Mozilla/5.0 (compatible; CiteeableBot/1.0)";
const FETCH_TIMEOUT_MS = 8_000;
const MAX_PRODUCT_CANDIDATES = 3;

/** Signal produit brut extrait d'une page (prix/devise/dispo repris tels quels). */
export type ProductSignal = {
  name: string;
  url: string;
  priceAmount?: string;
  priceCurrency?: string;
  availability?: string;
  hasProductJsonLd: boolean;
};

/** Résultat du diagnostic produit, stocké hors `checks` dans `raw_results`. */
export type ProductShopping = {
  sku: { name: string; url: string };
  markup: "present" | "absent";
  /** Correctif JSON-LD `Product` (JSON brut, sans balise <script>) — présent uniquement quand le balisage est absent. */
  fixJsonLd?: string;
};

// --- Helpers regex purs ------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Contenu d'une balise <meta> par attribut clé (property/name/itemprop), les deux ordres d'attributs gérés. */
function metaContent(html: string, key: "property" | "name" | "itemprop", value: string): string | undefined {
  const v = escapeRegExp(value);
  const forward = html.match(new RegExp(`<meta[^>]+${key}=["']${v}["'][^>]+content=["']([^"']*)["']`, "i"))?.[1];
  if (forward !== undefined) return forward;
  return html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${key}=["']${v}["']`, "i"))?.[1];
}

/** `@type` d'un noeud JSON-LD normalisé en chaîne (gère string ET tableau). */
function jsonLdType(record: Record<string, unknown>): string {
  const type = record["@type"];
  if (Array.isArray(type)) return type.join(" ");
  return typeof type === "string" ? type : "";
}

/** Retire un éventuel wrapper CDATA autour du contenu d'un <script>. */
function stripCdata(raw: string): string {
  return raw.replace(/^\s*<!\[CDATA\[/i, "").replace(/\]\]>\s*$/i, "").trim();
}

/** Borne anti-boucle sur un JSON-LD pathologiquement profond/large (jamais un vrai PDP). */
const MAX_JSONLD_NODES = 2_000;

/**
 * Cherche le premier noeud JSON-LD dont `@type` contient `Product`.
 * Descente GÉNÉRIQUE (BFS) dans toute la structure : `@graph`, mais aussi les
 * objets imbriqués arbitraires — `WebPage.mainEntity`, `ItemList.itemListElement[].item`,
 * etc. (patterns Google courants). Un bloc JSON malformé est ignoré silencieusement
 * (jamais de crash — traité comme « pas de Product »).
 */
function findProductNode(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripCdata(match[1] ?? ""));
    } catch {
      continue; // JSON-LD malformé → on n'en tient pas compte
    }

    const stack: unknown[] = [parsed];
    let visited = 0;
    while (stack.length && visited < MAX_JSONLD_NODES) {
      const item = stack.shift();
      visited += 1;
      if (!item || typeof item !== "object") continue;
      if (Array.isArray(item)) {
        stack.push(...item);
        continue;
      }
      const record = item as Record<string, unknown>;
      if (/product/i.test(jsonLdType(record))) return record;
      // Descente dans toutes les valeurs objet/tableau (couvre @graph, mainEntity,
      // itemListElement[].item…) sans énumérer chaque clé au cas par cas.
      for (const value of Object.values(record)) {
        if (value && typeof value === "object") stack.push(value);
      }
    }
  }
  return null;
}

/** Premier objet `offers` (gère l'objet unique ET le tableau d'offres). */
function firstOffer(record: Record<string, unknown>): Record<string, unknown> | null {
  const offers = record["offers"];
  if (Array.isArray(offers)) {
    const found = offers.find((offer) => offer && typeof offer === "object");
    return (found as Record<string, unknown> | undefined) ?? null;
  }
  if (offers && typeof offers === "object") return offers as Record<string, unknown>;
  return null;
}

/**
 * Reprend une valeur de prix telle quelle : string → verbatim (jamais arrondie),
 * number → `String()` sans reformatage. Vide/absent → undefined. AUCUN arrondi.
 */
function rawScalar(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Titre lisible en repli : og:title puis <title>. */
function fallbackName(html: string): string {
  const og = metaContent(html, "property", "og:title") ?? metaContent(html, "name", "og:title");
  if (og && og.trim()) return og.trim();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return (title ?? "").replace(/\s+/g, " ").trim();
}

// --- Fonctions publiques pures ----------------------------------------------

/**
 * Segments qui matchent la forme `/products?|shop|p/<slug>` mais désignent une
 * page utilitaire (panier, compte, recherche, carte cadeau…) OU une page de
 * collection/catégorie/navigation (sale, new, all, mens…), jamais un SKU phare.
 * Exclus des candidats pour ne pas générer un correctif sur une page non-produit
 * (finding review : `/shop/cart`, `/products/gift-card`, `/shop/sale`…).
 */
const UTILITY_SEGMENTS = new Set([
  "cart", "carts", "checkout", "checkouts", "basket", "bag",
  "account", "accounts", "login", "logout", "signin", "sign-in",
  "register", "signup", "sign-up", "wishlist", "wishlists",
  "search", "orders", "order", "returns", "return",
  "gift-card", "gift-cards", "giftcard", "giftcards",
  "contact", "about", "faq", "terms", "privacy", "policies", "policy",
  // Collections / catégories / navigation : matchent `/shop/<slug>` ou `/p/<slug>`
  // mais n'ont pas de JSON-LD Product → conduiraient à un faux « SKU phare = sale »
  // et à un correctif Product collé sur une page de collection.
  "sale", "sales", "clearance", "new", "news", "new-arrivals", "newin", "new-in",
  "all", "all-products", "shop", "shop-all", "products", "product",
  "collection", "collections", "catalog", "catalogue", "category", "categories",
  "men", "mens", "women", "womens", "kids", "unisex",
  "best-sellers", "bestsellers", "best-seller", "featured", "trending", "popular",
  "gifts", "gift", "brands", "brand", "home", "index",
]);

/**
 * Extrait les URLs de pages produit candidates depuis la home.
 * Ne retient que les liens de forme `/product(s)/<slug>`, `/shop/<slug>` ou
 * `/p/<slug>` (un segment unitaire après le préfixe → évite les liens de
 * navigation/collection), écarte les slugs utilitaires (panier/compte/recherche…
 * via UTILITY_SEGMENTS), résout en absolu, borne le même hôte (apex ↔ www),
 * dédoublonne et plafonne à MAX_PRODUCT_CANDIDATES. `[]` si aucun signal.
 */
export function extractProductLinks(homepageHtml: string, baseUrl: string): string[] {
  const baseHost = (() => {
    try {
      return new URL(baseUrl).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      return null;
    }
  })();

  // Capture le 1er segment après le préfixe pour filtrer les pages utilitaires.
  const productPath = /\/(?:products?|shop|p)\/([^/?#"'\s]+)/i;
  const seen = new Set<string>();
  const links: string[] = [];

  for (const match of homepageHtml.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const href = match[1];
    if (!href) continue;
    const slugMatch = productPath.exec(href);
    if (!slugMatch) continue;
    let slug = slugMatch[1].toLowerCase();
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* slug %-encodé invalide → on garde la forme brute */
    }
    if (UTILITY_SEGMENTS.has(slug)) continue;

    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    if (baseHost && resolved.hostname.replace(/^www\./i, "").toLowerCase() !== baseHost) continue;

    const normalized = resolved.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    links.push(normalized);
    if (links.length >= MAX_PRODUCT_CANDIDATES) break;
  }

  return links;
}

/**
 * Parse une page produit et retourne son signal brut.
 * Priorité au JSON-LD `Product` (name + offers.price/priceCurrency/availability
 * repris tels quels). À défaut, prix via og:price / product:price puis
 * <meta itemprop="price">. Prix JAMAIS inventé ni arrondi (AC3).
 */
export function parseProductPage(html: string, url: string): ProductSignal {
  const productNode = findProductNode(html);

  if (productNode) {
    const offer = firstOffer(productNode);
    return {
      // fallbackName rend une chaîne VIDE (pas undefined) sans og:title ni <title> ;
      // `|| url` garantit donc un nom non vide (AC1 : au moins 1 SKU avec son nom).
      name: rawScalar(productNode["name"]) ?? (fallbackName(html) || url),
      url,
      priceAmount: offer ? rawScalar(offer["price"]) : undefined,
      priceCurrency: offer ? rawScalar(offer["priceCurrency"]) : undefined,
      availability: offer ? rawScalar(offer["availability"]) : undefined,
      hasProductJsonLd: true,
    };
  }

  const priceAmount =
    metaContent(html, "property", "og:price:amount") ??
    metaContent(html, "property", "product:price:amount") ??
    metaContent(html, "name", "og:price:amount") ??
    metaContent(html, "itemprop", "price");
  const priceCurrency =
    metaContent(html, "property", "og:price:currency") ??
    metaContent(html, "property", "product:price:currency") ??
    metaContent(html, "name", "og:price:currency") ??
    metaContent(html, "itemprop", "priceCurrency");

  return {
    name: fallbackName(html) || url,
    url,
    priceAmount: priceAmount && priceAmount.trim() ? priceAmount.trim() : undefined,
    priceCurrency: priceCurrency && priceCurrency.trim() ? priceCurrency.trim() : undefined,
    availability: undefined,
    hasProductJsonLd: false,
  };
}

/**
 * Construit le correctif JSON-LD `Product` prêt à coller (JSON brut, sans
 * balise <script> — l'enrobage se fait côté rendu). `price`/`priceCurrency` ne
 * sont insérés QUE s'ils ont été détectés (jamais inventés). `availability`
 * retombe sur `InStock` (défaut neutre, éditable par l'utilisateur).
 */
export function buildProductJsonLdFix(signal: ProductSignal, brandName: string): string {
  const offers: Record<string, unknown> = { "@type": "Offer" };
  if (signal.priceAmount) offers.price = signal.priceAmount;
  if (signal.priceCurrency) offers.priceCurrency = signal.priceCurrency;
  offers.availability = signal.availability ?? "https://schema.org/InStock";

  const json = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: signal.name || brandName,
      brand: { "@type": "Brand", name: brandName },
      offers,
    },
    null,
    2
  );

  // Le correctif est destiné à être collé DANS <script type="application/ld+json">…</script>.
  // JSON.stringify n'échappe ni `<` ni `>` ni `&` : un nom contenant `</script>` (repris tel
  // quel de la page du fondateur) fermerait la balise prématurément et injecterait du markup.
  // On échappe en \uXXXX — JSON reste valide et reparse à la même chaîne (reco Google : < > &).
  return escapeForScriptTag(json);
}

/** Rend un JSON sûr à insérer dans <script> : échappe `<`, `>`, `&` en \uXXXX (JSON reste valide). */
function escapeForScriptTag(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

// --- Orchestrateur async fin -------------------------------------------------

function normalizeUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null; // échec réseau → jamais de throw (ne doit pas casser le run)
  }
}

/**
 * Choisit le SKU phare parmi les signaux joignables. Le verdict dépend de la
 * COUVERTURE réelle du markup, jamais de l'ordre des liens dans le HTML : un SKU
 * correctement balisé (`hasProductJsonLd`) prime sur tout candidat non balisé.
 * À défaut de tout markup, on retient le premier candidat joignable (dans l'ordre
 * des liens) et on rend `markup: "absent"` + correctif. `null` si liste vide.
 */
export function pickFlagshipSignal(signals: ProductSignal[]): ProductSignal | null {
  if (signals.length === 0) return null;
  return signals.find((signal) => signal.hasProductJsonLd) ?? signals[0];
}

/**
 * Détecte le SKU phare + son balisage depuis le site (home + pages produit
 * joignables). Rend `null` si aucune page produit détectable ou injoignable
 * (discipline « muet sans signal » — AC4). Ne throw jamais (AC5).
 *
 * `homepageHtml` optionnel : quand la home a déjà été téléchargée en amont (ex.
 * `inferCategory`), on la réutilise → zéro fetch home redondant sur le chemin
 * critique de l'audit. Absent/vide → fetch de repli (module auto-suffisant).
 * Les pages produit candidates sont récupérées en PARALLÈLE : la latence est
 * bornée par un seul timeout, quel que soit le nombre de candidats.
 */
export async function detectProductShopping(
  websiteUrl: string,
  brandName: string,
  homepageHtml?: string | null
): Promise<ProductShopping | null> {
  const homeUrl = normalizeUrl(websiteUrl);
  const homeHtml = homepageHtml && homepageHtml.trim() ? homepageHtml : await fetchHtml(homeUrl);
  if (!homeHtml) return null;

  const candidates = extractProductLinks(homeHtml, homeUrl);
  if (candidates.length === 0) return null; // non e-commerce / aucun SKU → muet, zéro fetch produit

  const pages = await Promise.all(candidates.map((candidate) => fetchHtml(candidate)));
  const signals = candidates
    .map((candidate, index) => ({ candidate, html: pages[index] }))
    .filter((entry): entry is { candidate: string; html: string } => entry.html !== null)
    .map((entry) => parseProductPage(entry.html, entry.candidate));

  const flagship = pickFlagshipSignal(signals);
  if (!flagship) return null; // aucun candidat joignable

  const markup: "present" | "absent" = flagship.hasProductJsonLd ? "present" : "absent";
  return {
    sku: { name: flagship.name, url: flagship.url },
    markup,
    fixJsonLd: markup === "absent" ? buildProductJsonLdFix(flagship, brandName) : undefined,
  };
}
