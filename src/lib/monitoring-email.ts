/**
 * LE RAPPORT MENSUEL — le livrable que l'abonnement paie.
 *
 * POURQUOI CE FICHIER EXISTE (22/09/2026, pivot offre services).
 *
 * Le mail de suivi mensuel EXISTAIT déjà et partait bien après chaque rescan.
 * Trois choses le rendaient faux le jour du pivot, et aucune n'était visible
 * depuis la landing :
 *
 *   1. il était ANGLAIS EN DUR, alors que le beachhead est un métier français.
 *      Un expert-comptable bordelais recevait « Your 3 things to do this week ».
 *   2. il disait « Monitor », un palier retiré de la vente.
 *   3. surtout, il donnait au client une LISTE DE CHOSES À FAIRE — « what to do,
 *      where » — pendant que la page d'accueil lui jure qu'il ne touche à rien.
 *      La surface qui part par la poste contredisait la surface qui vend. C'est
 *      exactement la faute du 28/08 (le mail nommait un rival que le rapport ne
 *      nommait pas), rejouée sur la promesse au lieu du rival.
 *
 * CE QUE CE MAIL N'AFFIRME PAS, ET C'EST DÉLIBÉRÉ. Il ne dit pas que GetPick a
 * publié quoi que ce soit ce mois-ci : le moteur off-site n'existe pas encore
 * (brique 1 du brief du 22/09). Tant qu'il n'existe pas, le mail rapporte ce
 * qui est MESURÉ — qui l'IA nomme, qui la devance, ce qui a bougé — et rien
 * d'autre. Le jour où le moteur publie, c'est ici qu'on ajoutera la ligne, avec
 * le lien de la page publiée, et pas avant.
 *
 * Module PUR : aucune base, aucun réseau, aucun import de valeur depuis
 * `audit-engine` (seulement des types, effacés à la compilation). C'est ce qui
 * le rend testable directement, contrairement au corps de mail précédent qui
 * ne l'était que par lecture de source.
 */

import type { BuyerIntentPromptResult, MonitoringSnapshot } from "./audit-engine";
import type { Locale } from "./i18n";
import { RECHECK_INTERVAL_DAYS } from "./plan-promises";
import { verdictCompetitors } from "./competitor-floor";

export type MonthlyMonitoringInput = {
  brandName: string;
  auditId: string;
  score: number;
  locale: Locale;
  monitoring: MonitoringSnapshot;
  buyerIntentPrompts: BuyerIntentPromptResult[];
  /** Date du rapport. Passée explicitement : un mail dont le mois dépend de
   *  l'horloge de la machine n'est pas testable, et se décale en fin de mois. */
  now: Date;
};

export type MonthlyMonitoringEmail = { subject: string; body: string };

