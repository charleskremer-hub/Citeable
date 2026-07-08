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
    heroEyebrow: "Free AI visibility audit",
    heroTitle: "Does AI recommend your business?",
    heroSubtitle: "When your customers ask AI for a recommendation, Citeable shows whether it names you - and who it picks instead. Free audit, no setup.",
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
    formFootnote: "No card needed. Free = diagnostic only: score, Gemini choice, competitors.",
    positioningEyebrow: "Done-for-you positioning",
    positioningTitle: "You don't need another dashboard.",
    positioningBody: "Other tools show you charts. Citeable tells you exactly what to fix - and writes it for you: FAQ answers, Google Business text, page copy, ready to paste.",
    positioningPrice: "Monitoring from €9/mo - the lowest-priced way to track if AI recommends you.",
    howEyebrow: "How it works",
    howTitle: "See who Gemini chooses. Upgrade to Monitor for actions.",
    howSteps: ["1. Tell us your business name and website", "2. We ask Gemini like a real customer would", "3. Free shows score, Gemini choice, and competitors"],
    agentEyebrow: "Agent €49 treatment",
    agentTitle: "Use ChatGPT gpt-4o-mini to find what to fix next.",
    agentBody: "Agent runs deeper ChatGPT (gpt-4o-mini) recommendation checks, then turns real gaps into 1–3 concrete fixes you can paste into your profiles, FAQ, and website.",
    agentBadge: "Reserved for Agent subscribers",
    agentPrice: "€49/month",
    agentFixes: ["FAQ paragraph to add this week", "Google Business Profile text", "Website answer ready to publish", "New page brief and first draft"],
    agentCardTitle: "Done to 80%. You validate and paste.",
    agentCardBody: "Each weekly batch starts with fresh ChatGPT (gpt-4o-mini) recommendation checks.",
    pricingEyebrow: "Pricing",
    pricingTitle: "Start with Gemini. Add actions at €9. Add ChatGPT gpt-4o-mini treatment at €49.",
    pricingTiers: [
      {
        name: "Free",
        price: "€0",
        note: "A one-time audit. No card needed.",
        badge: "Lead magnet",
        features: ["Diagnostic score from Gemini", "Who Gemini picks instead of you", "Competitors Gemini names"],
        cta: "Run my free audit",
        href: "#audit",
        plan: "free",
        highlight: false,
      },
      {
        name: "Monitor",
        price: "€9",
        suffix: "/month",
        note: "For owners who want Gemini monitoring plus actions.",
        badge: "Start here",
        features: ["Monthly Gemini recommendation re-check", "3 simple actions to do this week", "Email alerts when score or competitors change"],
        cta: "Start Monitor",
        href: "monitor",
        plan: "monitor",
        highlight: true,
      },
      {
        name: "Agent",
        price: "€49",
        suffix: "/month",
        note: "For owners who want weekly copy-paste fixes, not another report.",
        badge: "Treatment",
        features: ["Fresh ChatGPT (gpt-4o-mini) checks before each batch", "1–3 fixes drafted for you every week", "FAQ, Google Business, website, and page copy", "Third-party mention plan: directory, Reddit/Quora, listicle"],
        cta: "Start Agent",
        href: "agent",
        plan: "geo_agent",
        highlight: false,
      },
    ],
    faqEyebrow: "Plain English FAQ",
    faqQuestion: "Do I need to configure anything?",
    faqAnswer: "No. Enter your business name, website, and email.",
    footerTagline: "See whether AI recommends and chooses your business.",
    rights: "All rights reserved.",
  },
  fr: {
    navAudit: "Audit gratuit",
    heroEyebrow: "Audit gratuit de visibilité IA",
    heroTitle: "L'IA recommande-t-elle ton entreprise ?",
    heroSubtitle: "Quand tes clients demandent une recommandation à l'IA, Citeable te montre si elle te cite - et qui elle choisit à ta place. Audit gratuit, sans installation.",
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
    formFootnote: "Pas besoin de carte. Gratuit = diagnostic simple : score, choix de Gemini, concurrents.",
    positioningEyebrow: "Positionnement prêt à utiliser",
    positioningTitle: "Tu n'as pas besoin d'un autre tableau de bord.",
    positioningBody: "Les autres outils te montrent des graphiques. Citeable te dit quoi corriger - et l'écrit pour toi : réponses FAQ, texte Google Business, contenu de page, prêt à copier.",
    positioningPrice: "Monitoring dès 9 €/mois - le moyen le moins cher de savoir si l'IA te recommande.",
    howEyebrow: "Comment ça marche",
    howTitle: "Vois qui Gemini choisit. Passe à Monitor pour recevoir les actions.",
    howSteps: ["1. Indique ton entreprise et ton site", "2. On interroge Gemini comme un vrai client", "3. Le gratuit montre le score, le choix de Gemini et les concurrents"],
    agentEyebrow: "Traitement Agent à 49 €",
    agentTitle: "Utilise ChatGPT gpt-4o-mini pour trouver quoi corriger ensuite.",
    agentBody: "Agent lance des vérifications ChatGPT (gpt-4o-mini) plus poussées, puis transforme les écarts réels en 1 à 3 corrections concrètes à coller dans tes profils, ta FAQ et ton site.",
    agentBadge: "Réservé aux abonnés Agent",
    agentPrice: "49 €/mois",
    agentFixes: ["Paragraphe FAQ à ajouter cette semaine", "Texte pour Google Business Profile", "Réponse de site prête à publier", "Brief de nouvelle page et premier brouillon"],
    agentCardTitle: "Fait à 80 %. Tu valides et tu colles.",
    agentCardBody: "Chaque lot hebdomadaire commence par de nouvelles vérifications ChatGPT (gpt-4o-mini).",
    pricingEyebrow: "Tarifs",
    pricingTitle: "Commence avec Gemini. Ajoute les actions à 9 €. Ajoute le traitement ChatGPT gpt-4o-mini à 49 €.",
    pricingTiers: [
      {
        name: "Gratuit",
        price: "€0",
        note: "Un audit ponctuel. Pas besoin de carte.",
        badge: "Point de départ",
        features: ["Score diagnostic via Gemini", "Qui Gemini choisit à ta place", "Concurrents cités par Gemini"],
        cta: "Lancer mon audit gratuit",
        href: "#audit",
        plan: "free",
        highlight: false,
      },
      {
        name: "Monitor",
        price: "€9",
        suffix: "/mois",
        note: "Pour suivre Gemini chaque mois avec des actions simples.",
        badge: "Commence ici",
        features: ["Recontrôle mensuel des recommandations Gemini", "3 actions simples à faire cette semaine", "Alertes email quand le score ou les concurrents changent"],
        cta: "Démarrer Monitor",
        href: "monitor",
        plan: "monitor",
        highlight: true,
      },
      {
        name: "Agent",
        price: "€49",
        suffix: "/mois",
        note: "Pour recevoir des corrections prêtes à copier, pas un rapport de plus.",
        badge: "Traitement",
        features: ["Vérifications ChatGPT (gpt-4o-mini) fraîches avant chaque lot", "1 à 3 corrections rédigées pour toi chaque semaine", "FAQ, Google Business, site et contenu de page", "Plan de mentions tierces : annuaire, Reddit/Quora, article comparatif"],
        cta: "Démarrer Agent",
        href: "agent",
        plan: "geo_agent",
        highlight: false,
      },
    ],
    faqEyebrow: "FAQ en clair",
    faqQuestion: "Faut-il installer quelque chose ?",
    faqAnswer: "Non. Entre ton nom d'entreprise, ton site et ton email.",
    footerTagline: "Vois si l'IA recommande et choisit ton entreprise.",
    rights: "Tous droits réservés.",
  },
} as const;

