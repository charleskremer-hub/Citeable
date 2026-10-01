/**
 * Le haut du rapport parle des DEUX moteurs (Charles, 01/10/2026 16 h 54) :
 * l'email accroche sur ChatGPT, le rapport ne doit pas répondre « le classement
 * de Gemini » avec d'autres noms.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { firmKey, twoEngineHeadline, twoEngineView } from "@/app/audit/[id]/two-engines";

const surface = (kind: string, engine: string, checked: boolean, brand: boolean, competitors: string[]) => ({
  kind, engine, status: checked ? "checked" : "failed", brandMentioned: brand, competitors, surface: engine, reachable: checked, rawAnswerSnippet: "",
});
const q = (gem: ReturnType<typeof surface>, gpt: ReturnType<typeof surface> | null) =>
  ({ prompt: "q", available: true, brandMentioned: gem.brandMentioned, competitors: gem.competitors, surfaces: gpt ? [gem, gpt] : [gem] }) as never;

// Le cas réel R-P Avocats : Gemini 0/4 (Lefebvre, Majeli), ChatGPT 0/3 (+1 en échec).
const RP = [
  q(surface("ai_engine", "Gemini", true, false, ["Cabinet Lefebvre", "Majeli Avocat"]), surface("cross_check", "ChatGPT", true, false, ["Cabinet Lefebvre", "Majeli Avocat", "Antoine Genet Avocat"])),
  q(surface("ai_engine", "Gemini", true, false, []), surface("cross_check", "ChatGPT", true, false, ["Maître Brett Le Meur"])),
  q(surface("ai_engine", "Gemini", true, false, []), surface("cross_check", "ChatGPT", true, false, ["Nautilus Avocats"])),
  q(surface("ai_engine", "Gemini", true, false, []), surface("cross_check", "ChatGPT", false, false, [])),
];
const opts = { primaryEngine: "Gemini", isSelf: (n: string) => /R-P/.test(n), locale: "fr" as const };

test("classement sur toutes les réponses : ChatGPT d'abord, variantes regroupées, réponse en échec exclue", () => {
  const view = twoEngineView(RP, opts)!;
  assert.equal(view.label, "ChatGPT et Gemini");
  assert.deepEqual(view.engines.map((e) => [e.engine, e.cited, e.checked]), [["ChatGPT", 0, 3], ["Gemini", 0, 4]]);
  assert.equal(view.totalAnswers, 7);
  assert.deepEqual(view.rivals.slice(0, 2), [{ name: "Cabinet Lefebvre", count: 2 }, { name: "Majeli Avocat", count: 2 }]);
  assert.ok(view.rivals.some((r) => r.name === "Maître Brett Le Meur"));
});

test("le verdict nomme les deux moteurs, sans rien affirmer de plus que les comptes", () => {
  assert.equal(twoEngineHeadline(twoEngineView(RP, opts)!, { brandName: "Cabinet R-P Avocats", questionCount: 4, locale: "fr" }), "Sur 4 questions d'achat, ni ChatGPT ni Gemini ne recommandent Cabinet R-P Avocats.");
  const cited = [q(surface("ai_engine", "Gemini", true, true, []), surface("cross_check", "ChatGPT", true, false, ["X Avocats"]))];
  assert.match(twoEngineHeadline(twoEngineView(cited, opts)!, { brandName: "B", questionCount: 1, locale: "fr" }), /ChatGPT cite B sur 0\/1, Gemini sur 1\/1/);
});

test("sans réponse ChatGPT (anciens rapports) : vue Gemini inchangée", () => {
  assert.equal(twoEngineView([q(surface("ai_engine", "Gemini", true, false, ["A"]), null)], opts), null);
  assert.equal(twoEngineView([q(surface("ai_engine", "Gemini", true, false, ["A"]), surface("cross_check", "ChatGPT", false, false, []))], opts), null);
});

test("regroupement des écritures d'un même cabinet", () => {
  assert.equal(firmKey("Cabinet Majeli"), firmKey("Majeli Avocat"));
  assert.equal(firmKey("Maître Majeli"), firmKey("Majeli Avocats"));
  assert.notEqual(firmKey("Cabinet Lefebvre"), firmKey("Majeli Avocat"));
});

test("écran : titre, classement et tableau de bord branchés sur la vue deux moteurs", () => {
  const page = readFileSync(resolve(import.meta.dirname, "../src/app/audit/[id]/page.tsx"), "utf8");
  assert.equal((page.match(/twoEngineHeadline\(engines2/g) ?? []).length, 2, "verdict verrouillé ET rapport complet");
  assert.match(page, /engineRows=\{engines2\?\.engines\}/);
  assert.match(page, /rankEngineName=\{engines2\?\.label\}/);
});
