import { BEACHHEAD_TRADE, PLAN_PROMISES, RECHECK_CADENCE, SERVICE_PLAN_PRICE_EUR } from "./plan-promises";

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

/**
 * La cadence en tête de phrase (« Every month » / « Tous les mois »). Dérivée,
 * jamais écrite : `RECHECK_INTERVAL_DAYS` passe à 7 et le hero dit « Every
 * week » sans qu'on touche à une seule phrase. Voir `plan-promises.ts`.
 */
const CAPITALISED_CADENCE = {
  en: RECHECK_CADENCE.en.every.charAt(0).toUpperCase() + RECHECK_CADENCE.en.every.slice(1),
  fr: RECHECK_CADENCE.fr.every.charAt(0).toUpperCase() + RECHECK_CADENCE.fr.every.slice(1),
} as const;

export const homeCopy = {
  en: {
    navAudit: "Free diagnostic",
    navCompare: "Compare",
    // 1. HERO — pain + transformation
    heroEyebrow: "The agent that gets you recommended by AI",
    heroTitle: `When a client looks for an ${BEACHHEAD_TRADE.en}, ChatGPT answers with a name.`,
    heroTitleAccent: "Make it yours.",
    heroSubtitle: `GetPick builds and maintains your presence where AI looks for who to recommend. You touch nothing — no code, no site. ${CAPITALISED_CADENCE.en} it shows you who AI cites, and how you climb.`,
    formTitle: "Your free diagnostic",
    // « Email optional » était vrai pour LANCER l'audit et faux pour ce qu'on en
    // voit : une fois le gate déployé (`resolveReportAccess`, tier free non
    // réclamé -> `locked: "claim"`), un audit lancé sans email s'arrête au verdict
    // et aux questions perdues. Le score, le détail par question et les correctifs
    // sont sous la porte. Promettre « optionnel » sans le dire, c'est faire
    // découvrir la porte au moment exact où on demande l'email.
    formSubtitle: "Your firm + your website. Email optional — it unlocks your score and the peer named in your place.",
    freeBadge: "Free",
    success: "You're on the list — we'll be in touch with your free audit.",
    businessLabel: "Firm name",
    businessPlaceholder: "Firm name",
    websiteLabel: "Website",
    websitePlaceholder: "yourbusiness.com",
    emailLabel: "Email",
    emailPlaceholder: "you@yourfirm.com",
    emailOptionalPlaceholder: "Email (optional)",
    loadingCta: "Asking AI…",
    submitCta: "See who AI recommends instead of you →",
    error: "Something went wrong. Please try again.",
    // Refus du gate du champ << site >> : un message par code stable de l'API
    // (`error_code`), toujours avec la correction proposee.
    errorWebsiteLooksLikeEmail: "That looks like an email address — enter your website address instead, e.g. yourbrand.com.",
    errorWebsiteCredentials: "A website address can't contain a login or password — enter just your domain, e.g. yourbrand.com.",
    errorWebsiteUnreachable: "We couldn't reach that website — check the address, e.g. yourbrand.com.",
    formFootnote: "Your clients’ real questions, sent live to Gemini — never simulated. No card, no signup.",
    formBuyerIntentNote: `Ask AI the real question your clients ask — “best ${BEACHHEAD_TRADE.en} for a startup / freelancer / e-commerce in [city]”. In 2 minutes, GetPick shows you the peer it names in your place, and why.`,
    // 2. AI conversation demo
    demoEyebrow: "Illustrative example",
    demoTitle: "This is what losing a client to AI looks like.",
    demoQuestion: `Best ${BEACHHEAD_TRADE.en} in Bordeaux for a freelancer?`,
    demoAnswerBefore: "For a freelancer in Bordeaux, the one that comes up most often is ",
    demoAnswerRival: "Cabinet Merisier",
    demoAnswerAfter: " — they handle micro-entrepreneurs and small companies, publish their fees, and answer within 24 hours. A couple of other firms nearby are worth a look.",
    demoCaption: "Your firm isn't in the answer. The client never sees your name — and never sees your ads either.",
    // 3. Three numbered steps
    stepsEyebrow: "How it works",
    stepsTitle: "Three steps. You never touch your site.",
    steps: [
      { num: "1", time: "30 sec", title: "Give us your firm", body: "Your name and your website address. That's the entire setup." },
      { num: "2", time: "2 min", title: "The agent asks the AIs", body: `The real questions your clients ask, sent live at diagnostic time to ${PLAN_PROMISES.free.engineLabel.en}. Never simulated.` },
      { num: "3", time: "Same day", title: "We do the work off-site", body: "GetPick names the peer cited in your place, then builds and hosts your answer page and places you on the sources AI trusts. You change nothing on your side." },
    ],
    // 5. The deliverable
    deliverableEyebrow: "What you get",
    deliverableTitle: "Not a dashboard. A name, and the work done for you.",
    reportVerdictLabel: "Verdict",
    reportVerdict: "Gemini does not name you on 7 of 12 client questions.",
    reportRivalLabel: "Named in your place",
    reportRival: "Cabinet Merisier",
    reportFixLabel: "Written, hosted and maintained by the agent — you touch nothing",
    reportFixTitle: "Your answer page, the one AI reads",
    reportFixBody: `“Which ${BEACHHEAD_TRADE.en} for a freelancer in Bordeaux?” — Fees published up front, first appointment within 48 hours, micro-entrepreneurs and small companies handled, 120 freelance clients in the Gironde.`,
    reportCaption: "Illustrative example — your page is written from your real diagnostic.",
    // 5bis. L'ÉCRAN DE MONITORING — ce que l'abonnement livre, pour que le
    // prospect se projette. Le compte de questions est DÉRIVÉ du moteur : une
    // maquette qui annonce un chiffre que le produit ne sert pas est un
    // engagement, pas une illustration.
    monitorEyebrow: "What lands in your inbox every month",
    monitorTitle: "One screen. What AI answers about you, and how it moves.",
    monitorSubtitle: `${CAPITALISED_CADENCE.en}, GetPick re-asks your clients' real questions, publishes what needs publishing, and sends you this. Nothing to open, nothing to configure — it arrives by email.`,
    monitorDocTitle: "GetPick report — September",
    monitorDocChip: "Sent on the 1st",
    monitorTiles: [
      { label: "Questions tested", value: `${PLAN_PROMISES.monitor_9eur.buyerQuestionCount}`, delta: "" },
      { label: "AI names you", value: `5 / ${PLAN_PROMISES.monitor_9eur.buyerQuestionCount}`, delta: "+2 vs August" },
      { label: "A peer named first", value: `4 / ${PLAN_PROMISES.monitor_9eur.buyerQuestionCount}`, delta: "−2 vs August" },
    ],
    monitorColQuestion: "Question asked to AI",
    monitorColCited: "Named first",
    monitorRows: [
      { question: `Best ${BEACHHEAD_TRADE.en} in Bordeaux for a freelancer`, cited: "You", mine: true, move: "new" },
      { question: `${BEACHHEAD_TRADE.en.charAt(0).toUpperCase() + BEACHHEAD_TRADE.en.slice(1)} for an online shop in Bordeaux`, cited: "You", mine: true, move: "held" },
      { question: `Best ${BEACHHEAD_TRADE.en} for a small company`, cited: "Cabinet Merisier", mine: false, move: "" },
      { question: `Affordable ${BEACHHEAD_TRADE.en} in the Gironde`, cited: "Cabinet Merisier", mine: false, move: "" },
    ],
    monitorFooter: "Plus the page we published for you this month, with its link.",
    monitorCaption: "Illustrative example — your report is built from your own questions.",
    // 6. Anchored pricing
    pricingEyebrow: "Pricing",
    pricingTitle: `What a GEO agency charges €2,000–20,000/month for. €${SERVICE_PLAN_PRICE_EUR}.`,
    pricingSubtitle: "One plan. Everything done for you. No credits, no calculator.",
    pricingTiers: [
      {
        name: "Free",
        price: "€0",
        note: "The diagnostic: see who AI recommends today.",
        badge: "Free diagnostic",
        features: ["Your clients’ real questions, sent live", "Your score out of 100", "The peer named in your place", "Whether AI even knows what you do", "Your share of voice"],
        cta: "Run my free diagnostic",
        href: "#audit",
        plan: "free",
        highlight: false,
      },
      {
        name: "Done for you",
        price: `€${SERVICE_PLAN_PRICE_EUR}`,
        suffix: "/month",
        note: "GetPick does the work off-site. You touch nothing.",
        badge: "Zero technical",
        features: [
          "GetPick creates and hosts your answer page — the one AI reads and cites — without ever touching your site.",
          "It places you on the sources AI trusts: directories, reviews, category comparisons.",
          "It writes the content that gets you cited — ready to publish.",
          `${CAPITALISED_CADENCE.en} it re-tests your clients’ real questions and shows the shift: from the peer… to you.`,
          `€${SERVICE_PLAN_PRICE_EUR}/month, all in. No credits, no agency, no dev. No commitment.`,
        ],
        cta: `Start — €${SERVICE_PLAN_PRICE_EUR}/month`,
        href: "service",
        plan: "service",
        highlight: true,
      },
    ],
    pricingReassurance: "No commitment, cancel anytime.",
    pricingGuarantee: "Refunded on request within 30 days. No questions asked.",
    // 7. TL;DR — dense paragraph for AI readers
    tldrEyebrow: "In short",
    tldrBody: `GetPick is the GEO agent for service professionals — ${BEACHHEAD_TRADE.en}s first. It gets you recommended by AI assistants like ChatGPT and Gemini, and it does the work off-site: you never touch your own website. Concretely: it sends the real questions your clients ask to the AIs — live, never simulated — and reports whether you or a peer gets named, naming that peer. It then creates and hosts your answer page, places you on the sources AI trusts (directories, reviews, category comparisons), writes the content that gets you cited, and re-tests everything ${RECHECK_CADENCE.en.adverb} so you see the shift from the peer to you. It is built for professionals with no agency budget and no developer: a free diagnostic, then one done-for-you plan at €${SERVICE_PLAN_PRICE_EUR}/month — flat price, no credits, no seats, nothing to install. The paid plan is cancellable at any time and refunded on request within 30 days, no questions asked. GEO agencies charge €2,000 to €20,000 per month for this category of work. ChatGPT ad placements are now open to buy self-serve — current rollout as of 28 July 2026: the United States, the United Kingdom, Canada, Australia, New Zealand, Japan and South Korea, not France, and only on the Free and Go tiers — but those placements sit below the answer and independent research finds the shopping carousel ignores paid: being the organic recommendation is still free, while a sponsored click costs $3-5 and GetPick costs €${SERVICE_PLAN_PRICE_EUR}/month.`,
    // 8. Founder
    founderEyebrow: "Who's behind this",
    founderBody: "I'm Charles. I build GetPick and I run every diagnostic myself. No sales team, no support bot: if you have a question, you email me and I answer.",
    founderSignature: "Charles — GetPick",
    founderEmail: "hello@getpick.ai",
    // 9. FAQ — real objections
    faqEyebrow: "FAQ",
    faqItems: [
      {
        question: "Zero technical, really?",
        answer: "You don’t change your site, you don’t install anything, you don’t paste anything. GetPick publishes off-site, on the sources AI actually reads. The one thing we can’t do for you: a directory that requires your own login, or your client reviews — there we prepare everything and you approve.",
      },
      {
        question: "How long does it take?",
        answer: "An AI recommendation moves in weeks, not in one click. First movements within 2 to 4 weeks, and you see each re-test.",
      },
      {
        question: "AI answers change all the time — what's the point?",
        answer: `That's exactly why GetPick is a ${RECHECK_CADENCE.en.adjective} agent, not a one-shot audit. It re-asks your clients' questions ${RECHECK_CADENCE.en.every}, catches the moment an answer flips to a peer, and does the work while it still matters. A static report would be stale in a month.`,
      },
      {
        question: `Why €${SERVICE_PLAN_PRICE_EUR} when a GEO agency charges €2,000–20,000/month?`,
        answer: `An agency sells you people and a retainer. GetPick sells you the result of one job, done by an agent: the answer page, the sources, the content, the proof. One flat price, no credits, no seats, no setup — €${SERVICE_PLAN_PRICE_EUR}/month, cancellable at any time.`,
      },
      {
        question: "Is it simulated or real?",
        answer: "Real. Every check is a real question sent live to ChatGPT or Gemini at diagnostic time. No simulated prompts, no cached guesses, no modelled estimates. If an engine is unavailable, the report says so instead of inventing data.",
      },
      {
        question: "Which questions do you test?",
        answer: `Only the questions a client actually types before choosing — “best ${BEACHHEAD_TRADE.en} for a freelancer in Bordeaux”, not “reviews of your firm”. Questions that carry your own name almost always return a mention and inflate the score. We test whether AI names you when nobody handed it your name first.`,
      },
      {
        question: "Does it work in French and English?",
        answer: "Yes. Diagnostics, pages and reports come in both languages, and the questions are asked in the language your clients actually use.",
      },
      {
        question: "What if it doesn't work for me?",
        answer: "You get refunded on request within 30 days. Email hello@getpick.ai and say you want your money back — no justification asked, no form to fill in, no call to sit through. The subscription is monthly and cancellable at any time, so the most you ever have at risk is one month.",
      },
      {
        question: "ChatGPT now sells ads — is organic dead?",
        answer: `No. ChatGPT placements are now open to buy self-serve, but they sit below the answer, labelled “sponsored” and visually separated from it: the answer itself stays organic, and independent research on more than a million shopping queries found the shopping carousel is drawn from organic results only, with paid ads ignored. Current rollout as of 28 July 2026: the US, the UK, Canada, Australia, New Zealand, Japan and South Korea — not France — and only for logged-in adults on the Free and Go tiers. What actually changes: being the name the assistant gives is still free, while a sponsored click costs $3-5. GetPick costs €${SERVICE_PLAN_PRICE_EUR}/month, and it works on the organic answer.`,
      },
    ],
    // 10. Closing — loss aversion
    closingTitle: "Every day, AI gives a client a name in your area.",
    closingBody: "Right now it might not be yours. Two minutes tells you for sure — and the agent starts working on it.",
    closingCta: "Get picked →",
    footerTagline: `The agent that gets ${BEACHHEAD_TRADE.en}s recommended by ChatGPT and Gemini. Off-site, zero technical.`,
    rights: "All rights reserved.",
    footerProspection: "Outbound policy",
    footerStudy: "Our 21-brand study: why we withdrew the numbers",
  },
  fr: {
    navAudit: "Diagnostic gratuit",
    navCompare: "Comparatif",
    // 1. HERO — douleur + transformation
    heroEyebrow: "L'agent qui te fait recommander par l'IA",
    heroTitle: `Quand un client cherche un ${BEACHHEAD_TRADE.fr}, ChatGPT répond un nom.`,
    heroTitleAccent: "Fais que ce soit le tien.",
    heroSubtitle: `GetPick construit et entretient ta présence là où l'IA va chercher qui recommander. Tu ne touches à rien — ni code, ni site. ${CAPITALISED_CADENCE.fr}, il te montre qui l'IA cite, et comment tu remontes.`,
    formTitle: "Ton diagnostic gratuit",
    formSubtitle: "Ton cabinet + ton site. Email optionnel — il débloque ton score et le confrère nommé à ta place.",
    freeBadge: "Gratuit",
    success: "C'est noté — ton audit gratuit arrive bientôt.",
    businessLabel: "Nom du cabinet",
    businessPlaceholder: "Nom du cabinet",
    websiteLabel: "Site web",
    websitePlaceholder: "tonsite.fr",
    emailLabel: "Email",
    emailPlaceholder: "toi@toncabinet.fr",
    emailOptionalPlaceholder: "Email (optionnel)",
    loadingCta: "On interroge l'IA…",
    submitCta: "Vois qui l'IA recommande à ta place →",
    error: "Un problème est survenu. Réessaie dans un instant.",
    // Refus du gate du champ « site » : un message par code stable de l'API
    // (`error_code`), toujours avec la correction proposée.
    errorWebsiteLooksLikeEmail: "On dirait une adresse email — indique plutôt l'adresse de ton site, par exemple marque.com.",
    errorWebsiteCredentials: "Une adresse de site ne contient pas d'identifiants — indique juste ton domaine, par exemple marque.com.",
    errorWebsiteUnreachable: "Ce site ne répond pas — vérifie l'adresse, par exemple marque.com.",
    formFootnote: "Les vraies questions de tes clients, envoyées en direct à Gemini — jamais simulées. Sans carte, sans inscription.",
    formBuyerIntentNote: `Pose à l'IA la vraie question de tes clients — « meilleur ${BEACHHEAD_TRADE.fr} pour SAS / freelance / e-commerce à [ville] ». En 2 minutes, GetPick te montre le confrère qu'elle cite à ta place, nommé, et pourquoi.`,
    // 2. Démo conversation IA
    demoEyebrow: "Exemple illustratif",
    demoTitle: "Voilà à quoi ressemble un client perdu dans l'IA.",
    demoQuestion: `Quel ${BEACHHEAD_TRADE.fr} à Bordeaux pour un freelance ?`,
    demoAnswerBefore: "Pour un freelance à Bordeaux, celui qui revient le plus souvent est ",
    demoAnswerRival: "Cabinet Merisier",
    demoAnswerAfter: " — il suit les micro-entrepreneurs et les petites sociétés, publie ses honoraires et répond sous 24 h. Deux autres cabinets du secteur valent le coup d'œil.",
    demoCaption: "Ton cabinet n'est pas dans la réponse. Le client ne verra jamais ton nom — ni tes pubs.",
    // 3. Trois étapes chiffrées
    stepsEyebrow: "Comment ça marche",
    stepsTitle: "Trois étapes. Tu ne touches jamais à ton site.",
    steps: [
      { num: "1", time: "30 s", title: "Donne-nous ton cabinet", body: "Ton nom et l'adresse de ton site. C'est toute la configuration." },
      { num: "2", time: "2 min", title: "L'agent interroge les IA", body: `Les vraies questions de tes clients, envoyées en direct au moment du diagnostic à ${PLAN_PROMISES.free.engineLabel.fr}. Jamais simulées.` },
      { num: "3", time: "Le jour même", title: "On travaille hors de ton site", body: "GetPick nomme le confrère cité à ta place, puis construit et héberge ta page-réponse et te place sur les sources que l'IA croit. Tu ne changes rien de ton côté." },
    ],
    // 5. Le livrable
    deliverableEyebrow: "Le livrable",
    deliverableTitle: "Pas un dashboard. Un nom, et le travail fait pour toi.",
    reportVerdictLabel: "Verdict",
    reportVerdict: "Gemini ne te nomme pas sur 7 questions de clients sur 12.",
    reportRivalLabel: "Cité à ta place",
    reportRival: "Cabinet Merisier",
    reportFixLabel: "Écrit, hébergé et entretenu par l'agent — tu ne touches à rien",
    reportFixTitle: "Ta page-réponse, celle que l'IA lit",
    reportFixBody: `« Quel ${BEACHHEAD_TRADE.fr} pour un freelance à Bordeaux ? » — Honoraires publiés d’avance, premier rendez-vous sous 48 h, micro-entrepreneurs et petites sociétés suivis, 120 clients freelances en Gironde.`,
    reportCaption: "Exemple illustratif — ta page est écrite depuis ton vrai diagnostic.",
    // 5bis. L'ÉCRAN DE MONITORING — voir la note du bloc EN.
    monitorEyebrow: "Ce que tu reçois tous les mois",
    monitorTitle: "Un écran. Ce que l'IA répond sur toi, et comment ça bouge.",
    monitorSubtitle: `${CAPITALISED_CADENCE.fr}, GetPick repose les vraies questions de tes clients, publie ce qu'il y a à publier, et t'envoie ça. Rien à ouvrir, rien à configurer : c'est dans ta boîte mail.`,
    monitorDocTitle: "Rapport GetPick — septembre",
    monitorDocChip: "Envoyé le 1er",
    monitorTiles: [
      { label: "Questions testées", value: `${PLAN_PROMISES.monitor_9eur.buyerQuestionCount}`, delta: "" },
      { label: "L'IA te nomme", value: `5 / ${PLAN_PROMISES.monitor_9eur.buyerQuestionCount}`, delta: "+2 vs août" },
      { label: "Un confrère en tête", value: `4 / ${PLAN_PROMISES.monitor_9eur.buyerQuestionCount}`, delta: "−2 vs août" },
    ],
    monitorColQuestion: "Question posée à l'IA",
    monitorColCited: "Cité en premier",
    monitorRows: [
      { question: `${BEACHHEAD_TRADE.fr.charAt(0).toUpperCase() + BEACHHEAD_TRADE.fr.slice(1)} pour un freelance à Bordeaux`, cited: "Toi", mine: true, move: "nouveau" },
      { question: "Comptable pour une boutique en ligne à Bordeaux", cited: "Toi", mine: true, move: "conservé" },
      { question: `Meilleur ${BEACHHEAD_TRADE.fr} pour une SAS`, cited: "Cabinet Merisier", mine: false, move: "" },
      { question: `${BEACHHEAD_TRADE.fr.charAt(0).toUpperCase() + BEACHHEAD_TRADE.fr.slice(1)} abordable en Gironde`, cited: "Cabinet Merisier", mine: false, move: "" },
    ],
    monitorFooter: "Et la page qu'on a publiée pour toi ce mois-ci, avec son lien.",
    monitorCaption: "Exemple illustratif — ton rapport est construit depuis tes propres questions.",
    // 6. Prix ancré
    pricingEyebrow: "Tarifs",
    pricingTitle: `Le travail d'une agence GEO (2 000–20 000 €/mois). ${SERVICE_PLAN_PRICE_EUR} €.`,
    pricingSubtitle: "Une seule offre. Tout est fait pour toi. Pas de crédits, pas de calculateur.",
    pricingTiers: [
      {
        name: "Free",
        price: "€0",
        note: "Le diagnostic : vois qui l'IA recommande aujourd'hui.",
        badge: "Diagnostic gratuit",
        features: ["Les vraies questions de tes clients, envoyées en direct", "Ton score sur 100", "Le confrère nommé à ta place", "Si l'IA sait seulement ce que tu fais", "Ta part de voix"],
        cta: "Lancer mon diagnostic gratuit",
        href: "#audit",
        plan: "free",
        highlight: false,
      },
      {
        name: "Fait pour toi",
        price: `${SERVICE_PLAN_PRICE_EUR} €`,
        suffix: "/mois",
        note: "GetPick travaille hors de ton site. Tu ne touches à rien.",
        badge: "Zéro technique",
        features: [
          "GetPick crée et héberge ta page-réponse, celle que l'IA lit et cite — sans jamais toucher à ton site.",
          "Il te place sur les sources que l'IA croit : annuaires, avis, comparatifs de ta profession.",
          "Il rédige le contenu qui te fait citer — prêt à publier.",
          `${CAPITALISED_CADENCE.fr}, il re-teste les vraies questions de tes clients et te montre le basculement : du confrère… à toi.`,
          `${SERVICE_PLAN_PRICE_EUR} €/mois, tout compris. Pas de crédits, pas d'agence, pas de dev. Sans engagement.`,
        ],
        cta: `Démarrer — ${SERVICE_PLAN_PRICE_EUR} €/mois`,
        href: "service",
        plan: "service",
        highlight: true,
      },
    ],
    pricingReassurance: "Sans engagement, résiliable à tout moment.",
    pricingGuarantee: "Remboursé sur simple demande sous 30 jours. Pas de question.",
    // 7. En bref — paragraphe dense pour les lecteurs IA
    tldrEyebrow: "En bref",
    tldrBody: `GetPick est l'agent GEO des professionnels de service — les ${BEACHHEAD_TRADE.fr}s d'abord. Il te fait recommander par les assistants IA comme ChatGPT et Gemini, et il fait le travail hors de ton site : tu ne touches jamais à ton propre site. Concrètement : il envoie aux IA les vraies questions que posent tes clients — en direct, jamais simulées — puis te dit si c'est toi ou un confrère qui est nommé, en nommant ce confrère. Il crée et héberge ensuite ta page-réponse, te place sur les sources que l'IA croit (annuaires, avis, comparatifs de ta profession), rédige le contenu qui te fait citer, et re-teste tout ${RECHECK_CADENCE.fr.adverb} pour que tu voies le basculement du confrère vers toi. C'est pensé pour les professionnels sans budget agence et sans développeur : un diagnostic gratuit, puis une seule offre fait-pour-toi à ${SERVICE_PLAN_PRICE_EUR} €/mois — prix fixe, sans crédits, sans sièges, rien à installer. L'offre payante est résiliable à tout moment et remboursée sur simple demande sous 30 jours, sans question. Une agence GEO facture 2 000 à 20 000 € par mois pour cette catégorie de travail. Les placements publicitaires ChatGPT sont désormais ouverts à l'achat en self-serve — diffusion actuelle au 28 juillet 2026 : États-Unis, Royaume-Uni, Canada, Australie, Nouvelle-Zélande, Japon et Corée du Sud, pas la France, et uniquement sur les tiers Free et Go — mais ces placements s'affichent sous la réponse et une recherche indépendante montre que le carrousel shopping les ignore : être la recommandation organique reste gratuit, quand un clic sponsorisé coûte 3-5 $ et que GetPick coûte ${SERVICE_PLAN_PRICE_EUR} €/mois.`,
    // 8. Fondateur
    founderEyebrow: "Qui est derrière",
    founderBody: "Je m'appelle Charles. Je construis GetPick et je fais tourner chaque diagnostic moi-même. Pas d'équipe commerciale, pas de chatbot : une question ? C'est moi qui réponds.",
    founderSignature: "Charles — GetPick",
    founderEmail: "hello@getpick.ai",
    // 9. FAQ — les vraies objections
    faqEyebrow: "FAQ",
    faqItems: [
      {
        question: "Zéro technique, vraiment ?",
        answer: "Tu ne modifies pas ton site, tu n'installes rien, tu ne colles rien. GetPick publie hors de ton site, sur les sources que l'IA lit vraiment. Le seul geste qu'on ne fait pas à ta place : un annuaire qui exige ta connexion, ou tes avis clients — là, on te prépare tout, tu valides.",
      },
      {
        question: "Combien de temps avant que ça bouge ?",
        answer: "Une reco d'IA se déplace en semaines, pas en un clic. Premiers mouvements sous 2 à 4 semaines, et tu vois chaque re-test.",
      },
      {
        question: "Les réponses IA changent tout le temps, à quoi bon ?",
        answer: `C'est exactement pour ça que GetPick est un agent ${RECHECK_CADENCE.fr.adjective}, pas un audit one-shot. Il repose les questions de tes clients ${RECHECK_CADENCE.fr.every}, détecte le moment où une réponse bascule vers un confrère, et fait le travail pendant que ça compte encore. Un rapport statique serait périmé en un mois.`,
      },
      {
        question: `Pourquoi ${SERVICE_PLAN_PRICE_EUR} € quand une agence GEO facture 2 000–20 000 €/mois ?`,
        answer: `Une agence te vend des gens et un forfait. GetPick te vend le résultat d'un seul travail, fait par un agent : la page-réponse, les sources, le contenu, la preuve. Un prix fixe, sans crédits, sans sièges, sans setup — ${SERVICE_PLAN_PRICE_EUR} €/mois, résiliable à tout moment.`,
      },
      {
        question: "C'est simulé ou c'est réel ?",
        answer: "Réel. Chaque vérification est une vraie question envoyée en direct à ChatGPT ou Gemini au moment du diagnostic. Pas de prompts simulés, pas de réponses en cache, pas d'estimations modélisées. Si un moteur est indisponible, le rapport le dit au lieu d'inventer.",
      },
      {
        question: "Quelles questions testez-vous ?",
        answer: `Uniquement celles qu'un client tape avant de choisir — « meilleur ${BEACHHEAD_TRADE.fr} pour un freelance à Bordeaux », jamais « avis sur ton cabinet ». Les questions qui portent ton propre nom renvoient presque toujours une mention et gonflent le score. On teste si l'IA te nomme quand personne ne lui a soufflé ton nom.`,
      },
      {
        question: "Ça marche en français et en anglais ?",
        answer: "Oui. Diagnostics, pages et rapports sortent dans les deux langues, et les questions sont posées dans la langue que tes clients utilisent vraiment.",
      },
      {
        question: "Et si ça ne marche pas pour moi ?",
        answer: "Tu es remboursé sur simple demande sous 30 jours. Un email à hello@getpick.ai en disant que tu veux être remboursé — pas de justification, pas de formulaire, pas d'appel à subir. L'abonnement est mensuel et résiliable à tout moment : au pire, tu risques un mois.",
      },
      {
        question: "ChatGPT vend de la pub — l'organique est mort ?",
        answer: `Non. Les placements ChatGPT sont désormais ouverts à l'achat en self-serve, mais ils s'affichent sous la réponse, étiquetés « sponsorisé » et visuellement séparés d'elle : la réponse elle-même reste organique, et une recherche indépendante sur plus d'un million de requêtes shopping montre que le carrousel est construit sur les résultats organiques seuls, les pubs payantes étant ignorées. Diffusion actuelle au 28 juillet 2026 : États-Unis, Royaume-Uni, Canada, Australie, Nouvelle-Zélande, Japon et Corée du Sud — pas la France — et uniquement pour les adultes connectés sur les tiers Free et Go. Ce qui change vraiment : être le nom que l'assistant donne reste gratuit, quand un clic sponsorisé coûte 3-5 $. GetPick coûte ${SERVICE_PLAN_PRICE_EUR} €/mois, et il travaille sur la réponse organique.`,
      },
    ],
    // 10. Clôture — aversion à la perte
    closingTitle: "Chaque jour, l'IA donne un nom à un client de ton secteur.",
    closingBody: "En ce moment, ce n'est peut-être pas le tien. Deux minutes pour en avoir le cœur net — et l'agent s'y met.",
    closingCta: "Lancer mon audit gratuit →",
    footerTagline: `L'agent qui fait recommander les ${BEACHHEAD_TRADE.fr}s par ChatGPT et Gemini. Hors site, zéro technique.`,
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
    monitorEmpty: "Actions will appear as soon as the report finishes.",
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
    publishLockedEyebrow: `Done for you · €${SERVICE_PLAN_PRICE_EUR}/month`,
    publishLockedTitle: "Your “to publish” block, written for you",
    publishLockedBody: `No gesture on your side: GetPick writes what follows and publishes it off-site for you, then refreshes it ${RECHECK_CADENCE.en.adverb}. Here is what you unlock — named and counted, never invented:`,
    publishLockedCta: `Unlock the full report — €${SERVICE_PLAN_PRICE_EUR}/month →`,
    publishEyebrow: "To publish",
    publishTitle: "To publish on your site",
    publishBody: `Everything GetPick wrote for you, in one place. Published off-site for you, re-checked and refreshed ${RECHECK_CADENCE.en.adverb}.`,
    liveCheckLabel: "Live check, not simulated",
    liveCheckDetail: (engine: string) => `A real question was sent to ${engine} at audit time — no simulated prompts, no cached guesses.`,
    methodEyebrow: "How these questions were picked",
    methodTitle: "Real purchase questions. Never your brand name.",
    methodBody: (engine: string) =>
      `We only ask ${engine} questions a buyer would type before choosing — never "reviews of your brand". Asking an engine about a brand it was just handed almost always returns a mention, which inflates the score. These questions are the honest test: does it name you when nobody mentioned you first?`,
    methodChipUnbranded: "Non-branded",
    methodChipIntent: "Buyer intent",
    methodChipLive: "Asked live",
    techEyebrow: "Bonus · only if you want your own site to follow",
    techTitle: "Your own site is not part of the deal — but the files are yours",
    techBody:
      "Generic generators invent their Q&A. These files are built from the exact buyer questions where AI cites a rival instead of you — paste them on your site and the engines read your best answers. They are regenerated every time your answers move, so they never go stale.",
    techJsonLdLabel: "Your FAQ in the format AI reads — paste before </head> (JSON-LD, Organization + FAQ)",
    techJsonLdHint: "The FAQ entries are your real audited buyer questions, answered in your favour.",
    techLlmsLabel: "Your ID card for AI assistants — upload to yoursite.com/llms.txt",
    techLlmsHint: "The summary AI assistants read first to understand who you are and what to recommend you for.",
    techRobotsLabel: "The unblock that lets AI into your site — append to your existing robots.txt",
    techRobotsIntro: (bots: string) =>
      `Your robots.txt currently blocks ${bots}. Blocked crawlers cannot read your site, so the engines behind them cannot recommend you. Appending these lines unblocks them — a named rule always overrides "User-agent: *".`,
    techRegenNote: `Optional, and outside what we do for you: GetPick works off-site, your website needs none of this. If you want it anyway, the files are here and are regenerated at every ${RECHECK_CADENCE.en.recheckNoun} — send them to whoever handles your site.`,
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
    monitorEmpty: "Les actions apparaîtront dès que le rapport sera terminé.",
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
    publishLockedEyebrow: `Fait pour toi · ${SERVICE_PLAN_PRICE_EUR} €/mois`,
    publishLockedTitle: "Ton bloc « À publier », rédigé pour toi",
    publishLockedBody: `Aucun geste de ton côté : GetPick rédige ce qui suit et le publie hors de ton site, à ta place, puis le rafraîchit ${RECHECK_CADENCE.fr.adverb}. Voici ce que tu débloques — nommé et compté, jamais inventé :`,
    publishLockedCta: `Débloquer le rapport complet — ${SERVICE_PLAN_PRICE_EUR} €/mois →`,
    publishEyebrow: "À publier",
    publishTitle: "À publier sur ton site",
    publishBody: `Tout ce que GetPick a rédigé pour toi, au même endroit. Publié hors de ton site, à ta place, re-vérifié et rafraîchi ${RECHECK_CADENCE.fr.adverb}.`,
    liveCheckLabel: "Vérification en direct, pas simulée",
    liveCheckDetail: (engine: string) => `Une vraie question a été envoyée à ${engine} au moment de l'audit — aucun prompt simulé, aucune estimation en cache.`,
    methodEyebrow: "Comment ces questions ont été choisies",
    methodTitle: "De vraies questions d'achat. Jamais ton nom de marque.",
    methodBody: (engine: string) =>
      `On ne pose à ${engine} que des questions qu'un acheteur taperait avant de choisir — jamais « avis sur ta marque ». Demander à un moteur de parler d'une marque qu'on vient de lui souffler renvoie presque toujours une mention, ce qui gonfle le score. Ces questions sont le test honnête : est-ce qu'il te cite quand personne ne t'a mentionné avant ?`,
    methodChipUnbranded: "Sans nom de marque",
    methodChipIntent: "Intention d'achat",
    methodChipLive: "Posée en direct",
    techEyebrow: "Bonus · seulement si tu veux que ton site suive aussi",
    techTitle: "Ton site n'est pas dans le contrat — mais les fichiers sont à toi",
    techBody:
      "Les générateurs génériques inventent leurs Q&A. Ces fichiers sont construits depuis les vraies questions d'achat où l'IA cite un rival à ta place — colle-les sur ton site et les moteurs lisent tes meilleures réponses. Ils sont régénérés dès que les réponses bougent : jamais périmés.",
    techJsonLdLabel: "Ta FAQ dans le format que les IA lisent — à coller avant </head> (JSON-LD, Organization + FAQ)",
    techJsonLdHint: "Les entrées FAQ sont tes vraies questions d'achat auditées, avec des réponses en ta faveur.",
    techLlmsLabel: "Ta fiche d'identité pour les assistants IA — à déposer sur tonsite.com/llms.txt",
    techLlmsHint: "Le résumé que les assistants IA lisent en premier pour comprendre qui tu es et pour quoi te recommander.",
    techRobotsLabel: "Le déblocage qui laisse les IA entrer sur ton site — à ajouter à la fin de ton robots.txt",
    techRobotsIntro: (bots: string) =>
      `Ton robots.txt bloque actuellement ${bots}. Un crawler bloqué ne peut pas lire ton site, donc le moteur derrière ne peut pas te recommander. Ajouter ces lignes les débloque — une règle nommée prime toujours sur « User-agent: * ».`,
    techRegenNote: `Optionnel, et hors de ce qu'on fait à ta place : GetPick travaille hors de ton site, qui n'a besoin de rien de tout ça. Si tu le veux quand même, les fichiers sont là et sont régénérés à chaque ${RECHECK_CADENCE.fr.recheckNoun} — transmets-les à qui s'occupe de ton site.`,
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
