/**
 * Dérivations PURES du rapport d'audit : tout ce que la page calcule à partir
 * des questions d'achat stockées, sans base ni réseau.
 *
 * Extrait de page.tsx le 08/08/2026 (lot « verdict en trois blocs ») : les
 * fonctions historiques sont inchangées ; s'y ajoute le verdict au-dessus de la
 * porte (`lockedVerdictHeadline`, `lostBuyerQuestions`, `verdictCompetitors`),
 * pur lui aussi pour être testable seul — voir scripts/report-verdict.test.ts.
 */
import { UNKNOWN_CATEGORY } from "@/lib/audit-engine";
import type { BuyerIntentPromptResult, IcpSegmentMetadata, PlainAction } from "@/lib/audit-engine";
import type { Locale } from "@/lib/i18n";
import {
  VERDICT_COMPETITOR_MIN_QUESTIONS,
  VERDICT_COMPETITOR_MIN_SHARE,
  competitorCounts,
  lostBuyerQuestions,
  uniqueNames,
  verdictCompetitorThreshold,
  verdictCompetitors,
} from "@/lib/competitor-floor";

// Le plancher a déménagé dans `@/lib/competitor-floor` le 28/08/2026 : l'email
// devait l'appliquer aussi, et un module de page ne peut pas être importé par
// `audit-engine` sans créer un cycle. Ces ré-exports gardent les appelants
// existants (`page.tsx`, `scripts/report-verdict.test.ts`) intacts.
export {
  VERDICT_COMPETITOR_MIN_QUESTIONS,
  VERDICT_COMPETITOR_MIN_SHARE,
  competitorCounts,
  lostBuyerQuestions,
  uniqueNames,
  verdictCompetitorThreshold,
  verdictCompetitors,
};


export function extractPasteable(text: string) {
  const match = text.match(/[«"“]([\s\S]+?)[»"”]/);
  return (match ? match[1] : text).trim();
}

export function scoreColor(score: number) {
  if (score < 30) return "#FF5F5F";
  if (score < 60) return "#FFB84D";
  return "#CAFF3C";
}



export function localizedUnavailableReason(reason: string | undefined, locale: Locale, engine = "Gemini") {
  if (!reason) return locale === "fr" ? `${engine} est indisponible ; réessaie.` : `${engine} unavailable; try again.`;
  // Ancien libellé « Native NanoCorp web_search unavailable » conservé : les audits déjà en base le contiennent.
  if (reason.includes("Web search unavailable") || reason.includes("Native NanoCorp web_search unavailable")) {
    return locale === "fr" ? "Recherche web indisponible ; ce rapport utilise uniquement les vérifications terminées." : reason;
  }
  if (reason.includes("Gemini indisponible")) return locale === "fr" ? reason : "Gemini unavailable; try again.";
  if (reason.includes("ChatGPT indisponible")) return locale === "fr" ? reason : "ChatGPT unavailable; try again.";
  return reason;
}

export type PromptState = "recommended" | "missing" | "unchecked";

export function promptAnalysis(question: BuyerIntentPromptResult): { state: PromptState; competitors: string[]; reason?: string } {
  const aiSurface = question.surfaces.find((surface) => surface.kind === "ai_engine");

  if (aiSurface) {
    if (aiSurface.status !== "checked") {
      return { state: "unchecked", competitors: [], reason: aiSurface.unavailableReason };
    }
    return { state: aiSurface.brandMentioned ? "recommended" : "missing", competitors: question.competitors };
  }

  const checked = question.surfaces.find((surface) => surface.kind === "supplementary" && surface.status === "checked");
  if (checked) {
    return { state: checked.brandMentioned ? "recommended" : "missing", competitors: question.competitors };
  }

  return { state: "unchecked", competitors: [], reason: question.surfaces.find((surface) => surface.unavailableReason)?.unavailableReason };
}

export function promptStatusPill(state: PromptState, locale: Locale): { label: string; color: string; bg: string } {
  if (state === "recommended") return { label: locale === "fr" ? "✓ Recommandé" : "✓ Recommended", color: "#CAFF3C", bg: "rgba(202,255,60,0.12)" };
  if (state === "missing") return { label: locale === "fr" ? "✗ Pas cité" : "✗ Not cited", color: "#FF8F6B", bg: "rgba(255,143,107,0.12)" };
  return { label: locale === "fr" ? "— Non vérifié" : "— Not checked", color: "#9A9AA8", bg: "rgba(255,255,255,0.05)" };
}

