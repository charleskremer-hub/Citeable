/**
 * SOURCE DE VÉRITÉ des promesses de plan — ce que le produit SERT vraiment.
 *
 * Pourquoi ce fichier existe. Le 16/08/2026 la landing vendait deux choses que
 * le code ne livrait pas :
 *   - une re-vérification « chaque semaine / weekly / hebdo » (~13 occurrences
 *     dans `i18n.ts`, dont les puces d'offre payante), alors que `next_run_at`
 *     est fixé à `now() + interval '30 days'` à la souscription comme après
 *     chaque rescan — le cron quotidien de `vercel.json` ne fait que balayer,
 *     la cadence réelle est portée par `next_run_at` ;
 *   - « Gemini + ChatGPT vérifiés chaque semaine » sur l'offre Agent et « à
 *     ChatGPT et Gemini » à l'étape 2 du « comment ça marche », alors que
 *     `ANSWER_ENGINE_BY_TIER` n'associe qu'UN SEUL moteur à chaque tier
 *     (free/monitor → gemini, agent → openai) et que les trois autres
 *     fournisseurs sont `enabled: false`.
 *
 * C'est la même famille de faute que `formSubtitle` « Email optional » corrigée
 * le 14/08 : la surface publique promet plus que le produit ne sert. Un client
 * qui paie 9 € pour de l'hebdo et reçoit du mensuel a droit à son remboursement.
 *
 * Le remède n'est pas de réécrire les phrases une fois : c'est de les DÉRIVER.
 * `i18n.ts` et les tests consomment ce module ; changer `RECHECK_INTERVAL_DAYS`
 * de 30 à 7, ou servir un second moteur sur un tier, fait basculer les libellés
 * FR et EN sans toucher à une seule phrase.
 *
 * POURQUOI CE MODULE N'IMPORTE PAS `audit-engine.ts`. Deux raisons dures :
 *   1. cycle d'import — `audit-engine.ts` importe `RECHECK_INTERVAL_DAYS` d'ici
 *      pour ses requêtes SQL ; l'inverse fermerait la boucle ;
 *   2. bundle — `i18n.ts` est consommé par la landing ; importer `audit-engine`
 *      y tirerait `pg` et le réseau. `landing-copy.test.ts` documente déjà cette
 *      contrainte (« aucun import : audit-engine tire des dépendances réseau »).
 * Le moteur par tier et le nombre de questions sont donc MIROITÉS ici, et
 * l'alignement avec `audit-engine.ts` est VERROUILLÉ par `plan-promises.test.ts`
 * qui lit la source du moteur d'audit et compare. Désaligner l'un des deux rend
 * la suite rouge : c'est la garantie que ce module ne dérive pas en silence.
 */

/** Les tiers dont une promesse est PUBLIÉE sur la landing. `agent_49eur` n'est
 *  pas commercialisé sur la page, il n'a donc pas de promesse publique ici. */
export type PlanTier = "free" | "monitor_9eur" | "agent_19eur";

/** Même jeu de clés que `AnswerEngineProviderKey` dans `audit-engine.ts`. */
export type AnswerEngineKey = "gemini" | "openai" | "anthropic" | "xai" | "mistral";

/** Miroir des `locale` de `i18n.ts`. Déclaré ici pour ne pas créer de cycle. */
export type PromiseLocale = "en" | "fr";

/**
 * Cadence de re-vérification, en jours. UNIQUE endroit où ce nombre est écrit.
 *
 * Consommée par :
 *   - `audit-engine.ts` — `next_run_at` à la souscription et après un rescan ;
 *   - `db.ts` — rattrapage `next_run_at` et backfill des marques surveillées ;
 *   - les libellés FR/EN ci-dessous, donc toute la copy publique.
 *
 * Passer cette valeur à 7 suffit à faire dire « chaque semaine » / « weekly » à
 * la landing ET à faire re-tester les marques toutes les semaines. C'est une
 * décision de coût : elle se prend ici, en une ligne, jamais dans la copy.
 *
 * L'annotation `: number` est volontaire. Sans elle TypeScript fige le type
 * littéral `30`, et toute comparaison à une autre cadence devient une erreur
 * TS2367 « no overlap » : le typage interdirait exactement le basculement que
 * cette constante existe pour rendre possible.
 */
export const RECHECK_INTERVAL_DAYS: number = 30;

