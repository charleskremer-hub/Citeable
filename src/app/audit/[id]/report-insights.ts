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
  if (score < 30) return "#C0492E";
  if (score < 60) return "#8A6420";
  return "#17705B";
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
  if (state === "recommended") return { label: locale === "fr" ? "✓ Recommandé" : "✓ Recommended", color: "#17705B", bg: "rgba(202,255,60,0.12)" };
  if (state === "missing") return { label: locale === "fr" ? "✗ Pas cité" : "✗ Not cited", color: "#B04329", bg: "rgba(255,143,107,0.12)" };
  return { label: locale === "fr" ? "— Non vérifié" : "— Not checked", color: "#5B6B82", bg: "rgba(255,255,255,0.05)" };
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

// --- Le bloc « À publier » (lot 1 « la page dit une chose ») -----------------
// Un seul bloc, verrouillé derrière Monitor 9 € : le visiteur gratuit voit CE
// QU'IL OBTIENDRA, nommé et compté — jamais le contenu. Ces fonctions sont
// PURES et ne reçoivent aucun texte généré : elles ne peuvent structurellement
// pas faire fuiter un extrait de fichier machine (JSON-LD, llms.txt, robots)
// vers un tier gratuit. Voir scripts/report-page-contract.test.ts.

export type PublishTeaserItem = { name: string; detail: string };

export function publishTeaserItems(args: {
  lostQuestions: string[];
  questionCount: number;
  blockedBots: string[];
  locale: Locale;
}): PublishTeaserItem[] {
  const { lostQuestions, questionCount, blockedBots, locale } = args;
  const fr = locale === "fr";
  const items: PublishTeaserItem[] = [];

  if (lostQuestions.length > 0) {
    const first = lostQuestions[0];
    items.push({
      name: fr
        ? lostQuestions.length === 1
          ? "La réponse rédigée à la question que tu perds"
          : `${lostQuestions.length} réponses rédigées aux questions que tu perds`
        : lostQuestions.length === 1
          ? "The written answer to the question you lose"
          : `${lostQuestions.length} written answers to the questions you lose`,
      detail: fr ? `À commencer par « ${first} »` : `Starting with “${first}”`,
    });
  }

  // Le nom dit le BÉNÉFICE dans la langue du client ; le terme technique vit en
  // fin de détail, entre parenthèses, pour l'agence ou le dev qui liront après
  // lui. Un fondateur DTC ne sait pas ce qu'est un « schéma FAQ JSON-LD » : un
  // nom qu'il ne comprend pas ne peut pas lui donner envie de payer 9 €.
  items.push({
    name: fr ? "Ta FAQ dans le format que les IA lisent" : "Your FAQ in the format AI reads",
    detail: fr
      ? `Écrite depuis tes ${questionCount} questions d'achat auditées. Un bloc à coller une fois dans ton site, sans toucher au design (format technique : schéma FAQ JSON-LD).`
      : `Written from your ${questionCount} audited buying questions. One block to paste into your site, once, without touching your design (technical name: FAQ schema, JSON-LD).`,
  });

  items.push({
    name: fr ? "Ta fiche d'identité pour les assistants IA" : "Your ID card for AI assistants",
    detail: fr
      ? "Le fichier que ChatGPT et Gemini lisent en premier pour savoir ce que tu vends, à qui, et quand te recommander (llms.txt)."
      : "The file ChatGPT and Gemini read first to know what you sell, to whom, and when to recommend you (llms.txt).",
  });

  // Jamais une étape sans objet : le correctif robots.txt n'est annoncé que si
  // des crawlers IA sont réellement bloqués aujourd'hui.
  if (blockedBots.length > 0) {
    items.push({
      name: fr ? "Le déblocage qui laisse les IA entrer sur ton site" : "The unblock that lets AI into your site",
      detail: fr
        ? `${blockedBots.join(", ")} ne ${blockedBots.length > 1 ? "peuvent" : "peut"} pas lire ton site aujourd'hui. Une ligne à corriger (robots.txt).`
        : `${blockedBots.join(", ")} cannot read your site today. One line to fix (robots.txt).`,
    });
  }

  return items;
}

/**
 * Le rival du verdict OUVERT, et la question sur laquelle il gagne.
 *
 * MÊME PLANCHER que partout ailleurs : seul un concurrent qui franchit
 * `verdictCompetitors` (src/lib/competitor-floor.ts) peut être nommé — règle
 * inchangée, aucune exception. On privilégie une question PERDUE (le rival est
 * recommandé, pas la marque) ; à défaut, une question où il est cité aussi.
 */
