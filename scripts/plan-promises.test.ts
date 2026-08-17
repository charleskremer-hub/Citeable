// Verrou de l'invariant « la copy ne promet que ce que le produit sert ».
//
// Deux écarts mesurés le 16/08/2026 sur la tête de chaîne motivent ce fichier :
//   - la landing vendait un re-check « chaque semaine / weekly / hebdo » alors
//     que `next_run_at` était posé à `now() + interval '30 days'` — un client
//     qui paie 9 € pour de l'hebdo et reçoit du mensuel demande, à raison, un
//     remboursement ;
//   - la landing promettait « Gemini + ChatGPT » sur une même offre alors que
//     `ANSWER_ENGINE_BY_TIER` n'associe qu'UN moteur à chaque tier.
//
// `src/lib/plan-promises.ts` est désormais la source de vérité que la copy
// consomme. Ce fichier verrouille les deux jointures que le typage ne peut pas
// tenir : plan-promises ↔ `audit-engine.ts` (lu EN SOURCE, jamais importé : le
// moteur d'audit tire `pg` et le réseau — même raison que dans
// `landing-copy.test.ts`), et plan-promises ↔ surfaces expédiées.
//
// Fonctions pures, ZÉRO réseau. Lancer : npm test  (Node >= 23.6).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { homeCopy, auditCopy, type Locale } from "@/lib/i18n";
import {
  ANSWER_ENGINE_KEYS_BY_TIER,
  BUYER_QUESTION_COUNT_BY_TIER,
  ENABLED_ANSWER_ENGINE_KEYS,
  PLAN_PROMISES,
  RECHECK_CADENCE,
  RECHECK_INTERVAL_DAYS,
  cadenceLabels,
  joinEngineLabels,
  type AnswerEngineKey,
  type PlanTier,
} from "@/lib/plan-promises";

const LOCALES = ["en", "fr"] as const satisfies readonly Locale[];
const PUBLISHED_TIERS = ["free", "monitor_9eur", "agent_19eur"] as const satisfies readonly PlanTier[];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readRepoFile = (...segments: string[]) => readFileSync(resolve(repoRoot, ...segments), "utf8");

const engineSource = readRepoFile("src", "lib", "audit-engine.ts");
const dbSource = readRepoFile("src", "lib", "db.ts");
const llmsTxt = readRepoFile("public", "llms.txt");
// `llms.txt` est encolonné à ~78 caractères : une promesse y est coupée par des
// retours à la ligne. On compare donc sur une version à espaces normalisés.
const llmsTxtFlat = llmsTxt.replace(/\s+/g, " ");

// --- lecture de `audit-engine.ts` EN SOURCE ---------------------------------

/** Corps d'un littéral d'objet `const NOM ... = { ... };`, au premier `};`. */
function objectLiteralBody(source: string, constName: string) {
  const start = source.indexOf(`const ${constName}`);
  assert.notEqual(start, -1, `audit-engine.ts doit porter \`const ${constName}\``);
  const open = source.indexOf("{", start);
  const close = source.indexOf("\n};", open);
  assert.notEqual(close, -1, `le littéral ${constName} doit se fermer sur une ligne \`};\``);
  return source.slice(open, close);
}

/** `ANSWER_ENGINE_BY_TIER` → { free: "gemini", ... } */
function engineKeyByTierFromSource(): Record<string, string> {
  const body = objectLiteralBody(engineSource, "ANSWER_ENGINE_BY_TIER");
  const table: Record<string, string> = {};
  for (const [, tier, key] of body.matchAll(/(\w+):\s*"(\w+)"/g)) table[tier] = key;
  assert.ok(Object.keys(table).length >= 3, "ANSWER_ENGINE_BY_TIER doit être lisible en source");
  return table;
}

/** `ANSWER_ENGINE_PROVIDER_CONFIGS` → { gemini: { engine: "Gemini", enabled: true }, ... } */
function providerConfigsFromSource(): Record<string, { engine: string; enabled: boolean }> {
  const body = objectLiteralBody(engineSource, "ANSWER_ENGINE_PROVIDER_CONFIGS");
  const configs: Record<string, { engine: string; enabled: boolean }> = {};
  for (const [, key, engine, enabled] of body.matchAll(
    /key:\s*"(\w+)",[\s\S]*?engine:\s*"([^"]+)",[\s\S]*?enabled:\s*(true|false),/g
  )) {
    configs[key] = { engine, enabled: enabled === "true" };
  }
  assert.ok(Object.keys(configs).length >= 2, "ANSWER_ENGINE_PROVIDER_CONFIGS doit être lisible en source");
  return configs;
}

