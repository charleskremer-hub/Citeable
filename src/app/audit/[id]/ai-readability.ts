/**
 * « TON SITE, LISIBLE PAR LES IA » (demande Charles 01/10/2026).
 *
 * Le rapport montrait qui l'IA cite, pas POURQUOI elle ne lit pas bien le site
 * du cabinet. Ce bloc rend visible la couche machine, mesurée en direct sur SON
 * site — et ce que GetPick y pose.
 *
 * Volontairement absent : `ai-catalog.json`. C'est un brouillon (Linux
 * Foundation, A2A/MCP) pour découvrir des ARTEFACTS d'agents — serveurs MCP,
 * agent cards — pas pour qu'un cabinet décrive son activité. Le promettre ici
 * serait vendre un fichier sans effet sur une citation.
 *
 * Honnêteté : `measured: null` = non mesuré (site injoignable) — jamais un faux ✗.
 */
export type AiReadabilityItem = {
  key: "llms_txt" | "structured_data" | "ai_crawlers";
  label: string;
  /** true = en place, false = absent/bloqué, null = non mesuré. */
  measured: boolean | null;
  why: string;
  getpick: string;
};

export function aiReadabilityItems(
  input: { llmsFound: boolean | null; structuredDataFound: boolean | null; crawlState: "ok" | "blocked" | "unreachable" | null; blocked: string[] },
  locale: "fr" | "en",
  /** Avocats (08/10) : vouvoiement, et publication après validation. */
  vous = false
): AiReadabilityItem[] {
  const fr = locale === "fr";
  const unreachable = input.crawlState === "unreachable" || input.crawlState === null;
  return [
    {
      key: "llms_txt",
      label: "llms.txt",
      measured: unreachable ? null : input.llmsFound,
      why: fr ? (vous ? "La fiche que ChatGPT, Gemini et Perplexity lisent pour savoir qui vous êtes, ce que vous faites et pour qui." : "La fiche que ChatGPT, Gemini et Perplexity lisent pour savoir qui tu es, ce que tu fais et pour qui.") : "The file ChatGPT, Gemini and Perplexity read to learn who you are, what you do and for whom.",
      getpick: fr ? (vous ? "GetPick l'écrit depuis les faits de votre site et le tient à jour." : "GetPick l'écrit depuis les faits de ton site et le tient à jour.") : "GetPick writes it from your site's facts and keeps it current.",
    },
    {
      key: "structured_data",
      label: fr ? "Données structurées (JSON-LD)" : "Structured data (JSON-LD)",
      measured: input.structuredDataFound,
      why: fr ? (vous ? "Votre métier, votre ville, vos domaines et les réponses à vos clients, dans le format que les moteurs extraient sans deviner." : "Ton métier, ta ville, tes domaines et les réponses à tes clients, dans le format que les moteurs extraient sans deviner.") : "Your trade, city, practice areas and client answers, in the format engines extract without guessing.",
      getpick: fr ? (vous ? "GetPick les intègre à la page de réponses, que vous relisez et publiez sur votre site (WordPress : en un clic)." : "GetPick les publie sur ton site avec la page de réponses (WordPress : en un clic).") : "GetPick publishes them on your site with the answers page (WordPress: one click).",
    },
    {
      key: "ai_crawlers",
      label: fr ? "Accès des robots IA" : "AI crawler access",
      measured: unreachable ? null : input.crawlState === "ok",
      why:
        input.crawlState === "blocked" && input.blocked.length
          ? fr ? (vous ? `Votre robots.txt bloque : ${input.blocked.join(", ")}. Ces IA ne peuvent pas lire votre site.` : `Ton robots.txt bloque : ${input.blocked.join(", ")}. Ces IA ne peuvent pas lire ton site.`) : `Your robots.txt blocks: ${input.blocked.join(", ")}. These AIs cannot read your site.`
          : fr ? (vous ? "GPTBot, ClaudeBot, PerplexityBot et Google-Extended doivent pouvoir lire votre site." : "GPTBot, ClaudeBot, PerplexityBot et Google-Extended doivent pouvoir lire ton site.") : "GPTBot, ClaudeBot, PerplexityBot and Google-Extended must be able to read your site.",
      getpick: fr ? (vous ? "GetPick vérifie l'accès à chaque passage et vous signale tout blocage." : "GetPick vérifie l'accès à chaque passage et te signale tout blocage.") : "GetPick checks access on every pass and flags any block.",
    },
  ];
}

export function aiReadabilityScore(items: AiReadabilityItem[]): { ok: number; measured: number } {
  const measured = items.filter((item) => item.measured !== null);
  return { ok: measured.filter((item) => item.measured === true).length, measured: measured.length };
}
