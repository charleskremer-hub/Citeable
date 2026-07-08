export type Locale = "en" | "fr";

type HeaderReader = {
  get(name: string): string | null;
};

type SentimentLike = {
  label?: string;
  justification?: string;
};

type PlainActionLike = {
  title: string;
  doThis: string;
  where: string;
  basedOn?: string[];
};

const FRANCE_COUNTRY_CODES = new Set(["FR"]);

export function localeFromHeaders(headers: HeaderReader): Locale {
  const acceptLanguage = headers.get("accept-language")?.trim().toLowerCase() ?? "";
  const firstLanguage = acceptLanguage.split(",")[0]?.trim() ?? "";
  const country = ["x-vercel-ip-country", "cf-ipcountry", "x-country-code", "x-nf-country"]
    .map((name) => headers.get(name)?.trim().toUpperCase())
    .find(Boolean);

  return firstLanguage.startsWith("fr") || (country ? FRANCE_COUNTRY_CODES.has(country) : false) ? "fr" : "en";
}

export function localeFromUnknown(value: unknown): Locale {
  return value === "fr" ? "fr" : "en";
}

export const homeCopy = {
  en: {
    navAudit: "Free audit",
    heroEyebrow: "FREE AI AUDIT",
    heroTitle: "Does AI recommend your business?",
    heroSubtitle: "When your customers ask AI for advice, Citeable shows whether it cites you - and who it recommends instead. Then we fix it for you. Free audit, no setup.",
    formTitle: "Run your free audit",
    formSubtitle: "Brand, website, inbox. That's it.",
    freeBadge: "Free",
    success: "You're on the list — we'll be in touch with your free audit.",
    businessLabel: "Business name",
    businessPlaceholder: "Business name",
    websiteLabel: "Website",
    websitePlaceholder: "yourbusiness.com",
    emailLabel: "Email",
    emailPlaceholder: "you@yourbusiness.com",
    loadingCta: "Running…",
    submitCta: "Run my free audit",
    error: "Something went wrong. Please try again.",
    formFootnote: "No card needed. Free checks your visibility with Gemini.",
    positioningEyebrow: "Done-for-you AI visibility",
    positioningTitle: "Stop guessing why AI recommends someone else.",
    positioningBody: "Citeable turns your audit into copy-paste fixes: FAQ answers, Google Business text, page sections, and places where your business should be mentioned.",
    positioningPrice: "Free audit €0 · Monitor €9/month · Agent €19/month.",
    howEyebrow: "How it works",
    howTitle: "Free tells you where you stand. Agent helps you move.",
    howSteps: ["1. Enter your business name and website", "2. See whether AI recommends you, who it recommends instead, and which competitors appear", "3. Let Agent turn the gaps into copy-paste fixes every week"],
    agentEyebrow: "Agent €19/month",
    agentTitle: "An agent that gets you recommended by AI - not just another report.",
    agentBody: "Every week, the agent:",
    agentBadge: "Most popular",
    agentPrice: "€19/month",
    agentFixes: ["Checks your visibility on Gemini + ChatGPT", "Finds what makes you lose recommendations", "Writes 1 to 3 copy-paste fixes: FAQ answer, Google Business text, page section", "Gives you a mention plan: directories, Reddit/Quora, comparisons", "An agent to talk to, connected to your audit"],
    agentCardTitle: "Done to 80%. You validate and paste.",
    agentCardBody: "You do not get a vague score. You get the next fixes already drafted, with your audit as the source.",
    pricingEyebrow: "Pricing",
    pricingTitle: "Start free. Monitor for €9. Let Agent fix it for €19.",
    pricingTiers: [
      {
        name: "Free",
        price: "€0",
        note: "See what AI says today.",
        badge: "Free audit",
        features: ["Your score", "Who AI recommends", "Competitors AI mentions"],
        cta: "Run my free audit",
        href: "#audit",
        plan: "free",
        highlight: false,
      },
      {
        name: "Monitor",
        price: "€9",
        suffix: "/month",
        note: "For keeping an eye on your AI visibility.",
        badge: "Start here",
        features: ["Monthly Gemini re-check", "3 actions per week", "Alerts when score or competitors change"],
        cta: "Start Monitor",
        href: "monitor",
        plan: "monitor",
        highlight: false,
      },
      {
        name: "Agent",
        price: "€19",
        suffix: "/month",
        note: "So we fix it for you, every week.",
        badge: "Most popular",
        features: ["Weekly Gemini + ChatGPT checks", "1 to 3 fixes written for you per week", "FAQ, Google Business, and page copy ready to paste", "Mention plan", "An agent to talk to", "Monitor included"],
        cta: "Start Agent",
        href: "agent",
        plan: "agent_19eur",
        highlight: true,
      },
    ],
    pricingReassurance: "No commitment, cancel in 1 click.",
    agentExampleLabel: "What Agent writes for you",
    agentExampleFaq: "FAQ answer: clear buyer-language copy you can paste into your site.",
    agentExampleGoogle: "Google Business text: a ready-to-use sentence that helps AI understand why to recommend you.",
    faqEyebrow: "FAQ",
    faqItems: [
      { question: "Do I need to configure anything?", answer: "No. Enter your business name, website, and email." },
      { question: "Is this useful for a small business?", answer: "Yes. It is made for businesses without an SEO team." },
      { question: "Which AI tools do you check?", answer: "Free and Monitor use Gemini. Agent uses Gemini + ChatGPT." },
      { question: "Is this SEO?", answer: "No. SEO helps search pages rank you. Citeable helps AI recommend you." },
    ],
    footerTagline: "See whether AI recommends your business, then fix it.",
    rights: "All rights reserved.",
  },
  fr: {
    navAudit: "Audit gratuit",
    heroEyebrow: "AUDIT IA GRATUIT",
    heroTitle: "L'IA recommande-t-elle ton entreprise ?",
    heroSubtitle: "Quand tes clients demandent conseil a l'IA, Citeable te montre si elle te cite - et qui elle recommande a ta place. Puis on corrige pour toi. Audit gratuit, sans installation.",
    formTitle: "Lance ton audit gratuit",
    formSubtitle: "Nom, site, email. C'est tout.",
    freeBadge: "Gratuit",
    success: "C'est noté — ton audit gratuit arrive bientôt.",
    businessLabel: "Nom de l'entreprise",
    businessPlaceholder: "Nom de l'entreprise",
    websiteLabel: "Site web",
    websitePlaceholder: "tonsite.fr",
    emailLabel: "Email",
    emailPlaceholder: "toi@tonentreprise.fr",
    loadingCta: "Audit en cours…",
    submitCta: "Lancer mon audit gratuit",
    error: "Un problème est survenu. Réessaie dans un instant.",
    formFootnote: "Pas besoin de carte. Gratuit vérifie ta visibilité avec Gemini.",
    positioningEyebrow: "Visibilité IA clé en main",
    positioningTitle: "Arrête de deviner pourquoi l'IA recommande quelqu'un d'autre.",
    positioningBody: "Citeable transforme ton audit en correctifs prêts à coller : réponses FAQ, texte Google Business, sections de page, et endroits où ton entreprise doit être mentionnée.",
    positioningPrice: "Free 0 € · Monitor 9 €/mois · Agent 19 €/mois.",
    howEyebrow: "Comment ça marche",
    howTitle: "Free te dit où tu en es. Agent t'aide à avancer.",
    howSteps: ["1. Indique ton entreprise et ton site", "2. Vois si l'IA te recommande, qui elle recommande à ta place, et quels concurrents ressortent", "3. Laisse Agent transformer les écarts en correctifs prêts à coller chaque semaine"],
    agentEyebrow: "Agent 19 €/mois",
    agentTitle: "Un agent qui te rend visible dans l'IA - pas juste un rapport.",
    agentBody: "Chaque semaine l'agent :",
    agentBadge: "le plus populaire",
    agentPrice: "19 €/mois",
    agentFixes: ["verifie ta visibilite sur Gemini + ChatGPT", "repere ce qui te fait perdre des recommandations", "redige 1 a 3 correctifs prets a coller (reponse FAQ, texte fiche Google Business, section de page)", "te donne un plan de mentions (annuaires, Reddit/Quora, comparatifs)", "un agent a qui parler branche sur ton audit"],
    agentCardTitle: "Fait a 80%. Tu valides, tu colles.",
    agentCardBody: "Pas juste un score : les prochains correctifs sont deja rediges a partir de ton audit.",
    pricingEyebrow: "Tarifs",
    pricingTitle: "Free 0 € / Monitor 9 € / Agent 19 €/mois.",
    pricingTiers: [
      {
        name: "Free",
        price: "€0",
        note: "Vois ce que l'IA dit aujourd'hui.",
        badge: "Audit gratuit",
        features: ["score", "qui l'IA recommande", "concurrents"],
        cta: "Lancer mon audit gratuit",
        href: "#audit",
        plan: "free",
        highlight: false,
      },
      {
        name: "Monitor",
        price: "€9",
        suffix: "/mois",
        note: "Pour garder un oeil sur ta visibilité IA.",
        badge: "Commence ici",
        features: ["re-check mensuel Gemini", "3 actions/semaine", "alertes"],
        cta: "Démarrer Monitor",
        href: "monitor",
        plan: "monitor",
        highlight: false,
      },
      {
        name: "Agent",
        price: "€19",
        suffix: "/mois",
        note: "Pour qu'on corrige a ta place, chaque semaine.",
        badge: "le plus populaire",
        features: ["Verif hebdo Gemini + ChatGPT", "1 a 3 correctifs rediges pour toi/semaine", "FAQ, fiche Google, page prets a coller", "plan de mentions", "un agent a qui parler", "Monitor inclus"],
        cta: "Démarrer Agent",
        href: "agent",
        plan: "agent_19eur",
        highlight: true,
      },
    ],
    pricingReassurance: "Sans engagement, resiliable en 1 clic.",
    agentExampleLabel: "Ce qu'Agent rédige pour toi",
    agentExampleFaq: "Réponse FAQ : une formulation claire, prête à coller sur ton site.",
    agentExampleGoogle: "Texte fiche Google Business : une phrase prête à utiliser pour aider l'IA à comprendre pourquoi te recommander.",
    faqEyebrow: "FAQ",
    faqItems: [
      { question: "Config ?", answer: "Non." },
      { question: "Petit business ?", answer: "Oui, sans equipe SEO." },
      { question: "Quelles IA ?", answer: "Free/Monitor = Gemini ; Agent = Gemini + ChatGPT." },
      { question: "SEO ?", answer: "Non, l'IA te recommande." },
    ],
    footerTagline: "Vois si l'IA recommande ton entreprise, puis corrige.",
    rights: "Tous droits réservés.",
  },
} as const;

