/**
 * Présence off-site — moteur off-site (P0, brique 2).
 *
 * L'IA ne lit pas que le site du client pour décider qui recommander : elle lit
 * des ANNUAIRES, des AVIS, des COMPARATEURS et des COMMUNAUTÉS. Cette brique
 * inventorie ces sources pour un métier local, et pour chacune génère un
 * livrable PRÊT-À-PUBLIER depuis les faits réels du diagnostic.
 *
 * HONNÊTETÉ (garde-fou du brief) : on ne prétend JAMAIS « zéro effort » là où un
 * login humain est nécessaire. Chaque source porte une classe d'effort explicite
 * et un booléen `autonomous`. GetPick ne coche « posé » automatiquement que là
 * où il peut réellement agir seul.
 *
 * Fonctions PURES : aucun accès base ni réseau (la persistance du statut vit
 * dans /api/offsite-presence). Donc testable en isolation par `node --test`.
 */

import { localizeCategoryLabel, type Locale } from "@/lib/i18n";

export type OffsiteSourceType = "profile" | "directory" | "review" | "comparator" | "community" | "knowledge";

/**
 * Classe d'effort — QUI agit, et donc si GetPick peut le faire seul :
 *  - auto_public     : la fiche se peuple depuis des registres publics (SIREN).
 *                      GetPick vérifie/complète. Effort client ~nul. AUTONOME.
 *  - getpick_publish : GetPick publie/soumet sans compte du client (contribution
 *                      ouverte, page hébergée). AUTONOME.
 *  - ready_to_publish: GetPick génère le contenu EXACT ; un humain le colle
 *                      derrière un login. PAS autonome — action client requise.
 *  - client_access   : nécessite le compte/la propriété du client (ex. Google
 *                      Business Profile). GetPick prépare ; le client agit ou
 *                      délègue l'accès. PAS autonome.
 */
export type OffsiteEffort = "auto_public" | "getpick_publish" | "ready_to_publish" | "client_access";

export type OffsitePresenceStatus = "not_started" | "prepared" | "submitted" | "live" | "waiting_client";

export type OffsiteSource = {
  key: string;
  label: string;
  homepage: string;
  type: OffsiteSourceType;
  effort: OffsiteEffort;
  /** Vrai uniquement si GetPick peut poser la présence SANS geste du client. */
  autonomous: boolean;
  /** Pourquoi cette source compte pour un pro local (une phrase, FR/EN). */
  why: Record<Locale, string>;
};

export function effortIsAutonomous(effort: OffsiteEffort): boolean {
  return effort === "auto_public" || effort === "getpick_publish";
}

/**
 * Catalogue tête-de-pont : expert-comptable LOCAL en France. C'est un PARAMÈTRE
 * de départ, pas une vérité figée — d'autres métiers locaux ajouteront leurs
 * sources. L'ordre reflète l'impact décroissant sur la reco IA locale.
 */
