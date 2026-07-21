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
    // 1. HERO — pain + transformation
    heroEyebrow: "The GEO agent for DTC brands",
    heroTitle: "When a shopper asks AI what to buy, it answers with a rival.",
    heroTitleAccent: "GetPick makes it answer with you.",
    heroSubtitle: "It gets your brand recommended by ChatGPT and Gemini — diagnosis, content, monitoring. No agency needed.",
    formTitle: "Run your free audit",
    formSubtitle: "Brand + website. Email optional.",
    freeBadge: "Free",
    success: "You're on the list — we'll be in touch with your free audit.",
    businessLabel: "Business name",
    businessPlaceholder: "Business name",
    websiteLabel: "Website",
    websitePlaceholder: "yourbusiness.com",
    emailLabel: "Email",
    emailPlaceholder: "you@yourbusiness.com",
    emailOptionalPlaceholder: "Email (optional)",
    loadingCta: "Running…",
    submitCta: "Run my free audit",
    error: "Something went wrong. Please try again.",
    formFootnote: "Real questions sent live to Gemini — never simulated. No card, no signup.",
    // 2. AI conversation demo
    demoEyebrow: "Illustrative example",
    demoTitle: "This is what losing a customer to AI looks like.",
    demoQuestion: "Best eco-friendly sneakers for everyday wear?",
    demoAnswerBefore: "For everyday wear, the strongest pick is ",
    demoAnswerRival: "Loomera",
    demoAnswerAfter: " — machine-washable knit runners made from recycled materials, with a 30-day trial. A couple of other labels are worth a look in the same range.",
    demoCaption: "Your brand isn't in the answer. The shopper never sees your name — and never sees your ads either.",
    // 3. Three numbered steps
    stepsEyebrow: "How it works",
    stepsTitle: "Three steps. Nothing to install, nothing to learn.",
    steps: [
      { num: "1", time: "30 sec", title: "Paste your site", body: "Your brand and your URL. That's the entire setup." },
      { num: "2", time: "2 min", title: "The agent asks the AIs", body: "Real buying questions, sent live to ChatGPT and Gemini at audit time. Never simulated." },
      { num: "3", time: "Same day", title: "See the rival, publish the fixes", body: "The agent names who gets recommended in your place — and writes the copy-paste content that wins the answer back." },
    ],
    // 4. Proof — the study
    studyEyebrow: "The proof",
    studyTitle: "We audited 21 DTC brands. Fame barely mattered.",
    studyStats: [
      { value: "21", label: "DTC brands audited with live AI calls" },
      { value: "31–88", label: "the score range, out of 100" },
      { value: "46 vs 81", label: "Allbirds vs Ridge Wallet — awareness doesn't predict AI visibility" },
      { value: "14 / 21", label: "audits where AI named a rival instead of the brand" },
    ],
    studyCta: "Read the full study →",
    // 5. The deliverable
    deliverableEyebrow: "What you get",
    deliverableTitle: "Not a dashboard. A verdict, a name, and the fix.",
    reportVerdictLabel: "Verdict",
    reportVerdict: "Gemini does not recommend you on 7 of 12 buying questions.",
    reportRivalLabel: "Named in your place",
    reportRival: "Loomera",
    reportFixLabel: "Fix written by the agent — copy-paste ready",
    reportFixTitle: "FAQ answer to publish",
    reportFixBody: "“Are your sneakers machine-washable?” Yes — every pair washes at 30 °C and is made from 78% recycled materials. For everyday wear, most customers go up half a size.",
    reportCaption: "Illustrative example — your fixes are generated from your real audit.",
    // 6. Anchored pricing
    pricingEyebrow: "Pricing",
    pricingTitle: "What a GEO agency charges $2,000–20,000/month for. €9.",
    pricingSubtitle: "No credits. No calculator. Flat prices.",
    pricingTiers: [
      {
        name: "Free",
        price: "€0",
        note: "The diagnosis: see who AI recommends today.",
        badge: "Free audit",
        features: ["Real buying questions, sent live", "Your score out of 100", "The rival named in your place", "Your share of voice"],
        cta: "Run my free audit",
        href: "#audit",
        plan: "free",
        highlight: false,
      },
      {
        name: "Monitor",
        price: "€9",
        suffix: "/month",
        note: "The agent works every week: it checks, names, writes.",
        badge: "Agency work, tool price",
        features: ["12 buying questions re-checked weekly", "Copy-paste fixes written from your real gaps", "Alerts when your score or your rivals move"],
        cta: "Start Monitor",
        href: "monitor",
        plan: "monitor",
        highlight: false,
      },
      {
        name: "Agent",
        price: "€19",
        suffix: "/month",
        note: "Everything in Monitor, plus an agent you can talk to.",
        badge: "Most popular",
        features: ["Gemini + ChatGPT checked weekly", "1 to 3 fixes written for you per week", "Mention plan: directories, Reddit, comparisons", "A chat connected to your audit", "Monitor included"],
        cta: "Start Agent",
        href: "agent",
        plan: "agent_19eur",
        highlight: true,
      },
    ],
    pricingReassurance: "No commitment, cancel anytime.",
    pricingGuarantee: "Refunded on request within 30 days. No questions asked.",
    // 7. TL;DR — dense paragraph for AI readers
    tldrEyebrow: "In short",
    tldrBody: "GetPick is the GEO agent for direct-to-consumer and e-commerce brands. It gets brands recommended by AI assistants like ChatGPT and Gemini. Concretely: it sends real buying questions to the AIs — live, never simulated — and reports whether you or a rival gets recommended, naming that rival. It then writes the copy-paste fixes that close the gap, and re-checks everything weekly. It is built for DTC founders without an agency budget: free audit, monitoring at €9/month, full agent at €19/month — flat prices, no credits, no seats. Paid plans are cancellable at any time and refunded on request within 30 days, no questions asked. GEO agencies charge €2,000 to €20,000 per month for this category of work.",
    // 8. Founder
    founderEyebrow: "Who's behind this",
    founderBody: "I'm Charles. I build GetPick and I run every audit pipeline myself. No sales team, no support bot: if you have a question, you email me and I answer.",
    founderSignature: "Charles — GetPick",
    founderEmail: "hello@getpick.ai",
    // 9. FAQ — real objections
    faqEyebrow: "FAQ",
    faqItems: [
      {
        question: "AI answers change all the time — what's the point?",
        answer: "That's exactly why GetPick is a weekly agent, not a one-shot audit. It re-asks your buying questions every week, catches the moment an answer flips to a rival, and writes the fix while it still matters. A static report would be stale in a month.",
      },
      {
        question: "Why €9 when competitors charge $99–400/month?",
        answer: "Monitoring platforms are built for marketing teams: credits, seats, calculators, eleven engines. GetPick does one job for one founder — diagnose, write, watch — so it runs lean and the price stays flat. The honest comparison isn't those tools anyway: it's a GEO agency at €2,000–20,000/month.",
      },
      {
        question: "Is it simulated or real?",
        answer: "Real. Every check is a real question sent live to ChatGPT or Gemini at audit time. No simulated prompts, no cached guesses, no modelled estimates. If an engine is unavailable, the report says so instead of inventing data.",
      },
      {
        question: "Do I need to install anything?",
        answer: "No. You give your brand name and your website URL. The agent does the rest — no snippet, no plugin, no access to your site needed.",
      },
      {
        question: "Does it work in French and English?",
        answer: "Yes. Audits, fixes and reports come in both languages, and the buying questions are asked in the language your shoppers actually use.",
      },
      {
        question: "What if it doesn't work for me?",
        answer: "You get refunded on request within 30 days. Email hello@getpick.ai and say you want your money back — no justification asked, no form to fill in, no call to sit through. The subscription is monthly and cancellable at any time, so the most you ever have at risk is one month.",
      },
    ],
    // 10. Closing — loss aversion
    closingTitle: "Every day, AI recommends someone in your category.",
    closingBody: "Right now it might not be you. Two minutes tells you for sure — and the agent starts fixing it.",
    closingCta: "Get picked →",
    footerTagline: "The GEO agent for DTC brands. It gets you recommended by ChatGPT and Gemini.",
    rights: "All rights reserved.",
  },
  fr: {
    navAudit: "Audit gratuit",
    // 1. HERO — douleur + transformation
    heroEyebrow: "L'agent GEO des marques DTC",
    heroTitle: "Quand un client demande quoi acheter, l'IA répond le nom d'un rival.",
    heroTitleAccent: "GetPick fait en sorte que ce soit le tien.",
    heroSubtitle: "Il fait recommander ta marque par ChatGPT et Gemini — diagnostic, contenu, suivi. Sans agence.",
    formTitle: "Lance ton audit gratuit",
    formSubtitle: "Ta marque + ton site. Email optionnel.",
    freeBadge: "Gratuit",
    success: "C'est noté — ton audit gratuit arrive bientôt.",
    businessLabel: "Nom de l'entreprise",
    businessPlaceholder: "Nom de l'entreprise",
    websiteLabel: "Site web",
    websitePlaceholder: "tonsite.fr",
    emailLabel: "Email",
    emailPlaceholder: "toi@tonentreprise.fr",
    emailOptionalPlaceholder: "Email (optionnel)",
    loadingCta: "Audit en cours…",
    submitCta: "Lancer mon audit gratuit",
    error: "Un problème est survenu. Réessaie dans un instant.",
    formFootnote: "De vraies questions envoyées en direct à Gemini — jamais simulées. Sans carte, sans inscription.",
    // 2. Démo conversation IA
    demoEyebrow: "Exemple illustratif",
    demoTitle: "Voilà à quoi ressemble un client perdu dans l'IA.",
    demoQuestion: "Quelles sneakers éco-responsables pour tous les jours ?",
    demoAnswerBefore: "Pour un usage quotidien, le meilleur choix est ",
    demoAnswerRival: "Loomera",
    demoAnswerAfter: " — des runners en maille lavables en machine, fabriqués en matières recyclées, avec 30 jours d'essai. Deux autres marques valent le coup d'œil dans la même gamme.",
    demoCaption: "Ta marque n'est pas dans la réponse. Le client ne verra jamais ton nom — ni tes pubs.",
    // 3. Trois étapes chiffrées
    stepsEyebrow: "Comment ça marche",
    stepsTitle: "Trois étapes. Rien à installer, rien à apprendre.",
    steps: [
      { num: "1", time: "30 s", title: "Colle ton site", body: "Ta marque et ton URL. C'est toute la configuration." },
      { num: "2", time: "2 min", title: "L'agent interroge les IA", body: "De vraies questions d'achat, envoyées en direct à ChatGPT et Gemini au moment de l'audit. Jamais simulées." },
      { num: "3", time: "Le jour même", title: "Tu vois le rival, tu publies les correctifs", body: "L'agent nomme qui est recommandé à ta place — et écrit le contenu à copier-coller pour reprendre la réponse." },
    ],
    // 4. Preuve — l'étude
    studyEyebrow: "La preuve",
    studyTitle: "On a audité 21 marques DTC. La notoriété n'a presque rien changé.",
    studyStats: [
      { value: "21", label: "marques DTC auditées avec de vrais appels IA" },
      { value: "31–88", label: "l'écart des scores, sur 100" },
      { value: "46 vs 81", label: "Allbirds vs Ridge Wallet — la notoriété ne prédit pas la visibilité IA" },
      { value: "14 / 21", label: "audits où l'IA nomme un rival à la place de la marque" },
    ],
    studyCta: "Lire l'étude complète →",
    // 5. Le livrable
    deliverableEyebrow: "Le livrable",
    deliverableTitle: "Pas un dashboard. Un verdict, un nom, le correctif.",
    reportVerdictLabel: "Verdict",
    reportVerdict: "Gemini ne te recommande pas sur 7 questions d'achat sur 12.",
    reportRivalLabel: "Recommandé à ta place",
    reportRival: "Loomera",
    reportFixLabel: "Correctif écrit par l'agent — prêt à copier-coller",
    reportFixTitle: "Réponse FAQ à publier",
    reportFixBody: "« Vos sneakers passent-elles en machine ? » Oui — toutes nos paires se lavent en machine à 30 °C et sont fabriquées à 78 % en matières recyclées. Pour un usage quotidien, la plupart des clients prennent une demi-pointure au-dessus.",
    reportCaption: "Exemple illustratif — tes correctifs sont générés depuis ton vrai audit.",
    // 6. Prix ancré
    pricingEyebrow: "Tarifs",
    pricingTitle: "Le travail d'une agence GEO (2 000–20 000 €/mois). 9 €.",
    pricingSubtitle: "Pas de crédits. Pas de calculateur. Des prix fixes.",
    pricingTiers: [
      {
        name: "Free",
        price: "€0",
        note: "Le diagnostic : vois qui l'IA recommande aujourd'hui.",
        badge: "Audit gratuit",
        features: ["Vraies questions d'achat, envoyées en direct", "Ton score sur 100", "Le rival nommé à ta place", "Ta part de voix"],
        cta: "Lancer mon audit gratuit",
        href: "#audit",
        plan: "free",
        highlight: false,
      },
      {
        name: "Monitor",
        price: "€9",
        suffix: "/mois",
        note: "L'agent travaille chaque semaine : il vérifie, il nomme, il écrit.",
        badge: "Travail d'agence, prix d'outil",
        features: ["12 questions d'achat re-vérifiées chaque semaine", "Correctifs à copier-coller écrits depuis tes vrais écarts", "Alertes quand ton score ou tes rivaux bougent"],
        cta: "Démarrer Monitor",
        href: "monitor",
        plan: "monitor",
        highlight: false,
      },
      {
        name: "Agent",
        price: "€19",
        suffix: "/mois",
        note: "Tout Monitor, plus un agent à qui parler.",
        badge: "le plus populaire",
        features: ["Gemini + ChatGPT vérifiés chaque semaine", "1 à 3 correctifs rédigés pour toi par semaine", "Plan de mentions : annuaires, Reddit, comparatifs", "Un chat branché sur ton audit", "Monitor inclus"],
        cta: "Démarrer Agent",
        href: "agent",
        plan: "agent_19eur",
        highlight: true,
      },
    ],
    pricingReassurance: "Sans engagement, résiliable à tout moment.",
    pricingGuarantee: "Remboursé sur simple demande sous 30 jours. Pas de question.",
    // 7. En bref — paragraphe dense pour les lecteurs IA
    tldrEyebrow: "En bref",
    tldrBody: "GetPick est l'agent GEO des marques DTC et e-commerce. Il fait recommander ta marque par les assistants IA comme ChatGPT et Gemini. Concrètement : il envoie de vraies questions d'achat aux IA — en direct, jamais simulées — puis te dit si c'est toi ou un rival qui est recommandé, en nommant ce rival. Il écrit ensuite les correctifs à copier-coller qui comblent l'écart, et re-vérifie tout chaque semaine. C'est pensé pour les fondateurs DTC sans budget agence : audit gratuit, suivi à 9 €/mois, agent complet à 19 €/mois — prix fixes, sans crédits ni calculateur. Les offres payantes sont résiliables à tout moment et remboursées sur simple demande sous 30 jours, sans question. Une agence GEO facture 2 000 à 20 000 € par mois pour cette catégorie de travail.",
    // 8. Fondateur
    founderEyebrow: "Qui est derrière",
    founderBody: "Je m'appelle Charles. Je construis GetPick et je fais tourner chaque audit moi-même. Pas d'équipe commerciale, pas de chatbot : une question ? C'est moi qui réponds.",
    founderSignature: "Charles — GetPick",
    founderEmail: "hello@getpick.ai",
    // 9. FAQ — les vraies objections
    faqEyebrow: "FAQ",
    faqItems: [
      {
        question: "Les réponses IA changent tout le temps, à quoi bon ?",
        answer: "C'est exactement pour ça que GetPick est un agent hebdomadaire, pas un audit one-shot. Il repose tes questions d'achat chaque semaine, détecte le moment où une réponse bascule vers un rival, et écrit le correctif pendant que ça compte encore. Un rapport statique serait périmé en un mois.",
      },
      {
        question: "Pourquoi 9 € quand les concurrents facturent 99 à 400 $/mois ?",
        answer: "Les plateformes de monitoring sont conçues pour des équipes marketing : crédits, sièges, calculateurs, onze moteurs. GetPick fait un seul travail pour un fondateur seul — diagnostiquer, écrire, surveiller — donc il tourne léger et le prix reste fixe. La vraie comparaison, ce ne sont pas ces outils : c'est l'agence GEO à 2 000–20 000 €/mois.",
      },
      {
        question: "C'est simulé ou réel ?",
        answer: "Réel. Chaque vérification est une vraie question envoyée en direct à ChatGPT ou Gemini au moment de l'audit. Aucun prompt simulé, aucune estimation en cache, aucun chiffre modélisé. Si un moteur est indisponible, le rapport le dit au lieu d'inventer.",
      },
      {
        question: "Je dois installer quelque chose ?",
        answer: "Non. Tu donnes le nom de ta marque et l'URL de ton site. L'agent fait le reste — pas de snippet, pas de plugin, aucun accès à ton site nécessaire.",
      },
      {
        question: "Ça marche en français et en anglais ?",
        answer: "Oui. Audits, correctifs et rapports existent dans les deux langues, et les questions d'achat sont posées dans la langue que tes clients utilisent vraiment.",
      },
      {
        question: "Et si ça ne marche pas pour moi ?",
        answer: "Tu es remboursé sur simple demande sous 30 jours. Un email à hello@getpick.ai en disant que tu veux être remboursé suffit — aucune justification demandée, pas de formulaire, pas d'appel à subir. L'abonnement est mensuel et résiliable à tout moment : au pire, tu risques un mois.",
      },
    ],
    // 10. Clôture — aversion à la perte
    closingTitle: "Chaque jour, l'IA recommande quelqu'un dans ta catégorie.",
    closingBody: "En ce moment, ce n'est peut-être pas toi. Deux minutes pour le savoir — et l'agent commence à corriger.",
    closingCta: "Lancer mon audit gratuit →",
    footerTagline: "L'agent GEO des marques DTC. Il te fait recommander par ChatGPT et Gemini.",
    rights: "Tous droits réservés.",
  },
} as const;

