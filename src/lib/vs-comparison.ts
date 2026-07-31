// Source de vérité de la page comparative /vs (« GetPick vs les outils GEO
// nommés » / « alternative à Otterly »). Aucune preuve de l'étude n'est recopiée
// ici : pas de champ `score`, aucun import de la page study ou de ses artefacts.
// La page ne fige donc aucun chiffre qui se périmerait — elle renvoie vers
// /study par un lien.
//
// AC3 : chaque prix concurrent est un prix d'entrée RÉEL relevé sur la page
// pricing du concurrent (relevé 2026-07), avec sa `sourceUrl` vérifiable. Ne pas
// remplacer par les fourchettes de POSITIONING.md §3.4 (ce sont des fourchettes,
// pas des prix d'entrée). Prévoir la péremption : la valeur est datée
// `priceAsOf`, la page affiche « relevé 2026-07 ».
import { faqJsonLdForBrand } from "./audit-engine";
import { homeCopy, type Locale } from "./i18n";

export const SITE_URL = "https://www.getpick.ai";

export type VsCurrency = "EUR" | "USD";

// Le mois de relevé est un littéral : le test AC3 exige `priceAsOf === "2026-07"`
// sur chaque concurrent, ce qui casse volontairement si on ajoute une ligne sans
// re-vérifier le prix.
export type PriceAsOf = "2026-07";

type Localized = { en: string; fr: string };

export interface VsToolRow {
  name: string;
  /** true uniquement pour la ligne GetPick (mise en avant, exclue des concurrents). */
  isUs?: boolean;
  entryPlan: Localized;
  entryPrice: number;
  currency: VsCurrency;
  /** Note de facturation éventuelle (ex. « billed yearly »). Doit voyager avec le
   *  prix dans TOUTES les couches citables (tableau + JSON-LD + FAQ), sinon un LLM
   *  cite « dès $25/mois » sans savoir que c'est un tarif annuel. */
  billing?: Localized;
  priceAsOf: PriceAsOf;
  /** Page pricing du concurrent — source vérifiable, jamais un chiffre inventé. */
  sourceUrl: string;
  sourceLabel: string;
  /** Caveat de vérifiabilité de la source, propagé aux couches citables. Renseigné
   *  quand la `sourceUrl` primaire ne rend pas le prix à un crawler (page JS) : on
   *  disclose alors que le chiffre est recoupé, pour ne pas laisser un lecteur
   *  machine sur-interpréter une valeur qu'il ne peut pas confirmer à la source. */
  sourceNote?: Localized;
  /** Ce que l'outil fait réellement (monitoring vs travail fait-pour-toi). */
  does: Localized;
}

