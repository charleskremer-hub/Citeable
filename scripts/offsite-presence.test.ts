/**
 * Contrat de la brique 2 du moteur off-site : la présence off-site.
 *
 * Invariants gardés :
 *   - HONNÊTETÉ : `autonomous` est vrai UNIQUEMENT pour les classes d'effort où
 *     GetPick agit seul (auto_public / getpick_publish). Toute source à login
 *     client (client_access / ready_to_publish) est `autonomous:false` et
 *     `requiresClientAction:true` — on ne prétend jamais « zéro effort » là.
 *   - le presence pack dérive des faits réels (marque, ville) — zéro chiffre
 *     inventé quand les entrées n'en portent pas ;
 *   - statut par défaut `not_started`, surchargé par la base ;
 *   - la route valide statut + source et ne porte aucun gating.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OFFSITE_SOURCES,
  buildPresencePack,
  effortIsAutonomous,
  isKnownOffsiteSourceKey,
  isValidPresenceStatus,
} from "@/lib/offsite-sources";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function stripped(relPath: string) {
  return readFileSync(resolve(repoRoot, relPath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const INPUT = {
  brandName: "Cabinet Durand",
  category: "accounting firm",
  city: "Nantes",
  websiteUrl: "https://cabinet-durand.fr",
  description: "cabinet d'expertise comptable pour indépendants et TPE",
  competitors: ["Dougs", "Numbr"],
  prompts: ["meilleur expert-comptable à Nantes", "expert-comptable pour SAS à Nantes"],
};

test("catalogue — le flag autonomous est cohérent avec la classe d'effort", () => {
  assert.ok(OFFSITE_SOURCES.length >= 6, "au moins 6 sources de départ");
  for (const source of OFFSITE_SOURCES) {
    assert.equal(
      source.autonomous,
      effortIsAutonomous(source.effort),
      `${source.key}: autonomous doit refléter la classe d'effort`,
    );
    assert.ok(source.why.fr && source.why.en, `${source.key}: raison FR+EN requise`);
  }
});

test("catalogue — Google Business Profile exige l'accès client (jamais autonome)", () => {
  const gbp = OFFSITE_SOURCES.find((s) => s.key === "google_business_profile");
  assert.ok(gbp, "GBP doit être au catalogue");
  assert.equal(gbp!.autonomous, false);
  assert.equal(gbp!.effort, "client_access");
});

test("presence pack (fr) — dérivé des faits réels, statut par défaut, honnêteté", () => {
  const pack = buildPresencePack("fr", INPUT);
  assert.equal(pack.entries.length, OFFSITE_SOURCES.length, "une entrée par source");
  assert.equal(pack.autonomousCount + pack.clientActionCount, OFFSITE_SOURCES.length, "chaque source est classée");

  for (const entry of pack.entries) {
    assert.ok(entry.payload.length > 0, `${entry.key}: un livrable prêt-à-publier est requis`);
    assert.equal(entry.status, "not_started", `${entry.key}: statut par défaut not_started`);
    // Honnêteté : autonome XOR action client requise.
    assert.equal(entry.autonomous, !entry.requiresClientAction, `${entry.key}: autonome ⇔ pas d'action client`);
    if (entry.requiresClientAction) {
      assert.match(entry.actionLabel, /client|humain|human/i, `${entry.key}: le label doit dire qu'un geste humain est requis`);
    }
  }

  // Un bloc annuaire nomme la marque ET la ville.
  const directory = pack.entries.find((e) => e.type === "directory");
  assert.ok(directory && directory.payload.includes("Cabinet Durand") && directory.payload.includes("Nantes"));
});

test("presence pack — garde-fou zéro chiffre inventé", () => {
  const pack = buildPresencePack("fr", INPUT);
  const allPayloads = pack.entries.map((e) => e.payload).join(" ");
  assert.equal(/\d/.test(allPayloads), false, "aucun chiffre ne doit apparaître s'il n'était pas dans les faits");
});

test("presence pack — le statut stocké surcharge le défaut", () => {
  const pack = buildPresencePack("fr", INPUT, { pappers: "live" });
  const pappers = pack.entries.find((e) => e.key === "pappers");
  assert.equal(pappers!.status, "live");
});

test("presence pack (en) — bascule anglaise", () => {
  const pack = buildPresencePack("en", { ...INPUT, description: "" });
  const review = pack.entries.find((e) => e.type === "review");
  assert.ok(review && /review/i.test(review.payload), "réponse anglaise pour un template d'avis");
});

test("validateurs — statut et clé de source", () => {
  assert.equal(isValidPresenceStatus("live"), true);
  assert.equal(isValidPresenceStatus("bogus"), false);
  assert.equal(isKnownOffsiteSourceKey("pappers"), true);
  assert.equal(isKnownOffsiteSourceKey("myspace"), false);
});

// ---- Contrat de source de la route ----

const route = stripped("src/app/api/offsite-presence/route.ts");

test("route — GET + POST, dynamique, adossée au pack et validée", () => {
  assert.match(route, /force-dynamic/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /buildPresencePack/);
  assert.match(route, /isValidPresenceStatus/);
  assert.match(route, /isKnownOffsiteSourceKey/);
});

test("route — actif opérationnel : aucun gating de paiement", () => {
  assert.equal(/checkout|stripe|PaidReport|resolveReportAccess|entitlement/i.test(route), false);
});

test("db — table offsite_presence idempotente", () => {
  const db = stripped("src/lib/db.ts");
  assert.match(db, /CREATE TABLE IF NOT EXISTS offsite_presence/);
});
