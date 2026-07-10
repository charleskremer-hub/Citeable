import type { MetadataRoute } from "next";
import { answerPages } from "@/lib/answer-pages";

const siteUrl = "https://getciteable.nanocorp.app";

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
    ...answerPages.map((page) => ({
      url: `${siteUrl}/${page.locale}/${page.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.72,
    })),
  ];
}