export const OFFSITE_SOURCES: OffsiteSource[] = [
  {
    key: "google_business_profile",
    label: "Google Business Profile",
    homepage: "https://www.google.com/business/",
    type: "profile",
    effort: "client_access",
    autonomous: false,
    why: {
      fr: "Source n°1 du local : ce que Google (et les AI Overviews) lisent d'abord pour recommander un pro près de chez soi.",
      en: "The #1 local source: what Google (and AI Overviews) read first to recommend a nearby professional.",
    },
  },
  {
    key: "ordre_experts_comptables",
    label: "Annuaire de l'Ordre des experts-comptables",
    homepage: "https://www.experts-comptables.fr/annuaire",
    type: "directory",
    effort: "client_access",
    autonomous: false,
    why: {
      fr: "Annuaire officiel de la profession : une source de confiance que l'IA traite comme faisant autorité.",
      en: "The profession's official directory: a trusted source AI treats as authoritative.",
    },
  },
  {
    key: "pages_jaunes",
    label: "PagesJaunes",
    homepage: "https://www.pagesjaunes.fr/",
    type: "directory",
    effort: "ready_to_publish",
    autonomous: false,
    why: {
      fr: "Annuaire local massivement indexé et cité par les moteurs sur les requêtes « près de chez moi ».",
      en: "A heavily indexed local directory engines cite on “near me” queries.",
    },
  },
  {
    key: "google_reviews",
    label: "Avis Google",
    homepage: "https://www.google.com/business/",
    type: "review",
    effort: "ready_to_publish",
    autonomous: false,
    why: {
      fr: "Le volume et la fraîcheur des avis pèsent lourd dans la reco locale de l'IA. GetPick fournit la campagne, le client la déclenche.",
      en: "Review volume and freshness weigh heavily in AI local recs. GetPick supplies the campaign, the client triggers it.",
    },
  },
  {
    key: "trustpilot",
    label: "Trustpilot",
    homepage: "https://fr.trustpilot.com/",
    type: "review",
    effort: "ready_to_publish",
    autonomous: false,
    why: {
      fr: "Plateforme d'avis fréquemment citée par les LLM comme preuve tierce.",
      en: "A reviews platform LLMs frequently cite as third-party proof.",
    },
  },
  {
    key: "pappers",
    label: "Pappers",
    homepage: "https://www.pappers.fr/",
    type: "directory",
    effort: "auto_public",
    autonomous: true,
    why: {
      fr: "Fiche alimentée par le registre SIRENE : GetPick vérifie la cohérence des données (nom, adresse, activité) que l'IA recoupe.",
      en: "A registry-fed profile: GetPick verifies the consistency of the data (name, address, activity) AI cross-checks.",
    },
  },
  {
    key: "societe_com",
    label: "Societe.com",
    homepage: "https://www.societe.com/",
    type: "directory",
    effort: "auto_public",
    autonomous: true,
    why: {
      fr: "Autre fiche registre public à recouper : cohérence NAP (nom, adresse, téléphone) pour que l'IA identifie une seule entité.",
      en: "Another public-registry profile: NAP (name, address, phone) consistency so AI resolves a single entity.",
    },
  },
  {
    key: "communities",
    label: "Communautés & forums (r/vosfinances, forums pros)",
    homepage: "https://www.reddit.com/r/vosfinances/",
    type: "community",
    effort: "ready_to_publish",
    autonomous: false,
    why: {
      fr: "Les LLM citent Reddit et les forums. GetPick rédige une réponse utile et honnête ; un humain la poste depuis un compte réel.",
      en: "LLMs cite Reddit and forums. GetPick drafts an honest, useful answer; a human posts it from a real account.",
    },
  },
];

export type PresencePackInput = {
  brandName: string;
  category: string;
  city: string | null;
  websiteUrl: string;
  description: string;
  competitors: string[];
  prompts: string[];
  hostedPageUrl?: string;
};

export type PresenceEntry = {
  key: string;
  label: string;
  homepage: string;
  type: OffsiteSourceType;
  effort: OffsiteEffort;
  autonomous: boolean;
  why: string;
  /** Ce que GetPick livre pour cette source, prêt à être publié. */
  payload: string;
  /** Libellé de l'action attendue (côté GetPick ou côté client). */
  actionLabel: string;
  /** Vrai si un geste humain du client est indispensable (login/propriété). */
  requiresClientAction: boolean;
  status: OffsitePresenceStatus;
};

export type PresencePack = {
  brandName: string;
  city: string | null;
  autonomousCount: number;
  clientActionCount: number;
  entries: PresenceEntry[];
};

function napBlock(locale: Locale, input: PresencePackInput, trade: string): string {
  const city = input.city ?? (locale === "fr" ? "[ville]" : "[city]");
  const lines = locale === "fr"
    ? [
        `Nom : ${input.brandName}`,
        `Activité : ${trade}`,
        `Ville : ${city}`,
        `Site : ${input.websiteUrl}`,
        input.description ? `Description : ${input.description}` : `Description : [ce que ${input.brandName} fait, pour qui]`,
      ]
    : [
        `Name: ${input.brandName}`,
        `Activity: ${trade}`,
        `City: ${city}`,
        `Website: ${input.websiteUrl}`,
        input.description ? `Description: ${input.description}` : `Description: [what ${input.brandName} does, for whom]`,
      ];
  return lines.join("\n");
}

