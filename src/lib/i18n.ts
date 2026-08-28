import { PLAN_PROMISES, RECHECK_CADENCE } from "./plan-promises";

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
    navCompare: "Compare",
    // 1. HERO — pain + transformation
    heroEyebrow: "The GEO agent for DTC brands",
    heroTitle: "When a shopper asks AI what to buy, it answers with a rival.",
    heroTitleAccent: "GetPick makes it answer with you.",
    heroSubtitle: "It gets your brand recommended by ChatGPT and Gemini — diagnosis, content, monitoring. No agency needed.",
    formTitle: "Run your free audit",
    // « Email optional » était vrai pour LANCER l'audit et faux pour ce qu'on en
    // voit : une fois le gate déployé (`resolveReportAccess`, tier free non
    // réclamé -> `locked: "claim"`), un audit lancé sans email s'arrête au verdict
    // et aux questions perdues. Le score, le détail par question et les correctifs
    // sont sous la porte. Promettre « optionnel » sans le dire, c'est faire
    // découvrir la porte au moment exact où on demande l'email.
    formSubtitle: "Brand + website. Email optional — it unlocks your score and the fixes to publish.",
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
    // Refus du gate du champ << site >> : un message par code stable de l'API
    // (`error_code`), toujours avec la correction proposee.
    errorWebsiteLooksLikeEmail: "That looks like an email address — enter your website address instead, e.g. yourbrand.com.",
    errorWebsiteCredentials: "A website address can't contain a login or password — enter just your domain, e.g. yourbrand.com.",
    errorWebsiteUnreachable: "We couldn't reach that website — check the address, e.g. yourbrand.com.",
    formFootnote: "Real buying questions sent live to Gemini — never simulated. No card, no signup.",
    formBuyerIntentNote: "We only test questions a shopper asks before buying — never “reviews of your brand”.",
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
      { num: "2", time: "2 min", title: "The agent asks the AIs", body: `Real buying questions, sent live at audit time to the engine your plan checks — ${PLAN_PROMISES.free.engineLabel.en} on the free audit, ${PLAN_PROMISES.agent_19eur.engineLabel.en} on the Agent plan. Never simulated.` },
      { num: "3", time: "Same day", title: "See the rival, publish the fixes", body: "The agent names who gets recommended in your place — and writes the copy-paste content that wins the answer back." },
    ],
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
        features: ["Real buying questions, sent live", "Your score out of 100", "The rival named in your place", "Whether AI even knows what you sell", "Your share of voice"],
        cta: "Run my free audit",
        href: "#audit",
        plan: "free",
        highlight: false,
      },
      {
        name: "Monitor",
        price: "€9",
        suffix: "/month",
        note: `The agent works ${RECHECK_CADENCE.en.every}: it checks, names, writes.`,
        badge: "Agency work, tool price",
        features: [`${PLAN_PROMISES.monitor_9eur.buyerQuestionCount} buying questions re-checked ${RECHECK_CADENCE.en.adverb}`, "Copy-paste fixes written from your real gaps", "Ready-to-install machine files: FAQ schema (JSON-LD), llms.txt, robots.txt fix", "Alerts when your score or your rivals move"],
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
        features: [`${PLAN_PROMISES.agent_19eur.engineLabel.en} checked ${RECHECK_CADENCE.en.adverb} (Monitor checks ${PLAN_PROMISES.monitor_9eur.engineLabel.en})`, `1 to 3 fixes written for you ${RECHECK_CADENCE.en.per}`, "Mention plan: directories, Reddit, comparisons", "A chat connected to your audit", "Monitor included"],
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
    tldrBody: `GetPick is the GEO agent for direct-to-consumer and e-commerce brands. It gets brands recommended by AI assistants like ChatGPT and Gemini. Concretely: it sends real buying questions to the AIs — live, never simulated — and reports whether you or a rival gets recommended, naming that rival. It also reports whether the AI has you filed in the right category at all — if an engine thinks you sell something else, it will never shortlist you, no matter what you publish. It then writes the copy-paste fixes that close the gap — including the ready-to-install machine files (FAQ schema JSON-LD built from the audited questions, llms.txt, robots.txt fix when AI crawlers are blocked) — and re-checks everything ${RECHECK_CADENCE.en.adverb}, regenerating those files when the answers move. It is built for DTC founders without an agency budget: free audit, monitoring at €9/month, full agent at €19/month — flat prices, no credits, no seats. Paid plans are cancellable at any time and refunded on request within 30 days, no questions asked. GEO agencies charge €2,000 to €20,000 per month for this category of work. ChatGPT ad placements are now open to buy self-serve — current rollout as of 28 July 2026: the United States, the United Kingdom, Canada, Australia, New Zealand, Japan and South Korea, not France, and only on the Free and Go tiers — but those placements sit below the answer and independent research finds the shopping carousel ignores paid: being the organic recommendation is still free, while a sponsored click costs $3-5 and Monitor costs €9/month.`,
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
        answer: `That's exactly why GetPick is a ${RECHECK_CADENCE.en.adjective} agent, not a one-shot audit. It re-asks your buying questions ${RECHECK_CADENCE.en.every}, catches the moment an answer flips to a rival, and writes the fix while it still matters. A static report would be stale in a month.`,
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
        question: "Which questions do you test?",
        answer: "Only real buying questions — the ones a shopper types before choosing a brand. Never “reviews of your brand” or “what is [your name]”: those almost always return a mention and inflate the score. We test whether AI names you when nobody handed it your name first.",
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
      {
        question: "ChatGPT now sells ads — is organic dead?",
        answer: "No. ChatGPT placements are now open to buy self-serve, but they sit below the answer, labelled “sponsored” and visually separated from it: the answer itself stays organic, and independent research on more than a million shopping queries found the shopping carousel is drawn from organic results only, with paid ads ignored. Current rollout as of 28 July 2026: the US, the UK, Canada, Australia, New Zealand, Japan and South Korea — not France — and only for logged-in adults on the Free and Go tiers. What actually changes: being the recommendation the assistant names is still free, while a sponsored click costs $3-5. Monitor costs €9/month, and it works on the organic answer.",
      },
    ],
    // 10. Closing — loss aversion
    closingTitle: "Every day, AI recommends someone in your category.",
    closingBody: "Right now it might not be you. Two minutes tells you for sure — and the agent starts fixing it.",
    closingCta: "Get picked →",
    footerTagline: "The GEO agent for DTC brands. It gets you recommended by ChatGPT and Gemini.",
    rights: "All rights reserved.",
    footerProspection: "Outbound policy",
    footerStudy: "Our 21-brand study: why we withdrew the numbers",
  },
  fr: {
    navAudit: "Audit gratuit",
    navCompare: "Comparatif",
    // 1. HERO — douleur + transformation
    heroEyebrow: "L'agent GEO des marques DTC",
    heroTitle: "Quand un client demande quoi acheter, l'IA répond le nom d'un rival.",
    heroTitleAccent: "GetPick fait en sorte que ce soit le tien.",
    heroSubtitle: "Il fait recommander ta marque par ChatGPT et Gemini — diagnostic, contenu, suivi. Sans agence.",
    formTitle: "Lance ton audit gratuit",
    formSubtitle: "Ta marque + ton site. Email optionnel — il débloque ton score et les correctifs à publier.",
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
    // Refus du gate du champ « site » : un message par code stable de l'API
    // (`error_code`), toujours avec la correction proposée.
    errorWebsiteLooksLikeEmail: "On dirait une adresse email — indique plutôt l'adresse de ton site, par exemple marque.com.",
    errorWebsiteCredentials: "Une adresse de site ne contient pas d'identifiants — indique juste ton domaine, par exemple marque.com.",
    errorWebsiteUnreachable: "Ce site ne répond pas — vérifie l'adresse, par exemple marque.com.",
    formFootnote: "De vraies questions d'achat envoyées en direct à Gemini — jamais simulées. Sans carte, sans inscription.",
    formBuyerIntentNote: "On ne teste que les questions qu'un acheteur pose avant d'acheter — jamais « avis sur ta marque ».",
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
      { num: "2", time: "2 min", title: "L'agent interroge les IA", body: `De vraies questions d'achat, envoyées en direct au moment de l'audit au moteur que ton offre interroge — ${PLAN_PROMISES.free.engineLabel.fr} sur l'audit gratuit, ${PLAN_PROMISES.agent_19eur.engineLabel.fr} sur l'offre Agent. Jamais simulées.` },
      { num: "3", time: "Le jour même", title: "Tu vois le rival, tu publies les correctifs", body: "L'agent nomme qui est recommandé à ta place — et écrit le contenu à copier-coller pour reprendre la réponse." },
    ],
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
        features: ["Vraies questions d'achat, envoyées en direct", "Ton score sur 100", "Le rival nommé à ta place", "Si l'IA sait seulement ce que tu vends", "Ta part de voix"],
        cta: "Lancer mon audit gratuit",
        href: "#audit",
        plan: "free",
        highlight: false,
      },
      {
        name: "Monitor",
        price: "€9",
        suffix: "/mois",
        note: `L'agent travaille ${RECHECK_CADENCE.fr.every} : il vérifie, il nomme, il écrit.`,
        badge: "Travail d'agence, prix d'outil",
        features: [`${PLAN_PROMISES.monitor_9eur.buyerQuestionCount} questions d'achat re-vérifiées ${RECHECK_CADENCE.fr.adverb}`, "Correctifs à copier-coller écrits depuis tes vrais écarts", "Fichiers machine prêts à installer : schéma FAQ (JSON-LD), llms.txt, correctif robots.txt", "Alertes quand ton score ou tes rivaux bougent"],
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
        features: [`${PLAN_PROMISES.agent_19eur.engineLabel.fr} vérifié ${RECHECK_CADENCE.fr.adverb} (Monitor vérifie ${PLAN_PROMISES.monitor_9eur.engineLabel.fr})`, `1 à 3 correctifs rédigés pour toi ${RECHECK_CADENCE.fr.per}`, "Plan de mentions : annuaires, Reddit, comparatifs", "Un chat branché sur ton audit", "Monitor inclus"],
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
    tldrBody: `GetPick est l'agent GEO des marques DTC et e-commerce. Il fait recommander ta marque par les assistants IA comme ChatGPT et Gemini. Concrètement : il envoie de vraies questions d'achat aux IA — en direct, jamais simulées — puis te dit si c'est toi ou un rival qui est recommandé, en nommant ce rival. Il te dit aussi si l'IA t'a seulement rangé dans la bonne catégorie — si un moteur croit que tu vends autre chose, il ne te proposera jamais, quoi que tu publies. Il écrit ensuite les correctifs à copier-coller qui comblent l'écart — y compris les fichiers machine prêts à installer (schéma FAQ JSON-LD construit depuis les questions auditées, llms.txt, correctif robots.txt quand des crawlers IA sont bloqués) — et re-vérifie tout ${RECHECK_CADENCE.fr.adverb}, en régénérant ces fichiers quand les réponses bougent. C'est pensé pour les fondateurs DTC sans budget agence : audit gratuit, suivi à 9 €/mois, agent complet à 19 €/mois — prix fixes, sans crédits ni calculateur. Les offres payantes sont résiliables à tout moment et remboursées sur simple demande sous 30 jours, sans question. Une agence GEO facture 2 000 à 20 000 € par mois pour cette catégorie de travail. Les placements publicitaires ChatGPT sont désormais ouverts à l'achat en self-serve — diffusion actuelle au 28 juillet 2026 : États-Unis, Royaume-Uni, Canada, Australie, Nouvelle-Zélande, Japon et Corée du Sud, pas la France, et uniquement sur les tiers Free et Go — mais ces placements s'affichent sous la réponse et une recherche indépendante montre que le carrousel shopping les ignore : être la recommandation organique reste gratuit, quand un clic sponsorisé coûte 3-5 $ et que Monitor coûte 9 €/mois.`,
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
        answer: `C'est exactement pour ça que GetPick est un agent ${RECHECK_CADENCE.fr.adjective}, pas un audit one-shot. Il repose tes questions d'achat ${RECHECK_CADENCE.fr.every}, détecte le moment où une réponse bascule vers un rival, et écrit le correctif pendant que ça compte encore. Un rapport statique serait périmé en un mois.`,
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
        question: "Quelles questions testez-vous ?",
        answer: "Uniquement de vraies questions d'achat — celles qu'un client tape avant de choisir une marque. Jamais « avis sur ta marque » ni « c'est quoi [ton nom] » : ça renvoie presque toujours une mention et gonfle le score. On teste si l'IA te cite quand personne ne lui a soufflé ton nom avant.",
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
      {
        question: "ChatGPT vend maintenant de la pub — l'organique est mort ?",
        answer: "Non. Les placements ChatGPT sont désormais ouverts à l'achat en self-serve, mais ils s'affichent sous la réponse, étiquetés « sponsorisé » et visuellement séparés d'elle : la réponse, elle, reste organique, et une recherche indépendante sur plus d'un million de requêtes shopping a montré que le carrousel shopping est construit uniquement sur des résultats organiques, le payant étant ignoré. Diffusion actuelle au 28 juillet 2026 : États-Unis, Royaume-Uni, Canada, Australie, Nouvelle-Zélande, Japon et Corée du Sud — pas la France — et uniquement pour les utilisateurs connectés majeurs des tiers Free et Go. Ce que ça change vraiment : être la recommandation reste gratuit, quand un clic sponsorisé coûte 3-5 $. Monitor coûte 9 €/mois, et il travaille sur la réponse organique.",
      },
    ],
    // 10. Clôture — aversion à la perte
    closingTitle: "Chaque jour, l'IA recommande quelqu'un dans ta catégorie.",
    closingBody: "En ce moment, ce n'est peut-être pas toi. Deux minutes pour le savoir — et l'agent commence à corriger.",
    closingCta: "Lancer mon audit gratuit →",
    footerTagline: "L'agent GEO des marques DTC. Il te fait recommander par ChatGPT et Gemini.",
    rights: "Tous droits réservés.",
    footerProspection: "Politique de prospection",
    footerStudy: "Notre étude 21 marques : pourquoi on a retiré les chiffres",
  },
} as const;

