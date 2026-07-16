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
    heroTitle: "AI visibility, fixed for you.",
    heroSubtitle: "Run the free audit to see if AI recommends your business. Then Citeable tells you what to change - and writes the copy for you. No dashboard to learn.",
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
    positioningEyebrow: "Done-for-you, not another dashboard",
    positioningTitle: "Other tools give you another dashboard. Citeable tells you exactly what to fix - and writes the fixes for you.",
    positioningBody: "Built for small brands without a technical team: start with a free audit, then get clear copy-paste fixes for your site, FAQ, Google Business profile, and mention plan.",
    positioningPrice: "Audit → score → fixes → Agent at €19/month.",
    dashboardCardTitle: "Another dashboard",
    dashboardCardBody: "Charts, tabs, and work left for you to interpret.",
    dashboardCardItems: ["You find the problem", "You brief the writer", "You decide what to publish"],
    citeableCardTitle: "Citeable",
    citeableCardBody: "A simple audit plus fixes already drafted from your real gaps.",
    citeableCardItems: ["We show what to fix", "We write the first draft", "You validate and paste"],
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
    pricingTitle: "Start free. Monitor for €9/month. Let Agent fix it for €19/month.",
    pricingTiers: [
      {
        name: "Free",
        price: "€0",
        note: "See what AI says today.",
        badge: "Free audit",
        features: ["Your score", "Who AI recommends", "AI sentiment", "Share of voice", "Competitors AI mentions"],
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
        features: ["Weekly Gemini re-check", "3 actions per week", "Alerts when score or competitors change"],
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
    pricingReassurance: "No commitment, cancel anytime.",
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
    heroTitle: "Visibilité IA, réglée pour vous.",
    heroSubtitle: "Lance l'audit gratuit pour voir si l'IA recommande ton entreprise. Ensuite Citeable te dit quoi changer - et écrit la copie pour toi. Pas de dashboard à apprendre.",
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
    positioningEyebrow: "Done-for-you, pas un dashboard de plus",
    positioningTitle: "Les autres outils te donnent un énième dashboard. Citeable te dit quoi corriger — et écrit les correctifs pour toi.",
    positioningBody: "Pensé pour les petites marques sans équipe technique : tu pars d'un audit gratuit, puis tu reçois des correctifs prêts à coller pour ton site, ta FAQ, ta fiche Google Business et ton plan de mentions.",
    positioningPrice: "Audit → score → correctifs → Agent à 19 €/mois.",
    dashboardCardTitle: "❌ Autre dashboard",
    dashboardCardBody: "Des graphes, des onglets, et du travail à interpréter toi-même.",
    dashboardCardItems: ["Tu trouves le problème", "Tu briefes le rédacteur", "Tu décides quoi publier"],
    citeableCardTitle: "✅ Citeable",
    citeableCardBody: "Un audit simple et des correctifs déjà rédigés à partir de tes vrais écarts.",
    citeableCardItems: ["On montre quoi corriger", "On écrit le premier jet", "Tu valides et tu colles"],
    howEyebrow: "Comment ça marche",
    howTitle: "Free te dit où tu en es. Agent t'aide à avancer.",
    howSteps: ["1. Indique ton entreprise et ton site", "2. Vois si l'IA te recommande, qui elle recommande à ta place, et quels concurrents ressortent", "3. Laisse Agent transformer les écarts en correctifs prêts à coller chaque semaine"],
    agentEyebrow: "Agent 19 €/mois",
    agentTitle: "Un agent qui te rend visible dans l'IA - pas juste un rapport.",
    agentBody: "Chaque semaine l'agent :",
    agentBadge: "le plus populaire",
    agentPrice: "19 €/mois",
    agentFixes: ["vérifie ta visibilité sur Gemini + ChatGPT", "repère ce qui te fait perdre des recommandations", "rédige 1 à 3 correctifs prêts à coller (réponse FAQ, texte fiche Google Business, section de page)", "te donne un plan de mentions (annuaires, Reddit/Quora, comparatifs)", "un agent à qui parler, branché sur ton audit"],
    agentCardTitle: "Fait à 80 %. Tu valides, tu colles.",
    agentCardBody: "Pas juste un score : les prochains correctifs sont déjà rédigés à partir de ton audit.",
    pricingEyebrow: "Tarifs",
    pricingTitle: "Free 0 € / Monitor 9 € / Agent 19 €/mois.",
    pricingTiers: [
      {
        name: "Free",
        price: "€0",
        note: "Vois ce que l'IA dit aujourd'hui.",
        badge: "Audit gratuit",
        features: ["score", "qui l'IA recommande", "sentiment IA", "part de voix", "concurrents"],
        cta: "Lancer mon audit gratuit",
        href: "#audit",
        plan: "free",
        highlight: false,
      },
      {
        name: "Monitor",
        price: "€9",
        suffix: "/mois",
        note: "Pour garder un œil sur ta visibilité IA.",
        badge: "Commence ici",
        features: ["re-check hebdo Gemini", "3 actions/semaine", "alertes"],
        cta: "Démarrer Monitor",
        href: "monitor",
        plan: "monitor",
        highlight: false,
      },
      {
        name: "Agent",
        price: "€19",
        suffix: "/mois",
        note: "Pour qu'on corrige à ta place, chaque semaine.",
        badge: "le plus populaire",
        features: ["Vérif hebdo Gemini + ChatGPT", "1 à 3 correctifs rédigés pour toi/semaine", "FAQ, fiche Google, page prêts à coller", "plan de mentions", "un agent à qui parler", "Monitor inclus"],
        cta: "Démarrer Agent",
        href: "agent",
        plan: "agent_19eur",
        highlight: true,
      },
    ],
    pricingReassurance: "Sans engagement, résiliable à tout moment.",
    agentExampleLabel: "Ce qu'Agent rédige pour toi",
    agentExampleFaq: "Réponse FAQ : une formulation claire, prête à coller sur ton site.",
    agentExampleGoogle: "Texte fiche Google Business : une phrase prête à utiliser pour aider l'IA à comprendre pourquoi te recommander.",
    faqEyebrow: "FAQ",
    faqItems: [
      { question: "Faut-il configurer quelque chose ?", answer: "Non. Indique le nom de ton entreprise, ton site et ton email — c'est tout." },
      { question: "Est-ce utile pour une petite entreprise ?", answer: "Oui. C'est fait pour les marques sans équipe SEO ni technique." },
      { question: "Quelles IA vérifiez-vous ?", answer: "Free et Monitor utilisent Gemini. Agent utilise Gemini + ChatGPT." },
      { question: "Est-ce du SEO ?", answer: "Non. Le SEO t'aide à ranker dans les pages de recherche. Citeable t'aide à être recommandé par l'IA." },
    ],
    footerTagline: "Vois si l'IA recommande ton entreprise, puis corrige.",
    rights: "Tous droits réservés.",
  },
} as const;

