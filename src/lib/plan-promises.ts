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