export function checkedQuestions(questions: BuyerIntentPromptResult[]) {
  const available = questions.filter((question) => question.available);
  return available.length ? available : questions;
}

/**
 * Noun phrase used in every customer-facing fix sentence.
 * When category detection fails we fall back to a segment-appropriate phrase —
 * never a placeholder like "your business type", which reads as a broken template
 * in the exact sample that is supposed to sell the Agent plan.
 * Every call site below must keep it in a prepositional slot (about/around/in ${business}).
 */
function businessPhrase(category: string | undefined, locale: Locale, segment?: IcpSegmentMetadata) {
  const trimmed = (category ?? "").trim();
  if (trimmed && trimmed !== UNKNOWN_CATEGORY) return trimmed;
  if (segment?.key === "local_independent") return locale === "fr" ? "ce service" : "this service";
  if (segment?.key === "creator_influencer") return locale === "fr" ? "cette niche" : "this niche";
  return locale === "fr" ? "cette catégorie" : "this category";
}

export function fixSentence(category: string | undefined, hasCompetitors: boolean, locale: Locale, segment?: IcpSegmentMetadata) {
  const business = businessPhrase(category, locale, segment);

  if (segment?.key === "local_independent") {
    return locale === "fr"
      ? `À corriger : aligne ta fiche Google Business, tes annuaires métier, ta page “pourquoi me choisir” et tes avis locaux autour de ${business}.`
      : `What to fix: align your Google Business Profile, professional directories, “why choose me” page, and local reviews around ${business}.`;
  }

  if (segment?.key === "creator_influencer") {
    return locale === "fr"
      ? `À corriger : aligne tes bios/profils sociaux, tes mentions “top créateurs”, ta presse et tes preuves d'entité autour de ${business}.`
      : `What to fix: align social bios/profiles, top-creator listicle mentions, press, and entity proof around ${business}.`;
  }

  if (hasCompetitors) {
    return locale === "fr"
      ? `À corriger : ajoute une page claire sur ${business}, avec FAQ, pages produit, avis et réponses directes aux questions d'achat.`
      : `What to fix: add a clear FAQ/product page about ${business}, with reviews and direct answers to buyer questions.`;
  }

  return locale === "fr"
    ? `À corriger : rends ton site plus clair sur ${business}, tes preuves produit, tes avis et les raisons de choisir ta marque.`
    : `What to fix: make your site clearer about ${business}, product proof, reviews, and why buyers should choose your brand.`;
}