// Même ancrage que `landing-copy.test.ts` : `const count =` est exigé, car un
// second ternaire de même forme (`const minAi = tier === "free" ? 3 : 4;`) suit
// deux lignes plus bas et serait lu à sa place par une regex non ancrée.
const TIER_COUNT_RE = /const count = tier === "free" \? (\d+) : (\d+);/;

// --- 1. la cadence : une seule constante, consommée par le SQL --------------

// Écrit sans backtick JS : c'est le TEXTE `interval '${RECHECK_INTERVAL_DAYS}
// days'` qu'on cherche dans la source, pas sa valeur interpolée.
const CADENCE_SQL_TEMPLATE = "interval '${RECHECK_INTERVAL_DAYS} days'";

for (const [label, source] of [
  ["src/lib/audit-engine.ts", engineSource],
  ["src/lib/db.ts", dbSource],
] as const) {
  test(`cadence — ${label} tire son intervalle de la constante, jamais d'un littéral`, () => {
    assert.match(
      source,
      /import \{[^}]*RECHECK_INTERVAL_DAYS[^}]*\} from "\.\/plan-promises";/,
      `${label} doit importer RECHECK_INTERVAL_DAYS depuis plan-promises`
    );
    assert.ok(
      source.includes(CADENCE_SQL_TEMPLATE),
      `${label} doit poser next_run_at avec \`${CADENCE_SQL_TEMPLATE}\``
    );
    // Le littéral de la cadence en vigueur est banni : c'est exactement la forme
    // qui a laissé 30 jours vivre en dur pendant que la copy vendait 7.
    assert.doesNotMatch(
      source,
      new RegExp(`interval '${RECHECK_INTERVAL_DAYS} days'`),
      `${label}: \`interval '${RECHECK_INTERVAL_DAYS} days'\` en dur — la cadence doit venir de RECHECK_INTERVAL_DAYS`
    );
  });
}

// --- 2. les moteurs : ce qui est publié est ce qui est interrogé ------------

test("moteurs — chaque tier publie exactement le moteur de ANSWER_ENGINE_BY_TIER", () => {
  const byTier = engineKeyByTierFromSource();
  for (const tier of PUBLISHED_TIERS) {
    const served = byTier[tier];
    assert.ok(served, `ANSWER_ENGINE_BY_TIER doit couvrir le tier ${tier}`);
    assert.deepEqual(
      [...ANSWER_ENGINE_KEYS_BY_TIER[tier]],
      [served],
      `${tier}: plan-promises publie [${ANSWER_ENGINE_KEYS_BY_TIER[tier].join(", ")}] alors que le moteur d'audit interroge ${served}`
    );
  }
});

test("moteurs — aucun moteur publié n'est désactivé dans le moteur d'audit", () => {
  const configs = providerConfigsFromSource();
  const enabled = Object.entries(configs)
    .filter(([, config]) => config.enabled)
    .map(([key]) => key)
    .sort();
  assert.deepEqual(
    [...ENABLED_ANSWER_ENGINE_KEYS].sort(),
    enabled,
    `plan-promises liste ${ENABLED_ANSWER_ENGINE_KEYS.join(", ")} comme actifs, le moteur d'audit ${enabled.join(", ")}`
  );
  for (const tier of PUBLISHED_TIERS) {
    for (const key of ANSWER_ENGINE_KEYS_BY_TIER[tier]) {
      assert.ok(
        configs[key]?.enabled,
        `${tier}: le moteur « ${key} » est promis alors qu'il est enabled: false — il n'est jamais interrogé`
      );
    }
  }
});

test("moteurs — le libellé public est celui du moteur d'audit, pas un synonyme", () => {
  const configs = providerConfigsFromSource();
  for (const tier of PUBLISHED_TIERS) {
    for (const locale of LOCALES) {
      const label = PLAN_PROMISES[tier].engineLabel[locale];
      for (const key of ANSWER_ENGINE_KEYS_BY_TIER[tier]) {
        assert.ok(
          label.includes(configs[key].engine),
          `${tier}/${locale}: le libellé « ${label} » doit nommer « ${configs[key].engine} »`
        );
      }
    }
  }
});

