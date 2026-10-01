import { homeCopy } from "./i18n";
import { SERVICE_PLAN_PRICE_EUR } from "./plan-promises";

/**
 * TEST AVOCATS (01/10/2026, GO Charles). Deuxième métier testé à côté de la tête
 * de pont expert-comptable, au même prix, sans toucher à la home. Seuls les
 * textes qui parlent du métier changent ; l'offre, la caisse, les garanties et la
 * FAQ commune sont celles de la home (une seule vérité sur l'offre).
 *
 * Diagnostic vérifié en prod avant d'écrire cette page : audits 1b2d3628
 * (droit de la famille, Nantes) et 9cb5f131 (droit du travail, Lille) — catégorie
 * « law firm », questions par spécialité + ville, vrais confrères nommés.
 */
const fr = homeCopy.fr;

const questionsFaq = {
  question: "Quelles questions testez-vous ?",
  answer:
    "Uniquement celles qu'un client tape avant de choisir son avocat — « avocat pour un divorce avec enfants à Nantes », « avocat pour contester un licenciement à Lille » —, dans tes domaines d'intervention, jamais « avis sur Maître X ». Les questions qui portent ton nom renvoient presque toujours une mention et gonflent le score. On teste si l'IA te nomme quand personne ne lui a soufflé ton nom.",
};

const deontologyFaq = {
  question: "Et la déontologie ?",
  answer:
    "Les réponses publiées sur ton site s'en tiennent aux faits qu'il contient déjà : domaines d'intervention, modalités, contact. L'agent a pour consigne de n'écrire ni superlatif, ni comparaison avec un confrère, ni promesse de résultat — et une réponse qui contient un superlatif ou une promesse de résultat est écartée avant publication. Tu restes maître de ton site : l'accès est révocable et la page peut être retirée à tout moment.",
};

export const avocatsCopy = {
  ...fr,
  heroTitle: "Quand un client cherche un avocat près de chez lui, l'IA répond un nom.",
  formSubtitle: "Ton cabinet + ton site. Email optionnel — il débloque ton score et le confrère nommé à ta place.",
  emailPlaceholder: "toi@toncabinet-avocat.fr",
  formBuyerIntentNote:
    "Pose à l'IA la vraie question de tes clients — « avocat divorce / licenciement / bail commercial à [ville] ». En 2 minutes, GetPick te montre le confrère qu'elle cite à ta place, nommé, et pourquoi.",
  demoQuestion: "Quel avocat à Nantes pour un divorce avec enfants ?",
  demoAnswerBefore: "Pour un divorce avec enfants à Nantes, le nom qui revient le plus souvent est ",
  demoAnswerRival: "Cabinet Merisier Avocats",
  demoAnswerAfter:
    " — il intervient exclusivement en droit de la famille et reçoit en premier rendez-vous sous 48 h. Deux autres cabinets du barreau valent le coup d'œil.",
  demoCaption: "Ton cabinet n'est pas dans la réponse. Le client ne verra jamais ton nom.",
  reportRival: "Cabinet Merisier Avocats",
  reportFixBody:
    "« Quel avocat pour un divorce avec enfants à Nantes ? » — Droit de la famille, résidence des enfants et pension alimentaire ; premier rendez-vous au cabinet ou en visio ; honoraires fixés par convention écrite.",
  monitorRows: [
    { question: "Avocat pour un divorce avec enfants à Nantes", cited: "Toi", mine: true, move: "nouveau" },
    { question: "Avocat pension alimentaire à Nantes", cited: "Toi", mine: true, move: "conservé" },
    { question: "Avocat droit de la famille en Loire-Atlantique", cited: "Cabinet Merisier Avocats", mine: false, move: "" },
    { question: "Avocat changement de régime matrimonial à Nantes", cited: "Cabinet Merisier Avocats", mine: false, move: "" },
  ],
  tldrBody: `GetPick est l'agent GEO des professionnels de service — ici, les avocats. Il travaille à te faire recommander par les assistants IA, et tu n'appelles jamais de webmaster : tu connectes ton site WordPress en un clic. Concrètement : il envoie à Gemini et ChatGPT, recherche web activée, les vraies questions que posent tes futurs clients dans tes domaines d'intervention et ta ville — en direct, jamais simulées — puis te dit si c'est toi ou un confrère qui est nommé, en nommant ce confrère. Il écrit ensuite sur ton propre site, depuis ses faits et sans superlatif ni promesse de résultat, les réponses à ces questions exactes, et re-teste tout chaque mois. Un diagnostic gratuit, puis une seule offre : ${SERVICE_PLAN_PRICE_EUR} € HT/mois après 14 jours gratuits, résiliable à tout moment, remboursée sur simple demande sous 30 jours.`,
  faqItems: [
    ...fr.faqItems.filter((item) => item.question !== questionsFaq.question && !/pub/i.test(item.question)).slice(0, 4),
    questionsFaq,
    deontologyFaq,
    ...fr.faqItems.filter((item) => item.question !== questionsFaq.question && !/pub/i.test(item.question)).slice(4),
  ],
  closingTitle: "Chaque jour, l'IA donne le nom d'un avocat à un client de ta ville.",
  footerTagline: "L'agent qui fait recommander les avocats par l'IA. Un clic pour connecter ton site.",
};
