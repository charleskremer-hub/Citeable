import { homeCopy } from "./i18n";
import { SERVICE_OFFER_COPY, SERVICE_PLAN_PRICE_EUR, SERVICE_TRIAL_LABEL } from "./plan-promises";

/**
 * TEST AVOCATS (01/10/2026, GO Charles). Deuxième métier testé à côté de la tête
 * de pont expert-comptable, au même prix, sans toucher à la home. L'offre et la
 * caisse sont celles de la home (une seule vérité sur l'offre).
 *
 * Revue du 08/10/2026 (GO Charles), après relecture critique de la page :
 *  - VOUVOIEMENT partout. Le tutoiement SaaS face à un avocat coûte la
 *    crédibilité dès la première ligne ; les emails de prospection vouvoient
 *    déjà — la page était incohérente avec eux.
 *  - Plus de « client perdu » ni de « chaque jour, l'IA donne le nom d'un
 *    avocat… » : une absence dans une réponse ne prouve ni une recherche réelle
 *    ni un client perdu. On montre ce que l'IA répond, pas ce qu'on suppose.
 *  - Plus de comparaison « agence GEO 2 000–20 000 € » : une page FAQ écrite par
 *    un agent n'est pas une prestation d'agence, un avocat le voit tout de suite.
 *  - VALIDATION AVANT PUBLICATION : pour un cabinet d'avocats, l'agent dépose la
 *    page en BROUILLON sur le WordPress ; l'avocat la relit et clique « Publier ».
 *    La responsabilité déontologique reste chez lui (voir cms-connection-store).
 */
const fr = homeCopy.fr;
const price = `${SERVICE_PLAN_PRICE_EUR} € HT/mois`;

const faq = {
  technique: {
    question: "Qu'est-ce que j'ai à faire, concrètement ?",
    answer:
      "Deux gestes. Un : cliquer « Connecter mon site », vous connecter à votre WordPress et cliquer « Approuver ». Deux : relire la page que l'agent a déposée en brouillon et cliquer « Publier » — ou la modifier, ou ne pas la publier. Rien n'apparaît sur votre site sans votre validation. Accès révocable à tout moment.",
  },
  delai: {
    question: "Combien de temps avant que ça bouge ?",
    answer:
      "Une recommandation d'IA se déplace en semaines, pas en un clic, et nous ne promettons aucun délai que nous n'avons pas mesuré. Vous voyez chaque re-test, question par question, et vous pouvez arrêter chaque mois.",
  },
  variabilite: {
    question: "Les réponses des IA changent tout le temps : à quoi bon ?",
    answer:
      "C'est précisément pour cela que GetPick re-teste chaque mois au lieu de livrer un audit ponctuel. Chaque mesure est datée et conservée — question, moteur, réponse, confrères nommés — pour distinguer une tendance d'une variation passagère.",
  },
  questions: {
    question: "Quelles questions testez-vous ?",
    answer:
      "Uniquement celles qu'un client pose avant de choisir son avocat — « avocat pour un divorce avec enfants à Nantes », « avocat pour contester un licenciement à Lille » —, dans vos domaines d'intervention, jamais « avis sur Maître X ». Une question qui porte votre nom renvoie presque toujours une mention et gonfle le score : nous testons si l'IA vous nomme quand personne ne lui a soufflé votre nom.",
  },
  deontologie: {
    question: "Et la déontologie ?",
    answer:
      "Aucune page n'est publiée sans votre validation : l'agent la dépose en brouillon sur votre WordPress, vous la relisez, vous la publiez. Elle s'en tient aux faits que votre site contient déjà — domaines d'intervention, modalités, contact —, sans superlatif, sans comparaison avec un confrère, sans promesse de résultat ; une réponse qui en contient est écartée avant même le brouillon. Vous restez maître de votre site : l'accès est révocable et la page peut être retirée à tout moment.",
  },
  reel: {
    question: "C'est simulé ou c'est réel ?",
    answer:
      "Réel. Chaque vérification est une vraie question envoyée en direct à Gemini et ChatGPT, recherche web activée, au moment du diagnostic. Pas de prompts simulés, pas de réponses en cache, pas d'estimations modélisées. Si un moteur est indisponible, le rapport le dit au lieu d'inventer.",
  },
  score: {
    question: "Comment est calculé le score sur 100 ?",
    answer:
      "Sans boîte noire. 75 % : la part des vraies questions de vos futurs clients où l'IA vous nomme — sans qu'on lui ait soufflé votre nom. 25 % : vos fondations lisibles par l'IA — votre cabinet trouvé en recherche web, votre site lisible par les robots des IA, votre notoriété publique. Un cabinet que l'IA ne nomme sur aucune question ne dépasse pas 25. À côté du score, le rapport donne votre place face à vos confrères et le rang auquel l'IA vous cite.",
  },
  langues: {
    question: "Ça marche en français et en anglais ?",
    answer: "Oui. Diagnostics, pages et rapports sortent dans les deux langues, et les questions sont posées dans la langue de vos clients.",
  },
  remboursement: {
    question: "Et si cela ne fonctionne pas pour moi ?",
    answer:
      "Vous êtes remboursé sur simple demande sous 30 jours : un email à hello@getpick.ai suffit, sans justification ni formulaire. L'abonnement est mensuel et résiliable à tout moment.",
  },
};