export function treatmentProofForQuestion(brandName: string, category: string | undefined, question: BuyerIntentPromptResult, competitors: string[], engine: string, locale: Locale, segment?: IcpSegmentMetadata) {
  const business = businessPhrase(category, locale, segment);
  const citedCompetitors = uniqueNames([...question.competitors, ...competitors]).slice(0, 3);

  if (locale === "fr") {
    const competitorText = citedCompetitors.length
      ? `${engine} cite déjà ${citedCompetitors.join(", ")} sur ce sujet. La page doit expliquer pourquoi choisir ${brandName}, sans les attaquer.`
      : `Aucun concurrent clair n'est cité sur ce sujet. La page doit rendre ${brandName} plus facile à recommander.`;

    return {
      gap: question.brandMentioned
        ? citedCompetitors.length
          ? `Écart trouvé : ${engine} cite aussi ${citedCompetitors.join(", ")} pour « ${question.prompt} ».`
          : `Question vérifiée : « ${question.prompt} ».`
        : `Écart trouvé : ${engine} ne cite pas ${brandName} pour « ${question.prompt} ».`,
      title: segment?.key === "local_independent" ? `Fiche Google Business / page locale à corriger : « ${question.prompt} »` : segment?.key === "creator_influencer" ? `Bio sociale / listicle à corriger : « ${question.prompt} »` : `FAQ/page produit à créer : « ${question.prompt} »`,
      draft: segment?.key === "local_independent"
        ? `Brouillon local à publier après relecture : « ${brandName} accompagne les clients qui cherchent ${business} près de chez eux. Explique la ville servie, les cas traités, les qualifications, les avis vérifiables et la prochaine étape pour réserver. ${competitorText} »`
        : segment?.key === "creator_influencer"
          ? `Brouillon profil/listicle à publier après relecture : « ${brandName} est un profil à suivre dans ${business} pour son angle, ses contenus utiles et ses preuves publiques. Ajoute la niche, les plateformes actives, les meilleures preuves et les liens presse/profils. ${competitorText} »`
          : `Brouillon FAQ à publier après relecture : « Si tu compares les options dans ${business}, commence par ton besoin, les preuves disponibles et la prochaine étape. ${brandName} doit présenter ses cas d'usage, ses avis ou preuves vérifiables, puis répondre directement à cette question. ${competitorText} »`,
      google: segment?.key === "local_independent"
        ? `Phrase Google Business à coller : « ${brandName} aide les clients à choisir ${business} avec une prise de rendez-vous claire, des avis vérifiables et des informations locales à jour. »`
        : segment?.key === "creator_influencer"
          ? `Phrase bio/profil à coller : « ${brandName} crée du contenu sur ${business} à suivre pour des conseils clairs, des preuves publiques et des liens vers les meilleurs contenus et interviews. »`
          : `Phrase page produit à coller : « ${brandName} aide les clients à comparer ${business} avec des informations claires, des avis vérifiables et une prochaine étape simple. »`,
    };
  }

  const competitorText = citedCompetitors.length
    ? `${engine} already cites ${citedCompetitors.join(", ")} for this topic, so the page should explain why buyers should choose ${brandName} without attacking them.`
    : `No clear competitor is cited for this topic, so the page should make ${brandName} easier to recommend.`;

  return {
    gap: question.brandMentioned
      ? citedCompetitors.length
        ? `Gap found: ${engine} also cites ${citedCompetitors.join(", ")} for “${question.prompt}”.`
        : `Question checked: “${question.prompt}”.`
      : `Gap found: ${engine} does not cite ${brandName} for “${question.prompt}”.`,
    title: segment?.key === "local_independent" ? `Google Business / local page fix: “${question.prompt}”` : segment?.key === "creator_influencer" ? `Social bio / listicle fix: “${question.prompt}”` : `FAQ/product page to create: “${question.prompt}”`,
    draft: segment?.key === "local_independent"
      ? `Local draft to publish after review: “${brandName} helps clients looking for ${business} nearby. State the city served, cases handled, qualifications, verifiable reviews, and the next booking step. ${competitorText}”`
      : segment?.key === "creator_influencer"
        ? `Profile/listicle draft to publish after review: “${brandName} is a creator worth following in ${business} for a clear angle, useful content, and public proof. Add the niche, active platforms, best proof, and press/profile links. ${competitorText}”`
        : `FAQ draft to publish after review: “If you are comparing options in ${business}, start with your use case, available proof, and the next step. ${brandName} should present its use cases, reviews or verifiable proof, and a direct answer to this question. ${competitorText}”`,
    google: segment?.key === "local_independent"
      ? `Google Business sentence to paste: “${brandName} helps clients choose ${business} with clear booking steps, verifiable reviews, and up-to-date local information.”`
      : segment?.key === "creator_influencer"
        ? `Social/profile sentence to paste: “${brandName} creates content about ${business} worth following for clear advice, public proof, and links to the best content and interviews.”`
        : `Product-page sentence to paste: “${brandName} helps buyers compare ${business} with clear information, verifiable reviews, and a simple next step.”`,
  };
}

export function priorityQuestions(questions: BuyerIntentPromptResult[]) {
  return [
    ...questions.filter((item) => item.available && !item.brandMentioned),
    ...questions.filter((item) => item.available && item.brandMentioned && item.competitors.length > 0),
    ...questions.filter((item) => item.available && item.brandMentioned && item.competitors.length === 0),
  ];
}

export function priorityGapQuestions(questions: BuyerIntentPromptResult[]) {
  return priorityQuestions(questions).filter((question) => question.available && (!question.brandMentioned || question.competitors.length > 0));
}

export function treatmentProof(brandName: string, category: string | undefined, questions: BuyerIntentPromptResult[], competitors: string[], engine: string, locale: Locale, segment?: IcpSegmentMetadata) {
  const question = priorityQuestions(questions)[0];

  return question ? treatmentProofForQuestion(brandName, category, question, competitors, engine, locale, segment) : null;
}

// --- Verdict au-dessus de la porte (P1 « verdict en trois blocs ») -----------
// Ce que voit un rapport verrouillé se limite à : une phrase construite sur les
// données réelles, les questions perdues, un CTA. Rien d'inventé : si les
// données ne nomment aucun concurrent, la phrase de repli n'en nomme aucun.

/** Les questions d'achat vérifiées où la marque n'est PAS citée. */

