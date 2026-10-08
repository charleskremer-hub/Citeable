import type { Metadata } from "next";
import { pool } from "@/lib/db";
import { isLawCategory, localeFromUnknown } from "@/lib/i18n";

/**
 * Titre propre au rapport (bug 01/10/2026, audit 9591fb6e) : la page héritait du
 * titre du layout, résolu sur la langue du NAVIGATEUR — un rapport français
 * d'avocats s'affichait dans l'onglet « GetPick — The agent that gets
 * accountants recommended by AI ». Le titre suit désormais la langue du RAPPORT
 * et nomme le cabinet. Un rapport est une page privée de lead : noindex.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const robots = { index: false, follow: false };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { title: "GetPick", robots };
  try {
    // Pas de migration ici : lecture seule, la page s'en charge (bug 01/10).
    const row = (await pool.query<{ brand_name: string; locale: string | null; category: string | null }>(`SELECT brand_name, raw_results->>'locale' AS locale, raw_results->>'category' AS category FROM audits WHERE id = $1`, [id])).rows[0];
    if (!row) return { title: "GetPick", robots };
    const fr = localeFromUnknown(row.locale ?? "fr") === "fr";
    if (fr && isLawCategory(row.category)) {
      return {
        title: `${row.brand_name} — votre visibilité dans l'IA · GetPick`,
        description: `Ce que Gemini et ChatGPT répondent à vos futurs clients, et quels confrères ils citent à la place de ${row.brand_name}.`,
        robots,
      };
    }
    return {
      title: fr ? `${row.brand_name} — ta visibilité dans l'IA · GetPick` : `${row.brand_name} — your AI visibility · GetPick`,
      description: fr
        ? `Ce que Gemini et ChatGPT répondent à tes futurs clients, et quels confrères ils citent à la place de ${row.brand_name}.`
        : `What Gemini and ChatGPT tell your future clients, and which peers they name instead of ${row.brand_name}.`,
      robots,
    };
  } catch {
    return { title: "GetPick", robots };
  }
}