export function verdictRival(questions: BuyerIntentPromptResult[]): { name: string; prompt: string; replacement: boolean } | null {
  const nameable = new Set(verdictCompetitors(questions).map((name) => name.trim().toLowerCase()));
  if (nameable.size === 0) return null;

  const pick = (question: BuyerIntentPromptResult) =>
    question.competitors.find((candidate) => nameable.has(candidate.trim().toLowerCase()));

  const replacement = questions.find((question) => question.available && !question.brandMentioned && pick(question));
  const any = replacement ?? questions.find((question) => question.available && pick(question));
  const name = any ? pick(any) : undefined;

  return name && any ? { name, prompt: any.prompt, replacement: any === replacement } : null;
}

/**
 * CE QUE LE CLIENT OBTIENT — le bloc qui vend, sur le rapport gratuit.
 *
 * Demande de Charles (28/09/2026) : « il faut que dans le rapport on valorise
 * mieux ce que le client obtiendrait comme résultat ». Le bloc précédent
 * (`publishTeaserItems`) listait des livrables de l'ère marques DTC — une FAQ
 * JSON-LD « à coller dans ton site », un llms.txt, un robots.txt — c'est-à-dire
 * des gestes techniques, l'exact contraire de l'offre « tu ne touches à rien ».
 *
 * Trois étages, du résultat vers la preuve :
 *   1. l'OBJECTIF, écrit sur SA question et SON confrère (jamais générique) ;
 *   2. la VALEUR en euros — uniquement pour un cabinet d'expertise comptable,
 *      seul métier dont on a un ordre de grandeur sourcé ; ailleurs, rien ;
 *   3. le CALENDRIER de ce qui est livré, sans rien promettre qu'on ne fait pas
 *      (pas d'annuaires ni d'avis : l'off-site est désactivé).
 */
export type ServiceValuePlan = {
  objective: string;
  value?: { text: string; source: string };
  steps: Array<{ when: string; what: string }>;
};

/** Honoraires annuels constatés pour une petite SARL/SAS, bas de fourchette
 *  (l-expert-comptable.com, « 2 000 à 5 000 € », relevé le 28/09/2026). */
export const ACCOUNTING_CLIENT_ANNUAL_FEES_EUR = { low: 2000, high: 5000 } as const;
export const ACCOUNTING_FEES_SOURCE = "l-expert-comptable.com — honoraires annuels constatés pour une petite SARL/SAS";