// Prix d'entrée relevés le 2026-07 sur les pages pricing publiques de chaque
// acteur. Sources dans `sourceUrl`. Devises conservées telles quelles (USD pour
// Otterly/Profound, EUR pour Peec/Rankscale/GetPick) — on ne convertit pas pour
// ne pas inventer un taux.
export const VS_TOOLS: VsToolRow[] = [
  {
    name: "GetPick",
    isUs: true,
    entryPlan: { en: "Monitor", fr: "Monitor" },
    entryPrice: 9,
    currency: "EUR",
    priceAsOf: "2026-07",
    sourceUrl: `${SITE_URL}/`,
    sourceLabel: "getpick.ai",
    does: {
      en: "Diagnoses who AI names instead of you, writes the copy-paste fixes, re-checks weekly. Agency work at a tool price.",
      fr: "Diagnostique qui l'IA cite à ta place, écrit les correctifs à copier-coller, re-vérifie chaque semaine. Le travail d'agence, au prix d'un outil.",
    },
  },
  {
    name: "Otterly",
    entryPlan: { en: "Lite", fr: "Lite" },
    // Lite = $25/mois UNIQUEMENT en facturation annuelle (« 15% off on Annual »),
    // re-vérifié 2026-07 ; la vue par défaut de la page pricing affiche
    // $29/mois en mensuel. On retient le prix d'entrée plancher ($25) mais on
    // porte la condition d'engagement via `billing` — même traitement que
    // Profound (ligne yearly annotée) pour rester cohérent et ne pas afficher un
    // prix inférieur au tarif mensuel sans caveat.
    entryPrice: 25,
    currency: "USD",
    billing: { en: "billed yearly", fr: "facturé à l'année" },
    priceAsOf: "2026-07",
    sourceUrl: "https://otterly.ai/pricing",
    sourceLabel: "otterly.ai/pricing",
    does: {
      en: "Monitors your mentions across AI engines. Reports where you stand — no fixes written for you.",
      fr: "Surveille tes mentions sur les moteurs IA. Rapporte où tu en es — sans écrire les correctifs pour toi.",
    },
  },
  {
    name: "Peec",
    entryPlan: { en: "Starter", fr: "Starter" },
    // Starter = 89 €/mois, re-vérifié 2026-07. La page pricing officielle est
    // rendue en JS (le chiffre n'est PAS lisible par un crawler — confirmé par
    // fetch sans JS : plans nommés, aucun prix), donc la valeur a été recoupée :
    // plusieurs relevés publics indépendants citent « Starter ~89 €/mois »
    // (accès ChatGPT/Perplexity/Google AIO, 25 prompts). sourceUrl reste la page
    // officielle (source primaire, vérifiable par un humain dans le navigateur),
    // MAIS on porte un `sourceNote` : un lecteur machine qui suit le lien ne verra
    // pas le prix, on le lui dit explicitement au lieu de lui laisser croire que
    // « 89 € » est confirmé à la source (finding review adverse).
    entryPrice: 89,
    currency: "EUR",
    priceAsOf: "2026-07",
    sourceUrl: "https://peec.ai/pricing",
    sourceLabel: "peec.ai/pricing",
    sourceNote: {
      en: "list price corroborated from public listings — source page renders pricing in JS, not crawler-readable",
      fr: "prix recoupé sur des relevés publics — la page source rend le prix en JS, non lisible par un crawler",
    },
    does: {
      en: "Multi-engine visibility dashboards for marketing teams. Extra engines are billed on top.",
      fr: "Dashboards de visibilité multi-moteurs pour équipes marketing. Chaque moteur en plus est facturé.",
    },
  },
  {
    name: "Rankscale",
    entryPlan: { en: "Essentials", fr: "Essentials" },
    entryPrice: 20,
    currency: "EUR",
    priceAsOf: "2026-07",
    sourceUrl: "https://rankscale.ai/pricing",
    sourceLabel: "rankscale.ai/pricing",
    does: {
      en: "Credit-based AI-search rank tracking and audits. Monitoring, not done-for-you content.",
      fr: "Suivi de position et audits en recherche IA, à base de crédits. Du monitoring, pas du contenu fait pour toi.",
    },
  },
  {
    name: "Profound",
    entryPlan: { en: "Starter", fr: "Starter" },
    entryPrice: 99,
    currency: "USD",
    billing: { en: "billed yearly", fr: "facturé à l'année" },
    priceAsOf: "2026-07",
    sourceUrl: "https://www.tryprofound.com/pricing",
    sourceLabel: "tryprofound.com/pricing",
    does: {
      en: "Enterprise-grade answer analytics. The Starter tier tracks ChatGPT only.",
      fr: "Analytics de réponses pour l'entreprise. L'offre Starter suit ChatGPT seul.",
    },
  },
];

/** Les 4 rivaux nommés, sans la ligne GetPick. */
export const VS_COMPETITORS: VsToolRow[] = VS_TOOLS.filter((tool) => !tool.isUs);

/** La ligne GetPick (garantie présente). */
export const VS_GETPICK: VsToolRow =
  VS_TOOLS.find((tool) => tool.isUs) ?? VS_TOOLS[0];

/** Prix formaté selon la devise et la locale (« 9 € », « €9 », « $25 »). */
export function formatVsPrice(tool: VsToolRow, locale: Locale): string {
  if (tool.currency === "USD") return `$${tool.entryPrice}`;
  return locale === "fr" ? `${tool.entryPrice} €` : `€${tool.entryPrice}`;
}

