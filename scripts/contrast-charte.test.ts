/**
 * LISIBILITÉ — aucune couleur de texte illisible sur le fond clair de la charte.
 *
 * Le 28/09, Charles envoie une capture de la landing : « On ne voit rien ». Le
 * bloc « Ta page-réponse » était écrit en #D6E2EC sur #EEF2F7 (contraste 1,25).
 * Cause : la refonte « Clair & confiance » (26/09) a changé les fonds, mais 20
 * couleurs de TEXTE héritées de l'ancien thème sombre sont restées, dans 19
 * fichiers — landing, rapport, tableau de bord. Aucun test ne lisait les couleurs.
 *
 * Ce test les lit : toute couleur de texte littérale (classe `text-[#…]`,
 * `placeholder:text-[#…]`, `decoration` exclu, ou `color: "#…"` en style inline)
 * doit atteindre WCAG AA 4.5:1 sur le fond de page #F5F7FA. Seul le blanc est
 * exempté : il n'est posé que sur les boutons pleins (#123E5C).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function luminance(hex: string) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (x: number) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(tsx?|css)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

const PAGE_BG = "F5F7FA";
const EXEMPT = new Set(["FFFFFF"]);
const PUBLIC_SURFACES = ["src/app"];

test("lisibilité — toute couleur de texte atteint 4.5:1 sur le fond de page", () => {
  const offenders: string[] = [];
  for (const root of PUBLIC_SURFACES) {
    for (const file of walk(root)) {
      if (file.includes("/admin/")) continue; // back-office interne, hors parcours client
      const source = readFileSync(file, "utf8");
      const patterns = [/(?<![-\w])text-\[#([0-9A-Fa-f]{6})\]/g, /\bcolor:\s*["'`]#([0-9A-Fa-f]{6})["'`]/g];
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
          const hex = match[1].toUpperCase();
          if (EXEMPT.has(hex)) continue;
          const ratio = contrast(hex, PAGE_BG);
          if (ratio < 4.5) offenders.push(`${file}: #${hex} (${ratio.toFixed(2)}:1)`);
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `couleurs de texte illisibles :\n${offenders.join("\n")}`);
});