/**
 * PLANCHER DE STABILITÉ AVANT DE NOMMER UN RIVAL — et pourquoi il existe.
 *
 * La règle de rédaction posée le 30/07, mesurée sur le protocole 5x5, dit :
 * « ne jamais nommer le rival d'une question perdue — il change jusqu'à 4 fois
 * sur 5 passages du même instrument, le même jour, dans la même langue. »
 *
 * Cette fonction faisait exactement l'inverse : elle prenait le top-3 des
 * concurrents des questions perdues, sur UN SEUL passage, et ces noms partaient
 * dans le H1 du verdict — la plus grosse typo de la page, lue par tout visiteur,
 * affirmée comme un fait. Un rival cité sur UNE question perdue est du bruit
 * mesuré ; l'écrire en gros est une affirmation que le prospect peut démentir
 * de tête, et c'est le seul terrain où GetPick est encore défendable.
 *
 * On ne peut pas répéter les passages ici (ce serait une dépense par audit), mais
 * on a 12 questions dans le même audit : un rival cité sur PLUSIEURS d'entre
 * elles est structurel, un rival cité sur une seule est du bruit. C'est
 * exactement l'arbitrage fait à la main le 01/08 sur le lot 1, où les marques
 * sans rival « >= 4/12 » ont été écartées plutôt que de fabriquer un nom.
 *
 * Seuil retenu, hérité de ce geste : un tiers des questions d'achat vérifiées,
 * jamais moins de 2 questions distinctes.
 *
 * QUAND PERSONNE NE FRANCHIT LE PLANCHER, ON NE NOMME PERSONNE : le repli sans
 * nom existe déjà dans `lockedVerdictHeadline` et reste vrai. Mieux vaut
 * « Gemini ne recommande jamais {marque} » — exact — que « Gemini recommande
 * Loomera » quand Loomera sortait d'un tirage.
 */

/** Le nombre de questions distinctes qu'un rival doit occuper pour être nommable. */

/**
 * Les concurrents du verdict : ceux cités sur les questions PERDUES (c'est eux
 * qui prennent la place de la marque), qui franchissent le plancher de
 * stabilité ci-dessus, les plus cités d'abord, 3 max.
 *
 * Le comptage se fait en QUESTIONS DISTINCTES, pas en occurrences : un rival
 * nommé deux fois dans la même réponse reste un seul signal.
 */

function joinNames(names: string[], locale: Locale) {
  if (names.length <= 1) return names.join("");
  const rest = names.slice(0, -1).join(", ");
  return `${rest} ${locale === "fr" ? "et" : "and"} ${names[names.length - 1]}`;
}

export type LockedVerdictInput = {
  brandName: string;
  engineName: string;
  questionCount: number;
  brandMentionCount: number;
  lostCount: number;
  competitors: string[];
  locale: Locale;
};

/**
 * LA phrase du rapport verrouillé. Chaque variante n'affirme que ce que les
 * données prouvent — jamais de chiffre inventé, jamais de nom inventé.
 */
export function lockedVerdictHeadline({ brandName, engineName, questionCount, brandMentionCount, lostCount, competitors, locale }: LockedVerdictInput): string {
  const fr = locale === "fr";
  const named = joinNames(competitors, locale);

  if (questionCount === 0) {
    return fr
      ? `L'audit de ${brandName} est terminé, mais aucune question d'achat n'a pu être vérifiée.`
      : `The ${brandName} audit is complete, but no buyer question could be checked.`;
  }

  if (lostCount === 0) {
    return fr
      ? `Sur ${questionCount} questions d'achat, ${engineName} cite ${brandName} sur ${brandMentionCount}. Le rapport complet montre lesquelles, et qui d'autre est cité.`
      : `Across ${questionCount} buyer questions, ${engineName} cites ${brandName} on ${brandMentionCount}. The full report shows which ones, and who else gets cited.`;
  }

  if (brandMentionCount === 0) {
    if (competitors.length) {
      return fr
        ? `Sur ${questionCount} questions d'achat, ${engineName} recommande ${named}. Pas ${brandName}.`
        : `Across ${questionCount} buyer questions, ${engineName} recommends ${named}. Not ${brandName}.`;
    }
    return fr
      ? `Sur ${questionCount} questions d'achat, ${engineName} ne recommande jamais ${brandName}.`
      : `Across ${questionCount} buyer questions, ${engineName} never recommends ${brandName}.`;
  }

  if (competitors.length) {
    return fr
      ? `Sur ${questionCount} questions d'achat, ${engineName} ne cite ${brandName} que sur ${brandMentionCount}. Sur les questions perdues, il recommande ${named}.`
      : `Across ${questionCount} buyer questions, ${engineName} only cites ${brandName} on ${brandMentionCount}. On the lost questions, it recommends ${named}.`;
  }

  return fr
    ? `Sur ${questionCount} questions d'achat, ${engineName} ne cite ${brandName} que sur ${brandMentionCount}.`
    : `Across ${questionCount} buyer questions, ${engineName} only cites ${brandName} on ${brandMentionCount}.`;
}