const [freeTier, serviceTier] = fr.pricingTiers;

export const avocatsCopy = {
  ...fr,
  heroEyebrow: "L'agent qui vous fait recommander par l'IA",
  heroTitle: "Quand un client cherche un avocat près de chez lui, l'IA répond un nom.",
  heroTitleAccent: "Faites que ce soit le vôtre.",
  heroSubtitle:
    "GetPick mesure ce que Gemini et ChatGPT répondent quand on leur demande un avocat dans votre ville et vos domaines, puis rédige, depuis les faits de votre site, les réponses que ces assistants lisent. Vous les relisez et les publiez d'un clic — sans webmaster. Chaque mois, il refait la mesure.",
  formTitle: "Votre diagnostic gratuit",
  formSubtitle: "Votre cabinet + votre site. Email optionnel — il débloque votre score et le confrère nommé à votre place.",
  success: "C'est noté — votre diagnostic gratuit arrive.",
  websitePlaceholder: "votrecabinet.fr",
  emailPlaceholder: "vous@votrecabinet-avocat.fr",
  submitCta: "Voir qui l'IA recommande →",
  error: "Un problème est survenu. Réessayez dans un instant.",
  errorWebsiteLooksLikeEmail: "On dirait une adresse email — indiquez plutôt l'adresse de votre site, par exemple votrecabinet.fr.",
  errorWebsiteCredentials: "Une adresse de site ne contient pas d'identifiants — indiquez simplement votre domaine, par exemple votrecabinet.fr.",
  errorWebsiteUnreachable: "Ce site ne répond pas — vérifiez l'adresse, par exemple votrecabinet.fr.",
  errorFreeQuotaEmail: "Un diagnostic gratuit a déjà été lancé avec cet email aujourd'hui. Revenez demain — ou écrivez à hello@getpick.ai et je le lance pour vous.",
  errorFreeQuotaDomain: "Un diagnostic gratuit a déjà été lancé pour ce site aujourd'hui. Revenez demain — ou écrivez à hello@getpick.ai et je le lance pour vous.",
  formFootnote: "Les vraies questions de vos futurs clients, envoyées en direct à Gemini et ChatGPT — jamais simulées. Sans carte, sans inscription.",
  formBuyerIntentNote:
    "Nous posons à l'IA la question que tape un futur client — « avocat divorce / licenciement / bail commercial à [ville] ». En 2 minutes, vous voyez ce qu'elle répond, et quel confrère elle nomme.",
  demoTitle: "Voici ce que l'IA répond aujourd'hui.",
  demoQuestion: "Quel avocat à Nantes pour un divorce avec enfants ?",
  demoAnswerBefore: "Pour un divorce avec enfants à Nantes, le nom qui revient le plus souvent est ",
  demoAnswerRival: "Cabinet Merisier Avocats",
  demoAnswerAfter:
    " — il intervient exclusivement en droit de la famille et reçoit en premier rendez-vous sous 48 h. Deux autres cabinets du barreau valent le coup d'œil.",
  demoCaption: "Votre cabinet n'apparaît pas dans cette réponse.",
  stepsTitle: "Trois étapes. Vous gardez la main sur la dernière.",
  steps: [
    { num: "1", time: "30 s", title: "Indiquez votre cabinet", body: "Son nom et l'adresse de votre site. C'est toute la configuration." },
    { num: "2", time: "2 min", title: "L'agent interroge les IA", body: "Les vraies questions de vos futurs clients, envoyées en direct à Gemini et ChatGPT au moment du diagnostic. Jamais simulées." },
    { num: "3", time: "Le jour même", title: "Vous relisez, vous publiez", body: "L'agent rédige la réponse à chaque question où un confrère est cité, depuis les faits de votre site, et la dépose en brouillon sur votre WordPress. Vous la relisez et cliquez « Publier » — rien n'est mis en ligne sans vous." },
  ],
  deliverableTitle: "Pas un tableau de bord. Un constat, et une page prête à relire.",
  reportVerdict: "Gemini ne vous nomme pas sur 7 questions de clients sur 12.",
  reportRivalLabel: "Cité à votre place",
  reportRival: "Cabinet Merisier Avocats",
  reportFixLabel: "Rédigé par l'agent — publié par vous, sur votre domaine",
  reportFixTitle: "Sur votre site — les réponses que l'IA lit",
  reportFixBody:
    "« Quel avocat pour un divorce avec enfants à Nantes ? » — Droit de la famille, résidence des enfants et pension alimentaire ; premier rendez-vous au cabinet ou en visio ; honoraires fixés par convention écrite.",
  reportCaption: "Exemple illustratif — votre page est rédigée depuis votre vrai diagnostic.",
  monitorEyebrow: "Ce que vous recevez chaque mois",
  monitorTitle: "Un écran. Ce que l'IA répond, et comment cela évolue.",
  monitorSubtitle:
    "Chaque mois, GetPick repose les vraies questions de vos futurs clients et vous envoie le résultat. Rien à ouvrir, rien à configurer : c'est dans votre boîte mail.",
  monitorTiles: [
    { label: fr.monitorTiles[0].label, value: fr.monitorTiles[0].value, delta: fr.monitorTiles[0].delta },
    { label: "L'IA vous nomme", value: fr.monitorTiles[1].value, delta: fr.monitorTiles[1].delta },
    { label: fr.monitorTiles[2].label, value: fr.monitorTiles[2].value, delta: fr.monitorTiles[2].delta },
  ],
  monitorRows: [
    { question: "Avocat pour un divorce avec enfants à Nantes", cited: "Vous", mine: true, move: "nouveau" },
    { question: "Avocat pension alimentaire à Nantes", cited: "Vous", mine: true, move: "conservé" },
    { question: "Avocat droit de la famille en Loire-Atlantique", cited: "Cabinet Merisier Avocats", mine: false, move: "" },
    { question: "Avocat changement de régime matrimonial à Nantes", cited: "Cabinet Merisier Avocats", mine: false, move: "" },
  ],
  monitorFooter: "Chaque mesure est datée et conservée : question, moteur, confrères nommés.",
  monitorCaption: "Exemple illustratif — votre rapport est construit depuis vos propres questions.",
  pricingTitle: `Une seule offre. ${price}.`,
  pricingSubtitle: "Pas de crédits, pas de calculateur, pas d'engagement.",
  pricingTiers: [
    {
      ...freeTier,
      note: "Le diagnostic : voyez qui l'IA recommande aujourd'hui.",
      features: ["Les vraies questions de vos futurs clients, envoyées en direct", "Votre score sur 100", "Le confrère nommé à votre place", "Si l'IA sait seulement ce que vous faites", "Votre part de voix"],
    },
    {
      ...serviceTier,
      name: "Fait pour vous",
      note: "Vous connectez votre site en un clic, vous validez chaque page. GetPick fait le reste.",
      features: [
        "L'agent rédige la réponse à chaque vraie question de vos futurs clients, depuis les faits de votre site, et la dépose en brouillon sur votre WordPress : vous la relisez et la publiez d'un clic.",
        "Un tableau de bord : votre visibilité dans l'IA face à vos confrères, question par question.",
        "Chaque mois, il re-teste ces questions et vous montre qui l'IA cite — vous ou un confrère.",
        `${SERVICE_TRIAL_LABEL.fr}, tout compris. Sans engagement.`,
      ],
    },
  ],
  pricingReassurance: `${SERVICE_TRIAL_LABEL.fr}. Carte demandée, rien n'est débité pendant l'essai. Pour arrêter : un email à hello@getpick.ai avant la fin, vous ne payez rien.`,
  pricingGuarantee: "Remboursé sur simple demande sous 30 jours.",
  tldrBody: `GetPick est un agent GEO pour les professionnels de service — ici, les avocats. Il envoie à Gemini et ChatGPT, recherche web activée, les vraies questions que posent vos futurs clients dans vos domaines d'intervention et votre ville — en direct, jamais simulées — puis vous dit si c'est vous ou un confrère qui est nommé, en nommant ce confrère. Il rédige ensuite, depuis les faits de votre site et sans superlatif ni promesse de résultat, les réponses à ces questions, et les dépose en brouillon sur votre WordPress : rien n'est publié sans votre validation. Il refait la mesure chaque mois. Un diagnostic gratuit, puis une seule offre : ${price} après 14 jours gratuits, résiliable à tout moment, remboursée sur simple demande sous 30 jours.`,
  founderBody: "Je m'appelle Charles. Je construis GetPick et je suis chaque diagnostic moi-même. Pas d'équipe commerciale, pas de chatbot : pour toute question, c'est moi qui réponds.",
  faqItems: [faq.technique, faq.deontologie, faq.questions, faq.delai, faq.variabilite, faq.reel, faq.score, faq.langues, faq.remboursement],
  closingTitle: "Que répond l'IA quand on lui demande un avocat dans votre ville ?",
  closingBody: "Deux minutes pour le savoir, question par question.",
  closingCta: "Lancer mon diagnostic gratuit →",
  footerTagline: "L'agent qui fait recommander les avocats par l'IA. Vous validez chaque page.",
};

/** Garde-fou : la page avocats est TOUJOURS au même prix que la home. */
export const AVOCATS_SAME_OFFER = { href: serviceTier.href, plan: serviceTier.plan, price: serviceTier.price, cta: SERVICE_OFFER_COPY.fr.cta };
