import { BEACHHEAD_TRADE } from "./plan-promises";

export type AnswerLocale = "en" | "fr";

export type AnswerAudience = "beachhead" | "legacy";

export type AnswerPage = {
  locale: AnswerLocale;
  audience: AnswerAudience;
  slug: string;
  categoryKey: string;
  category: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  directAnswer: string;
  featuredListIntro: string;
  featuredList: string[];
  verificationTitle: string;
  verificationIntro: string;
  verificationSteps: string[];
  getpickTitle: string;
  getpickBody: string;
  sourceTitle: string;
  sourceIntro: string;
  sources: { label: string; href: string; note: string }[];
  proofSignalsTitle: string;
  proofSignals: string[];
  ctaTitle: string;
  ctaBody: string;
  ctaLabel: string;
  relatedTitle: string;
  faq: { question: string; answer: string }[];
};

const marketSources = {
  adobe: {
    label: "Adobe Analytics retail traffic study",
    href: "https://blog.adobe.com/en/publish/2025/03/17/adobe-analytics-traffic-to-us-retail-websites-from-generative-ai-sources-jumps-1200-percent",
    noteEn: "Generative-AI traffic to U.S. retail sites rose 1,200% in February 2025 versus July 2024; AI referrals browsed more pages and bounced less.",
    noteFr: "Le trafic issu de l'IA générative vers des sites retail américains a augmenté de 1 200 % en février 2025 vs juillet 2024 ; ces visiteurs consultent plus de pages et rebondissent moins.",
  },
  capgemini: {
    label: "Capgemini consumer products and retail research",
    href: "https://www.capgemini.com/news/press-releases/71-of-consumers-want-generative-ai-integrated-into-their-shopping-experiences/",
    noteEn: "Capgemini reports that 58% of consumers have replaced traditional search engines with generative-AI tools for product or service recommendations.",
    noteFr: "Capgemini indique que 58 % des consommateurs ont remplacé les moteurs de recherche traditionnels par des outils d'IA générative pour les recommandations de produits ou services.",
  },
  bain: {
    label: "Bain & Company AI search research",
    href: "https://www.bain.com/about/media-center/press-releases/20252/consumer-reliance-on-ai-search-results-signals-new-era-of-marketing--bain--company-about-80-of-search-users-rely-on-ai-summaries-at-least-40-of-the-time-on-traditional-search-engines-about-60-of-searches-now-end-without-the-user-progressing-to-a/",
    noteEn: "Bain finds that 42% of LLM users ask for shopping recommendations and about 60% of traditional searches now end without a click.",
    noteFr: "Bain observe que 42 % des utilisateurs de LLM demandent des recommandations shopping et qu'environ 60 % des recherches traditionnelles se terminent sans clic.",
  },
};

type CategorySeed = {
  key: string;
  /** `beachhead` = le metier que la landing vend aujourd'hui ; `legacy` = une
   *  page publiee avant le pivot du 22/09, qui reste en ligne pour son
   *  referencement mais ne s'affiche plus sur la landing. */
  audience: AnswerAudience;
  /** Le mot qui designe l'entite recommandee. Une marque n'est pas un cabinet :
   *  la copy generique parle du sujet de la page, pas de l'ancien ICP. Les
   *  formulations qui l'entourent sont ecrites SANS article ni accord, parce
   *  que le genre du mot change d'une categorie a l'autre. */
  enSubjectPlural: string;
  frSubjectPlural: string;
  enSlug: string;
  frSlug: string;
  enCategory: string;
  frCategory: string;
  enSignals: string[];
  frSignals: string[];
  enAngle: string;
  frAngle: string;
};