export const auditCopy = {
  en: {
    navCta: "Fix it for me — €19 →",
    status: { failed: "Failed", complete: "Complete", running: "Running" },
    title: (brandName: string) => `Simple report for ${brandName}`,
    scoreAria: (score: number) => `score ${score} out of 100`,
    scoreRunningAria: "score running",
    failedPrefix: "Could not run the report:",
    unknownError: "unknown error",
    runningText: "Wait 20–60 seconds: checking real results without inventing anything.",
    primaryCta: "Fix it for me — €19 →",
    monitorCta: "Or monitor monthly — €9 →",
    competitorsTitle: (engine: string) => `Competitors cited by ${engine}`,
    webSearchTitle: "Brands found in web_search results",
    noBrands: "No brand names found in the available answers.",
    secondaryEyebrow: "Secondary option · Monitor €9",
    secondaryTitle: "Want monthly tracking instead?",
    secondaryBody: "The free report stops at your score, AI sentiment, Gemini recommendation status, and cited competitors. Monitor adds 3 concrete priorities and monthly Gemini tracking. The €19 Agent remains the fastest path if you want it handled for you.",
    secondaryCta: "Monitor monthly — €9 →",
    monitorEyebrow: "Monitor €9",
    monitorTitle: "3 priority actions to tackle this week",
    monitorEmpty: "Actions will appear as soon as the Monitor report finishes.",
    where: "Where:",
    questionsTitle: (engine: string) => `Questions asked to ${engine}`,
    webQuestionsTitle: "Buyer web searches checked",
    nativeWebSearch: "Native web_search",
    engineUnavailable: (engine: string) => `${engine} unavailable; try again.`,
    webUnavailable: "Native web_search unavailable; this report uses only checks that completed.",
    proofEyebrow: "€19 Agent — concrete example",
    proofTitle: "A fix generated from a real signal",
    reportReassurance: "No long-term commitment: one-time checkout, no automatic subscription.",
    reportTeaserCta: "Unlock my fixes — €19",
  },
  fr: {
    navCta: "Corrigez-le pour moi — 19 € →",
    status: { failed: "Échec", complete: "Terminé", running: "En cours" },
    title: (brandName: string) => `Rapport simple pour ${brandName}`,
    scoreAria: (score: number) => `score ${score} sur 100`,
    scoreRunningAria: "score en cours",
    failedPrefix: "Impossible de lancer le rapport :",
    unknownError: "erreur inconnue",
    runningText: "Attends 20 à 60 secondes : on vérifie de vrais résultats sans rien inventer.",
    primaryCta: "Corrigez-le pour moi — 19 € →",
    monitorCta: "Ou surveiller chaque mois — 9 € →",
    competitorsTitle: (engine: string) => `concurrents cités par ${engine}`,
    webSearchTitle: "Marques trouvées dans les résultats web_search",
    noBrands: "Aucun nom de marque trouvé dans les réponses disponibles.",
    secondaryEyebrow: "Option secondaire · Monitor 9 €",
    secondaryTitle: "Tu veux suivre ça chaque mois ?",
    secondaryBody: "Le rapport gratuit s'arrête au score, au sentiment IA, au statut de recommandation Gemini et aux concurrents cités. Monitor ajoute 3 priorités concrètes et un suivi Gemini mensuel. L'Agent à 19 € reste le chemin le plus rapide si tu veux qu'on s'en occupe pour toi.",
    secondaryCta: "Surveiller chaque mois — 9 € →",
    monitorEyebrow: "Monitor 9 €",
    monitorTitle: "3 actions prioritaires pour cette semaine",
    monitorEmpty: "Les actions apparaîtront dès que le rapport Monitor sera terminé.",
    where: "Où :",
    questionsTitle: (engine: string) => `Questions posées à ${engine}`,
    webQuestionsTitle: "Recherches d'achat vérifiées",
    nativeWebSearch: "web_search natif",
    engineUnavailable: (engine: string) => `${engine} est indisponible ; réessaie.`,
    webUnavailable: "web_search natif indisponible ; ce rapport utilise uniquement les vérifications terminées.",
    proofEyebrow: "Agent à 19 € — exemple concret",
    proofTitle: "Une correction générée à partir d'un vrai signal",
    reportReassurance: "Sans engagement : achat unique via checkout NanoCorp, pas d'abonnement automatique.",
    reportTeaserCta: "Débloquer mes correctifs — 19 €",
  },
} as const;