test("moteurs — la copy d'offre nomme le moteur réellement interrogé pour ce tier", () => {
  for (const locale of LOCALES) {
    const tiers = homeCopy[locale].pricingTiers;
    const monitor = tiers.find((entry) => entry.name === "Monitor");
    const agent = tiers.find((entry) => entry.name === "Agent");
    assert.ok(monitor && agent, `${locale}: les offres Monitor et Agent doivent exister`);
    const agentFeature = agent!.features[0];
    assert.ok(
      agentFeature.includes(PLAN_PROMISES.agent_19eur.engineLabel[locale]),
      `${locale}: la première puce Agent doit nommer ${PLAN_PROMISES.agent_19eur.engineLabel[locale]}`
    );
    // Le défaut d'origine : « Gemini + ChatGPT » sur une offre qui n'interroge
    // qu'un moteur. Interdit tant que le tier ne sert qu'un moteur.
    if (PLAN_PROMISES.agent_19eur.answerEngineKeys.length === 1) {
      assert.doesNotMatch(
        agentFeature,
        /Gemini \+ ChatGPT|ChatGPT \+ Gemini/i,
        `${locale}: l'offre Agent n'interroge qu'un moteur, elle ne peut pas en promettre deux sur un même audit`
      );
    }
  }
});

test("moteurs — llms.txt n'annonce pas deux moteurs sur une offre qui n'en sert qu'un", () => {
  if (PLAN_PROMISES.agent_19eur.answerEngineKeys.length > 1) return;
  assert.doesNotMatch(
    llmsTxtFlat,
    /Gemini \+ ChatGPT|ChatGPT \+ Gemini/i,
    "llms.txt: aucune offre n'interroge deux moteurs sur un même audit"
  );
});

// --- 3. les questions : le compte publié est celui du moteur ----------------

test("questions — le compte publié par tier est celui du moteur d'audit", () => {
  const match = engineSource.match(TIER_COUNT_RE);
  assert.ok(match, 'audit-engine.ts doit porter `const count = tier === "free" ? N : M;`');
  const [, free, paid] = match!;
  assert.equal(BUYER_QUESTION_COUNT_BY_TIER.free, Number(free), "le compte gratuit doit être celui du moteur");
  assert.equal(BUYER_QUESTION_COUNT_BY_TIER.monitor_9eur, Number(paid), "le compte Monitor doit être celui du moteur");
  assert.equal(BUYER_QUESTION_COUNT_BY_TIER.agent_19eur, Number(paid), "le compte Agent doit être celui du moteur");
});

test("questions — la puce Monitor publie le compte du moteur, FR et EN", () => {
  for (const locale of LOCALES) {
    const monitor = homeCopy[locale].pricingTiers.find((entry) => entry.name === "Monitor");
    assert.ok(monitor, `${locale}: l'offre Monitor doit exister`);
    assert.ok(
      monitor!.features[0].startsWith(String(BUYER_QUESTION_COUNT_BY_TIER.monitor_9eur)),
      `${locale}: la puce Monitor doit ouvrir sur ${BUYER_QUESTION_COUNT_BY_TIER.monitor_9eur} questions`
    );
  }
});

// --- 4. la cadence publiée est la cadence servie ----------------------------

test("cadence — les libellés dérivent de la constante, dans les deux langues", () => {
  const expected = cadenceLabels(RECHECK_INTERVAL_DAYS);
  for (const locale of LOCALES) {
    assert.deepEqual(RECHECK_CADENCE[locale], expected[locale], `${locale}: les libellés doivent suivre la constante`);
  }
});

test("cadence — la puce Monitor publie la cadence réelle, FR et EN", () => {
  for (const locale of LOCALES) {
    const monitor = homeCopy[locale].pricingTiers.find((entry) => entry.name === "Monitor");
    const expected =
      locale === "en"
        ? `${BUYER_QUESTION_COUNT_BY_TIER.monitor_9eur} buying questions re-checked ${RECHECK_CADENCE.en.adverb}`
        : `${BUYER_QUESTION_COUNT_BY_TIER.monitor_9eur} questions d'achat re-vérifiées ${RECHECK_CADENCE.fr.adverb}`;
    assert.equal(monitor!.features[0], expected, `${locale}: la puce Monitor doit publier la cadence réelle`);
  }
});

