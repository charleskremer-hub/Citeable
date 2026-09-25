/**
 * Contrat de la visibilité GEO — le cœur autonome du dashboard.
 *
 * Invariants :
 *   - part de voix mesurée sur les questions DISPONIBLES ;
 *   - le client n'est jamais compté comme son propre concurrent ;
 *   - rang correct (1 = le plus cité) ; vue par prompt cohérente ;
 *   - headline honnête quand le client n'est pas cité.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { computeGeoVisibility } from "@/lib/geo-visibility";
import type { BuyerIntentPromptResult } from "@/lib/audit-engine";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function stripped(relPath: string) {
  return readFileSync(resolve(repoRoot, relPath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

function q(prompt: string, brandMentioned: boolean, competitors: string[], available = true): BuyerIntentPromptResult {
  return { prompt, available, brandMentioned, competitors, surfaces: [] };
}

test("computeGeoVisibility — part de voix, rang et principaux concurrents", () => {
  const prompts = [
    q("Q1", false, ["Dougs", "Numbr"]),
    q("Q2", true, ["Dougs"]),
    q("Q3", false, ["Dougs"]),
    q("Q4", false, ["Indy"]),
  ];
  const vis = computeGeoVisibility(prompts, "Cabinet Durand", "fr");

  assert.equal(vis.totalPrompts, 4);
  assert.equal(vis.brand.citedCount, 1);
  // Dougs cité sur Q1,Q2,Q3 = 3 ; Numbr 1 ; Indy 1
  const dougs = vis.competitors.find((c) => c.name === "Dougs");
  assert.equal(dougs?.citedCount, 3);
  assert.equal(vis.competitors[0].name, "Dougs", "le plus cité en tête");
  // Rang du client : Dougs (3) > 1, donc rang 2
  assert.equal(vis.brandRank, 2);
  assert.equal(vis.playerCount, 4); // Durand + Dougs + Numbr + Indy
  assert.match(vis.headline, /rang 2|derrière Dougs/i);
});

test("computeGeoVisibility — le client n'est jamais son propre concurrent", () => {
  const prompts = [q("Q1", true, ["Cabinet Durand", "Dougs"])];
  const vis = computeGeoVisibility(prompts, "Cabinet Durand", "fr");
  assert.equal(vis.competitors.some((c) => c.name.toLowerCase() === "cabinet durand"), false);
  assert.equal(vis.byPrompt[0].competitorsCited.includes("Cabinet Durand"), false);
});

test("computeGeoVisibility — seules les questions disponibles comptent", () => {
  const prompts = [q("Q1", true, []), q("Q2", true, [], false)];
  const vis = computeGeoVisibility(prompts, "X", "fr");
  assert.equal(vis.totalPrompts, 1);
});

test("computeGeoVisibility — headline honnête quand le client n'est jamais cité", () => {
  const prompts = [q("Q1", false, ["Dougs"]), q("Q2", false, ["Dougs"])];
  const vis = computeGeoVisibility(prompts, "Cabinet Durand", "fr");
  assert.equal(vis.brand.citedCount, 0);
  assert.match(vis.headline, /ne te cite jamais/i);
  assert.match(vis.headline, /Dougs/);
});

test("computeGeoVisibility — leader quand le client domine", () => {
  const prompts = [q("Q1", true, ["Dougs"]), q("Q2", true, []), q("Q3", true, [])];
  const vis = computeGeoVisibility(prompts, "Cabinet Durand", "fr");
  assert.equal(vis.brandRank, 1);
  assert.match(vis.headline, /le nom le plus cité/i);
});

// ---- Contrat de source de la route ----

test("route geo-visibility — GET dynamique adossé au calcul", () => {
  const route = stripped("src/app/api/geo-visibility/route.ts");
  assert.match(route, /force-dynamic/);
  assert.match(route, /export async function GET/);
  assert.match(route, /computeGeoVisibility/);
  assert.equal(/checkout|stripe|PaidReport|entitlement/i.test(route), false);
});
