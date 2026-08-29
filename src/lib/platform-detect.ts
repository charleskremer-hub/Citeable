/**
 * Détection de la plateforme e-commerce depuis le HTML DÉJÀ récupéré au crawl.
 *
 * Ce module est PUR : aucune requête réseau, aucune dépendance. Il est appelé
 * au moment de l'audit (là où le HTML de la page d'accueil existe déjà) et son
 * résultat est PERSISTÉ dans `raw_results.platform` — le rendu du rapport ne
 * re-crawle jamais.
 *
 * Règle de doute (arbitrage Charles, 28/08/2026) : en cas d'ambiguïté — aucun
 * signal, ou signaux de DEUX plateformes différentes — on rend "inconnu" et la
 * page affiche le guide générique. Un pas-à-pas Shopify affiché à un site
 * WooCommerce détruit plus de confiance qu'une absence de guide.
 */

export type DetectedPlatform =
  | "shopify"
  | "woocommerce"
  | "wix"
  | "squarespace"
  | "prestashop"
  | "inconnu";

export const KNOWN_PLATFORMS = [
  "shopify",
  "woocommerce",
  "wix",
  "squarespace",
  "prestashop",
] as const satisfies readonly Exclude<DetectedPlatform, "inconnu">[];

/** Balise <meta name="generator" content="…">, les deux ordres d'attributs. */
function generatorContents(html: string): string[] {
  const values: string[] = [];
  for (const match of html.matchAll(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/gi)) {
    values.push(match[1]);
  }
  for (const match of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["']/gi)) {
    values.push(match[1]);
  }
  return values.map((value) => value.toLowerCase());
}

/**
 * Chaque plateforme est reconnue par des signaux FORTS et distinctifs :
 * la balise generator qu'elle émet elle-même, ou des chemins d'assets que seul
 * son runtime produit. Pas de signal faible (un lien vers shopify.com dans un
 * article de blog ne doit pas classer le site).
 */
const ASSET_SIGNALS: Record<(typeof KNOWN_PLATFORMS)[number], RegExp[]> = {
  shopify: [/cdn\.shopify\.com/i, /\.myshopify\.com/i, /Shopify\.theme\s*=/i, /\/cdn\/shop\//i],
  woocommerce: [/wp-content\/plugins\/woocommerce\//i, /\bwoocommerce-page\b/i],
  wix: [/static\.parastorage\.com/i, /static\.wixstatic\.com/i],
  squarespace: [/images\.squarespace-cdn\.com/i, /assets\.squarespace\.com/i],
  prestashop: [/var\s+prestashop\s*=/i, /\bjs\/jquery\/plugins\/prestashop\b/i],
};

const GENERATOR_SIGNALS: Record<(typeof KNOWN_PLATFORMS)[number], RegExp> = {
  shopify: /shopify/,
  woocommerce: /woocommerce/,
  wix: /wix\.com/,
  squarespace: /squarespace/,
  prestashop: /prestashop/,
};

export function detectPlatform(html: string | null | undefined): DetectedPlatform {
  if (!html || !html.trim()) return "inconnu";

  const generators = generatorContents(html);
  const matched = KNOWN_PLATFORMS.filter((platform) => {
    if (generators.some((value) => GENERATOR_SIGNALS[platform].test(value))) return true;
    return ASSET_SIGNALS[platform].some((signal) => signal.test(html));
  });

  // Exactement UN candidat, sinon le doute l'emporte.
  return matched.length === 1 ? matched[0] : "inconnu";
}
