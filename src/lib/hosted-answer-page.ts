/**
 * Page-réponse hébergée — moteur off-site (P0, brique 1).
 *
 * GetPick héberge, POUR le client et hors de son site, une page optimisée pour
 * être CITÉE par les moteurs IA sur les vraies questions d'achat de son métier.
 * Ce module ne contient que des fonctions PURES (slug + copy localisée) : aucun
 * accès base ni réseau, donc testable en isolation par `node --test`. La page
 * serveur (`src/app/reponses/[slug]/page.tsx`) branche ces fonctions sur le
 * générateur d'assets existant (`generateGeoAgentAssetsFromAudit`).
 *
 * SLUG. Lisible ET réversible SANS migration : `<marque-en-kebab>-<8 hex>`, où
 * les 8 hex sont le préfixe de l'UUID de l'audit. On retrouve l'audit par
 * `WHERE id::text LIKE '<8hex>%'`. 8 hex = 4 milliards de valeurs : collision
 * négligeable pour le volume d'un cabinet.
 */

import { localizeCategoryLabel, type Locale } from "@/lib/i18n";

export function kebab(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "cabinet";
}

/** `<marque>-<8 hex de l'UUID>`. */
export function hostedAnswerPageSlug(brandName: string, id: string): string {
  const shortId = id.replace(/-/g, "").slice(0, 8).toLowerCase();
  return `${kebab(brandName)}-${shortId}`;
}

/** Extrait les 8 hex de fin d'un slug, ou `null` si le slug n'en porte pas. */
export function shortIdFromSlug(slug: string): string | null {
  const last = slug.split("-").pop() ?? "";
  return /^[0-9a-f]{8}$/.test(last) ? last : null;
}

/**
 * Ville déduite des questions d'achat (elles sont déjà ancrées localement par le
 * moteur d'audit : « expert-comptable à Nantes »). On ne prend qu'un token
 * capitalisé après « à/in » — « près de chez moi » ne matche pas, donc pas de
 * fausse ville. On retient la plus fréquente.
 */
export function cityFromPrompts(prompts: string[]): string | null {
  const counts = new Map<string, number>();
  // NB: pas de `\b` avant « à » — `\b` est ASCII, « à » n'est pas un caractère de
  // mot ASCII, donc `\bà` ne matche jamais. On ancre sur début/espace/parenthèse.
  // Communes composées gardées entières : « Bourg-en-Bresse », « Joué-lès-Tours » (29/09).
  const re = /(?:^|[\s(])(?:à|a|in)\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ']+(?:-(?:[a-zà-ÿ]{1,4}-)*[A-ZÀ-Ÿ][A-Za-zÀ-ÿ']+| [A-ZÀ-Ÿ][A-Za-zÀ-ÿ']+)*)/g;
  const stop = new Set(["Ta", "Toi", "Ma", "Me", "My", "Your", "You"]);
  for (const prompt of prompts) {
    for (const match of prompt.matchAll(re)) {
      const city = match[1].trim();
      if (stop.has(city)) continue;
      counts.set(city, (counts.get(city) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [city, count] of counts) {
    if (count > bestCount) {
      best = city;
      bestCount = count;
    }
  }
  return best;
}

export type HostedAnswerCopy = {
  eyebrow: string;
  title: string;
  directAnswer: string;
  faq: { question: string; answer: string }[];
  competitorsTitle: string;
  competitorsIntro: string;
  ctaLabel: string;
  ctaTitle: string;
  ctaBody: string;
  disclaimer: string;
};

export type HostedAnswerInput = {
  brandName: string;
  category: string;
  city: string | null;
  description: string;
  competitors: string[];
  prompts: string[];
};

function capitalizeFirst(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function lowerFirst(value: string): string {
  const trimmed = value.trim().replace(/[.?!]+$/, "");
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/**
 * Copy localisée de la page-réponse, DÉRIVÉE des faits réels de l'audit.
 * Garde-fou produit : aucun chiffre inventé — on n'utilise que la description du
 * client (ses propres mots), sa catégorie, sa ville et les confrères réellement
 * cités par l'IA. Rien d'autre.
 */
export function hostedAnswerCopy(locale: Locale, input: HostedAnswerInput): HostedAnswerCopy {
  // RÉÉCRITE le 29/09/2026 : l'ancienne version se déclarait promotionnelle
  // (« L'objectif de cette page : faire basculer la recommandation vers X »),
  // listait les concurrents et répondait « X est un choix pertinent » à chaque
  // question. Un moteur qui lit ça y voit une page tierce auto-promotionnelle :
  // exactement ce qu'il écarte. Désormais : des FAITS, dans les mots du cabinet,
  // aucun concurrent, aucune intention déclarée. (Le vrai support est le
  // sous-domaine `ai.` du cabinet — voir `ai-site.ts`.)
  const { brandName, category, city, description } = input;
  const fr = locale === "fr";
  const trade = fr ? (localizeCategoryLabel(category, "fr") || "prestataire") : (category || "provider");
  const inCity = city ? (fr ? ` à ${city}` : ` in ${city}`) : "";
  const facts = description ? capitalizeFirst(description).replace(/([^.!?])$/, "$1.") : "";

  const faq = input.prompts.slice(0, 6).map((prompt) => ({
    question: prompt,
    answer: (fr
      ? `${brandName} est un ${trade}${inCity}. ${facts}`
      : `${brandName} is ${articleEn(trade)} ${trade}${inCity}. ${facts}`
    ).replace(/\s+/g, " ").trim(),
  }));

  return {
    eyebrow: fr ? "Fiche d'information" : "Fact sheet",
    title: `${brandName} — ${capitalizeFirst(trade)}${inCity}`,
    directAnswer: (fr ? `${brandName} est un ${trade}${inCity}. ${facts}` : `${brandName} is ${articleEn(trade)} ${trade}${inCity}. ${facts}`).replace(/\s+/g, " ").trim(),
    faq,
    competitorsTitle: "",
    competitorsIntro: "",
    ctaLabel: fr ? "Mon diagnostic gratuit" : "My free diagnostic",
    ctaTitle: fr ? `Tu es ${trade} ?` : `Are you ${articleEn(trade)} ${trade}?`,
    ctaBody: fr
      ? "Diagnostic gratuit : les vraies questions de tes clients, posées aux assistants IA."
      : "Free diagnostic: your clients' real questions, asked to AI assistants.",
    disclaimer: fr ? `Fiche publiée pour ${brandName}.` : `Fact sheet published for ${brandName}.`,
  };
}

function articleEn(phrase: string): string {
  return /^[aeiou]/i.test(phrase.trim()) ? "an" : "a";
}