/**
 * OFFRE PUBLIQUE — pivot du 22/09/2026, décidé par Charles (CEO).
 *
 * La landing ne vend plus trois paliers outil à une marque DTC : elle vend UN
 * plan fait-pour-toi à un professionnel de service, qui ne touche ni à son
 * site ni à son code. Le prix est écrit ICI et nulle part ailleurs — la copy
 * FR/EN, le JSON-LD de `layout.tsx`, `public/llms.txt` et la page /vs le
 * DÉRIVENT. `offre-services.test.ts` échoue si une surface publique publie un
 * autre montant : c'est la même discipline que la cadence ci-dessus, née de la
 * même faute (deux surfaces, deux chiffres, aucune des deux fausse isolément).
 *
 * Les tiers internes `monitor_9eur` / `agent_19eur` NE DISPARAISSENT PAS du
 * code : des droits y sont attachés (`entitlement.ts`, `stripe-webhook.ts`,
 * page de rapport). Ce qui change est ce qui est PUBLIÉ sur la landing.
 */
export const SERVICE_PLAN_PRICE_EUR: number = 69;

/**
 * Métier du beachhead. C'est un PARAMÈTRE, pas une conviction : basculer vers
 * un autre métier de service est un seul mot, et toute la copy FR/EN suit.
 */
export const BEACHHEAD_TRADE: Record<PromiseLocale, string> = {
  en: "accountant",
  fr: "expert-comptable",
};

/** Libellé public de chaque moteur — miroir du champ `engine` de
 *  `ANSWER_ENGINE_PROVIDER_CONFIGS` (`audit-engine.ts`). */
const ANSWER_ENGINE_LABELS: Record<AnswerEngineKey, string> = {
  gemini: "Gemini",
  openai: "ChatGPT",
  anthropic: "Claude",
  xai: "Grok",
  mistral: "Mistral",
};

/** Miroir des `enabled: true` de `ANSWER_ENGINE_PROVIDER_CONFIGS`. Aucun moteur
 *  hors de cette liste ne peut être promis : il n'est pas interrogé. */
export const ENABLED_ANSWER_ENGINE_KEYS: readonly AnswerEngineKey[] = ["gemini", "openai"];

/**
 * Moteurs RÉELLEMENT interrogés par un audit de ce tier — miroir de
 * `ANSWER_ENGINE_BY_TIER`. Un tableau et non une valeur seule : le jour où un
 * tier interroge deux moteurs, on ajoute la clé ici et tous les libellés
 * (« Gemini », « Gemini et ChatGPT », « Gemini and ChatGPT ») suivent seuls.
 */
export const ANSWER_ENGINE_KEYS_BY_TIER: Record<PlanTier, readonly AnswerEngineKey[]> = {
  free: ["gemini"],
  monitor_9eur: ["gemini"],
  agent_19eur: ["openai"],
};

/** Nombre de questions d'achat envoyées par audit — miroir de
 *  `const count = tier === "free" ? 6 : 12;` (`analyzeBuyerIntentPrompts`). */
export const BUYER_QUESTION_COUNT_BY_TIER: Record<PlanTier, number> = {
  free: 6,
  monitor_9eur: 12,
  agent_19eur: 12,
};

/** Les formes dont la copy a besoin pour parler d'une cadence sans l'écrire. */
export type CadenceLabels = {
  /** « chaque mois » / « monthly » — épithète de verbe : « re-vérifiées ___ ». */
  adverb: string;
  /** « tous les mois » / « every month » — complément : « il repose tes questions ___ ». */
  every: string;
  /** « mensuel » / « monthly » — adjectif : « un agent ___ ». */
  adjective: string;
  /** « par mois » / « per month » — distributif : « 1 à 3 correctifs ___ ». */
  per: string;
  /** « re-check mensuel » / « monthly re-check » — l'ordre diffère selon la langue. */
  recheckNoun: string;
};

type CadenceEntry = Record<PromiseLocale, CadenceLabels>;

/**
 * Cadences nommées. Une cadence non listée retombe sur la forme générique
 * « tous les N jours » / « every N days » : jamais de libellé faux, au pire un
 * libellé littéral. On ne devine pas — 30 jours se dit « chaque mois », pas
 * « toutes les 4 semaines et 2 jours ».
 */
