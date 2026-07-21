import type { MetadataRoute } from "next";

// CANONIQUE = www, volontairement (21/07/2026).
// L'apex getpick.ai résout bien vers Vercel mais n'est PAS déclaré dans le projet :
// le certificat SSL ne couvre que www, donc l'apex refuse toutes les connexions.
// Déclarer aux crawlers IA une URL qui ne répond pas nous coûtait notre propre
// lisibilité (score dogfood tombé de 61 à 34). On déclare donc l'URL qui sert.
// Quand l'apex sera ajouté au projet Vercel, repasser ces constantes sur
// https://getpick.ai (voir RENAME_WHOPICKS.md / PRODUCT_BACKLOG.md).
const BASE_URL = "https://www.getpick.ai";

/**
 * robots.txt servi par Next.
 *
 * Avant ce fichier, le domaine ne renvoyait que le boilerplate "content signals"
 * injecté par Cloudflare : aucune directive, aucune référence au sitemap. Pour un
 * produit qui vend de la visibilité IA, laisser les crawlers IA sans autorisation
 * explicite et sans sitemap était une incohérence coûteuse.
 *
 * On autorise donc explicitement les crawlers des moteurs IA (ce sont eux qui
 * alimentent les réponses où nos clients veulent être cités) et on déclare le
 * sitemap.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: "/" })),
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
