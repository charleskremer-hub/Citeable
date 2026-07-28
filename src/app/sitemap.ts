import type { MetadataRoute } from "next";
import { answerPages } from "@/lib/answer-pages";

// CANONIQUE = www tant que l'apex getpick.ai n'est pas déclaré dans le projet
// Vercel (son certificat SSL ne le couvre pas, il refuse les connexions).
// Voir le commentaire détaillé dans src/app/robots.ts.
const siteUrl = "https://www.getpick.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/fr`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${siteUrl}/en`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      // Étude de données propriétaires : c'est le contenu le plus susceptible
      // d'être cité par les moteurs IA et de générer des liens entrants.
      url: `${siteUrl}/study`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.9,
    },
    {
      // Page comparative citable « GetPick vs les outils GEO nommés » : c'est là
      // que l'acheteur et les LLM comparent réellement (les listicles), pas
      // seulement sur la home.
      url: `${siteUrl}/vs`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.85,
    },
    {
      url: `${siteUrl}/fr/vs`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.85,
    },
    {
      // Citée dans le pied de chaque email sortant : elle doit être atteignable
      // et indexable, sans concurrencer les pages produit (priorité basse).
      url: `${siteUrl}/prospection`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    ...answerPages.map((page) => ({
      url: `${siteUrl}/${page.locale}/${page.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.72,
    })),
  ];
}