const NAMED_CADENCES: ReadonlyMap<number, CadenceEntry> = new Map([
  [
    1,
    {
      fr: { adverb: "chaque jour", every: "tous les jours", adjective: "quotidien", per: "par jour", recheckNoun: "re-check quotidien" },
      en: { adverb: "daily", every: "every day", adjective: "daily", per: "per day", recheckNoun: "daily re-check" },
    },
  ],
  [
    7,
    {
      fr: { adverb: "chaque semaine", every: "toutes les semaines", adjective: "hebdomadaire", per: "par semaine", recheckNoun: "re-check hebdomadaire" },
      en: { adverb: "weekly", every: "every week", adjective: "weekly", per: "per week", recheckNoun: "weekly re-check" },
    },
  ],
  [
    14,
    {
      fr: { adverb: "toutes les deux semaines", every: "toutes les deux semaines", adjective: "bimensuel", per: "toutes les deux semaines", recheckNoun: "re-check bimensuel" },
      en: { adverb: "every two weeks", every: "every two weeks", adjective: "fortnightly", per: "every two weeks", recheckNoun: "fortnightly re-check" },
    },
  ],
  [
    30,
    {
      fr: { adverb: "chaque mois", every: "tous les mois", adjective: "mensuel", per: "par mois", recheckNoun: "re-check mensuel" },
      en: { adverb: "monthly", every: "every month", adjective: "monthly", per: "per month", recheckNoun: "monthly re-check" },
    },
  ],
  [
    90,
    {
      fr: { adverb: "chaque trimestre", every: "tous les trimestres", adjective: "trimestriel", per: "par trimestre", recheckNoun: "re-check trimestriel" },
      en: { adverb: "quarterly", every: "every quarter", adjective: "quarterly", per: "per quarter", recheckNoun: "quarterly re-check" },
    },
  ],
]);

function genericCadence(days: number): CadenceEntry {
  const fr = `tous les ${days} jours`;
  const en = `every ${days} days`;
  return {
    fr: { adverb: fr, every: fr, adjective: fr, per: fr, recheckNoun: `re-check ${fr}` },
    en: { adverb: en, every: en, adjective: en, per: en, recheckNoun: `re-check ${en}` },
  };
}

/** Libellés de cadence pour un nombre de jours quelconque. */
export function cadenceLabels(days: number): CadenceEntry {
  return NAMED_CADENCES.get(days) ?? genericCadence(days);
}

/** Les libellés de LA cadence en vigueur. C'est ce que la copy consomme. */
export const RECHECK_CADENCE: CadenceEntry = cadenceLabels(RECHECK_INTERVAL_DAYS);

/** « Gemini », « Gemini et ChatGPT », « Gemini, ChatGPT et Claude ». */
export function joinEngineLabels(keys: readonly AnswerEngineKey[], locale: PromiseLocale): string {
  const labels = keys.map((key) => ANSWER_ENGINE_LABELS[key]);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  const conjunction = locale === "fr" ? "et" : "and";
  return `${labels.slice(0, -1).join(", ")} ${conjunction} ${labels[labels.length - 1]}`;
}

export type PlanPromise = {
  tier: PlanTier;
  /** Nombre de questions d'achat envoyées par audit. */
  buyerQuestionCount: number;
  /** Clés des moteurs réellement interrogés pour ce tier. */
  answerEngineKeys: readonly AnswerEngineKey[];
  /** Cadence de re-vérification, en jours. */
  recheckIntervalDays: number;
  /** Libellé public des moteurs, par langue. */
  engineLabel: Record<PromiseLocale, string>;
  /** Libellés de cadence, par langue. */
  cadence: CadenceEntry;
};

function promiseFor(tier: PlanTier): PlanPromise {
  const answerEngineKeys = ANSWER_ENGINE_KEYS_BY_TIER[tier];
  return {
    tier,
    buyerQuestionCount: BUYER_QUESTION_COUNT_BY_TIER[tier],
    answerEngineKeys,
    recheckIntervalDays: RECHECK_INTERVAL_DAYS,
    engineLabel: {
      fr: joinEngineLabels(answerEngineKeys, "fr"),
      en: joinEngineLabels(answerEngineKeys, "en"),
    },
    cadence: RECHECK_CADENCE,
  };
}

/** Ce que chaque offre sert vraiment. Toute promesse publique part d'ici. */
export const PLAN_PROMISES: Record<PlanTier, PlanPromise> = {
  free: promiseFor("free"),
  monitor_9eur: promiseFor("monitor_9eur"),
  agent_19eur: promiseFor("agent_19eur"),
};

