/**
 * Contrat de la brique 3 du moteur off-site : la preuve du basculement.
 *
 * Invariants :
 *   - le basculement est calculé QUESTION PAR QUESTION (confrère → toi = won,
 *     toi → confrère = lost), apparié par texte de question ;
 *   - sans scan précédent, on annonce un scan de RÉFÉRENCE (jamais un faux gain) ;
 *   - seules les questions disponibles comptent ;
 *   - la route ne porte aucun gating de paiement.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { computeShiftProof, movementLabel } from "@/lib/shift-proof";
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

test("computeShiftProof — won / lost / held / rival par question", () => {
  const previous = [
    q("Q1", false, ["Dougs"]),
    q("Q2", true, []),
    q("Q3", true, []),
    q("Q4", false, ["Numbr"]),
  ];
  const current = [
    q("Q1", true, []),        // confrère -> toi
    q("Q2", false, ["Dougs"]), // toi -> confrère
    q("Q3", true, []),         // conservé
    q("Q4", false, ["Numbr"]), // toujours un confrère
    q("Q5", true, []),         // nouvelle question
  ];
  const proof = computeShiftProof(current, previous, "fr");

  assert.equal(proof.hasPrevious, true);
  const byQ = Object.fromEntries(proof.rows.map((r) => [r.question, r.movement]));
  assert.equal(byQ.Q1, "won");
  assert.equal(byQ.Q2, "lost");
  assert.equal(byQ.Q3, "held_you");
  assert.equal(byQ.Q4, "held_rival");
  assert.equal(byQ.Q5, "new");

  assert.equal(proof.summary.totalQuestions, 5);
  assert.equal(proof.summary.youCitedNow, 3); // Q1, Q3, Q5
  assert.equal(proof.summary.youCitedBefore, 2); // Q2, Q3 (communes, citées avant)
  assert.equal(proof.summary.wonCount, 1);
  assert.equal(proof.summary.lostCount, 1);
  assert.equal(proof.summary.netChange, 0); // communes citées maintenant (Q1,Q3=2) - avant (2)
  assert.match(proof.headline, /[Bb]asculement/);
});

test("computeShiftProof — sans scan précédent = scan de référence honnête", () => {
  const current = [q("Q1", true, []), q("Q2", false, ["Dougs"])];
  const proof = computeShiftProof(current, null, "fr");

  assert.equal(proof.hasPrevious, false);
  assert.equal(proof.summary.youCitedBefore, 0);
  assert.equal(proof.summary.wonCount, 0);
  assert.equal(proof.summary.lostCount, 0);
  assert.ok(proof.rows.every((r) => r.youCitedBefore === null && r.movement === "new"));
  assert.match(proof.headline, /référence|reference/i);
});

test("computeShiftProof — seules les questions disponibles comptent", () => {
  const current = [q("Q1", true, []), q("Q2", true, [], false)];
  const proof = computeShiftProof(current, null, "fr");
  assert.equal(proof.summary.totalQuestions, 1);
});

test("computeShiftProof — recul détecté quand pertes > gains", () => {
  const previous = [q("Q1", true, []), q("Q2", true, [])];
  const current = [q("Q1", false, ["Dougs"]), q("Q2", false, ["Numbr"])];
  const proof = computeShiftProof(current, previous, "fr");
  assert.equal(proof.summary.lostCount, 2);
  assert.equal(proof.summary.netChange, -2);
  assert.match(proof.headline, /[Rr]ecul|[Ss]etback/);
});

test("movementLabel — libellés FR", () => {
  assert.equal(movementLabel("won", "fr"), "Basculé vers toi");
  assert.equal(movementLabel("lost", "fr"), "Reperdu");
});

// ---- Contrat de source de la route ----

const route = stripped("src/app/api/shift-proof/route.ts");

test("route — GET dynamique adossée au calcul de basculement", () => {
  assert.match(route, /force-dynamic/);
  assert.match(route, /export async function GET/);
  assert.match(route, /computeShiftProof/);
  assert.match(route, /previous_audit_id/);
});

test("route — aucun gating de paiement", () => {
  assert.equal(/checkout|stripe|PaidReport|resolveReportAccess|entitlement/i.test(route), false);
});
