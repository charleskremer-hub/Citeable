import type { MetadataRoute } from "next";

const BASE_URL = "https://getciteable.nanocorp.app";

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