test("cadence — le TL;DR et la FAQ publient la cadence réelle, FR et EN", () => {
  for (const locale of LOCALES) {
    const { tldrBody, faqItems } = homeCopy[locale];
    assert.ok(
      tldrBody.includes(RECHECK_CADENCE[locale].adverb),
      `${locale}: le TL;DR doit porter « ${RECHECK_CADENCE[locale].adverb} »`
    );
    const cadenceFaq = faqItems.find((item) => item.answer.includes(RECHECK_CADENCE[locale].every));
    assert.ok(
      cadenceFaq,
      `${locale}: une réponse de FAQ doit porter « ${RECHECK_CADENCE[locale].every} »`
    );
    assert.ok(
      cadenceFaq!.answer.includes(RECHECK_CADENCE[locale].adjective),
      `${locale}: la FAQ doit qualifier l'agent de « ${RECHECK_CADENCE[locale].adjective} »`
    );
  }
});

test("cadence — le rapport d'audit publie la cadence réelle, FR et EN", () => {
  for (const locale of LOCALES) {
    assert.ok(
      auditCopy[locale].techRegenNote.includes(RECHECK_CADENCE[locale].recheckNoun),
      `${locale}: techRegenNote doit porter « ${RECHECK_CADENCE[locale].recheckNoun} »`
    );
  }
});

// --- 5. aucune surface expédiée ne contredit la constante -------------------

// Le ban porte sur la famille HEBDOMADAIRE et sur elle seule, conditionné à la
// constante. Deux raisons de ne pas le rendre symétrique :
//   - c'est l'hebdo qui a été survendu, c'est donc l'hebdo qu'il faut empêcher
//     de revenir tant que la constante ne vaut pas 7 ;
//   - les marqueurs « mensuels » (« par mois », « /month », « monthly ») sont
//     aussi les marqueurs de PRIX (« 9 €/mois »). Les bannir quand la cadence
//     passerait à 7 rendrait la suite rouge sur la grille tarifaire, c'est-à-dire
//     pour une raison fausse.
// « cette semaine » / « this week » restent autorisés : ils datent une action du
// CLIENT (« 3 actions prioritaires pour cette semaine »), pas la cadence du
// produit.
const WEEKLY_PROMISES = [
  /\bweekly\b/i,
  /\bevery week\b/i,
  /\bper week\b/i,
  /\bchaque semaine\b/i,
  /\btoutes les semaines\b/i,
  /\bpar semaine\b/i,
  /\bhebdo/i,
] as const;

/** Toutes les chaînes expédiées d'un dictionnaire de copy, à plat. */
function shippedStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) shippedStrings(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) shippedStrings(item, out);
  return out;
}

const SHIPPED_SURFACES = () =>
  [
    ...LOCALES.flatMap(
      (locale) =>
        [
          [`homeCopy.${locale}`, shippedStrings(homeCopy[locale]).join("\n")],
          [`auditCopy.${locale}`, shippedStrings(auditCopy[locale]).join("\n")],
        ] as const
    ),
    ["public/llms.txt", llmsTxt],
  ] as const;

test("cadence — aucune surface expédiée ne promet une cadence que le produit ne sert pas", () => {
  if (RECHECK_INTERVAL_DAYS === 7) return; // la promesse hebdo serait alors vraie
  for (const [surface, text] of SHIPPED_SURFACES()) {
    for (const promise of WEEKLY_PROMISES) {
      assert.doesNotMatch(
        text,
        promise,
        `${surface}: promesse hebdomadaire « ${promise.source} » alors que le produit re-teste tous les ${RECHECK_INTERVAL_DAYS} jours`
      );
    }
  }
});

// Le ban ci-dessus ne lit que les dictionnaires de copy et `llms.txt`. Le
// 17/08 on a mesuré que la promesse hebdomadaire survivait dans SIX fichiers
// que ce filet ne regardait pas : le JSON-LD `Offer` et la meta description de
// `layout.tsx` (rendus sur TOUTES les pages, donc le signal structuré que lit
// un crawler IA), la page comparative `/vs` et son JSON-LD, la page de rapport
// ouverte par un lien de prospection, et la carte de suivi montrée à l'ABONNÉ
// PAYANT. Un filet qui ne couvre pas la surface la plus citable ne protège rien
// — il rend seulement vert. Le ban porte donc aussi sur les sources.
//
// On lit en SOURCE et non par import : ces modules tirent des dépendances
// réseau (`audit-engine`) ou React. Les faux positifs de vocabulaire technique
// (`weekly_rescan`, `weeklyEmailSent`, `changeFrequency: "weekly"`…) sont
// retirés avant l'assertion : ce sont des identifiants, pas des promesses.
const CADENCE_SOURCE_SURFACES = [
  ["src/app/layout.tsx", ["src", "app", "layout.tsx"]],
  ["src/lib/vs-comparison.ts", ["src", "lib", "vs-comparison.ts"]],
  ["src/app/audit/[id]/page.tsx", ["src", "app", "audit", "[id]", "page.tsx"]],
  ["src/app/audit/[id]/VisibilityMonitorCard.tsx", ["src", "app", "audit", "[id]", "VisibilityMonitorCard.tsx"]],
] as const;