function reviewTemplate(locale: Locale, input: PresencePackInput): string {
  return locale === "fr"
    ? `Bonjour {{prénom}}, si ${input.brandName} vous a aidé, un avis en une phrase aide d'autres dirigeants à nous trouver : dites ce que vous cherchiez, pourquoi vous nous avez choisis, et le résultat obtenu.`
    : `Hi {{first_name}}, if ${input.brandName} helped you, a one-sentence review helps other owners find us: say what you needed, why you chose us, and the result you got.`;
}

function communityAnswer(locale: Locale, input: PresencePackInput): string {
  const q = input.prompts[0] ?? (locale === "fr" ? "quel expert-comptable choisir près de chez moi" : "which accountant to choose near me");
  const inCity = input.city ? (locale === "fr" ? ` à ${input.city}` : ` in ${input.city}`) : "";
  return locale === "fr"
    ? `Sur « ${q} » : ${input.description || `${input.brandName} accompagne ce type de besoin`}${inCity}. À vérifier selon ta situation — regarde les honoraires publiés, la réactivité et les avis récents. (Réponse à poster depuis un compte réel, en toute transparence.)`
    : `On “${q}”: ${input.description || `${input.brandName} handles this kind of need`}${inCity}. Check against your situation — look at published fees, responsiveness and recent reviews. (Post from a real account, transparently.)`;
}

function payloadFor(source: OffsiteSource, locale: Locale, input: PresencePackInput, trade: string): string {
  switch (source.type) {
    case "review":
      return reviewTemplate(locale, input);
    case "community":
      return communityAnswer(locale, input);
    case "profile":
    case "directory":
    default:
      return napBlock(locale, input, trade);
  }
}

function actionLabelFor(effort: OffsiteEffort, locale: Locale): string {
  const fr = locale === "fr";
  switch (effort) {
    case "auto_public":
      return fr ? "GetPick vérifie et complète la fiche" : "GetPick verifies and completes the listing";
    case "getpick_publish":
      return fr ? "GetPick publie" : "GetPick publishes";
    case "ready_to_publish":
      return fr ? "Prêt à publier — un clic humain requis" : "Ready to publish — one human click required";
    case "client_access":
      return fr ? "Nécessite l'accès au compte du client" : "Requires the client's account access";
  }
}

/**
 * Construit le plan de présence off-site pour un client, depuis les faits réels
 * de son diagnostic. `statusByKey` vient de la base (défaut : not_started).
 */
export function buildPresencePack(
  locale: Locale,
  input: PresencePackInput,
  statusByKey: Record<string, OffsitePresenceStatus> = {},
): PresencePack {
  const trade = locale === "fr"
    ? (localizeCategoryLabel(input.category, "fr") || "prestataire de service")
    : (input.category || "service provider");

  const entries: PresenceEntry[] = OFFSITE_SOURCES.map((source) => {
    const requiresClientAction = !source.autonomous;
    return {
      key: source.key,
      label: source.label,
      homepage: source.homepage,
      type: source.type,
      effort: source.effort,
      autonomous: source.autonomous,
      why: source.why[locale],
      payload: payloadFor(source, locale, input, trade),
      actionLabel: actionLabelFor(source.effort, locale),
      requiresClientAction,
      status: statusByKey[source.key] ?? (requiresClientAction ? "not_started" : "not_started"),
    };
  });

  return {
    brandName: input.brandName,
    city: input.city,
    autonomousCount: entries.filter((entry) => entry.autonomous).length,
    clientActionCount: entries.filter((entry) => entry.requiresClientAction).length,
    entries,
  };
}

const VALID_STATUSES: ReadonlySet<string> = new Set<OffsitePresenceStatus>([
  "not_started",
  "prepared",
  "submitted",
  "live",
  "waiting_client",
]);

export function isValidPresenceStatus(value: unknown): value is OffsitePresenceStatus {
  return typeof value === "string" && VALID_STATUSES.has(value);
}

export function isKnownOffsiteSourceKey(value: unknown): boolean {
  return typeof value === "string" && OFFSITE_SOURCES.some((source) => source.key === value);
}
