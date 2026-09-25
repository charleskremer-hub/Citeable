/**
 * Preuve du basculement — moteur off-site (P0, brique 3).
 *
 * La promesse produit n'est pas « un meilleur score » : c'est le BASCULEMENT.
 * Sur chaque vraie question d'achat, passe-t-on de « l'IA cite un confrère
 * nommé » à « l'IA te cite » ? Cette brique compare un audit à son précédent
 * (lien `previous_audit_id` posé par le rescan hebdo) et produit, question par
 * question, l'avant / après — le rapport que le client attend vraiment.
 *
 * Fonctions PURES : aucun accès base ni réseau. La récupération des deux audits
 * vit dans /api/shift-proof.
 */

import type { BuyerIntentPromptResult } from "@/lib/audit-engine";
import type { Locale } from "@/lib/i18n";

export type ShiftMovement = "won" | "lost" | "held_you" | "held_rival" | "still_absent" | "new";

export type ShiftRow = {
  question: string;
  youCitedBefore: boolean | null; // null = la question n'existait pas au scan précédent
  youCitedNow: boolean;
  rivalBefore: string | null;
  rivalNow: string | null;
  movement: ShiftMovement;
};

export type ShiftSummary = {
  totalQuestions: number;
  youCitedNow: number;
  youCitedBefore: number; // sur les questions communes aux deux scans
  wonCount: number;       // confrère → toi
  lostCount: number;      // toi → confrère
  netChange: number;      // youCitedNow - youCitedBefore sur les questions communes
};

export type ShiftProof = {
  hasPrevious: boolean;
  summary: ShiftSummary;
  rows: ShiftRow[];
  headline: string;
};

function normalize(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstRival(prompt: BuyerIntentPromptResult): string | null {
  return prompt.competitors.find((name) => name && name.trim().length > 0)?.trim() ?? null;
}

function movementFor(youBefore: boolean | null, youNow: boolean, rivalNow: string | null): ShiftMovement {
  if (youBefore === null) return "new";
  if (!youBefore && youNow) return "won";
  if (youBefore && !youNow) return "lost";
  if (youBefore && youNow) return "held_you";
  return rivalNow ? "held_rival" : "still_absent";
}

/**
 * Compare les questions d'achat du scan courant à celles du précédent.
 * On itère sur les questions COURANTES disponibles (l'ensemble vivant), et on
 * apparie par texte de question normalisé.
 */
export function computeShiftProof(
  currentPrompts: BuyerIntentPromptResult[],
  previousPrompts: BuyerIntentPromptResult[] | null,
  locale: Locale = "fr",
): ShiftProof {
  const current = currentPrompts.filter((prompt) => prompt.available);
  const prevByKey = new Map<string, BuyerIntentPromptResult>();
  for (const prompt of previousPrompts ?? []) {
    if (prompt.available) prevByKey.set(normalize(prompt.prompt), prompt);
  }
  const hasPrevious = Boolean(previousPrompts && prevByKey.size > 0);

  const rows: ShiftRow[] = current.map((prompt) => {
    const prev = hasPrevious ? prevByKey.get(normalize(prompt.prompt)) ?? null : null;
    const youBefore = hasPrevious ? (prev ? prev.brandMentioned : null) : null;
    const youNow = prompt.brandMentioned;
    return {
      question: prompt.prompt,
      youCitedBefore: youBefore,
      youCitedNow: youNow,
      rivalBefore: prev ? firstRival(prev) : null,
      rivalNow: firstRival(prompt),
      movement: movementFor(youBefore, youNow, firstRival(prompt)),
    };
  });

  const common = rows.filter((row) => row.youCitedBefore !== null);
  const summary: ShiftSummary = {
    totalQuestions: rows.length,
    youCitedNow: rows.filter((row) => row.youCitedNow).length,
    youCitedBefore: common.filter((row) => row.youCitedBefore === true).length,
    wonCount: rows.filter((row) => row.movement === "won").length,
    lostCount: rows.filter((row) => row.movement === "lost").length,
    netChange: 0,
  };
  summary.netChange = common.filter((row) => row.youCitedNow).length - summary.youCitedBefore;

  return { hasPrevious, summary, rows, headline: headlineFor(hasPrevious, summary, locale) };
}

function headlineFor(hasPrevious: boolean, summary: ShiftSummary, locale: Locale): string {
  const fr = locale === "fr";
  if (!hasPrevious) {
    return fr
      ? `Scan de référence : l'IA te cite sur ${summary.youCitedNow}/${summary.totalQuestions} questions. Le prochain scan mesurera le basculement.`
      : `Baseline scan: AI cites you on ${summary.youCitedNow}/${summary.totalQuestions} questions. The next scan will measure the shift.`;
  }
  if (summary.wonCount > 0 && summary.wonCount >= summary.lostCount) {
    return fr
      ? `Basculement : ${summary.wonCount} question(s) sont passées d'un confrère à toi. L'IA te cite maintenant sur ${summary.youCitedNow}/${summary.totalQuestions}.`
      : `Shift: ${summary.wonCount} question(s) moved from a peer to you. AI now cites you on ${summary.youCitedNow}/${summary.totalQuestions}.`;
  }
  if (summary.netChange < 0 || summary.lostCount > summary.wonCount) {
    return fr
      ? `Recul ce scan : ${summary.lostCount} question(s) reperdue(s). L'IA te cite sur ${summary.youCitedNow}/${summary.totalQuestions} — on ajuste la présence off-site.`
      : `Setback this scan: ${summary.lostCount} question(s) lost. AI cites you on ${summary.youCitedNow}/${summary.totalQuestions} — we adjust the off-site presence.`;
  }
  return fr
    ? `Stable : l'IA te cite sur ${summary.youCitedNow}/${summary.totalQuestions} questions, position tenue.`
    : `Stable: AI cites you on ${summary.youCitedNow}/${summary.totalQuestions} questions, position held.`;
}

export function movementLabel(movement: ShiftMovement, locale: Locale): string {
  const fr = locale === "fr";
  switch (movement) {
    case "won": return fr ? "Basculé vers toi" : "Moved to you";
    case "lost": return fr ? "Reperdu" : "Lost";
    case "held_you": return fr ? "Conservé" : "Held";
    case "held_rival": return fr ? "Toujours un confrère" : "Still a peer";
    case "still_absent": return fr ? "Pas encore cité" : "Not cited yet";
    case "new": return fr ? "Nouvelle question" : "New question";
  }
}