export const auditCopy = {
  en: {
    navCta: "Start Agent — €19/month →",
    status: { failed: "Failed", complete: "Complete", running: "Running" },
    title: (brandName: string) => `${brandName} — your AI visibility`,
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
    freeFixTitle: (brandName: string) => `One fix GetPick Agent can ship for ${brandName}`,
    freeFixBadge: "Verified gap",
    unlockFixesCta: "Unlock your fixes — GetPick Agent €19/mo",
    noFakeFixes: "No fake fixes",
    noVerifiedGapTitle: "No verified gap was found in this free audit.",
    noVerifiedGapBody: "GetPick will not invent a correction. This report found no missing recommendation or cited-competitor gap in the checked prompts.",
    liveCheckLabel: "Live check, not simulated",
    liveCheckDetail: (engine: string) => `A real question was sent to ${engine} at audit time — no simulated prompts, no cached guesses.`,
    sovEyebrow: "Share of voice",
    sovYouLabel: "You",
    sovLead: (brandPct: number, engine: string) =>
      `Out of every brand ${engine} named on the buyer questions we tested, ${brandPct}% of the mentions were yours.`,
    sovLeaderLine: (leader: string, leaderPct: number) =>
      `${leader} takes ${leaderPct}% — that's the share you're competing for.`,
    sovInvisibleLine: (engine: string) =>
      `${engine} never named you. Every mention went to someone else.`,
    sovWinningLine: "You're the most-cited brand on these questions. Hold it.",
    sovFairShareLine: (fairPct: number, brandCount: number) =>
      `Benchmark: with ${brandCount} brands named here, an even split would give each one ${fairPct}%.`,
    sovBandInvisible: "Invisible",
    sovBandFarBelow: "Far below your fair share",
    sovBandBelow: "Below your fair share",
    sovBandFair: "At your fair share",
    sovBandAbove: "Above your fair share",
    methodEyebrow: "How these questions were picked",
    methodTitle: "Real purchase questions. Never your brand name.",
    methodBody: (engine: string) =>
      `We only ask ${engine} questions a buyer would type before choosing — never "reviews of your brand". Asking an engine about a brand it was just handed almost always returns a mention, which inflates the score. These questions are the honest test: does it name you when nobody mentioned you first?`,
    methodChipUnbranded: "Non-branded",
    methodChipIntent: "Buyer intent",
    methodChipLive: "Asked live",
  },
  fr: {
    navCta: "Démarrer Agent — 19 €/mois →",
    status: { failed: "Échec", complete: "Terminé", running: "En cours" },
    title: (brandName: string) => `${brandName} — ta visibilité dans l'IA`,
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
    freeFixTitle: (brandName: string) => `Un correctif que GetPick Agent peut livrer pour ${brandName}`,
    freeFixBadge: "Écart vérifié",
    unlockFixesCta: "Débloquer tes correctifs — GetPick Agent 19 €/mois",
    noFakeFixes: "Aucun correctif inventé",
    noVerifiedGapTitle: "Aucun écart vérifié trouvé dans cet audit gratuit.",
    noVerifiedGapBody: "GetPick n'invente pas de correction. Ce rapport n'a trouvé aucun manque de recommandation ni concurrent cité dans les questions vérifiées.",
    liveCheckLabel: "Vérification en direct, pas simulée",
    liveCheckDetail: (engine: string) => `Une vraie question a été envoyée à ${engine} au moment de l'audit — aucun prompt simulé, aucune estimation en cache.`,
    sovEyebrow: "Part de voix",
    sovYouLabel: "Toi",
    sovLead: (brandPct: number, engine: string) =>
      `Sur toutes les marques citées par ${engine} dans les questions d'achat testées, ${brandPct}% des mentions sont les tiennes.`,
    sovLeaderLine: (leader: string, leaderPct: number) =>
      `${leader} en prend ${leaderPct}% — c'est cette part que tu vas chercher.`,
    sovInvisibleLine: (engine: string) =>
      `${engine} ne t'a jamais cité. Chaque mention est partie chez un concurrent.`,
    sovWinningLine: "Tu es la marque la plus citée sur ces questions. Garde cette place.",
    sovFairShareLine: (fairPct: number, brandCount: number) =>
      `Repère : avec ${brandCount} marques citées ici, un partage à parts égales donnerait ${fairPct}% à chacune.`,
    sovBandInvisible: "Invisible",
    sovBandFarBelow: "Très en dessous de ta part équitable",
    sovBandBelow: "En dessous de ta part équitable",
    sovBandFair: "À ta part équitable",
    sovBandAbove: "Au-dessus de ta part équitable",
    methodEyebrow: "Comment ces questions ont été choisies",
    methodTitle: "De vraies questions d'achat. Jamais ton nom de marque.",
    methodBody: (engine: string) =>
      `On ne pose à ${engine} que des questions qu'un acheteur taperait avant de choisir — jamais « avis sur ta marque ». Demander à un moteur de parler d'une marque qu'on vient de lui souffler renvoie presque toujours une mention, ce qui gonfle le score. Ces questions sont le test honnête : est-ce qu'il te cite quand personne ne t'a mentionné avant ?`,
    methodChipUnbranded: "Sans nom de marque",
    methodChipIntent: "Intention d'achat",
    methodChipLive: "Posée en direct",
  },
} as const;


export function localizeCategoryLabel(category: string | undefined, locale: Locale) {
  const clean = (category ?? "").trim();
  if (!clean || locale === "en") return clean;

  const lower = clean.toLowerCase();
  const translations: Array<[RegExp, string]> = [
    // Safety net: the internal sentinel must never surface in a FR report either.
    [/your type of business/, "cette catégorie"],
    [/eyewear brand|eyewear|glasses/, "marque de lunettes"],
    [/jewelry brand|jewell?ery/, "marque de bijoux"],
    [/mattress and bedding brand|mattress|bedding/, "marque de literie"],
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