/**
 * COPY DE L'OFFRE PUBLIQUE, DÉRIVÉE — ajoutée le 22/09/2026 (lot « surfaces
 * prospect »).
 *
 * POURQUOI. Le pivot du matin a réaligné la LANDING sur l'offre unique à
 * `SERVICE_PLAN_PRICE_EUR`. Il n'a pas touché aux surfaces qu'un prospect voit
 * APRÈS son diagnostic gratuit : le bloc verrouillé de la page de rapport et
 * les deux emails post-audit vendaient encore « Monitor 9 € » et « Agent
 * 19 € », et le bloc verrouillé demandait au client de COLLER quelque chose
 * sur son site — c'est-à-dire l'exact contraire de la promesse « tu ne touches
 * à rien » affichée sur la home. Deux prix et deux promesses opposées sur le
 * même parcours, chacun vrai isolément : même famille que le 28/07
 * (llms.txt 6 questions / JSON-LD 3) et que le 16/08 (cadence promise non
 * servie).
 *
 * L'invariant n'est pas « le prix vaut 69 » : c'est que ces surfaces DÉRIVENT
 * du même endroit que la landing. Changer le prix, le métier ou la cadence
 * reste un seul geste. `scripts/surfaces-prospect.test.ts` échoue si une de ces
 * surfaces republie un ancien palier ou redemande un geste technique.
 *
 * CE QUE CE MODULE NE TOUCHE PAS, et c'est délibéré : les libellés destinés aux
 * CLIENTS EXISTANTS (description de tier dans `audit-engine.ts`, `PaidReportGate`,
 * chat Agent). Un droit déjà vendu ne se réécrit pas par une copy de landing.
 */
export type ServiceOfferCopy = {
  /** « 69 €/mois » — le prix seul, dans la forme de la langue. */
  price: string;
  /** « Fait pour toi · 69 €/mois » — badge court du plan. */
  badge: string;
  /** Titre du bloc vendu à un prospect qui vient de lire son diagnostic. */
  title: string;
  /** Ce que l'offre fait — aucun geste demandé au client. */
  body: string;
  /** Libellé du bouton. */
  cta: string;
  /** Une phrase pour un email : ce qu'on fait, à quel prix. */
  emailSentence: string;
  /** Libellé du bouton d'email. */
  emailCta: string;
};

const SERVICE_PRICE_LABEL: Record<PromiseLocale, string> = {
  fr: `${SERVICE_PLAN_PRICE_EUR} €/mois`,
  en: `€${SERVICE_PLAN_PRICE_EUR}/month`,
};

export const SERVICE_OFFER_COPY: Record<PromiseLocale, ServiceOfferCopy> = {
  fr: {
    price: SERVICE_PRICE_LABEL.fr,
    badge: `Fait pour toi · ${SERVICE_PRICE_LABEL.fr}`,
    title: "Ce travail, GetPick le fait à ta place",
    body: `GetPick crée et héberge ta page-réponse, celle que l'IA lit et cite, et te place sur les sources qu'elle croit — annuaires, avis, comparatifs de ta profession. Hors de ton site : tu ne changes rien de ton côté. ${RECHECK_CADENCE.fr.every}, il repose ces mêmes questions et te montre le basculement. Voici ce qui t'attend — nommé et compté, jamais inventé :`,
    cta: `Démarrer — ${SERVICE_PRICE_LABEL.fr} →`,
    emailSentence: `Tu peux t'en occuper toi-même. GetPick le fait à ta place, hors de ton site, pour ${SERVICE_PRICE_LABEL.fr}, sans engagement.`,
    emailCta: `Démarrer — ${SERVICE_PRICE_LABEL.fr}`,
  },
  en: {
    price: SERVICE_PRICE_LABEL.en,
    badge: `Done for you · ${SERVICE_PRICE_LABEL.en}`,
    title: "GetPick does this work for you",
    body: `GetPick creates and hosts your answer page — the one AI reads and cites — and places you on the sources it trusts: directories, reviews, category comparisons. Off-site: you change nothing on your end. ${RECHECK_CADENCE.en.every}, it asks those same questions again and shows you the shift. Here is what is waiting — named and counted, never invented:`,
    cta: `Start — ${SERVICE_PRICE_LABEL.en} →`,
    emailSentence: `You can handle it yourself. GetPick does it for you, off-site, for ${SERVICE_PRICE_LABEL.en}, no commitment.`,
    emailCta: `Start — ${SERVICE_PRICE_LABEL.en}`,
  },
};