export const auditCopy = {
  en: {
    status: { failed: "Failed", complete: "Complete", running: "Running" },
    title: (brandName: string) => `${brandName} — your AI visibility`,
    failedPrefix: "Could not run the report:",
    unknownError: "unknown error",
    runningText: "Wait 20–60 seconds: checking real results without inventing anything.",
    monitorEmpty: "Actions will appear as soon as the Monitor report finishes.",
    where: "Where:",
    questionsTitle: (engine: string) => `Questions asked to ${engine}`,
    webQuestionsTitle: "Buyer web searches checked",
    nativeWebSearch: "Native web_search",
    engineUnavailable: (engine: string) => `${engine} unavailable; try again.`,
    webUnavailable: "Native web_search unavailable; this report uses only checks that completed.",
    proofTitle: "A fix generated from a real signal",
    reportReassurance: "No commitment, cancel anytime.",
    scoreCategoryLine: (score: number, category: string) => `Score ${score}/100 · detected category: ${category}`,
    verdictRivalReplacement: (engine: string, rival: string, prompt: string) => `On “${prompt}”, ${engine} recommends ${rival}. Not you.`,
    verdictRivalAlso: (engine: string, rival: string, prompt: string) => `On “${prompt}”, ${engine} cites you — and also cites ${rival}.`,
    publishLockedEyebrow: "Monitor · €9/month",
    publishLockedTitle: "Your “to publish” block, written for you",
    publishLockedBody: `One gesture: paste what follows onto your site. Monitor writes it from your real audit and regenerates it ${RECHECK_CADENCE.en.adverb}. Here is what you unlock — named and counted, never invented:`,
    publishLockedCta: "Unlock “to publish” — €9/month →",
    publishEyebrow: "To publish",
    publishTitle: "To publish on your site",
    publishBody: `Everything the audit wrote for you, in one place: paste, publish. Re-checked and regenerated ${RECHECK_CADENCE.en.adverb}.`,
    liveCheckLabel: "Live check, not simulated",
    liveCheckDetail: (engine: string) => `A real question was sent to ${engine} at audit time — no simulated prompts, no cached guesses.`,
    methodEyebrow: "How these questions were picked",
    methodTitle: "Real purchase questions. Never your brand name.",
    methodBody: (engine: string) =>
      `We only ask ${engine} questions a buyer would type before choosing — never "reviews of your brand". Asking an engine about a brand it was just handed almost always returns a mention, which inflates the score. These questions are the honest test: does it name you when nobody mentioned you first?`,
    methodChipUnbranded: "Non-branded",
    methodChipIntent: "Buyer intent",
    methodChipLive: "Asked live",
    techEyebrow: "Technical files · ready to install",
    techTitle: "The machine files, written from your real audit",
    techBody:
      "Generic generators invent their Q&A. These files are built from the exact buyer questions where AI cites a rival instead of you — paste them on your site and the engines read your best answers. They are regenerated every time your answers move, so they never go stale.",
    techJsonLdLabel: "JSON-LD (Organization + FAQ) — paste before </head>",
    techJsonLdHint: "The FAQ entries are your real audited buyer questions, answered in your favour.",
    techLlmsLabel: "llms.txt — upload to yoursite.com/llms.txt",
    techLlmsHint: "The summary AI assistants read first to understand who you are and what to recommend you for.",
    techRobotsLabel: "robots.txt fix — append to your existing robots.txt",
    techRobotsIntro: (bots: string) =>
      `Your robots.txt currently blocks ${bots}. Blocked crawlers cannot read your site, so the engines behind them cannot recommend you. Appending these lines unblocks them — a named rule always overrides "User-agent: *".`,
    techRegenNote: `Regenerated at every ${RECHECK_CADENCE.en.recheckNoun} — when the AI answers move, your files follow.`,
    categoryPerceptionEyebrow: "What AI thinks you sell",
    categoryPerceptionMismatchTitle: "AI doesn't know what you sell.",
    categoryPerceptionMatchTitle: "AI knows what you sell.",
    categoryPerceptionYouSell: "Your site sells",
    categoryPerceptionAiThinks: "AI describes you as",
    categoryPerceptionMismatchBody: (engine: string) =>
      `${engine} places you in a different category than the one you actually sell in. This is upstream of your score: if the engine has you filed under the wrong category, it will not shortlist you for the buying questions that matter — no amount of content in your real category fixes a wrong filing.`,
    categoryPerceptionMismatchAction:
      "Make one page state plainly, in the first sentence, what you sell and to whom. Then get that same wording repeated on the third-party pages AI reads about you — listicles, directories, your own llms.txt.",
    categoryPerceptionMatchBody: (engine: string) =>
      `${engine} files you in the right category. Your visibility problem, if you have one, is about being chosen inside that category — not about being misunderstood.`,
    sentimentEyebrow: "How AI talks about you",
    sentimentTitle: "Brand sentiment",
    sentimentPositive: "Positive",
    sentimentNeutral: "Neutral",
    sentimentNegative: "Needs work",
    sentimentUnknown: "Not enough signal",
    sentimentBodyPositive: "When AI mentions you, the tone is favourable — protect that with consistent product facts.",
    sentimentBodyNeutral: "AI describes you factually but without warmth. Clearer proofs and use-cases tip this positive.",
    sentimentBodyNegative: "AI frames you poorly or inaccurately. Fix the public facts it can read before chasing more mentions.",
    sentimentBodyUnknown: "AI barely describes you at all. Getting named on buying questions is the first step.",
    actionWhyFirst: "Why this first",
    actionWhyBecause: (prompts: string[]) =>
      prompts.length === 1
        ? `Closes the gap on: “${prompts[0]}”`
        : `Closes gaps on ${prompts.length} buyer questions, starting with: “${prompts[0]}”`,
    // Impact CALCULÉ (lot P2) : le libellé ne porte que des nombres dérivés de
    // l'audit — questions perdues adressées / questions perdues. Jamais de
    // pourcentage inventé, jamais de promesse de gain. Sans donnée : neutre.
    actionImpactMeasured: (addressed: number, lostTotal: number) => {
      if (lostTotal === 1) return addressed === 1 ? "Addresses the one lost buyer question" : "Doesn't address the lost buyer question";
      return addressed === 0
        ? `Addresses none of the ${lostTotal} lost buyer questions`
        : `Addresses ${addressed} of the ${lostTotal} lost buyer questions`;
    },
    actionImpactUnmeasured: "Impact not measured",
    actionPhase: { foundations: "Foundations", content: "Content", authority: "Authority" },
    youtubeTipBadge: "Content tip",
    youtubeTipTitle: "YouTube is the #1 AI-visibility signal — and you have none",
    youtubeTipBody:
      "An Ahrefs study of 75,000 brands found YouTube mentions correlate with AI visibility more than any other single signal. None of the sources the engines cited for you were a YouTube video — publishing one (a product demo, an honest comparison, a review) is a lever most brands your size still haven't pulled.",
  },
  fr: {
    status: { failed: "Échec", complete: "Terminé", running: "En cours" },
    title: (brandName: string) => `${brandName} — ta visibilité dans l'IA`,
    failedPrefix: "Impossible de lancer le rapport :",
    unknownError: "erreur inconnue",
    runningText: "Attends 20 à 60 secondes : on vérifie de vrais résultats sans rien inventer.",
    monitorEmpty: "Les actions apparaîtront dès que le rapport Monitor sera terminé.",
    where: "Où :",
    questionsTitle: (engine: string) => `Questions posées à ${engine}`,
    webQuestionsTitle: "Recherches d'achat vérifiées",
    nativeWebSearch: "Recherche web native",
    engineUnavailable: (engine: string) => `${engine} est indisponible ; réessaie.`,
    webUnavailable: "Recherche web native indisponible ; ce rapport utilise uniquement les vérifications terminées.",
    proofTitle: "Une correction générée à partir d'un vrai signal",
    reportReassurance: "Sans engagement, résiliable à tout moment.",
    scoreCategoryLine: (score: number, category: string) => `Score ${score}/100 · catégorie détectée : ${category}`,
    verdictRivalReplacement: (engine: string, rival: string, prompt: string) => `Sur « ${prompt} », ${engine} recommande ${rival}. Pas toi.`,
    verdictRivalAlso: (engine: string, rival: string, prompt: string) => `Sur « ${prompt} », ${engine} te cite — et cite aussi ${rival}.`,
    publishLockedEyebrow: "Monitor · 9 €/mois",
    publishLockedTitle: "Ton bloc « À publier », rédigé pour toi",
    publishLockedBody: `Un seul geste : tu colles ce qui suit sur ton site. Monitor le rédige depuis ton vrai audit et le régénère ${RECHECK_CADENCE.fr.adverb}. Voici ce que tu débloques — nommé et compté, jamais inventé :`,
    publishLockedCta: "Débloquer « À publier » — 9 €/mois →",
    publishEyebrow: "À publier",
    publishTitle: "À publier sur ton site",
    publishBody: `Tout ce que l'audit a rédigé pour toi, au même endroit : colle, publie. Re-vérifié et régénéré ${RECHECK_CADENCE.fr.adverb}.`,
    liveCheckLabel: "Vérification en direct, pas simulée",
    liveCheckDetail: (engine: string) => `Une vraie question a été envoyée à ${engine} au moment de l'audit — aucun prompt simulé, aucune estimation en cache.`,
    methodEyebrow: "Comment ces questions ont été choisies",
    methodTitle: "De vraies questions d'achat. Jamais ton nom de marque.",
    methodBody: (engine: string) =>
      `On ne pose à ${engine} que des questions qu'un acheteur taperait avant de choisir — jamais « avis sur ta marque ». Demander à un moteur de parler d'une marque qu'on vient de lui souffler renvoie presque toujours une mention, ce qui gonfle le score. Ces questions sont le test honnête : est-ce qu'il te cite quand personne ne t'a mentionné avant ?`,
    methodChipUnbranded: "Sans nom de marque",
    methodChipIntent: "Intention d'achat",
    methodChipLive: "Posée en direct",
    techEyebrow: "Fichiers techniques · prêts à installer",
    techTitle: "Tes fichiers machine, écrits depuis ton vrai audit",
    techBody:
      "Les générateurs génériques inventent leurs Q&A. Ces fichiers sont construits depuis les vraies questions d'achat où l'IA cite un rival à ta place — colle-les sur ton site et les moteurs lisent tes meilleures réponses. Ils sont régénérés dès que les réponses bougent : jamais périmés.",
    techJsonLdLabel: "JSON-LD (Organization + FAQ) — à coller avant </head>",
    techJsonLdHint: "Les entrées FAQ sont tes vraies questions d'achat auditées, avec des réponses en ta faveur.",
    techLlmsLabel: "llms.txt — à déposer sur tonsite.com/llms.txt",
    techLlmsHint: "Le résumé que les assistants IA lisent en premier pour comprendre qui tu es et pour quoi te recommander.",
    techRobotsLabel: "Correctif robots.txt — à ajouter à la fin de ton robots.txt existant",
    techRobotsIntro: (bots: string) =>
      `Ton robots.txt bloque actuellement ${bots}. Un crawler bloqué ne peut pas lire ton site, donc le moteur derrière ne peut pas te recommander. Ajouter ces lignes les débloque — une règle nommée prime toujours sur « User-agent: * ».`,
    techRegenNote: `Régénérés à chaque ${RECHECK_CADENCE.fr.recheckNoun} — quand les réponses IA bougent, tes fichiers suivent.`,
    categoryPerceptionEyebrow: "Ce que l'IA croit que tu vends",
    categoryPerceptionMismatchTitle: "L'IA ne sait pas ce que tu vends.",
    categoryPerceptionMatchTitle: "L'IA sait ce que tu vends.",
    categoryPerceptionYouSell: "Ton site vend",
    categoryPerceptionAiThinks: "L'IA te décrit comme",
    categoryPerceptionMismatchBody: (engine: string) =>
      `${engine} te range dans une autre catégorie que celle où tu vends réellement. C'est en amont de ton score : si le moteur t'a classé au mauvais endroit, il ne te fera pas figurer dans les questions d'achat qui comptent — et aucun contenu publié dans ta vraie catégorie ne rattrape un mauvais classement.`,
    categoryPerceptionMismatchAction:
      "Fais dire à une page, dès la première phrase, ce que tu vends et à qui. Puis fais reprendre exactement cette formulation sur les pages tierces que l'IA lit à ton sujet — comparatifs, annuaires, et ton propre llms.txt.",
    categoryPerceptionMatchBody: (engine: string) =>
      `${engine} te classe dans la bonne catégorie. Ton problème de visibilité, s'il y en a un, est d'être choisi À L'INTÉRIEUR de cette catégorie — pas d'être mal compris.`,
    sentimentEyebrow: "Ce que l'IA dit de toi",
    sentimentTitle: "Sentiment de marque",
    sentimentPositive: "Positif",
    sentimentNeutral: "Neutre",
    sentimentNegative: "À améliorer",
    sentimentUnknown: "Pas assez de signal",
    sentimentBodyPositive: "Quand l'IA te mentionne, le ton est favorable — protège-le avec des faits produit cohérents.",
    sentimentBodyNeutral: "L'IA te décrit factuellement, sans chaleur. Des preuves et cas d'usage plus clairs basculent ça en positif.",
    sentimentBodyNegative: "L'IA te présente mal ou de façon inexacte. Corrige d'abord les faits publics qu'elle peut lire.",
    sentimentBodyUnknown: "L'IA te décrit à peine. Se faire nommer sur des questions d'achat est la première étape.",
    actionWhyFirst: "Pourquoi en premier",
    actionWhyBecause: (prompts: string[]) =>
      prompts.length === 1
        ? `Comble l'écart sur : « ${prompts[0]} »`
        : `Comble l'écart sur ${prompts.length} questions d'achat, à commencer par : « ${prompts[0]} »`,
    // Impact CALCULÉ (lot P2) : uniquement des nombres dérivés de l'audit.
    actionImpactMeasured: (addressed: number, lostTotal: number) => {
      if (lostTotal === 1) return addressed === 1 ? "Adresse la seule question d'achat perdue" : "N'adresse pas la question d'achat perdue";
      return addressed === 0
        ? `N'adresse aucune des ${lostTotal} questions d'achat perdues`
        : `Adresse ${addressed} des ${lostTotal} questions d'achat perdues`;
    },
    actionImpactUnmeasured: "Impact non mesuré",
    actionPhase: { foundations: "Fondations", content: "Contenu", authority: "Autorité" },
    youtubeTipBadge: "Astuce contenu",
    youtubeTipTitle: "YouTube est le signal #1 de visibilité IA — et tu n'en as aucun",
    youtubeTipBody:
      "Une étude Ahrefs sur 75 000 marques montre que les mentions YouTube sont le signal le plus corrélé à la visibilité dans l'IA, plus que n'importe quel autre facteur pris seul. Aucune des sources citées par les moteurs pour toi n'est une vidéo YouTube — en publier une (démo produit, comparatif honnête, avis) est un levier que la plupart des marques de ta taille n'ont pas encore actionné.",
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

export type BrandSentimentView = {
  label: "positive" | "neutral" | "negative" | "not_enough_signal";
  shortLabel: string;
  color: string;
  justification: string;
  guidance: string;
};

export function brandSentimentView(sentiment: SentimentLike, locale: Locale): BrandSentimentView {
  const label =
    sentiment.label === "positive" || sentiment.label === "neutral" || sentiment.label === "negative"
      ? sentiment.label
      : "not_enough_signal";
  const justification = (sentiment.justification ?? "").trim();
  const copy = auditCopy[locale];

  if (label === "positive") {
    return {
      label,
      shortLabel: copy.sentimentPositive,
      color: "#CAFF3C",
      justification: justification && justification.toLowerCase() !== "not enough signal" ? justification : "",
      guidance: copy.sentimentBodyPositive,
    };
  }
  if (label === "neutral") {
    return {
      label,
      shortLabel: copy.sentimentNeutral,
      color: "#FFD166",
      justification: justification && justification.toLowerCase() !== "not enough signal" ? justification : "",
      guidance: copy.sentimentBodyNeutral,
    };
  }
  if (label === "negative") {
    return {
      label,
      shortLabel: copy.sentimentNegative,
      color: "#FF8F6B",
      justification: justification && justification.toLowerCase() !== "not enough signal" ? justification : "",
      guidance: copy.sentimentBodyNegative,
    };
  }
  return {
    label: "not_enough_signal",
    shortLabel: copy.sentimentUnknown,
    color: "#8E8E9A",
    justification: "",
    guidance: copy.sentimentBodyUnknown,
  };
}

export function brandSentimentText(sentiment: SentimentLike, locale: Locale) {
  const view = brandSentimentView(sentiment, locale);
  const eyebrow = auditCopy[locale].sentimentEyebrow;

  if (!view.justification) return `${eyebrow} : ${view.shortLabel}`;
  return `${eyebrow} : ${view.shortLabel} — ${view.justification}`;
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