const categories: CategorySeed[] = [
  // BEACHHEAD (23/09). La landing vend un service aux ${BEACHHEAD_TRADE} depuis
  // le 22/09, et sa section « Guides IA » proposait encore cinq pages de
  // l'ancien ICP : sneakers DTC, cafe de specialite, cosmetique clean, mode
  // ethique, coworking. Mesure du 23/09 06:2xZ : « DTC » apparaissait 2 fois sur
  // `/fr` et 2 fois sur `/en`, dans ces cartes — la seule surface publique ou le
  // vocabulaire de l'ancienne cible ait survecu au pivot. Cette page-ci est la
  // categorie du metier vendu ; les cinq autres restent en ligne (leur
  // referencement ne se jette pas) mais quittent la landing.
  {
    key: "beachhead-trade",
    audience: "beachhead",
    enSlug: `does-ai-recommend-${BEACHHEAD_TRADE.en}s`,
    frSlug: `ia-recommande-${BEACHHEAD_TRADE.fr}s`,
    enCategory: `${BEACHHEAD_TRADE.en}s`,
    frCategory: `${BEACHHEAD_TRADE.fr}s`,
    enSubjectPlural: "firms",
    frSubjectPlural: "cabinets",
    enAngle: "Buyers ask for a local, specialised recommendation, so AI leans on city and speciality pages, client-type wording, public reviews, directory listings and press or partner mentions rather than on a homepage that says «\u00a0we support you\u00a0».",
    frAngle: "La demande est locale et specialisee : l'IA s'appuie sur les pages ville et specialite, le type de client servi, les avis publics, les annuaires et les mentions presse ou partenaires, plutot que sur une home qui dit «\u00a0on vous accompagne\u00a0».",
    enSignals: [
      "A page per city and per speciality, worded the way a client asks",
      "The client profiles actually served: freelancers, e-commerce, startups, TPE-PME",
      "Public reviews and directory listings that agree with the site on name, address and speciality",
      "Press, partner, software or professional-body mentions that prove the firm exists outside its own site",
    ],
    frSignals: [
      "Une page par ville et par specialite, ecrite comme un client la demande",
      "Les profils de clients reellement servis : freelances, e-commerce, startups, TPE-PME",
      "Des avis publics et des annuaires qui disent la meme chose que le site : nom, adresse, specialite",
      "Des mentions presse, partenaires, editeurs ou ordre professionnel qui prouvent une existence hors du site",
    ],
  },
  {
    key: "dtc-sneakers",
    audience: "legacy",
    enSubjectPlural: "brands",
    frSubjectPlural: "marques",
    enSlug: "does-ai-recommend-dtc-sneakers",
    frSlug: "ia-recommande-chaussures-sneakers-dtc",
    enCategory: "DTC sneaker brands",
    frCategory: "marques de chaussures et sneakers DTC",
    enAngle: "Fit, returns, durability, independent reviews, stock availability, and use-case language matter more than a beautiful product grid.",
    frAngle: "La pointure, les retours, la durabilité, les avis indépendants, la disponibilité et les usages comptent plus qu'une belle grille produit.",
    enSignals: ["Clear sizing, return and warranty pages", "Review snippets that mention comfort, durability and use cases", "Comparison pages against better-known sneaker brands", "Retailer, press or community mentions that confirm the brand exists outside its own site"],
    frSignals: ["Pages pointure, retours et garantie faciles à citer", "Avis qui parlent de confort, durabilité et usages", "Pages comparatives face à des marques plus connues", "Mentions presse, retail ou communauté qui prouvent que la marque existe hors de son site"],
  },
  {
    key: "specialty-coffee",
    audience: "legacy",
    enSubjectPlural: "brands",
    frSubjectPlural: "marques",
    enSlug: "does-ai-recommend-specialty-coffee",
    frSlug: "ia-recommande-cafe-specialite",
    enCategory: "specialty coffee brands",
    frCategory: "marques de café de spécialité",
    enAngle: "AI needs concrete taste, origin, roast, subscription and sourcing language; vague craft positioning is hard to recommend.",
    frAngle: "L'IA a besoin d'informations concrètes sur le goût, l'origine, la torréfaction, l'abonnement et le sourcing ; le positionnement artisanal vague est difficile à recommander.",
    enSignals: ["Origin, process, roast level and tasting notes on product pages", "Freshness, shipping cadence and subscription terms", "Third-party cafe, roaster or guide mentions", "Transparent sourcing language that an answer engine can quote"],
    frSignals: ["Origine, process, niveau de torréfaction et notes de dégustation sur les pages produits", "Fraîcheur, cadence d'expédition et conditions d'abonnement", "Mentions par cafés, torréfacteurs ou guides tiers", "Sourcing transparent que l'IA peut citer clairement"],
  },
  {
    key: "clean-beauty",
    audience: "legacy",
    enSubjectPlural: "brands",
    frSubjectPlural: "marques",
    enSlug: "does-ai-recommend-clean-beauty",
    frSlug: "ia-recommande-cosmetique-clean",
    enCategory: "clean beauty brands",
    frCategory: "marques de cosmétique clean",
    enAngle: "Clean beauty is crowded and ambiguous, so AI looks for ingredient clarity, skin-type use cases, proof, safety language and trusted mentions.",
    frAngle: "La cosmétique clean est dense et ambiguë : l'IA cherche la clarté ingrédients, les cas d'usage par type de peau, la preuve, la sécurité et des mentions fiables.",
    enSignals: ["Ingredient pages written in plain language", "Claims connected to evidence, certifications or testing scope", "Skin-type and routine-specific FAQ answers", "Mentions from retailers, dermatology-led content or independent reviews"],
    frSignals: ["Pages ingrédients en langage clair", "Allégations reliées à des preuves, certifications ou périmètres de tests", "FAQ par type de peau et routine", "Mentions par retailers, contenus dermatologiques ou avis indépendants"],
  },
  {
    key: "ethical-fashion",
    audience: "legacy",
    enSubjectPlural: "brands",
    frSubjectPlural: "marques",
    enSlug: "does-ai-recommend-ethical-fashion",
    frSlug: "ia-recommande-mode-ethique",
    enCategory: "ethical fashion brands",
    frCategory: "marques de mode éthique",
    enAngle: "AI is cautious with sustainability claims; it favors brands that explain materials, factories, certifications, repair, resale and traceability without greenwashing.",
    frAngle: "L'IA est prudente avec les promesses durables : elle favorise les marques qui expliquent matières, ateliers, certifications, réparation, seconde main et traçabilité sans greenwashing.",
    enSignals: ["Materials and factory transparency pages", "Repair, resale or take-back policies", "Certification or standard references where relevant", "Independent sustainability, press or marketplace mentions"],
    frSignals: ["Pages de transparence sur matières et ateliers", "Politiques de réparation, seconde main ou reprise", "Références à des standards ou certifications quand c'est pertinent", "Mentions indépendantes : presse, marketplaces ou analyses durables"],
  },
  {
    key: "coworking",
    audience: "legacy",
    enSubjectPlural: "brands",
    frSubjectPlural: "marques",
    enSlug: "does-ai-recommend-coworking-spaces",
    frSlug: "ia-recommande-coworking",
    enCategory: "coworking spaces",
    frCategory: "espaces de coworking",
    enAngle: "Local intent dominates: AI answers need location, pricing, opening hours, amenities, neighborhood context, photos, reviews and Google Business consistency.",
    frAngle: "L'intention locale domine : l'IA a besoin de localisation, prix, horaires, équipements, contexte quartier, photos, avis et cohérence Google Business.",
    enSignals: ["Consistent address, hours and pricing across the site and Google Business", "Amenity pages for meeting rooms, day passes, phone booths and events", "Local reviews that mention real use cases", "Neighborhood and transport details that answer engines can summarize"],
    frSignals: ["Adresse, horaires et prix cohérents entre site et Google Business", "Pages équipements : salles de réunion, pass journée, phone booths, événements", "Avis locaux qui mentionnent des cas d'usage réels", "Détails quartier et transport faciles à résumer par l'IA"],
  },
];

