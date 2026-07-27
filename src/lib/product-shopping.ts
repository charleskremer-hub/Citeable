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

/**
 * Cherche le premier noeud JSON-LD dont `@type` contient `Product`.
 * Gère les tableaux et `@graph`. Un bloc JSON malformé est ignoré silencieusement
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

    const stack: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (stack.length) {
      const item = stack.shift();
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;

      if (Array.isArray(record["@graph"])) stack.push(...(record["@graph"] as unknown[]));
      if (/product/i.test(jsonLdType(record))) return record;
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
 * Extrait les URLs de pages produit candidates depuis la home.
 * Ne retient que les liens de forme `/product(s)/<slug>`, `/shop/<slug>` ou
 * `/p/<slug>` (un segment unitaire après le préfixe → évite les liens de
 * navigation/collection), résout en absolu, borne le même hôte (apex ↔ www),
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

  const productPath = /\/(?:products?|shop|p)\/[^/?#"'\s]+/i;
  const seen = new Set<string>();
  const links: string[] = [];

  for (const match of homepageHtml.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const href = match[1];
    if (!href || !productPath.test(href)) continue;

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
      name: rawScalar(productNode["name"]) ?? fallbackName(html) ?? url,
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

  return JSON.stringify(
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
 * Détecte le SKU phare + son balisage depuis le site (home + 1 page produit
 * joignable). Rend `null` si aucune page produit détectable ou injoignable
 * (discipline « muet sans signal » — AC4). Ne throw jamais (AC5).
 */
export async function detectProductShopping(websiteUrl: string, brandName: string): Promise<ProductShopping | null> {
  const homeUrl = normalizeUrl(websiteUrl);
  const homeHtml = await fetchHtml(homeUrl);
  if (!homeHtml) return null;

  const candidates = extractProductLinks(homeHtml, homeUrl);
  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    const productHtml = await fetchHtml(candidate);
    if (!productHtml) continue; // page injoignable → candidat suivant

    const signal = parseProductPage(productHtml, candidate);
    const markup: "present" | "absent" = signal.hasProductJsonLd ? "present" : "absent";

    return {
      sku: { name: signal.name, url: signal.url },
      markup,
      fixJsonLd: markup === "absent" ? buildProductJsonLdFix(signal, brandName) : undefined,
    };
  }

  return null; // aucun candidat joignable
}
