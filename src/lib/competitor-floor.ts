/**
 * PLANCHER DE STABILITÉ AVANT DE NOMMER UN RIVAL — la seule vérité du produit.
 *
 * POURQUOI CE FICHIER EXISTE (28/08/2026)
 *
 * Le plancher était appliqué par le RAPPORT (`verdictCompetitors`, corrigé le
 * 14/08) et par personne d'autre. L'EMAIL, lui, nommait le rival de la première
 * question perdue venue, sans aucun seuil — c'est-à-dire exactement la faute
 * que le plancher avait été écrit pour empêcher, rejouée dans un autre fichier.
 *
 * Conséquence concrète et vérifiable : un prospect recevait « ChatGPT
 * recommande Loomera à ta place », cliquait, et le rapport ne nommait personne.
 * Deux surfaces du même produit se contredisaient, et c'est celle qui part par
 * la poste qui avait tort.
 *
 * La règle, mesurée sur le protocole 5x5 du 30/07 : le rival d'UNE question
 * perdue change jusqu'à 4 fois sur 5 passages du même instrument, le même jour,
 * dans la même langue. Un rival cité sur un tiers des questions vérifiées, et
 * jamais moins de 2 questions distinctes, est structurel. En dessous, c'est du
 * bruit, et on ne nomme personne — un verdict sans nom reste vrai.
 */

import type { BuyerIntentPromptResult } from "./audit-engine";

export const VERDICT_COMPETITOR_MIN_SHARE = 1 / 3;
export const VERDICT_COMPETITOR_MIN_QUESTIONS = 2;

/** Le nombre de questions distinctes qu'un rival doit occuper pour être nommable. */
export function verdictCompetitorThreshold(availableQuestionCount: number) {
  return Math.max(VERDICT_COMPETITOR_MIN_QUESTIONS, Math.ceil(availableQuestionCount * VERDICT_COMPETITOR_MIN_SHARE));
}

export function uniqueNames(names: string[]) {
  const seen = new Set<string>();

  return names.filter((name) => {
    const cleaned = name.trim();
    const key = cleaned.toLowerCase();

    if (!cleaned || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function competitorCounts(names: string[]) {
  const counts = new Map<string, { name: string; count: number; firstIndex: number }>();

  names.forEach((name, index) => {
    const cleaned = name.trim().replace(/\s+/g, " ");
    const key = cleaned.toLowerCase();

    if (!cleaned) return;

    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { name: cleaned, count: 1, firstIndex: index });
  });

  return [...counts.values()].sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex);
}

export function lostBuyerQuestions(questions: BuyerIntentPromptResult[]) {
  return questions.filter((question) => question.available && !question.brandMentioned);
}

/**
 * Les rivaux nommables : cités sur les questions PERDUES, franchissant le
 * plancher, les plus cités d'abord, 3 max. Comptage en QUESTIONS DISTINCTES.
 */
export function verdictCompetitors(questions: BuyerIntentPromptResult[]) {
  const availableCount = questions.filter((question) => question.available).length;
  const threshold = verdictCompetitorThreshold(availableCount);
  const perQuestion = lostBuyerQuestions(questions).flatMap((question) => uniqueNames(question.competitors));

  return competitorCounts(perQuestion)
    .filter((item) => item.count >= threshold)
    .slice(0, 3)
    .map((item) => item.name);
}