export function serviceValuePlan(args: {
  brandName: string;
  engineName: string;
  lostQuestions: string[];
  questionCount: number;
  rival: { name: string; prompt: string; replacement: boolean } | null;
  topRivals: string[];
  category?: string;
  monthlyPriceEur: number;
  recheckEvery: string;
  locale: Locale;
  /** Domaine racine du cabinet (sans www) — pour nommer SON sous-domaine ai. */
  brandDomain?: string;
}): ServiceValuePlan {
  const fr = args.locale === "fr";
  const q = (text: string) => (fr ? `« ${text} »` : `“${text}”`);
  const lost = args.lostQuestions.length;

  const objective = args.rival?.replacement
    ? fr
      ? `Aujourd'hui, sur ${q(args.rival.prompt)}, ${args.engineName} recommande ${args.rival.name}. L'objectif : que ce soit ${args.brandName}.`
      : `Today, on ${q(args.rival.prompt)}, ${args.engineName} recommends ${args.rival.name}. The goal: make it ${args.brandName}.`
    : lost > 0
      ? fr
        ? `Aujourd'hui, ${args.engineName} ne te cite sur aucune de ces ${lost} question${lost > 1 ? "s" : ""} de clients. L'objectif : devenir sa réponse.`
        : `Today, ${args.engineName} does not name you on ${lost} of these client questions. The goal: become its answer.`
      : fr
        ? `${args.engineName} te cite déjà. L'objectif : le rester, chaque mois, face à tes confrères.`
        : `${args.engineName} already names you. The goal: stay there, every month, against your peers.`;

  let value: ServiceValuePlan["value"];
  if (args.category === "accounting firm") {
    const yearly = args.monthlyPriceEur * 12;
    const years = Math.floor(ACCOUNTING_CLIENT_ANNUAL_FEES_EUR.low / yearly);
    value = {
      text: fr
        ? `Chacune de ces questions, c'est un dirigeant qui cherche son expert-comptable et appelle le cabinet que l'IA lui donne. Un client SARL ou SAS représente en général ${ACCOUNTING_CLIENT_ANNUAL_FEES_EUR.low.toLocaleString("fr-FR")} à ${ACCOUNTING_CLIENT_ANNUAL_FEES_EUR.high.toLocaleString("fr-FR")} € d'honoraires par an : un seul client gagné paie plus de ${years} ans de GetPick.`
        : `Each of these questions is a business owner looking for an accountant and calling the firm AI names. A small company client is typically worth €${ACCOUNTING_CLIENT_ANNUAL_FEES_EUR.low.toLocaleString("en-GB")}–${ACCOUNTING_CLIENT_ANNUAL_FEES_EUR.high.toLocaleString("en-GB")} in fees per year: one client won pays for more than ${years} years of GetPick.`,
      source: ACCOUNTING_FEES_SOURCE,
    };
  }

  const covered = lost > 0 ? lost : args.questionCount;
  const firstQuestion = args.lostQuestions[0];
  const peers = args.topRivals.slice(0, 3);
  const steps = [
    {
      when: fr ? "Jour 1" : "Day 1",
      what: fr
        ? "Tu nous ajoutes comme administrateur de ta fiche Google — 1 minute, rien de technique, comme partager un document."
        : "You add us as a manager of your Google Business Profile — 1 minute, nothing technical, like sharing a document.",
    },
    {
      when: fr ? "Sous 48 h" : "Within 48 h",
      what: fr
        ? `Ta fiche Google complétée pour ${covered === 1 ? "cette question" : `ces ${covered} questions`}${firstQuestion ? `, à commencer par ${q(firstQuestion)}` : ""} : services, spécialités, zone. Puis tes annuaires alignés (Bing, Yelp, PagesJaunes).`
        : `Your Google profile completed for ${covered === 1 ? "this question" : `these ${covered} questions`}${firstQuestion ? `, starting with ${q(firstQuestion)}` : ""}: services, specialties, area. Then your listings aligned (Bing, Yelp, PagesJaunes).`,
    },
    {
      when: args.recheckEvery.charAt(0).toUpperCase() + args.recheckEvery.slice(1),
      what: fr
        ? `Les mêmes questions reposées à ${args.engineName}, avec recherche web. Tu vois, une par une, qui est cité — toi ou ${args.rival?.name ?? "tes confrères"} — et quelles pages l'IA a lues.`
        : `The same questions asked to ${args.engineName} again, with web search. You see, one by one, who gets named — you or ${args.rival?.name ?? "your peers"} — and which pages AI read.`,
    },
    {
      when: fr ? "En continu" : "Ongoing",
      what: fr
        ? `Ton tableau de bord : ta visibilité dans l'IA face à ${peers.length ? peers.join(", ") : "tes confrères"}.`
        : `Your dashboard: your AI visibility against ${peers.length ? peers.join(", ") : "your peers"}.`,
    },
  ];

  return { objective, value, steps };
}

/**
 * OÙ L'IA A LU POUR RÉPONDRE — agrégé sur les questions du diagnostic.
 *
 * C'est la réponse factuelle à « comment être sûr que l'IA ira lire ta page » :
 * on ne le suppose pas, on relève les pages que le moteur a réellement lues
 * (recherche ancrée) et l'on compte si le site du cabinet — ou son sous-domaine
 * `ai.` — en fait partie. Vide si aucune réponse n'était ancrée : on n'affiche
 * alors rien plutôt qu'un bloc trompeur.
 */
export type SourcesSummary = {
  groundedCount: number;
  top: Array<{ domain: string; count: number }>;
  ownDomainReadCount: number;
};

function registrable(domain: string) {
  return domain.toLowerCase().replace(/^www\./, "");
}

export function sourcesSummary(questions: BuyerIntentPromptResult[], brandDomain: string): SourcesSummary {
  const own = registrable(brandDomain);
  const counts = new Map<string, number>();
  let groundedCount = 0;
  let ownDomainReadCount = 0;
  for (const question of questions) {
    const surfaces = (question.surfaces ?? []).filter((surface) => surface.grounded);
    if (!surfaces.length) continue;
    groundedCount += 1;
    const domains = new Set(surfaces.flatMap((surface) => (surface.sources ?? []).map((source) => registrable(source.domain))));
    if (own && [...domains].some((domain) => domain === own || domain.endsWith(`.${own}`))) ownDomainReadCount += 1;
    for (const domain of domains) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, 6);
  return { groundedCount, top, ownDomainReadCount };
}
