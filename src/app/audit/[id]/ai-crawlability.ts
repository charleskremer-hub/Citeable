// --- Lisibilité par les crawlers IA -----------------------------------------
// Si les bots des moteurs IA sont bloqués par robots.txt, la marque ne peut pas
// être citée, quel que soit son contenu. C'est le check le plus actionnable qui
// soit : binaire, vérifiable, et corrigeable en une ligne de robots.txt.
// Volontairement isolé de la page (aucun impact sur le scoring ni sur le
// pipeline d'audit) pour rester additif et sans risque pour le funnel.
// Extrait de page.tsx le 08/08/2026 (lot « verdict en trois blocs ») : la
// logique est inchangée, seul le fichier change.
import { fetchWithHostFallback } from "@/lib/audit-engine";

const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended"] as const;

type RobotsGroup = { agents: string[]; disallowAll: boolean };

function parseRobotsGroups(robots: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let previousLineWasAgent = false;

  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      // Des User-agent consécutifs partagent le même bloc de règles.
      if (!current || !previousLineWasAgent) {
        current = { agents: [], disallowAll: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      previousLineWasAgent = true;
      continue;
    }

    previousLineWasAgent = false;
    if (current && key === "disallow" && value === "/") current.disallowAll = true;
  }

  return groups;
}

function blockedAiCrawlers(robots: string) {
  const groups = parseRobotsGroups(robots);
  const wildcardBlocked = groups.some((group) => group.agents.includes("*") && group.disallowAll);

  return AI_CRAWLERS.filter((crawler) => {
    const named = groups.filter((group) => group.agents.includes(crawler.toLowerCase()));
    // Une règle nommée l'emporte toujours sur la règle générique "*".
    if (named.length) return named.some((group) => group.disallowAll);
    return wildcardBlocked;
  });
}

// Trois états distincts — c'est le cœur du correctif :
//  - "blocked"     : le site répond ET bloque explicitement un crawler IA (vrai négatif)
//  - "ok"          : le site répond et ne bloque personne
//  - "unreachable" : ni l'apex ni le www ne répondent (DNS/hébergement), PAS un blocage
export type AiCrawlState = "ok" | "blocked" | "unreachable";

export async function checkAiCrawlability(websiteUrl: string): Promise<{
  state: AiCrawlState;
  blocked: string[];
  llmsFound: boolean;
  resolvedHost: string | null;
}> {
  // fetchWithHostFallback bascule apex ↔ www sur échec réseau uniquement
  // (un 404 sur /llms.txt reste un 404, on ne retente pas l'autre hôte).
  const load = async (path: string) => {
    const target = new URL(path, websiteUrl).toString();
    const result = await fetchWithHostFallback(target);
    if (!result.response) return { text: null, reachable: false, host: null as string | null };
    const text = result.response.ok ? await result.response.text().catch(() => null) : null;
    return { text, reachable: true, host: result.host };
  };

  const [robots, llms] = await Promise.all([load("/robots.txt"), load("/llms.txt")]);

  // Aucune variante d'hôte n'a répondu sur aucun des deux fichiers : injoignable.
  if (!robots.reachable && !llms.reachable) {
    return { state: "unreachable", blocked: [], llmsFound: false, resolvedHost: null };
  }

  // Pas de robots.txt = tout est autorisé par défaut : ce n'est pas un blocage.
  const blocked = robots.text ? blockedAiCrawlers(robots.text) : [];

  return {
    state: blocked.length ? "blocked" : "ok",
    blocked,
    llmsFound: llms.text !== null,
    resolvedHost: robots.host ?? llms.host,
  };
}