function createPage(seed: CategorySeed, locale: AnswerLocale): AnswerPage {
  const isFr = locale === "fr";
  const category = isFr ? seed.frCategory : seed.enCategory;
  const subjects = isFr ? seed.frSubjectPlural : seed.enSubjectPlural;
  const slug = isFr ? seed.frSlug : seed.enSlug;
  const title = isFr ? `Est-ce que l'IA recommande les ${category} ?` : `Does AI recommend ${category}?`;
  const directAnswer = isFr
    ? `Oui, l'IA peut recommander des ${category}, mais elle cite surtout les ${subjects} dont les preuves sont faciles à lire : pages claires, avis, comparatifs, mentions tierces et réponses directes aux questions d'achat. Tu peux être très bon et rester invisible si tes signaux sont dispersés ou trop marketing.`
    : `Yes, AI can recommend ${category}, but it tends to cite ${subjects} with evidence it can read: clear pages, reviews, comparisons, third-party mentions and direct answers to buying questions. You can be excellent and still be invisible if those signals are scattered or too promotional.`;

  return {
    locale,
    audience: seed.audience,
    slug,
    categoryKey: seed.key,
    category,
    title,
    metaTitle: title,
    metaDescription: isFr
      ? `Réponse claire : quand l'IA recommande des ${category}, quels signaux elle utilise et comment GetPick vérifie ou corrige ta visibilité.`
      : `Clear answer: when AI recommends ${category}, which signals it uses, and how GetPick checks or fixes your visibility.`,
    eyebrow: isFr ? "Réponse SEO/GEO" : "SEO/GEO answer",
    directAnswer,
    featuredListIntro: isFr ? "Pour apparaître dans une réponse IA, il faut rendre ses preuves faciles à extraire :" : "To appear in an AI answer, you need to make your proof easy to extract:",
    featuredList: isFr
      ? ["une proposition de valeur en une phrase", "des pages qui répondent aux questions d'achat", "des avis et comparatifs lisibles", "des mentions tierces cohérentes", "des informations locales, prix ou disponibilité à jour"]
      : ["a one-sentence value proposition", "pages that answer buying questions", "readable reviews and comparisons", "consistent third-party mentions", "current local, price or availability information"],
    verificationTitle: isFr ? `Comment savoir qui l'IA recommande parmi les ${category} ?` : `How do you find out who AI recommends among ${category}?`,
    verificationIntro: isFr
      ? "Ne te fie pas à une seule question. Teste plusieurs formulations proches d'une vraie intention d'achat, puis regarde si tu es cité, pourquoi, et qui est recommandé à ta place."
      : "Do not trust one prompt. Test several versions of a real buying intent, then check whether you are cited, why, and who is recommended instead.",
    verificationSteps: isFr
      ? ["Demande une recommandation large : meilleur choix, alternative locale, option durable ou rapport qualité-prix.", "Note qui est cité en premier, les arguments utilisés et les sources visibles.", "Compare avec ton site : la réponse IA peut-elle trouver la même preuve en moins de deux clics ?", "Ajoute ou corrige les pages qui manquent : FAQ, comparatif, preuve, Google Business, mentions."]
      : ["Ask a broad recommendation question: best choice, local alternative, sustainable option or value pick.", "Record who appears first, which arguments are used and which visible sources are cited.", "Compare the answer with your site: can the AI find the same proof in fewer than two clicks?", "Add or fix the missing assets: FAQ, comparison, proof, Google Business and mentions."],
    getpickTitle: isFr ? "L'angle GetPick" : "The GetPick angle",
    getpickBody: isFr
      ? `GetPick lance un audit gratuit qui pose les questions que tes clients posent à l'IA, repère si tu es recommandé, nomme les concurrents cités à ta place, puis écrit les corrections prêtes à publier.`
      : `GetPick runs a free audit that asks the questions your customers ask AI, checks whether you are recommended, names the competitors cited in your place, and writes the fixes ready to publish.`,
    sourceTitle: isFr ? "Pourquoi ça compte maintenant" : "Why this matters now",
    sourceIntro: isFr
      ? `Les recommandations IA ne sont plus marginales dans le parcours d'achat. Les sources ci-dessous montrent pourquoi les ${subjects} doivent mesurer leur présence dans les réponses, pas seulement leurs positions Google.`
      : `AI recommendations are no longer a fringe part of the buying journey. The sources below show why ${subjects} should measure answer presence, not only Google rankings.`,
    sources: [
      { label: marketSources.capgemini.label, href: marketSources.capgemini.href, note: isFr ? marketSources.capgemini.noteFr : marketSources.capgemini.noteEn },
      { label: marketSources.bain.label, href: marketSources.bain.href, note: isFr ? marketSources.bain.noteFr : marketSources.bain.noteEn },
      { label: marketSources.adobe.label, href: marketSources.adobe.href, note: isFr ? marketSources.adobe.noteFr : marketSources.adobe.noteEn },
    ],
    proofSignalsTitle: isFr ? `Signaux utiles pour les ${category}` : `Useful signals for ${category}`,
    proofSignals: isFr ? seed.frSignals : seed.enSignals,
    ctaTitle: isFr ? "Audit gratuit : vois si l'IA te cite" : "Free audit: see whether AI cites you",
    ctaBody: isFr
      ? "Entre ton entreprise et ton site. GetPick vérifie les réponses IA, montre les concurrents cités et indique quoi corriger en premier."
      : "Enter your business and website. GetPick checks AI answers, shows cited competitors and tells you what to fix first.",
    ctaLabel: isFr ? "Lancer l'audit gratuit" : "Run the free audit",
    relatedTitle: isFr ? "Autres catégories" : "Other categories",
    faq: [
      {
        question: isFr ? "Pourquoi l'IA ne me recommande-t-elle pas dans cette catégorie ?" : "Why does AI not recommend me in this category?",
        answer: isFr
          ? `Souvent parce que les preuves publiques sont trop faibles, contradictoires ou difficiles à extraire. ${seed.frAngle}`
          : `Usually because public proof is too thin, inconsistent or hard to extract. ${seed.enAngle}`,
      },
      {
        question: isFr ? "Est-ce une question de SEO classique ?" : "Is this just classic SEO?",
        answer: isFr
          ? "Pas seulement. Le SEO aide l'indexation, mais les moteurs de réponse sélectionnent aussi des passages clairs, des preuves tierces et des formulations qui répondent directement à l'intention de l'acheteur."
          : "Not only. SEO helps indexation, but answer engines also select clear passages, third-party proof and wording that directly answers buyer intent.",
      },
      {
        question: isFr ? "Que corriger en premier ?" : "What should I fix first?",
        answer: isFr
          ? "Commence par une page FAQ ou comparatif qui répond aux vraies questions d'achat, puis aligne tes preuves externes : avis, annuaires, Google Business, presse, marketplaces ou communautés."
          : "Start with an FAQ or comparison page that answers real buying questions, then align external proof: reviews, directories, Google Business, press, marketplaces or communities.",
      },
    ],
  };
}

export const answerPages: AnswerPage[] = categories.flatMap((seed) => [createPage(seed, "fr"), createPage(seed, "en")]);

export const answerPagesByPath = new Map(answerPages.map((page) => [`${page.locale}/${page.slug}`, page]));

export function getAnswerPage(locale: string, slug: string) {
  return answerPagesByPath.get(`${locale}/${slug}`);
}

export function getRelatedAnswerPages(page: AnswerPage) {
  return answerPages.filter((candidate) => candidate.locale === page.locale && candidate.slug !== page.slug).slice(0, 4);
}

export function getAlternateAnswerPage(page: AnswerPage) {
  return answerPages.find((candidate) => candidate.categoryKey === page.categoryKey && candidate.locale !== page.locale);
}

/** Les pages presentees SUR LA LANDING. La landing vend un metier ; elle ne
 *  propose que les guides de ce metier. Les pages `legacy` restent servies a
 *  leur URL et dans le sitemap — elles ne sont pas detruites, elles ne sont
 *  plus mises en avant devant un visiteur a qui elles ne parlent pas. */
export function landingAnswerPages(locale: AnswerLocale, limit = 5) {
  return answerPages.filter((page) => page.locale === locale && page.audience === "beachhead").slice(0, limit);
}
