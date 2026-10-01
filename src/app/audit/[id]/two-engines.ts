/**
 * LE RAPPORT PARLE DES DEUX MOTEURS, PARTOUT (Charles, 01/10/2026 16 h 54).
 *
 * Le défaut : le haut du rapport (titre, classement, cases) ne parlait que de
 * Gemini, alors que ChatGPT — l'IA que les clients utilisent le plus — n'était
 * qu'une ligne secondaire sous chaque question. L'email de prospection, lui,
 * accrochait sur ChatGPT. Le prospect cliquait sur « ChatGPT recommande X »
 * et tombait sur « le classement de Gemini » avec d'autres noms : incohérent.
 *
 * Ici, quand la contre-vérification ChatGPT existe, le classement compte les
 * cabinets cités sur TOUTES les réponses obtenues (Gemini + ChatGPT), une
 * réponse = un moteur sur une question. Sans contre-vérification (anciens
 * rapports), rien ne change : null, et l'appelant garde la vue Gemini.
 *
 * Le score /100 reste calculé sur Gemini seul (comparable d'un mois à l'autre) ;
 * il est étiqueté comme tel ailleurs.
 */
import type { BuyerIntentPromptResult } from "@/lib/audit-engine";
import type { PromptState } from "./report-insights";

export type EngineRow = { engine: string; cited: number; checked: number; states: PromptState[] };

export type TwoEngineView = {
  label: string; // « ChatGPT et Gemini »
  engines: EngineRow[]; // ChatGPT d'abord : c'est l'IA que les clients utilisent le plus
  brandCount: number; // réponses où le cabinet est cité
  totalAnswers: number; // réponses obtenues, tous moteurs confondus
  rivals: Array<{ name: string; count: number }>; // réponses où chaque confrère est cité
};

/** Clé de regroupement d'un nom de cabinet : « Cabinet Majeli » = « Majeli Avocat » = « Maître Majeli ». */
export function firmKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(cabinet|avocats?|avocate|maitre|me|selarl|selas|sas|sarl|scp|aarpi|associes|et associes)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function twoEngineView(
  questions: BuyerIntentPromptResult[],
  args: { primaryEngine: string; isSelf: (name: string) => boolean; locale: "fr" | "en" }
): TwoEngineView | null {
  type Answer = { engine: string; state: PromptState; rivals: string[] };
  const perQuestion = questions.map((question) => {
    const primary = question.surfaces.find((surface) => surface.kind === "ai_engine");
    const cross = question.surfaces.find((surface) => surface.kind === "cross_check");
    const answer = (surface: typeof primary, engine: string, rivals: string[]): Answer => ({
      engine,
      state: !surface || surface.status !== "checked" ? "unchecked" : surface.brandMentioned ? "recommended" : "missing",
      rivals: !surface || surface.status !== "checked" ? [] : rivals,
    });
    return {
      primary: answer(primary, args.primaryEngine, question.competitors),
      cross: cross ? answer(cross, cross.engine ?? "ChatGPT", cross.competitors ?? []) : null,
    };
  });

  const crossEngine = perQuestion.find((item) => item.cross)?.cross?.engine;
  const crossChecked = perQuestion.some((item) => item.cross && item.cross.state !== "unchecked");
  if (!crossEngine || !crossChecked) return null;

  const engineRow = (engine: string, pick: (item: (typeof perQuestion)[number]) => Answer | null): EngineRow => {
    const states = perQuestion.map((item) => pick(item)?.state ?? "unchecked");
    return { engine, states, cited: states.filter((state) => state === "recommended").length, checked: states.filter((state) => state !== "unchecked").length };
  };
  const engines = [engineRow(crossEngine, (item) => item.cross), engineRow(args.primaryEngine, (item) => item.primary)];

  // Une réponse = un moteur sur une question. Un confrère nommé deux fois dans
  // la même réponse compte une fois ; variantes d'écriture regroupées.
  const answers = perQuestion.flatMap((item) => [item.primary, item.cross]).filter((item): item is Answer => Boolean(item) && item!.state !== "unchecked");
  const counts = new Map<string, { name: string; count: number }>();
  for (const answer of answers) {
    const seen = new Set<string>();
    for (const name of answer.rivals) {
      if (args.isSelf(name)) continue;
      const key = firmKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key);
      if (entry) {
        entry.count += 1;
        if (name.length < entry.name.length) entry.name = name; // forme la plus courte, la plus lisible
      } else counts.set(key, { name, count: 1 });
    }
  }
  const rivals = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const brandCount = answers.filter((answer) => answer.state === "recommended").length;
  const label = args.locale === "fr" ? `${crossEngine} et ${args.primaryEngine}` : `${crossEngine} and ${args.primaryEngine}`;
  return { label, engines, brandCount, totalAnswers: answers.length, rivals };
}

/** La phrase du verdict quand les deux moteurs ont répondu. N'affirme que ce que les comptes prouvent. */
export function twoEngineHeadline(view: TwoEngineView, args: { brandName: string; questionCount: number; locale: "fr" | "en" }): string {
  const fr = args.locale === "fr";
  const [a, b] = view.engines;
  if (a.cited === 0 && b.cited === 0) {
    return fr
      ? `Sur ${args.questionCount} questions d'achat, ni ${a.engine} ni ${b.engine} ne recommandent ${args.brandName}.`
      : `Across ${args.questionCount} buyer questions, neither ${a.engine} nor ${b.engine} recommends ${args.brandName}.`;
  }
  return fr
    ? `Sur ${args.questionCount} questions d'achat, ${a.engine} cite ${args.brandName} sur ${a.cited}/${a.checked}, ${b.engine} sur ${b.cited}/${b.checked}.`
    : `Across ${args.questionCount} buyer questions, ${a.engine} cites ${args.brandName} on ${a.cited}/${a.checked}, ${b.engine} on ${b.cited}/${b.checked}.`;
}