// --- Impact CALCULÉ des actions (lot P2 « impact calculé + phase ») ----------
// Un rang d'affichage n'est pas une mesure. Ce qui suit dérive l'impact de
// chaque action depuis les données stockées de l'audit — le recouvrement entre
// les questions qu'elle adresse (`basedOn`) et les questions d'achat PERDUES —
// pur, sans réseau, testable seul (voir scripts/report-action-impact.test.ts).
// Interdits absolus, hérités du verdict : jamais un chiffre rédigé, jamais un
// pourcentage inventé, jamais une promesse de gain. Quand la donnée manque,
// l'impact est « non mesuré », il ne fabrique RIEN.

export type ActionPhase = "foundations" | "content" | "authority";

export type ActionImpact =
  | { measured: true; addressedLostCount: number; lostCount: number }
  | { measured: false };

export type RankedAction = {
  action: PlainAction;
  phase: ActionPhase;
  impact: ActionImpact;
};

/** Trois fixes maximum à l'écran — la règle produit, pas un détail de style. */
export const MAX_DISPLAYED_ACTIONS = 3;

function normalizeActionPrompt(prompt: string) {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Phase du plan à laquelle l'action appartient, déduite de sa famille — même
 * convention de préfixe de titre que `localizePlainAction` (les actions de
 * `buildPlainActions` sont générées en anglais, leurs titres sont stables).
 * - foundations : les faits de base que l'IA lit (profils, fiches, annuaires) ;
 * - content : les pages qui répondent aux questions d'achat ;
 * - authority : les preuves tierces (listicles, presse, avis).
 */
export function actionPhase(action: PlainAction): ActionPhase {
  const title = action.title;

  if (
    title.startsWith("Update Google Business Profile") ||
    title.startsWith("Refresh professional directory") ||
    title.startsWith("Align social bios")
  ) {
    return "foundations";
  }

  if (
    title.startsWith("Earn listicle") ||
    title.startsWith("Ask 3 customers") ||
    title.startsWith("Get included in top-creator") ||
    title.startsWith("Build press and entity proof")
  ) {
    return "authority";
  }

  // FAQ/pages produit, page « pourquoi me choisir », et toute action inconnue :
  // la famille « contenu » est le défaut — c'est une catégorie, pas un chiffre.
  return "content";
}

/**
 * L'impact d'une action = combien de questions d'achat PERDUES elle adresse,
 * reproductible depuis `raw_results` : `basedOn` (les questions que l'action
 * cible) croisé avec les questions vérifiées où la marque n'est pas citée.
 * Sans `basedOn`, ou sans question perdue, il n'y a rien à mesurer : l'impact
 * est non mesuré, jamais estimé.
 */
export function actionImpact(action: PlainAction, questions: BuyerIntentPromptResult[]): ActionImpact {
  const lost = lostBuyerQuestions(questions);

  if (!lost.length || !action.basedOn?.length) return { measured: false };

  const targeted = new Set(action.basedOn.map(normalizeActionPrompt));
  const addressedLostCount = lost.filter((question) => targeted.has(normalizeActionPrompt(question.prompt))).length;

  return { measured: true, addressedLostCount, lostCount: lost.length };
}

/**
 * Les actions à afficher : chacune portant son impact calculé et sa phase,
 * triées par impact décroissant (le calculé, pas l'ordre d'arrivée), les
 * non-mesurées en dernier, ordre d'origine en cas d'égalité, 3 max.
 */
export function rankActionsByImpact(actions: PlainAction[], questions: BuyerIntentPromptResult[]): RankedAction[] {
  const impactValue = (impact: ActionImpact) => (impact.measured ? impact.addressedLostCount : -1);

  return actions
    .map((action, index) => ({ action, phase: actionPhase(action), impact: actionImpact(action, questions), index }))
    .sort((left, right) => impactValue(right.impact) - impactValue(left.impact) || left.index - right.index)
    .slice(0, MAX_DISPLAYED_ACTIONS)
    .map(({ action, phase, impact }) => ({ action, phase, impact }));
}
