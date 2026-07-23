/**
 * Tests unitaires des fonctions pures du script de re-run de l'étude.
 * Exécution : npm test (node --test, type stripping natif de Node >= 22.6).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SPONSORED_MARKER_PATTERN,
  mostFrequentCompetitor,
  scanSponsoredMarkers,
  slugify,
  type BuyerIntentPrompt,
} from "./rerun-study-2026-07.ts";

function prompt(overrides: Partial<BuyerIntentPrompt>): BuyerIntentPrompt {
  return {
    prompt: "best example question",
    available: true,
    brandMentioned: false,
    competitors: [],
    surfaces: [],
    ...overrides,
  };
}

test("slugify normalise les noms de marques en noms de fichiers sûrs", () => {
  assert.equal(slugify("Hedley & Bennett"), "hedley-bennett");
  assert.equal(slugify("Necessaire"), "necessaire");
  assert.equal(slugify("Spot & Tango"), "spot-tango");
  assert.equal(slugify("GetPick"), "getpick");
});

test("mostFrequentCompetitor compte uniquement les questions où la marque est absente", () => {
  const prompts: BuyerIntentPrompt[] = [
    prompt({ brandMentioned: false, competitors: ["CeraVe", "Aesop"] }),
    prompt({ brandMentioned: false, competitors: ["CeraVe"] }),
    // Question où la marque est citée : ses concurrents ne comptent pas.
    prompt({ brandMentioned: true, competitors: ["Aesop", "Aesop"] }),
  ];
  assert.equal(mostFrequentCompetitor(prompts), "CeraVe");
});

test("mostFrequentCompetitor rend null sans concurrent", () => {
  assert.equal(mostFrequentCompetitor([prompt({ brandMentioned: true })]), null);
});

test("scanSponsoredMarkers détecte les marqueurs d'emplacements sponsorisés", () => {
  const prompts: BuyerIntentPrompt[] = [
    prompt({
      prompt: "best running shoes",
      surfaces: [
        { kind: "ai_engine", rawAnswerSnippet: "Sponsored result: Brand X is a paid placement here." },
        { kind: "ai_engine", rawAnswerSnippet: "recommended_brands: Brand Y, Brand Z" },
      ],
    }),
  ];
  const hits = scanSponsoredMarkers(prompts);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].prompt, "best running shoes");
  assert.match(hits[0].marker, /sponsored/i);
});

test("scanSponsoredMarkers rend une liste vide sur des réponses organiques", () => {
  const prompts: BuyerIntentPrompt[] = [
    prompt({ surfaces: [{ kind: "ai_engine", rawAnswerSnippet: "recommended_brands: Recess, Kin Euphorics" }] }),
  ];
  assert.equal(scanSponsoredMarkers(prompts).length, 0);
});

test("le motif sponsorisé couvre les variantes FR/EN sans sur-matcher", () => {
  assert.match("Ceci est une annonce sponsorisée", SPONSORED_MARKER_PATTERN);
  assert.match("promoted listing", SPONSORED_MARKER_PATTERN);
  // "brand" contient "ad" mais ne doit pas matcher (\b#ad\b).
  assert.doesNotMatch("great brand with adaptive design", SPONSORED_MARKER_PATTERN);
});