export function recommendationText(engine: string, brandMentioned: boolean, locale: Locale) {
  if (locale === "fr") return brandMentioned ? `${engine} te recommande` : `${engine} ne te cite pas`;
  return brandMentioned ? `${engine} recommends you` : `${engine} does not mention you`;
}

export function brandSentimentText(sentiment: SentimentLike, locale: Locale) {
  const label = sentiment.label === "positive" || sentiment.label === "neutral" || sentiment.label === "negative" ? sentiment.label : "not_enough_signal";

  if (locale === "fr") {
    if (label === "not_enough_signal") return "Comment l'IA parle de toi : pas assez de signal";
    const translated = label === "positive" ? "plutôt positif" : label === "negative" ? "à améliorer" : "neutre";
    return `Comment l'IA parle de toi : ${translated}.`;
  }

  if (label === "not_enough_signal") return "How AI talks about you: not enough signal";
  const englishLabel = label.charAt(0).toUpperCase() + label.slice(1);
  return `How AI talks about you: ${englishLabel}${sentiment.justification ? ` - ${sentiment.justification}` : ""}.`;
}

export function localizePlainAction(action: PlainActionLike, locale: Locale): PlainActionLike {
  if (locale === "en") return action;

  if (action.title.startsWith("Add a FAQ page")) {
    const questions = action.basedOn?.length ? action.basedOn.map((prompt) => `« ${prompt} »`).join(" ; ") : "les questions testées dans cet audit";
    return {
      ...action,
      title: "Ajoute une page FAQ pour les questions que tes clients posent",
      doThis: `Crée une page qui répond simplement à ces questions exactes : ${questions}.`,
      where: "Sur ton site, avec un lien depuis l'accueil et la navigation principale.",
    };
  }

  if (action.title.startsWith("Earn third-party mentions")) {
    return {
      ...action,
      title: "Obtiens des mentions tierces que Gemini peut croire",
      doThis: "Crée ou mets à jour des profils courts pour ton activité. Priorité : un annuaire, une réponse de type Reddit ou Quora, puis un article ou comparatif pertinent.",
      where: "Annuaires, profils, discussions communautaires et articles comparatifs de ton secteur.",
    };
  }

  if (action.title.startsWith("Ask 3 happy customers")) {
    return {
      ...action,
      title: "Demande un avis à 3 clients satisfaits cette semaine",
      doThis: "Demande-leur de citer le problème résolu et le résultat obtenu. Ces mots aident l'IA à comprendre quand te recommander.",
      where: "Avis Google, sites d'avis, LinkedIn et profils d'annuaire déjà utilisés.",
    };
  }

  return {
    ...action,
    title: "Action prioritaire",
    doThis: "Transforme ce signal en une amélioration simple sur ton site, ton profil Google Business ou tes pages publiques.",
    where: "Là où tes clients et les moteurs d'IA peuvent vérifier l'information.",
  };
}