/** Identifiants et clés techniques : ils contiennent « weekly » sans rien promettre. */
const TECHNICAL_WEEKLY = /weekly_rescan|weeklyRescan|weekly_monitoring|weeklyEmail\w*|weeklyActionPlan|sendWeeklyMonitoringEmail|changeFrequency:\s*"weekly"/g;

test("cadence — aucune SOURCE cliente ne promet une cadence que le produit ne sert pas", () => {
  if (RECHECK_INTERVAL_DAYS === 7) return; // la promesse hebdo serait alors vraie
  for (const [label, segments] of CADENCE_SOURCE_SURFACES) {
    const text = readRepoFile(...segments).replace(TECHNICAL_WEEKLY, "");
    for (const promise of WEEKLY_PROMISES) {
      assert.doesNotMatch(
        text,
        promise,
        `${label}: promesse hebdomadaire « ${promise.source} » alors que le produit re-teste tous les ${RECHECK_INTERVAL_DAYS} jours`
      );
    }
  }
});

test("cadence — la cadence réelle est bien publiée sur chaque surface, pas seulement absente", () => {
  // Sans ce test, supprimer toute mention de cadence ferait passer le ban
  // ci-dessus au vert pour la mauvaise raison.
  for (const [surface, text] of SHIPPED_SURFACES()) {
    const locale: Locale = surface.endsWith(".fr") ? "fr" : "en";
    const labels = RECHECK_CADENCE[locale];
    assert.ok(
      [labels.adverb, labels.every, labels.adjective, labels.per].some((label) => text.includes(label)),
      `${surface}: la cadence réelle (« ${labels.adverb} ») doit être publiée`
    );
  }
});

// --- 6. cohérence interne de la table de cadences ---------------------------

test("cadence — une cadence non nommée retombe sur une forme littérale, jamais fausse", () => {
  const odd = cadenceLabels(11);
  assert.equal(odd.fr.adverb, "tous les 11 jours");
  assert.equal(odd.en.adverb, "every 11 days");
  for (const locale of LOCALES) {
    for (const promise of WEEKLY_PROMISES) {
      assert.doesNotMatch(odd[locale].adverb, promise, "une cadence inconnue ne doit jamais se dire « hebdo »");
    }
  }
});

test("cadence — 7 jours se dit bien « chaque semaine » / « weekly »", () => {
  // Sonde du basculement : c'est ce que la landing publierait si la constante
  // passait à 7, sans qu'une seule phrase soit réécrite.
  const weekly = cadenceLabels(7);
  assert.equal(weekly.fr.adverb, "chaque semaine");
  assert.equal(weekly.en.adverb, "weekly");
  assert.equal(weekly.fr.adjective, "hebdomadaire");
  assert.equal(weekly.en.recheckNoun, "weekly re-check");
});

test("moteurs — deux moteurs sur un tier produisent un libellé à deux moteurs", () => {
  // Sonde côté moteurs : le jour où un tier interroge Gemini ET ChatGPT, les
  // libellés le disent sans qu'une phrase de copy soit réécrite. Les noms
  // attendus sont lus dans `ANSWER_ENGINE_PROVIDER_CONFIGS`, jamais écrits ici.
  const configs = providerConfigsFromSource();
  const keys: readonly AnswerEngineKey[] = ["gemini", "openai"];
  assert.equal(joinEngineLabels(keys, "fr"), `${configs.gemini.engine} et ${configs.openai.engine}`);
  assert.equal(joinEngineLabels(keys, "en"), `${configs.gemini.engine} and ${configs.openai.engine}`);
  assert.equal(joinEngineLabels(["gemini"], "fr"), configs.gemini.engine);
});
