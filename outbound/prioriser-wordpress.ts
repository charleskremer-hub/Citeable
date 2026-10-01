/**
 * PRIORITÉ WORDPRESS DANS LA PROSPECTION (demande Charles 01/10/2026).
 *
 * Un cabinet sous WordPress connectable se branche en UN clic (mot de passe
 * d'application natif, WP ≥ 5.6) : GetPick publie alors lui-même la page de
 * réponses + le JSON-LD sur SON domaine. C'est le chemin où la promesse
 * « zéro geste technique » est vraie de bout en bout — donc celui qu'on
 * prospecte en premier.
 *
 * Même détection que le produit (`discoverSite`, src/lib/wp-connect.ts) : ce
 * que le script classe « WordPress 1 clic » est exactement ce que le bouton
 * « Connecter mon site » saura connecter.
 *
 * Usage :
 *   node --import ./scripts/test-loader.mjs outbound/prioriser-wordpress.ts outbound/AVOCATS_LOT1_2026-10-01.md
 * Lit les URLs du tableau « Prospects », détecte le CMS, réécrit le tableau
 * trié (WordPress 1 clic → WordPress verrouillé → Wix → autre → injoignable),
 * avec une colonne « Site ». Idempotent : la colonne est remplacée, pas dupliquée.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { discoverSite } from "@/lib/wp-connect";

export const CMS_RANK = { wordpress: 0, wordpress_locked: 1, wix: 2, other: 3, unreachable: 4 } as const;
export const CMS_LABEL = {
  wordpress: "WordPress · 1 clic",
  wordpress_locked: "WordPress · verrouillé",
  wix: "Wix",
  other: "Autre CMS",
  unreachable: "Injoignable",
} as const;
type Kind = keyof typeof CMS_RANK;

function domainOfRow(row: string): string | null {
  const url = row.match(/\]\((https?:\/\/[^)]+)\)/)?.[1];
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: prioriser-wordpress.ts <lot.md>");
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const header = lines.findIndex((line) => line.startsWith("| Cabinet"));
  if (header < 0) throw new Error("Tableau « | Cabinet » introuvable.");
  let end = header + 2;
  while (end < lines.length && lines[end].startsWith("|")) end += 1;

  const hasSiteCol = lines[header].includes("| Site |");
  // Re-run : on retire l'ancienne colonne « Site » (2e colonne) avant de la recalculer.
  const strip = (row: string) => (hasSiteCol ? row.replace(/^(\|[^|]*\|)[^|]*\|/, "$1") : row);
  const rows = lines.slice(header + 2, end).map(strip);

  const detected = await Promise.all(
    rows.map(async (row) => {
      const domain = domainOfRow(row);
      const kind: Kind = domain ? (await discoverSite(domain)).kind : "unreachable";
      return { row, kind };
    })
  );
  detected.sort((a, b) => CMS_RANK[a.kind] - CMS_RANK[b.kind]);

  const baseHeader = strip(lines[header]);
  const baseSep = strip(lines[header + 1]);
  const withCol = (row: string, cell: string) => row.replace(/^(\|[^|]*\|)/, `$1 ${cell} |`);
  const out = [
    withCol(baseHeader, "Site"),
    withCol(baseSep, "---"),
    ...detected.map(({ row, kind }) => withCol(row, CMS_LABEL[kind])),
  ];
  lines.splice(header, end - header, ...out);
  writeFileSync(file, lines.join("\n"));

  const counts = detected.reduce<Record<string, number>>((acc, { kind }) => ((acc[CMS_LABEL[kind]] = (acc[CMS_LABEL[kind]] ?? 0) + 1), acc), {});
  console.log(JSON.stringify(counts));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