const MONTHS: Record<Locale, readonly string[]> = {
  fr: ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** Mois en toutes lettres, en UTC — la même date doit produire le même mot
 *  quelle que soit la machine qui envoie. */
export function monthLabel(date: Date, locale: Locale) {
  return MONTHS[locale][date.getUTCMonth()];
}

/**
 * Le compte qui décide de tout : sur les questions RÉELLEMENT posées, combien
 * nomment le client, et combien laissent la place à quelqu'un d'autre.
 *
 * `available` d'abord : une question qu'un moteur n'a pas pu traiter n'est ni
 * gagnée ni perdue, et la compter en perte gonflerait le problème qu'on vend.
 */
export function namingCounts(prompts: BuyerIntentPromptResult[]) {
  const asked = prompts.filter((prompt) => prompt.available);
  const named = asked.filter((prompt) => prompt.brandMentioned);
  return { asked: asked.length, named: named.length, lost: asked.length - named.length };
}

function scoreDeltaLine(snapshot: MonitoringSnapshot, locale: Locale) {
  if (snapshot.scoreDelta === null) {
    return locale === "fr" ? "premier relevé, pas encore de comparaison" : "first reading, nothing to compare yet";
  }
  const signed = `${snapshot.scoreDelta >= 0 ? "+" : ""}${snapshot.scoreDelta}`;
  return locale === "fr"
    ? `${signed} points depuis le relevé précédent`
    : `${signed} points since the previous reading`;
}

/**
 * Le corps du rapport mensuel, dans la langue du client.
 *
 * Miroir exact de la maquette publiée sur la landing (`monitorTiles` /
 * `monitorRows` de `i18n.ts`) : les questions posées, celles où l'IA nomme le
 * client, celles où elle nomme un confrère — puis ce qui a bougé. Si la
 * maquette et ce mail divergent, c'est la maquette qui ment au prospect.
 */
export function buildMonthlyMonitoringEmail(input: MonthlyMonitoringInput): MonthlyMonitoringEmail {
  const fr = input.locale === "fr";
  const { asked, named, lost } = namingCounts(input.buyerIntentPrompts);
  const rivals = verdictCompetitors(input.buyerIntentPrompts);
  const month = monthLabel(input.now, input.locale);

  const subject = fr
    ? `Ton rapport GetPick — ${input.brandName}, ${month}`
    : `Your GetPick report — ${input.brandName}, ${month}`;

  const lines: string[] = [];

  lines.push(fr ? `Rapport ${month} — ${input.brandName}` : `${month} report — ${input.brandName}`);
  lines.push("");
  lines.push(fr ? `Questions posées à l'IA : ${asked}` : `Questions asked to AI: ${asked}`);
  lines.push(fr ? `L'IA te nomme : ${named} / ${asked}` : `AI names you: ${named} / ${asked}`);
  lines.push(fr ? `Quelqu'un d'autre est nommé : ${lost} / ${asked}` : `Someone else is named: ${lost} / ${asked}`);
  lines.push(fr ? `Score : ${input.score}/100 (${scoreDeltaLine(input.monitoring, input.locale)})` : `Score: ${input.score}/100 (${scoreDeltaLine(input.monitoring, input.locale)})`);
  lines.push("");

  // Le plancher du 14/08 s'applique ici comme au rapport : on ne nomme un
  // concurrent que s'il est structurel. Un mail qui nomme quelqu'un que le
  // rapport ne nomme pas est la faute du 28/08.
  if (rivals.length) {
    lines.push(fr ? "Nommés à ta place, de façon récurrente :" : "Named in your place, repeatedly:");
    for (const rival of rivals) lines.push(`- ${rival}`);
  } else {
    lines.push(
      fr
        ? "Personne n'est nommé à ta place de façon assez régulière pour être cité — ce mois-ci, la place est ouverte."
        : "Nobody is named in your place often enough to be worth naming — this month, the slot is open."
    );
  }
  lines.push("");

  const movements = input.monitoring.competitorMovements.slice(0, 5);
  if (movements.length) {
    lines.push(fr ? "Ce qui a bougé depuis le dernier relevé :" : "What moved since the last reading:");
    for (const movement of movements) lines.push(`- ${movement.competitor} — ${movement.detail} (${movement.prompt})`);
  } else {
    lines.push(fr ? "Rien n'a bougé depuis le dernier relevé." : "Nothing moved since the last reading.");
  }
  lines.push("");

  lines.push(
    fr
      ? `Le rapport complet : https://www.getpick.ai/audit/${input.auditId}`
      : `The full report: https://www.getpick.ai/audit/${input.auditId}`
  );
  lines.push("");
  // La phrase de clôture est la promesse du pivot, et elle est VRAIE au sens
  // strict : le client n'a rien à faire pour que le prochain relevé parte.
  // Elle n'affirme RIEN sur ce que GetPick aurait publié entre-temps.
  lines.push(
    fr
      ? `Tu n'as rien à faire : le prochain relevé part dans ${RECHECK_INTERVAL_DAYS} jours.`
      : `Nothing is required from you: the next reading goes out in ${RECHECK_INTERVAL_DAYS} days.`
  );

  return { subject, body: lines.join("\n") };
}