export const auditCopy = {
  en: {
    navCta: "Fix it for me — €49 →",
    status: { failed: "Failed", complete: "Complete", running: "Running" },
    title: (brandName: string) => `Simple report for ${brandName}`,
    scoreAria: (score: number) => `Score ${score} out of 100`,
    scoreRunningAria: "Score running",
    failedPrefix: "Could not run the report:",
    unknownError: "unknown error",
    runningText: "Wait 20–60 seconds: checking real results without inventing anything.",
    primaryCta: "Fix it for me — €49 →",
    monitorCta: "Or monitor monthly — €9 →",
    competitorsTitle: (engine: string) => `Competitors cited by ${engine}`,
    webSearchTitle: "Brands found in web_search results",
    noBrands: "No brand names found in the available answers.",
    secondaryEyebrow: "Secondary option · Monitor €9",
    secondaryTitle: "Want monthly tracking instead?",
    secondaryBody: "The free report stops at your score, AI sentiment, Gemini recommendation status, and cited competitors. Monitor adds 3 concrete priorities and monthly Gemini tracking. The €49 fix remains the fastest path if you want it handled for you.",
    secondaryCta: "Monitor monthly — €9 →",
    monitorEyebrow: "Monitor €9",
    monitorTitle: "3 priority actions to tackle this week",
    monitorEmpty: "Actions will appear as soon as the Monitor report finishes.",
    where: "Where:",
    questionsTitle: (engine: string) => `Questions asked to ${engine}`,
    webQuestionsTitle: "Buyer web searches checked",
    unknownModel: "model unknown",
    nativeWebSearch: "Native web_search",
    engineUnavailable: (engine: string) => `${engine} unavailable; try again.`,
    webUnavailable: "Native web_search unavailable; this report uses only checks that completed.",
    proofEyebrow: "€49 fix — concrete example",
    proofTitle: "A fix generated from a real signal",
  },
  fr: {
    navCta: "Corrigez-le pour moi — 49 € →",
    status: { failed: "Échec", complete: "Terminé", running: "En cours" },
    title: (brandName: string) => `Rapport simple pour ${brandName}`,
    scoreAria: (score: number) => `Score ${score} sur 100`,
    scoreRunningAria: "Score en cours",
    failedPrefix: "Impossible de lancer le rapport :",
    unknownError: "erreur inconnue",
    runningText: "Attends 20 à 60 secondes : on vérifie de vrais résultats sans rien inventer.",
    primaryCta: "Corrigez-le pour moi — 49 € →",
    monitorCta: "Ou surveiller chaque mois — 9 € →",
    competitorsTitle: (engine: string) => `Concurrents cités par ${engine}`,
    webSearchTitle: "Marques trouvées dans les résultats web_search",
    noBrands: "Aucun nom de marque trouvé dans les réponses disponibles.",
    secondaryEyebrow: "Option secondaire · Monitor 9 €",
    secondaryTitle: "Tu veux suivre ça chaque mois ?",
    secondaryBody: "Le rapport gratuit s'arrête au score, au sentiment IA, au statut de recommandation Gemini et aux concurrents cités. Monitor ajoute 3 priorités concrètes et un suivi Gemini mensuel. L'offre à 49 € reste le chemin le plus rapide si tu veux qu'on s'en occupe pour toi.",
    secondaryCta: "Surveiller chaque mois — 9 € →",
    monitorEyebrow: "Monitor 9 €",
    monitorTitle: "3 actions prioritaires pour cette semaine",
    monitorEmpty: "Les actions apparaîtront dès que le rapport Monitor sera terminé.",
    where: "Où :",
    questionsTitle: (engine: string) => `Questions posées à ${engine}`,
    webQuestionsTitle: "Recherches d'achat vérifiées",
    unknownModel: "modèle inconnu",
    nativeWebSearch: "web_search natif",
    engineUnavailable: (engine: string) => `${engine} est indisponible ; réessaie.`,
    webUnavailable: "web_search natif indisponible ; ce rapport utilise uniquement les vérifications terminées.",
    proofEyebrow: "Correction à 49 € — exemple concret",
    proofTitle: "Une correction générée à partir d'un vrai signal",
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