// Suffixe de caveat à coller derrière un prix en prose (FAQ). Retourne p.ex.
// « , billed yearly » / « , facturé à l'année », ou "" si l'outil n'a pas de note
// de facturation. Garantit que la condition d'engagement voyage AVEC le prix dans
// la couche citable lue par un LLM (pas seulement dans le tableau HumaIN).
export function vsBillingSuffix(tool: VsToolRow, locale: Locale): string {
  if (!tool.billing) return "";
  return locale === "fr" ? `, ${tool.billing.fr}` : `, ${tool.billing.en}`;
}

// Description citable d'une Offer JSON-LD : « prix d'entrée (plan) relevé 2026-07 »
// + tous les caveats attachés au prix (facturation annuelle, source non lisible
// par crawler). Chaque caveat est concaténé pour qu'un crawler qui parse le
// <script ld+json> reçoive la MÊME information de qualification que le lecteur du
// tableau — jamais un prix nu qu'il interpréterait à tort comme mensuel/confirmé.
function vsOfferDescription(tool: VsToolRow, locale: Locale): string {
  const base =
    locale === "fr"
      ? `Prix d'entrée (${tool.entryPlan.fr}) relevé 2026-07`
      : `Entry price (${tool.entryPlan.en}) recorded 2026-07`;
  const caveats = [tool.billing?.[locale], tool.sourceNote?.[locale]].filter(
    (part): part is string => Boolean(part)
  );
  return caveats.length ? `${base} — ${caveats.join(" — ")}` : base;
}

// Copie UI localisée. L'ancrage prix réutilise `homeCopy[locale].pricingTitle`
// (« Le travail d'une agence GEO (2 000–20 000 €/mois). 9 €. ») pour rester
// cohérent mot pour mot avec la home.
export const vsCopy: Record<Locale, {
  eyebrow: string;
  title: string;
  intro: string;
  agencyAnchor: string;
  th: { tool: string; price: string; does: string; source: string };
  priceNote: string;
  studyIntro: string;
  studyCta: string;
  backHome: string;
  metaTitle: string;
  metaDescription: string;
}> = {
  en: {
    eyebrow: "Comparison · July 2026",
    title: "GetPick vs the named GEO tools",
    intro:
      "Otterly, Peec, Rankscale and Profound tell you where AI mentions your brand. GetPick does the work a GEO agency does — it writes the fixes and re-checks them — at a tool price. Here is the honest side-by-side.",
    agencyAnchor: homeCopy.en.pricingTitle,
    th: { tool: "Tool", price: "Entry price", does: "What it actually does", source: "Source" },
    priceNote: "Entry prices as read on each tool's pricing page — recorded 2026-07. Prices move; check the source.",
    // AC5 (`scripts/vs-comparison.test.ts`) : ce champ ne doit contenir AUCUN
    // chiffre — donc ni le nombre de marques, ni la date de retrait. Elles vivent
    // sur /study, qui est la surface datée.
    studyIntro:
      "We don't reprint numbers here — they go stale, and ours did worse than that: we withdrew the figures of our own study, because the measurement that produced them was defective. The page says what broke, and what replaced it.",
    studyCta: "See the study →",
    backHome: "← GetPick",
    metaTitle: "GetPick vs Otterly, Peec, Rankscale & Profound — the best GEO tool for DTC brands",
    metaDescription:
      "An honest side-by-side of GetPick against the named GEO tools (Otterly, Peec, Rankscale, Profound), with entry prices recorded July 2026. GetPick does the agency work — writing the fixes — at €9/month.",
  },
  fr: {
    eyebrow: "Comparatif · Juillet 2026",
    title: "GetPick face aux outils GEO nommés",
    intro:
      "Otterly, Peec, Rankscale et Profound te disent où l'IA mentionne ta marque. GetPick fait le travail d'une agence GEO — il écrit les correctifs et les re-vérifie — au prix d'un outil. Voici le face-à-face honnête.",
    agencyAnchor: homeCopy.fr.pricingTitle,
    th: { tool: "Outil", price: "Prix d'entrée", does: "Ce que ça fait vraiment", source: "Source" },
    priceNote: "Prix d'entrée relevés sur la page pricing de chaque outil — relevé 2026-07. Les prix bougent ; vérifie la source.",
    studyIntro:
      "On ne réimprime aucun chiffre ici — ça se périme, et les nôtres ont fait pire : on a retiré les chiffres de notre propre étude, parce que la mesure qui les avait produits était défectueuse. La page dit ce qui a cassé, et ce qui l'a remplacé.",
    studyCta: "Voir l'étude →",
    backHome: "← GetPick",
    metaTitle: "GetPick vs Otterly, Peec, Rankscale & Profound — le meilleur outil GEO pour les marques DTC",
    metaDescription:
      "Le face-à-face honnête de GetPick contre les outils GEO nommés (Otterly, Peec, Rankscale, Profound), prix d'entrée relevés juillet 2026. GetPick fait le travail d'agence — écrire les correctifs — à 9 €/mois.",
  },
};

