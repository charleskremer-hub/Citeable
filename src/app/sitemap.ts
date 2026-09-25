import type { MetadataRoute } from "next";
import { answerPages } from "@/lib/answer-pages";
import { ensureAuditSchema, pool } from "@/lib/db";
import { hostedAnswerPageSlug } from "@/lib/hosted-answer-page";

// CANONIQUE = www tant que l'apex getpick.ai n'est pas déclaré dans le projet
// Vercel (son certificat SSL ne le couvre pas, il refuse les connexions).
// Voir le commentaire détaillé dans src/app/robots.ts.
const siteUrl = "https://www.getpick.ai";

// Pages-réponses PUBLIÉES uniquement (answer_page_published_at non nul). Les
// diagnostics anonymes ne sont jamais listés. La base peut être indisponible au
// build : on dégrade en liste vide plutôt que de casser tout le sitemap.
async function publishedHostedAnswerPages(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    await ensureAuditSchema();
    const result = await pool.query<{ id: string; brand_name: string; answer_page_published_at: string }>(
      `SELECT id, brand_name, answer_page_published_at
       FROM audits
       WHERE answer_page_published_at IS NOT NULL AND score IS NOT NULL
       ORDER BY answer_page_published_at DESC
       LIMIT 5000`
    );
    return result.rows.map((row) => ({
      url: `${siteUrl}/reponses/${hostedAnswerPageSlug(row.brand_name, row.id)}`,
      lastModified: row.answer_page_published_at ? new Date(row.answer_page_published_at) : now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const hostedPages = await publishedHostedAnswerPages(now);

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
    ...hostedPages,
  ];
}
