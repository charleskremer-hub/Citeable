import type { MetadataRoute } from "next";
import { answerPages } from "@/lib/answer-pages";

const siteUrl = "https://getpick.ai";

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
    ...answerPages.map((page) => ({
      url: `${siteUrl}/${page.locale}/${page.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.72,
    })),
  ];
}
