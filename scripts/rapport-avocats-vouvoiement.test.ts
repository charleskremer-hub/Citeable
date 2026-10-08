/**
 * Rapport /audit/[id] d'un cabinet d'avocats en VOUVOIEMENT (08/10/2026, GO
 * Charles). C'est la page vers laquelle pointent les emails de prospection aux
 * avocats, qui vouvoient : un rapport qui tutoie contredit l'email qui y mène.
 * Les expert-comptables gardent le tutoiement (non-régression).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { auditCopy, auditCopyFor, auditCopyVous, brandSentimentView, isLawCategory } from "@/lib/i18n";
import { serviceValuePlan } from "@/app/audit/[id]/report-insights";
import { aiReadabilityItems } from "@/app/audit/[id]/ai-readability";

// Bornes Unicode : « prête » ne doit pas matcher « te ».
const TU = /(?<!\p{L})(tu|ton|ta|tes|toi|te|t')(?!\p{L})/iu;

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return strings((value as (...a: unknown[]) => unknown)("Gemini", "Cabinet Merisier", "avocat divorce Nantes"));
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}
// « le ton est favorable » : le nom, pas le possessif.
const clean = (text: string) => text.replace(/« [^»]* »/g, "").replace(/\ble ton\b/g, "");
const tutoiement = (texts: string[]) => texts.find((text) => TU.test(clean(text)));

test("détection : « law firm » seulement", () => {
  assert.equal(isLawCategory("law firm"), true);
  assert.equal(isLawCategory("accounting firm"), false);
  assert.equal(isLawCategory(undefined), false);
  assert.equal(auditCopyFor("fr", true), auditCopyVous);
  assert.equal(auditCopyFor("fr", false), auditCopy.fr);
  assert.equal(auditCopyFor("en", true), auditCopy.en);
});

test("les textes du rapport avocats ne tutoient jamais", () => {
  const visible = Object.entries(auditCopyVous)
    // Blocs des tiers payants à fichiers techniques : jamais rendus au rapport gratuit.
    .filter(([key]) => !/^(tech|youtube|action|proof|publishEyebrow|publishBody|monitorEmpty)/.test(key))
    .map(([, value]) => value);
  assert.equal(tutoiement(strings(visible)), undefined, `tutoiement : ${tutoiement(strings(visible))}`);
});

test("le rapport avocats annonce la validation avant publication", () => {
  assert.match(auditCopyVous.publishLockedBody, /brouillon/);
  assert.match(auditCopyVous.publishLockedBody, /sans votre validation/);
  assert.match(auditCopyVous.verdictRivalReplacement("Gemini", "X", "q"), /Pas vous\.$/);
});

const planArgs = {
  brandName: "Cabinet R-P Avocats",
  engineName: "Gemini",
  lostQuestions: ["Avocat divorce Nantes", "Avocat garde d'enfants Nantes"],
  questionCount: 6,
  rival: { name: "Cabinet Merisier", prompt: "Avocat divorce Nantes", replacement: false },
  topRivals: ["Cabinet Merisier", "Cabinet Dupont"],
  monthlyPriceEur: 69,
  recheckEvery: "tous les mois",
  locale: "fr" as const,
  brandDomain: "rp-avocats.fr",
};

test("plan de valeur avocats : vouvoiement et brouillon, jamais « publiées par l'agent »", () => {
  const plan = serviceValuePlan({ ...planArgs, category: "law firm" });
  const texts = [plan.objective, ...plan.steps.map((step) => step.what)];
  assert.equal(tutoiement(texts), undefined, `tutoiement : ${tutoiement(texts)}`);
  assert.ok(texts.some((text) => /brouillon/.test(text)));
  assert.ok(!texts.some((text) => /Publiées par l'agent/.test(text)));
  const allCited = serviceValuePlan({ ...planArgs, category: "law firm", lostQuestions: [], rival: null });
  assert.equal(TU.test(allCited.objective), false);
});

test("non-régression : le rapport expert-comptable garde son registre", () => {
  const plan = serviceValuePlan({ ...planArgs, category: "accounting firm", rival: null });
  assert.match(plan.objective, /ne te cite pas/);
  assert.match(plan.steps[1].what, /Publiées par l'agent/);
});

test("lisibilité IA et image du cabinet : vouvoiement", () => {
  const items = aiReadabilityItems({ llmsFound: false, structuredDataFound: false, crawlState: "blocked", blocked: ["GPTBot"] }, "fr", true);
  assert.equal(tutoiement(items.flatMap((item) => [item.label, item.why, item.getpick])), undefined);
  for (const label of ["positive", "neutral", "negative", "not_enough_signal"]) {
    const view = brandSentimentView({ label, justification: "" }, "fr", true);
    assert.equal(TU.test(clean(view.guidance)), false, view.guidance);
  }
});

test("la page passe le registre à chaque bloc du rapport gratuit", () => {
  const page = readFileSync(resolve("src/app/audit/[id]/page.tsx"), "utf8");
  for (const block of ["<ClaimReportGate", "<LockedVerdict", "<ScoreHero", "<EmailDeliveryNotice", "<QuestionBoard", "<AiReadabilityBlock", "<ServiceValueBlock"]) {
    const at = page.indexOf(block);
    assert.ok(at > 0, block);
    assert.match(page.slice(at, page.indexOf(">", page.indexOf("/>", at) - 1) + 1 || at + 2000), /vous=\{vous\}/, `${block} sans vous={vous}`);
  }
  assert.match(page, /brandSentimentView\([^;]*, locale, vous\)/);
  assert.match(readFileSync(resolve("src/app/audit/[id]/ServiceValueBlock.tsx"), "utf8"), /<DashboardMockup\s+vous=\{vous\}/);
});