export const auditCopy = {
  en: {
    navCta: "Start Agent — €19/month →",
    status: { failed: "Failed", complete: "Complete", running: "Running" },
    title: (brandName: string) => `Simple report for ${brandName}`,
    scoreAria: (score: number) => `score ${score} out of 100`,
    scoreRunningAria: "score running",
    failedPrefix: "Could not run the report:",
    unknownError: "unknown error",
    runningText: "Wait 20–60 seconds: checking real results without inventing anything.",
    primaryCta: "Start Agent — €19/month →",
    monitorCta: "Or monitor monthly — €9 →",
    competitorsTitle: (engine: string) => `Competitors cited by ${engine}`,
    webSearchTitle: "Brands found in web_search results",
    noBrands: "No brand names found in the available answers.",
    secondaryEyebrow: "Secondary option · Monitor €9",
    secondaryTitle: "Want monthly tracking instead?",
    secondaryBody: "The free report stops at your score, AI sentiment, Gemini recommendation status, and cited competitors. Monitor adds 3 concrete priorities and weekly Gemini tracking. Agent at €19/month remains the fastest path if you want it handled for you.",
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
    proofEyebrow: "€19/month Agent — concrete example",
    proofTitle: "A fix generated from a real signal",
    reportReassurance: "No commitment, cancel anytime. Agent is €19/month.",
    reportTeaserCta: "Unlock Agent — €19/month",
    freeFixEyebrow: "Real fix from this audit",
    freeFixTitle: (brandName: string) => `One fix Citeable Agent can ship for ${brandName}`,
    freeFixBadge: "Verified gap",
    unlockFixesCta: "Unlock your fixes — Citeable Agent €19/mo",
    noFakeFixes: "No fake fixes",
    noVerifiedGapTitle: "No verified gap was found in this free audit.",
    noVerifiedGapBody: "Citeable will not invent a correction. This report found no missing recommendation or cited-competitor gap in the checked prompts.",
  },
  fr: {
    navCta: "Démarrer Agent — 19 €/mois →",
    status: { failed: "Échec", complete: "Terminé", running: "En cours" },
    title: (brandName: string) => `Rapport simple pour ${brandName}`,
    scoreAria: (score: number) => `score ${score} sur 100`,
    scoreRunningAria: "score en cours",
    failedPrefix: "Impossible de lancer le rapport :",
    unknownError: "erreur inconnue",
    runningText: "Attends 20 à 60 secondes : on vérifie de vrais résultats sans rien inventer.",
    primaryCta: "Démarrer Agent — 19 €/mois →",
    monitorCta: "Ou surveiller chaque mois — 9 € →",
    competitorsTitle: (engine: string) => `concurrents cités par ${engine}`,
    webSearchTitle: "Marques trouvées dans les résultats de recherche web",
    noBrands: "Aucun nom de marque trouvé dans les réponses disponibles.",
    secondaryEyebrow: "Option secondaire · Monitor 9 €",
    secondaryTitle: "Tu veux suivre ça chaque mois ?",
    secondaryBody: "Le rapport gratuit s'arrête au score, au sentiment IA, au statut de recommandation Gemini et aux concurrents cités. Monitor ajoute 3 priorités concrètes et un suivi Gemini hebdo. L'Agent à 19 €/mois reste le chemin le plus rapide si tu veux qu'on s'en occupe pour toi.",
    secondaryCta: "Surveiller chaque mois — 9 € →",
    monitorEyebrow: "Monitor 9 €",
    monitorTitle: "3 actions prioritaires pour cette semaine",
    monitorEmpty: "Les actions apparaîtront dès que le rapport Monitor sera terminé.",
    where: "Où :",
    questionsTitle: (engine: string) => `Questions posées à ${engine}`,
    webQuestionsTitle: "Recherches d'achat vérifiées",
    nativeWebSearch: "Recherche web native",
    engineUnavailable: (engine: string) => `${engine} est indisponible ; réessaie.`,
    webUnavailable: "Recherche web native indisponible ; ce rapport utilise uniquement les vérifications terminées.",
    proofEyebrow: "Agent à 19 €/mois — exemple concret",
    proofTitle: "Une correction générée à partir d'un vrai signal",
    reportReassurance: "Sans engagement, résiliable à tout moment. Agent est à 19 €/mois.",
    reportTeaserCta: "Débloquer Agent — 19 €/mois",
    freeFixEyebrow: "Correctif réel issu de cet audit",
    freeFixTitle: (brandName: string) => `Un correctif que Citeable Agent peut livrer pour ${brandName}`,
    freeFixBadge: "Écart vérifié",
    unlockFixesCta: "Débloquer tes correctifs — Citeable Agent 19 €/mois",
    noFakeFixes: "Aucun correctif inventé",
    noVerifiedGapTitle: "Aucun écart vérifié trouvé dans cet audit gratuit.",
    noVerifiedGapBody: "Citeable n'invente pas de correction. Ce rapport n'a trouvé aucun manque de recommandation ni concurrent cité dans les questions vérifiées.",
  },
} as const;


