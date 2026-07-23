/**
 * Re-run de l'étude 21 marques — édition juillet 2026.
 *
 * Relance les 21 audits de l'étude /study à travers l'API de production
 * (www.getpick.ai), qui exécute le moteur corrigé du 21/07 : questions non
 * brandées garanties (promptMentionsAuditedBrand), zéro écho de copy marque
 * (questionEchoesBrandCopy), 12 questions acheteur par marque (tier agent).
 *
 * Chaque audit est stocké côté serveur dans la base Neon avec son promptDebug
 * (preuve de la source des questions et des rejets de questions brandées) —
 * exactement le chemin d'écriture de production, pas un chemin parallèle.
 *
 * L'email utilisé est du domaine anonyme (anonymous.citeable.invalid) : il est
 * dans la liste de suppression du moteur, donc AUCUN email ne part pendant le
 * re-run (ni résultat d'audit, ni séquence J+1/J+3).
 *
 * Sorties locales (versionnées dans artifacts/study-rerun-2026-07/) :
 *  - raw/<slug>.json           : réponse complète d'audit-status par marque
 *  - results.json              : agrégat criblé anti-écho (score, réponses
 *    valides vs échos de l'exemple du prompt, cited x/valides, rival,
 *    promptDebug) — voir le bloc echoScreening en tête du fichier
 *  - sponsored-placements-veille.md : journal AC5 — présence/absence de
 *    marqueurs d'emplacements sponsorisés dans la seule sortie moteur que le
 *    pipeline persiste : la liste structurée des marques recommandées
 *    (« recommended_brands: X, Y, Z »). La prose brute du modèle n'est PAS
 *    stockée — limite structurelle documentée dans le journal lui-même.
 *
 * Usage :
 *   node scripts/rerun-study-2026-07.ts               # collecte live complète
 *   node scripts/rerun-study-2026-07.ts --reprocess   # re-crible les raw/
 *     existants (détection des échos de l'exemple du prompt) et régénère
 *     results.json sans aucun appel réseau
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { matchesLegacyPromptExample } from "../src/lib/prompt-example-echo.ts";

const BASE_URL = process.env.STUDY_RERUN_BASE_URL ?? "https://www.getpick.ai";
// Domaine anonyme = supprimé par shouldSuppressEmail : aucun email ne part.
// Exporté : scripts/deactivate-study-rerun-monitoring.ts cible exactement
// cet email pour désactiver le monitoring mensuel créé par le re-run.
export const RUN_EMAIL = "study-rerun-2026-07@anonymous.citeable.invalid";
const AUDIT_TIER = "agent_19eur"; // 12 questions acheteur, moteur ChatGPT.
const OUT_DIR = join(process.cwd(), "artifacts", "study-rerun-2026-07");
const RAW_DIR = join(OUT_DIR, "raw");
const POLL_INTERVAL_MS = 15_000;
const BRAND_TIMEOUT_MS = 15 * 60_000;
const MAX_ATTEMPTS_PER_BRAND = 3;
const CONCURRENCY = 3;

// Les 21 marques de l'étude publiée le 19/07 — mêmes marques, mêmes domaines.
const BRANDS: ReadonlyArray<{ brand: string; url: string }> = [
  { brand: "Hedley & Bennett", url: "https://hedleyandbennett.com" },
  { brand: "Necessaire", url: "https://necessaire.com" },
  { brand: "Allbirds", url: "https://allbirds.com" },
  { brand: "Bubble", url: "https://hellobubble.com" },
  { brand: "Cuts", url: "https://cutsclothing.com" },
  { brand: "Topicals", url: "https://mytopicals.com" },
  { brand: "Spot & Tango", url: "https://spotandtango.com" },
  { brand: "De Soi", url: "https://drinkdesoi.com" },
  { brand: "GetPick", url: "https://getpick.ai" },
  { brand: "Versed", url: "https://versedskin.com" },
  { brand: "Baboon to the Moon", url: "https://baboontothemoon.com" },
  { brand: "Cometeer", url: "https://cometeer.com" },
  { brand: "Tower 28", url: "https://tower28beauty.com" },
  { brand: "Arrae", url: "https://arrae.com" },
  { brand: "Dagne Dover", url: "https://dagnedover.com" },
  { brand: "Ollie", url: "https://myollie.com" },
  { brand: "Recess", url: "https://takearecess.com" },
  { brand: "Our Place", url: "https://fromourplace.com" },
  { brand: "Ridge Wallet", url: "https://ridge.com" },
  { brand: "Moon Juice", url: "https://moonjuice.com" },
  { brand: "Brooklinen", url: "https://brooklinen.com" },
];

type SurfaceResult = {
  kind: string;
  engine?: string;
  model?: string;
  status?: string;
  reachable?: boolean;
  brandMentioned?: boolean;
  competitors?: string[];
  rawAnswerSnippet?: string;
  realLlmCall?: boolean;
  brandSentiment?: { label?: string; justification?: string };
};

type BuyerIntentPrompt = {
  prompt: string;
  available: boolean;
  brandMentioned: boolean;
  competitors: string[];
  surfaces: SurfaceResult[];
};

type AuditStatusResponse = {
  audit_id: string;
  status: string;
  score: number | null;
  buyer_intent_prompts?: BuyerIntentPrompt[];
  prompt_debug?: string;
  category?: string;
  audit_tier?: string;
  answer_engine?: { engine: string; model: string; realLlmCall: boolean };
  error?: string;
};

type RunAuditResponse = {
  audit_id?: string;
  status?: string;
  error?: string;
};

// Statut des données IA d'une marque après criblage anti-écho :
//  - clean : les 12 réponses sont de vraies réponses du modèle.
//  - contaminated_floor : une partie des réponses recopiait l'exemple du
//    prompt (artefact) ; elles sont écartées de citedCount/namedInstead, mais
//    le score stocké en base les a comptées « non cité » — c'est un plancher.
//  - no_valid_ai_data : TOUTES les réponses étaient des échos ; aucune donnée
//    IA exploitable, aucune affirmation de visibilité possible.
type AiDataStatus = "clean" | "contaminated_floor" | "no_valid_ai_data";

type BrandResult = {
  brand: string;
  websiteUrl: string;
  auditId: string;
  score: number;
  questionsAsked: number;
  // Réponses restantes après retrait des échos de l'exemple du prompt.
  validAnswers: number;
  echoAnswers: number;
  aiDataStatus: AiDataStatus;
  // Comptés sur les réponses VALIDES uniquement.
  citedCount: number;
  namedInstead: string | null;
  promptDebug: string | null;
  engine: string | null;
  model: string | null;
  realLlmCall: boolean;
  category: string | null;
  collectedAt: string;
  sponsoredMarkers: Array<{ prompt: string; marker: string; snippet: string }>;
};

// Marqueurs d'emplacements sponsorisés à surveiller (AC5 — prérequis de
// l'item Should « veille armée »). Attention à la portée : le moteur ne
// persiste que la liste extraite des marques recommandées (audit-engine.ts,
// parseStructuredBrandResponse remplace la réponse par « recommended_brands:
// X, Y, Z »), donc ce motif ne peut matcher que dans des NOMS de marques —
// jamais dans la prose d'une réponse, qui n'est stockée nulle part.
export const SPONSORED_MARKER_PATTERN =
  /\b(sponsored|sponsorisé|sponsorship|paid\s+(?:placement|partnership|promotion|listing)|promoted|advertisement|#ad|publicité|annonce\s+sponsorisée)\b/i;

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postRunAudit(payload: Record<string, unknown>): Promise<RunAuditResponse> {
  const response = await fetch(`${BASE_URL}/api/run-audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as RunAuditResponse;
  if (!response.ok && response.status !== 202 && response.status !== 500) {
    throw new Error(`run-audit HTTP ${response.status}: ${body.error ?? "unknown"}`);
  }
  return body;
}

async function getAuditStatus(auditId: string): Promise<AuditStatusResponse> {
  const response = await fetch(`${BASE_URL}/api/audit-status?audit_id=${encodeURIComponent(auditId)}`);
  if (!response.ok) throw new Error(`audit-status HTTP ${response.status}`);
  return (await response.json()) as AuditStatusResponse;
}

// Une réponse est un écho si elle porte la signature exacte de l'ANCIEN
// exemple du prompt moteur : trio On/Hoka/Veja dans le même ordre + la
// justification de l'exemple recopiée mot pour mot. 29 des 252 réponses du
// re-run du 23/07 portaient cette signature (dont 17 en réponse à des
// questions logiciel, café, compléments, sacs ou cocktails — catégoriquement
// impossible en réponse authentique). Ces réponses sont des artefacts du
// prompt, pas des recommandations : elles sont écartées de tous les comptes.
export function isPromptEchoAnswer(prompt: BuyerIntentPrompt): boolean {
  const aiSurface = prompt.surfaces.find((surface) => surface.kind === "ai_engine");
  return matchesLegacyPromptExample(prompt.competitors, aiSurface?.brandSentiment?.justification);
}

export function mostFrequentCompetitor(prompts: BuyerIntentPrompt[]): string | null {
  const counts = new Map<string, number>();
  for (const prompt of prompts) {
    if (prompt.brandMentioned) continue;
    for (const competitor of prompt.competitors) {
      counts.set(competitor, (counts.get(competitor) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [competitor, count] of counts) {
    if (count > bestCount) {
      best = competitor;
      bestCount = count;
    }
  }
  return best;
}

export function scanSponsoredMarkers(prompts: BuyerIntentPrompt[]) {
  const hits: Array<{ prompt: string; marker: string; snippet: string }> = [];
  for (const prompt of prompts) {
    for (const surface of prompt.surfaces) {
      const snippet = surface.rawAnswerSnippet ?? "";
      const match = snippet.match(SPONSORED_MARKER_PATTERN);
      if (match) {
        hits.push({ prompt: prompt.prompt, marker: match[0], snippet: snippet.slice(0, 200) });
      }
    }
  }
  return hits;
}

async function runOneAttempt(brand: string, url: string): Promise<AuditStatusResponse> {
  const started = await postRunAudit({
    email: RUN_EMAIL,
    brand_name: brand,
    website_url: url,
    audit_tier: AUDIT_TIER,
    locale: "en",
  });
  if (!started.audit_id) throw new Error(`no audit_id returned for ${brand}: ${started.error ?? "unknown"}`);
  const auditId = started.audit_id;
  const deadline = Date.now() + BRAND_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const status = await getAuditStatus(auditId);
    if (status.status === "completed" && status.score !== null) return status;
    if (status.status === "failed") {
      throw new Error(`audit ${auditId} failed: ${status.error ?? "unknown"}`);
    }
    // Re-kick : sur serverless, le job `after()` peut être interrompu ; ce POST
    // relance l'audit si aucun run frais (< 2 min) n'est en cours (advisory lock
    // + startedAt côté serveur empêchent tout double run).
    await postRunAudit({ audit_id: auditId, audit_tier: AUDIT_TIER });
  }
  throw new Error(`audit ${auditId} timed out after ${BRAND_TIMEOUT_MS / 60000} min`);
}

// Construit le résultat agrégé d'une marque avec criblage anti-écho :
// citedCount et namedInstead sont comptés sur les réponses valides uniquement.
// Partagé entre la collecte live et le retraitement --reprocess des raw/.
export function buildBrandResult(brand: string, url: string, status: AuditStatusResponse, collectedAt: string): BrandResult {
  const prompts = status.buyer_intent_prompts ?? [];
  const validPrompts = prompts.filter((prompt) => !isPromptEchoAnswer(prompt));
  const echoAnswers = prompts.length - validPrompts.length;
  const aiDataStatus: AiDataStatus = echoAnswers === 0 ? "clean" : validPrompts.length === 0 ? "no_valid_ai_data" : "contaminated_floor";

  return {
    brand,
    websiteUrl: url,
    auditId: status.audit_id,
    score: status.score ?? 0,
    questionsAsked: prompts.length,
    validAnswers: validPrompts.length,
    echoAnswers,
    aiDataStatus,
    citedCount: validPrompts.filter((prompt) => prompt.brandMentioned).length,
    namedInstead: mostFrequentCompetitor(validPrompts),
    promptDebug: status.prompt_debug ?? null,
    engine: status.answer_engine?.engine ?? null,
    model: status.answer_engine?.model ?? null,
    realLlmCall: status.answer_engine?.realLlmCall ?? false,
    category: status.category ?? null,
    collectedAt,
    sponsoredMarkers: scanSponsoredMarkers(prompts),
  };
}

async function runBrand(brand: string, url: string): Promise<BrandResult> {
  let lastError: unknown;
  let contaminatedFallback: { result: BrandResult; status: AuditStatusResponse } | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_BRAND; attempt += 1) {
    try {
      console.log(`[study-rerun] ${brand} — attempt ${attempt}`);
      const status = await runOneAttempt(brand, url);
      const result = buildBrandResult(brand, url, status, new Date().toISOString());

      // Des réponses recopiant l'exemple du prompt sont des artefacts : on
      // retente la marque tant qu'il reste des essais, et on garde le dernier
      // run contaminé (flagué) plutôt que de perdre la marque si rien de
      // propre n'est obtenu.
      if (result.echoAnswers > 0 && attempt < MAX_ATTEMPTS_PER_BRAND) {
        contaminatedFallback = { result, status };
        console.warn(`[study-rerun] ${brand} — ${result.echoAnswers} prompt-echo answer(s) detected, retrying`);
        continue;
      }

      writeFileSync(join(RAW_DIR, `${slugify(brand)}.json`), JSON.stringify(status, null, 2));
      console.log(
        `[study-rerun] ${brand} — score ${result.score}, cited ${result.citedCount}/${result.validAnswers} valid ` +
          `(${result.echoAnswers} echo), promptDebug=${result.promptDebug}, sponsored markers=${result.sponsoredMarkers.length}`
      );
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`[study-rerun] ${brand} — attempt ${attempt} failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (contaminatedFallback) {
    writeFileSync(join(RAW_DIR, `${slugify(brand)}.json`), JSON.stringify(contaminatedFallback.status, null, 2));
    console.warn(`[study-rerun] ${brand} — kept contaminated run (${contaminatedFallback.result.echoAnswers} echo answers) after ${MAX_ATTEMPTS_PER_BRAND} attempts`);
    return contaminatedFallback.result;
  }

  throw new Error(`[study-rerun] ${brand} — all attempts failed: ${lastError instanceof Error ? lastError.message : lastError}`);
}

function buildVeilleMarkdown(results: BrandResult[]) {
  const runDate = new Date().toISOString().slice(0, 10);
  const totalHits = results.reduce((sum, result) => sum + result.sponsoredMarkers.length, 0);
  const lines: string[] = [
    "# Veille — marqueurs d'emplacements sponsorisés dans les réponses IA",
    "",
    `Re-run étude 21 marques, édition juillet 2026 — collecte du ${runDate}.`,
    "",
    "Ce qui a été scanné : le champ `rawAnswerSnippet` de chaque surface",
    "`ai_engine` stockée par audit. Ce champ ne contient PAS la prose brute du",
    "modèle : le moteur instruit le modèle de répondre uniquement en JSON",
    "structuré et remplace la réponse par la liste extraite",
    "« recommended_brands: X, Y, Z » (voir la limite structurelle plus bas).",
    "Motif appliqué :",
    "",
    "```",
    SPONSORED_MARKER_PATTERN.source,
    "```",
    "",
    `## Verdict : ${totalHits === 0 ? "AUCUN marqueur détecté dans les listes de marques recommandées" : `${totalHits} marqueur(s) détecté(s)`}`,
    "",
    "| Marque | Moteur | Questions scannées | Marqueurs trouvés |",
    "|---|---|---|---|",
    ...results.map(
      (result) =>
        `| ${result.brand} | ${result.engine ?? "?"} (${result.model ?? "?"}) | ${result.questionsAsked} | ${result.sponsoredMarkers.length === 0 ? "aucun" : result.sponsoredMarkers.map((hit) => `« ${hit.marker} »`).join(", ")} |`
    ),
    "",
  ];
  const withHits = results.filter((result) => result.sponsoredMarkers.length > 0);
  if (withHits.length > 0) {
    lines.push("## Détail des détections", "");
    for (const result of withHits) {
      for (const hit of result.sponsoredMarkers) {
        lines.push(`- **${result.brand}** — question « ${hit.prompt} » — marqueur « ${hit.marker} » — extrait : ${hit.snippet}`);
      }
    }
    lines.push("");
  }
  lines.push(
    "## Pourquoi ce journal existe",
    "",
    "Prérequis de l'item Should « veille armée » (zéro dev produit associé) :",
    "si un moteur commence à insérer des emplacements sponsorisés dans ses",
    "recommandations d'achat, la promesse GEO change de nature. Ce journal est",
    "le point de comparaison daté — dans les limites de portée ci-dessous.",
    "",
    "## Limite structurelle — portée réelle de ce scan",
    "",
    "Le pipeline d'audit ne stocke aucune réponse rédigée du modèle. Chaque",
    "`rawAnswerSnippet` est la liste structurée des marques recommandées",
    "(25 à 72 caractères sur ce run), produite côté moteur en remplacement de",
    "la réponse brute (`parseStructuredBrandResponse` dans",
    "`src/lib/audit-engine.ts`). Ce scan ne peut donc détecter un marqueur",
    "sponsorisé QUE s'il apparaît dans un nom de marque recommandé — jamais",
    "dans la prose d'une réponse, qui n'existe nulle part en base.",
    "",
    "Conséquence assumée : ce journal établit l'absence de marqueurs dans les",
    "listes de marques recommandées à la date de collecte, et rien de plus.",
    "Pour armer réellement la veille (détecter un emplacement sponsorisé",
    "inséré dans la prose d'un moteur), il faut d'abord persister la réponse",
    "brute complète du modèle par surface — dev côté moteur, hors périmètre",
    "de cette story, consigné ici comme prérequis restant de l'item Should",
    "« veille armée ».",
    ""
  );
  return lines.join("\n");
}

// Bloc de synthèse du criblage anti-écho, écrit en tête de results.json pour
// que le fichier soit auto-portant : quiconque lit les chiffres voit d'abord
// combien de réponses étaient des artefacts et comment elles ont été traitées.
function buildEchoScreeningSummary(results: BrandResult[]) {
  const totalAnswers = results.reduce((sum, result) => sum + result.questionsAsked, 0);
  const echoAnswers = results.reduce((sum, result) => sum + result.echoAnswers, 0);
  const affected = results.filter((result) => result.echoAnswers > 0);

  return {
    screenedAt: new Date().toISOString(),
    method:
      "Every answer whose competitor list is exactly the legacy prompt-format example (On, Hoka, Veja in that order) " +
      "with the example's sentiment justification copied verbatim is a prompt-echo artifact, not a model recommendation. " +
      "Echo answers are excluded from citedCount, validAnswers and namedInstead. The stored score counted them as " +
      "'brand not named', so scores of affected brands are floors. Detection: matchesLegacyPromptExample in " +
      "src/lib/prompt-example-echo.ts; engine fix: placeholder-only format example + answerEchoesPromptExample guard.",
    totalAnswers,
    echoAnswersDiscarded: echoAnswers,
    brandsAffected: affected.map((result) => ({ brand: result.brand, echoAnswers: result.echoAnswers, aiDataStatus: result.aiDataStatus })),
  };
}

function writeResults(results: BrandResult[], failures: Array<{ brand: string; error: string }>, generatedAt: string) {
  results.sort((left, right) => left.score - right.score || left.brand.localeCompare(right.brand));
  writeFileSync(
    join(OUT_DIR, "results.json"),
    JSON.stringify(
      {
        runEmail: RUN_EMAIL,
        auditTier: AUDIT_TIER,
        baseUrl: BASE_URL,
        generatedAt,
        echoScreening: buildEchoScreeningSummary(results),
        results,
        failures,
      },
      null,
      2
    )
  );
}

// Retraite les réponses brutes déjà collectées (raw/<slug>.json) avec le
// criblage anti-écho et régénère results.json — sans aucun nouvel appel
// réseau. C'est le mode utilisé pour corriger les agrégats du run du 23/07,
// dont 29 réponses recopiaient l'exemple du prompt. collectedAt et
// generatedAt sont repris du results.json existant : les données n'ont pas
// été recollectées, seulement re-criblées.
function reprocessFromRaw() {
  type PreviousResults = { generatedAt?: string; results?: Array<{ auditId?: string; collectedAt?: string }>; failures?: Array<{ brand: string; error: string }> };
  const previous: PreviousResults = JSON.parse(readFileSync(join(OUT_DIR, "results.json"), "utf8")) as PreviousResults;
  const collectedAtByAuditId = new Map<string, string>();
  for (const entry of previous.results ?? []) {
    if (entry.auditId && entry.collectedAt) collectedAtByAuditId.set(entry.auditId, entry.collectedAt);
  }

  const results: BrandResult[] = [];
  for (const file of readdirSync(RAW_DIR).filter((name) => name.endsWith(".json")).sort()) {
    const status = JSON.parse(readFileSync(join(RAW_DIR, file), "utf8")) as AuditStatusResponse & { brand_name?: string; website_url?: string };
    const brand = BRANDS.find((entry) => slugify(entry.brand) === file.replace(/\.json$/, ""));
    if (!brand) throw new Error(`[study-rerun] raw file ${file} does not match any study brand`);
    const collectedAt = collectedAtByAuditId.get(status.audit_id) ?? previous.generatedAt ?? new Date().toISOString();
    results.push(buildBrandResult(brand.brand, brand.url, status, collectedAt));
  }

  writeResults(results, previous.failures ?? [], previous.generatedAt ?? new Date().toISOString());
  console.log("[study-rerun] reprocess done.");
  console.table(
    results.map((result) => ({
      brand: result.brand,
      score: result.score,
      cited: `${result.citedCount}/${result.validAnswers}`,
      echo: result.echoAnswers,
      status: result.aiDataStatus,
      instead: result.namedInstead ?? "—",
    }))
  );
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true });
  // STUDY_RERUN_ONLY="Allbirds,Recess" → smoke test sur un sous-ensemble.
  const only = (process.env.STUDY_RERUN_ONLY ?? "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const queue = BRANDS.filter((entry) => only.length === 0 || only.includes(entry.brand.toLowerCase()));
  const results: BrandResult[] = [];
  const failures: Array<{ brand: string; error: string }> = [];

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      try {
        results.push(await runBrand(next.brand, next.url));
      } catch (error) {
        failures.push({ brand: next.brand, error: error instanceof Error ? error.message : String(error) });
      }
    }
  });
  await Promise.all(workers);

  writeResults(results, failures, new Date().toISOString());
  writeFileSync(join(OUT_DIR, "sponsored-placements-veille.md"), buildVeilleMarkdown(results));

  console.log("\n[study-rerun] Done.");
  console.table(
    results.map((result) => ({
      brand: result.brand,
      score: result.score,
      cited: `${result.citedCount}/${result.validAnswers}`,
      echo: result.echoAnswers,
      instead: result.namedInstead ?? "—",
      promptDebug: result.promptDebug,
    }))
  );
  if (failures.length > 0) {
    console.error("[study-rerun] FAILURES:", failures);
    process.exitCode = 1;
  }
}

// Garde d'exécution directe : le fichier est aussi importé par les tests
// unitaires (node --test), qui ne doivent pas déclencher le re-run.
const isDirectRun = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  if (process.argv.includes("--reprocess")) {
    // Retraitement local des raw/ existants (criblage anti-écho), zéro réseau.
    reprocessFromRaw();
  } else {
    main().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
}

export type { BuyerIntentPrompt };
