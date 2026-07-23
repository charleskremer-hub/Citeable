/**
 * Tests unitaires des fonctions pures du script de re-run de l'étude.
 * Exécution : npm test (node --test, type stripping natif de Node >= 22.6).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SPONSORED_MARKER_PATTERN,
  buildBrandResult,
  isPromptEchoAnswer,
  mostFrequentCompetitor,
  scanSponsoredMarkers,
  slugify,
  type BuyerIntentPrompt,
} from "./rerun-study-2026-07.ts";

// Réponse portant la signature exacte de l'ancien exemple du prompt moteur :
// trio On/Hoka/Veja dans cet ordre + justification recopiée mot pour mot.
function echoPrompt(question = "best GEO software?"): BuyerIntentPrompt {
  return {
    prompt: question,
    available: true,
    brandMentioned: false,
    competitors: ["On", "Hoka", "Veja"],
    surfaces: [
      {
        kind: "ai_engine",
        brandSentiment: { label: "positive", justification: "described as a trusted premium option" },
        rawAnswerSnippet: "recommended_brands: On, Hoka, Veja",
      },
    ],
  };
}

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

test("isPromptEchoAnswer détecte la signature de l'ancien exemple du prompt", () => {
  assert.equal(isPromptEchoAnswer(echoPrompt()), true);
  // Trio identique mais justification authentique : réponse légitime possible
  // pour une marque de chaussures — pas un écho.
  const genuineTrio = echoPrompt("best travel sneakers?");
  genuineTrio.surfaces[0].brandSentiment = { label: "positive", justification: "popular for comfort" };
  assert.equal(isPromptEchoAnswer(genuineTrio), false);
  // Autres marques : pas un écho.
  assert.equal(isPromptEchoAnswer(prompt({ competitors: ["CeraVe", "Neutrogena"] })), false);
});

test("buildBrandResult écarte les échos des comptes cited/namedInstead et flague le statut", () => {
  const status = {
    audit_id: "audit-1",
    status: "completed",
    score: 13,
    buyer_intent_prompts: [
      echoPrompt(),
      echoPrompt("best GEO platform?"),
      prompt({ brandMentioned: false, competitors: ["SEMrush", "Ahrefs"] }),
      prompt({ brandMentioned: false, competitors: ["SEMrush"] }),
      prompt({ brandMentioned: true, competitors: [] }),
    ],
    prompt_debug: "ai:5",
  };
  const result = buildBrandResult("GetPick", "https://getpick.ai", status, "2026-07-23T00:00:00.000Z");

  assert.equal(result.questionsAsked, 5);
  assert.equal(result.echoAnswers, 2);
  assert.equal(result.validAnswers, 3);
  assert.equal(result.citedCount, 1);
  // Le rival est compté sur les réponses valides uniquement : SEMrush (2),
  // jamais « On » venu de l'écho.
  assert.equal(result.namedInstead, "SEMrush");
  assert.equal(result.aiDataStatus, "contaminated_floor");
});

test("buildBrandResult : tout-écho → no_valid_ai_data, zéro écho → clean", () => {
  const allEcho = buildBrandResult(
    "Allbirds",
    "https://allbirds.com",
    { audit_id: "audit-2", status: "completed", score: 25, buyer_intent_prompts: [echoPrompt(), echoPrompt()] },
    "2026-07-23T00:00:00.000Z"
  );
  assert.equal(allEcho.aiDataStatus, "no_valid_ai_data");
  assert.equal(allEcho.validAnswers, 0);
  assert.equal(allEcho.namedInstead, null);

  const clean = buildBrandResult(
    "Recess",
    "https://takearecess.com",
    { audit_id: "audit-3", status: "completed", score: 87, buyer_intent_prompts: [prompt({ brandMentioned: true })] },
    "2026-07-23T00:00:00.000Z"
  );
  assert.equal(clean.aiDataStatus, "clean");
  assert.equal(clean.echoAnswers, 0);
});

test("le motif sponsorisé couvre les variantes FR/EN sans sur-matcher", () => {
  assert.match("Ceci est une annonce sponsorisée", SPONSORED_MARKER_PATTERN);
  assert.match("promoted listing", SPONSORED_MARKER_PATTERN);
  // "brand" contient "ad" mais ne doit pas matcher (\b#ad\b).
  assert.doesNotMatch("great brand with adaptive design", SPONSORED_MARKER_PATTERN);
});