export function localizeCategoryLabel(category: string | undefined, locale: Locale) {
  const clean = (category ?? "").trim();
  if (!clean || locale === "en") return clean;

  const lower = clean.toLowerCase();
  const translations: Array<[RegExp, string]> = [
    [/socks? and apparel|hosiery/, "chaussettes et vêtements"],
    [/dtc footwear brand|footwear|shoe|sneaker/, "marque de chaussures"],
    [/backpacks? and outdoor gear/, "sacs à dos et équipement outdoor"],
    [/beauty brand|skincare|cosmetic/, "marque de beauté"],
    [/fashion brand|apparel|clothing/, "marque de vêtements"],
    [/coffee brand/, "marque de café"],
    [/food & beverage|food and beverage/, "alimentation et boissons"],
    [/bakery \/ restaurant/, "boulangerie / restaurant"],
    [/fitness coach/, "coach sportif"],
    [/web agency/, "agence web"],
    [/law firm/, "cabinet d'avocat"],
    [/accounting firm/, "expert-comptable"],
    [/real estate agency/, "agence immobilière"],
    [/hair salon/, "salon de coiffure"],
    [/auto repair shop/, "garage auto"],
    [/architecture firm/, "architecte"],
  ];

  return translations.find(([pattern]) => pattern.test(lower))?.[1] ?? clean;
}

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

  if (action.title.startsWith("Update Google Business Profile")) {
    const questions = action.basedOn?.length ? action.basedOn.map((prompt) => `« ${prompt} »`).join(" ; ") : "les questions locales testées dans cet audit";
    return {
      ...action,
      title: "Mets à jour ta fiche Google Business pour l'intention locale",
      doThis: `Réécris ta description et tes services autour de ces questions : ${questions}. Ajoute service, ville, preuve et prise de rendez-vous.`,
      where: "Fiche Google Business : description, services, posts, Q&R, photos et lien de rendez-vous.",
    };
  }

  if (action.title.startsWith("Refresh professional directory")) {
    return {
      ...action,
      title: "Mets à jour tes annuaires métier",
      doThis: "Aligne Doctolib, Resalib, annuaires locaux ou métiers avec la même catégorie, ville, services et preuves que ton site.",
      where: "Annuaires professionnels, pages locales, marketplaces et profils de citation.",
    };
  }

  if (action.title.startsWith("Create a 'why choose me'")) {
    return {
      ...action,
      title: "Crée une page locale “pourquoi me choisir”",
      doThis: "Publie une page qui explique qui tu aides, où tu interviens, tes avis, qualifications et comment réserver.",
      where: "Ton site, liée depuis l'accueil, contact, Google Business et tes annuaires.",
    };
  }

  if (action.title.startsWith("Align social bios")) {
    const questions = action.basedOn?.length ? action.basedOn.map((prompt) => `« ${prompt} »`).join(" ; ") : "les questions créateur testées dans cet audit";
    return {
      ...action,
      title: "Aligne tes bios sociales avec ta niche créateur",
      doThis: `Mets à jour tes bios Instagram, TikTok, YouTube, LinkedIn, newsletter ou podcast pour répondre à ces questions : ${questions}.`,
      where: "Profils sociaux, page créateur, YouTube About, bio TikTok/Instagram et link-in-bio.",
    };
  }

  if (action.title.startsWith("Get included in top-creator")) {
    return {
      ...action,
      title: "Fais-toi citer dans des listicles top créateurs",
      doThis: "Pitch ou mets à jour des pages crédibles avec une bio courte, ta niche, une preuve d'audience, tes meilleurs contenus et pourquoi te suivre.",
      where: "Listicles top créateurs, blogs de niche, podcasts, newsletters et listes médias.",
    };
  }

  if (action.title.startsWith("Build press and entity")) {
    return {
      ...action,
      title: "Construis des preuves presse et entité",
      doThis: "Rassemble interviews, presse, prix, collaborations et faits publics cohérents avant Wikipedia/Wikidata.",
      where: "Page presse, media kit, profils créateur, interviews publiques et preuves d'éligibilité.",
    };
  }

  if (action.title.startsWith("Add FAQ and product-page")) {
    const questions = action.basedOn?.length ? action.basedOn.map((prompt) => `« ${prompt} »`).join(" ; ") : "les questions marque testées dans cet audit";
    return {
      ...action,
      title: "Ajoute des réponses FAQ et pages produit",
      doThis: `Crée une section FAQ/produit crawlable qui répond simplement à ces questions : ${questions}.`,
      where: "Pages produit, pages catégorie, FAQ et guides d'achat liés depuis l'accueil.",
    };
  }

  if (action.title.startsWith("Earn listicle and review")) {
    return {
      ...action,
      title: "Obtiens des mentions dans listicles et avis",
      doThis: "Priorité : un listicle pertinent, une page d'avis et une page de comparaison que l'IA peut citer.",
      where: "Listicles secteur, pages d'avis, guides comparatifs, marketplaces et communautés.",
    };
  }

  if (action.title.startsWith("Ask 3 customers for product-specific")) {
    return {
      ...action,
      title: "Demande 3 avis produit cette semaine",
      doThis: "Demande aux clients de mentionner le produit, le cas d'usage, le résultat et pourquoi ils t'ont choisi.",
      where: "Avis produit, Google si pertinent, marketplaces, Trustpilot et sections preuve sociale.",
    };
  }

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