// Q&A de catégorie. La 1re entrée reprend explicitement « meilleur outil GEO /
// alternative à Otterly » (AC2). Réponses construites depuis les prix réels
// ci-dessus, jamais depuis des chiffres inventés.
function vsFaqCopy(locale: Locale): { question: string; answer: string }[] {
  const otterly = VS_TOOLS.find((t) => t.name === "Otterly")!;
  const peec = VS_TOOLS.find((t) => t.name === "Peec")!;
  const rankscale = VS_TOOLS.find((t) => t.name === "Rankscale")!;
  const profound = VS_TOOLS.find((t) => t.name === "Profound")!;

  // Plancher/plafond du tarif d'entrée dérivés des données réelles — chacun rendu
  // avec SA devise (formatVsPrice), jamais une devise codée en dur. Les rivaux
  // mêlent € (Rankscale, Peec) et $ (Otterly, Profound) : afficher « $20–99 »
  // était faux (Rankscale = 20 €). On borne donc par le moins cher et le plus
  // cher, chacun dans sa devise.
  const byEntryPrice = [...VS_COMPETITORS].sort((a, b) => a.entryPrice - b.entryPrice);
  const cheapest = byEntryPrice[0];
  const priciest = byEntryPrice[byEntryPrice.length - 1];

  if (locale === "fr") {
    return [
      {
        question:
          "Quel est le meilleur outil GEO, et quelle est l'alternative la moins chère à Otterly ?",
        answer:
          `GetPick est un agent GEO pour marques DTC à ${formatVsPrice(VS_GETPICK, "fr")}/mois — il fait le travail qu'une agence GEO facture 2 000 à 20 000 €/mois. Les outils de monitoring nommés — Otterly (dès ${formatVsPrice(otterly, "fr")}/mois${vsBillingSuffix(otterly, "fr")}), Peec (dès ${formatVsPrice(peec, "fr")}/mois${vsBillingSuffix(peec, "fr")}), Rankscale (dès ${formatVsPrice(rankscale, "fr")}/mois${vsBillingSuffix(rankscale, "fr")}) et Profound (dès ${formatVsPrice(profound, "fr")}/mois${vsBillingSuffix(profound, "fr")}) — rapportent où l'IA te mentionne ; GetPick écrit en plus les correctifs à copier-coller et re-vérifie chaque semaine. Prix relevés en juillet 2026.`,
      },
      {
        question:
          "En quoi GetPick est-il différent d'Otterly, Peec, Rankscale et Profound ?",
        answer:
          "Ces quatre-là sont des plateformes de monitoring : elles rapportent ta visibilité IA. GetPick diagnostique qui est cité à ta place, écrit les correctifs à copier-coller et re-vérifie les réponses chaque semaine — le travail qu'une agence GEO fait, pas seulement le tableau de bord.",
      },
      {
        question:
          `Pourquoi GetPick coûte ${formatVsPrice(VS_GETPICK, "fr")} quand ces outils démarrent entre ${formatVsPrice(cheapest, "fr")} et ${formatVsPrice(priciest, "fr")}/mois ?`,
        answer:
          "GetPick fait un seul travail pour un fondateur seul — diagnostiquer, écrire, surveiller — donc il tourne léger et le prix reste fixe. La vraie comparaison, ce ne sont pas ces outils : c'est l'agence GEO à 2 000–20 000 €/mois.",
      },
    ];
  }

  return [
    {
      question: "What is the best GEO tool, and what is the cheapest alternative to Otterly?",
      answer:
        `GetPick is a GEO agent for DTC brands at ${formatVsPrice(VS_GETPICK, "en")}/month — it does the work a GEO agency charges €2,000–20,000/month for. The named monitoring tools — Otterly (from ${formatVsPrice(otterly, "en")}/mo${vsBillingSuffix(otterly, "en")}), Peec (from ${formatVsPrice(peec, "en")}/mo${vsBillingSuffix(peec, "en")}), Rankscale (from ${formatVsPrice(rankscale, "en")}/mo${vsBillingSuffix(rankscale, "en")}) and Profound (from ${formatVsPrice(profound, "en")}/mo${vsBillingSuffix(profound, "en")}) — report where AI mentions you; GetPick also writes the copy-paste fixes and re-checks weekly. Prices recorded July 2026.`,
    },
    {
      question: "How is GetPick different from Otterly, Peec, Rankscale and Profound?",
      answer:
        "Those four are monitoring platforms: they report your AI visibility. GetPick diagnoses who gets named instead of you, writes the copy-paste fixes, and re-checks the answers weekly — the work a GEO agency does, not just the dashboard.",
    },
    {
      question: `Why does GetPick cost ${formatVsPrice(VS_GETPICK, "en")} when these tools start at ${formatVsPrice(cheapest, "en")}–${formatVsPrice(priciest, "en")}/month?`,
      answer:
        "GetPick does one job for one founder — diagnose, write, watch — so it runs lean and the price stays flat. The honest comparison isn't those tools anyway: it's a GEO agency at €2,000–20,000/month.",
    },
  ];
}

