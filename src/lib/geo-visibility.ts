/**
 * Visibilité GEO vs concurrents — le cœur autonome du tableau de bord.
 *
 * 100 % mesuré par l'audit, AUCUNE intervention humaine : sur les vraies
 * questions d'achat du métier, qui l'IA cite-t-elle ? Deux vues :
 *   - GÉNÉRAL : part de voix du client vs les principaux concurrents (combien de
 *     questions chacun rafle), et le rang du client ;
 *   - PAR PROMPT : pour chaque question, qui est cité (toi + confrères).
 *
 * Fonction PURE : aucun accès base ni réseau. Testable par `node --test`.
 */

import type { BuyerIntentPromptResult } from "@/lib/audit-engine";
import type { Locale } from "@/lib/i18n";

export type VisibilityPlayer = {
  name: string;
  isBrand: boolean;
  citedCount: number;
  rate: number; // 0..1 sur les questions disponibles
};

export type VisibilityPromptRow = {
  prompt: string;
  brandCited: boolean;
  competitorsCited: string[];
};

export type GeoVisibility = {
  totalPrompts: number;
  brand: VisibilityPlayer;
  competitors: VisibilityPlayer[]; // principaux concurrents, triés par citations décroissantes
  players: VisibilityPlayer[];     // brand + concurrents, triés (pour le classement/part de voix)
  brandRank: number;               // 1 = le plus cité
  playerCount: number;
  byPrompt: VisibilityPromptRow[];
  headline: string;
};

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = (raw ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * @param topCompetitors nombre de concurrents principaux à retenir (défaut 6).
 */
export function computeGeoVisibility(
  prompts: BuyerIntentPromptResult[],
  brandName: string,
  locale: Locale = "fr",
  topCompetitors = 6,
): GeoVisibility {
  const available = prompts.filter((prompt) => prompt.available);
  const total = available.length;

  const brandCited = available.filter((prompt) => prompt.brandMentioned).length;

  // Comptage des concurrents : une question compte une fois par concurrent nommé.
  const counts = new Map<string, number>();
  for (const prompt of available) {
    for (const name of uniqueNames(prompt.competitors)) {
      // ne jamais compter le client comme son propre concurrent
      if (name.toLowerCase() === brandName.trim().toLowerCase()) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  const rate = (n: number) => (total > 0 ? n / total : 0);

  const allCompetitors: VisibilityPlayer[] = [...counts.entries()]
    .map(([name, citedCount]) => ({ name, isBrand: false, citedCount, rate: rate(citedCount) }))
    .sort((a, b) => b.citedCount - a.citedCount || a.name.localeCompare(b.name));

  const brand: VisibilityPlayer = { name: brandName, isBrand: true, citedCount: brandCited, rate: rate(brandCited) };

  // Rang du client parmi TOUS les acteurs (client + tous les concurrents).
  const brandRank = 1 + allCompetitors.filter((competitor) => competitor.citedCount > brandCited).length;
  const playerCount = allCompetitors.length + 1;

  const competitors = allCompetitors.slice(0, topCompetitors);
  const players = [brand, ...allCompetitors].sort(
    (a, b) => b.citedCount - a.citedCount || (a.isBrand ? -1 : b.isBrand ? 1 : a.name.localeCompare(b.name)),
  );

  const byPrompt: VisibilityPromptRow[] = available.map((prompt) => ({
    prompt: prompt.prompt,
    brandCited: prompt.brandMentioned,
    competitorsCited: uniqueNames(prompt.competitors).filter((name) => name.toLowerCase() !== brandName.trim().toLowerCase()),
  }));

  return {
    totalPrompts: total,
    brand,
    competitors,
    players,
    brandRank,
    playerCount,
    byPrompt,
    headline: headlineFor(brandName, brand, allCompetitors, total, brandRank, playerCount, locale),
  };
}

function headlineFor(
  brandName: string,
  brand: VisibilityPlayer,
  allCompetitors: VisibilityPlayer[],
  total: number,
  brandRank: number,
  playerCount: number,
  locale: Locale,
): string {
  const fr = locale === "fr";
  const leader = allCompetitors[0] ?? null;

  if (total === 0) {
    return fr ? "Aucune question d'achat mesurée pour l'instant." : "No buyer questions measured yet.";
  }
  if (brand.citedCount === 0) {
    return leader
      ? (fr
        ? `Sur tes ${total} questions d'achat, l'IA ne te cite jamais — elle cite surtout ${leader.name} (${leader.citedCount}/${total}).`
        : `On your ${total} buyer questions, AI never cites you — it mostly cites ${leader.name} (${leader.citedCount}/${total}).`)
      : (fr
        ? `Sur tes ${total} questions d'achat, l'IA ne cite encore personne clairement — la place est à prendre.`
        : `On your ${total} buyer questions, AI cites no one clearly yet — the spot is open.`);
  }
  if (brandRank === 1) {
    return fr
      ? `Tu es le nom le plus cité par l'IA sur tes questions d'achat (${brand.citedCount}/${total}).`
      : `You are the name AI cites most on your buyer questions (${brand.citedCount}/${total}).`;
  }
  return fr
    ? `L'IA te cite sur ${brand.citedCount}/${total} questions — rang ${brandRank}/${playerCount}${leader ? `, derrière ${leader.name}` : ""}.`
    : `AI cites you on ${brand.citedCount}/${total} questions — rank ${brandRank}/${playerCount}${leader ? `, behind ${leader.name}` : ""}.`;
}