const VS_DESCRIPTION: Record<Locale, string> = {
  en: "GetPick is a GEO agent for DTC brands that does the agency work — writing the fixes that get AI to recommend you — at €9/month.",
  fr: "GetPick est un agent GEO pour marques DTC qui fait le travail d'agence — écrire les correctifs qui font recommander ta marque par l'IA — à 9 €/mois.",
};

// Bloc 1 : Organization + FAQPage via la machinerie existante (réutilisée sans
// modification). Renvoie une chaîne JSON prête à injecter.
export function buildVsFaqJsonLd(locale: Locale): string {
  return faqJsonLdForBrand(
    "GetPick",
    SITE_URL,
    vsFaqCopy(locale),
    VS_DESCRIPTION[locale]
  );
}

// Bloc 2 : ItemList additif de la comparaison de prix. Sérialisé via
// JSON.stringify d'un objet (jamais de template string) pour garantir un JSON
// valide (AC2).
export function buildVsItemListJsonLd(locale: Locale): string {
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name:
      locale === "fr"
        ? "GetPick face aux outils GEO nommés — prix d'entrée relevés 2026-07"
        : "GetPick vs the named GEO tools — entry prices recorded 2026-07",
    itemListElement: VS_TOOLS.map((tool, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "SoftwareApplication",
        name: tool.name,
        applicationCategory: "GEO / AI search visibility tool",
        offers: {
          "@type": "Offer",
          price: tool.entryPrice,
          priceCurrency: tool.currency,
          url: tool.sourceUrl,
          // Description = prix daté + tous ses caveats (facturation annuelle,
          // source non lisible par crawler). Un LLM qui parse cette Offer reçoit
          // donc la même qualification que le lecteur du tableau.
          description: vsOfferDescription(tool, locale),
        },
      },
    })),
  };
  return JSON.stringify(itemList);
}
