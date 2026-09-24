/**
 * LE PLAN D'ACTIONS PARLE LE MÉTIER QUE LA LANDING VEND — LOT G.
 *
 * Suite directe du LOT F (23/09). Le LOT F a corrigé `buildFixes` ; il n'a PAS
 * touché `buildPlainActions`, qui rendait le bloc DTC — « Add FAQ and
 * product-page answers », « marketplaces, Trustpilot », en anglais, à
 * l'impératif — à TOUT segment autre que `local_independent` et
 * `creator_influencer`, donc aussi au `service_professional` créé la veille.
 *
 * CE PLAN N'EST PAS DÉCORATIF. Il est servi sur trois chemins payants ou
 * publics : `reportFromRow` (rapport rendu), `monitoringSnapshotFromRuns`
 * (suivi mensuel, persisté dans `raw_results` et ENVOYÉ PAR EMAIL depuis
 * `sendMonthlyMonitoringEmail`), et `generateGeoAgentAssetsFromAudit`
 * (`weeklyActionPlan`, rendu sur `/audit/[id]` payant et servi par
 * `/api/geo-agent-assets`).
 *
 * DEUXIÈME DÉFAUT, DE LA MÊME FAMILLE QUE `detectIcpSegment()` GELÉE : le champ
 * `raw_results.icpSegment` manquant recevait DEUX réponses différentes dans le
 * même fichier — `reportFromRow` recalculait `detectIcpSegment(category)`,
 * `monitoringSnapshotFromRuns` et `generateGeoAgentAssetsFromAudit` figeaient
 * `small_brand_ecommerce`. La même ligne d'audit rendait donc un plan de service
 * sur la page du rapport et un plan DTC dans son suivi mensuel.
 *
 * OÙ LA PREUVE S'ARRÊTE, dit en clair : `monitoringSnapshotFromRuns` et
 * `getAuditMonitoringSnapshot` ne sont pas exportés et lisent `pool`. Leur
 * couture est donc verrouillée ici SUR LA SOURCE relue en clair (précédent :
 * `checkout-links-static.test.ts`), pas par exécution. Ce qui est exercé par
 * exécution : le choix du segment, le défaut dérivé, la langue, la promesse.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildPlainActions,
  detectIcpSegment,
  type BuyerIntentPromptResult,
} from "@/lib/audit-engine";

const SOURCE = readFileSync(path.join(process.cwd(), "src/lib/audit-engine.ts"), "utf-8");

/** Questions telles qu'un cabinet les reçoit — formulées « quel métier pour qui ». */
function questionsCabinet(): BuyerIntentPromptResult[] {
  return [
    {
      prompt: "Quel expert-comptable à Bordeaux pour un freelance ?",
      available: true,
      brandMentioned: true,
      competitors: ["Dougs"],
      surfaces: [],
    },
    {
      prompt: "Meilleur cabinet d'expertise comptable pour une TPE à Lyon ?",
      available: true,
      brandMentioned: false,
      competitors: ["Keobiz", "Amarris Direct"],
      surfaces: [],
    },
  ];
}

// Les trois catégories réellement inférées en production le 23/09 sur les
// cabinets du CEO, plus les autres métiers de service que le produit sert.
const CATEGORIES_DE_SERVICE = ["accounting firm", "law firm", "architecture firm", "dentist"];

test("plan d'actions — un métier de service ne reçoit JAMAIS le plan DTC", () => {
  const dtc = buildPlainActions(questionsCabinet(), "DTC footwear brand", [], detectIcpSegment("DTC footwear brand"), "en");
  const titresDtc = new Set(dtc.map((action) => action.title));
  assert.equal(titresDtc.size, 3, "le plan DTC de référence doit rendre ses trois actions");

  for (const categorie of CATEGORIES_DE_SERVICE) {
    const segment = detectIcpSegment(categorie);
    assert.equal(segment.key, "service_professional", categorie);

    for (const locale of ["fr", "en"] as const) {
      const plan = buildPlainActions(questionsCabinet(), categorie, [], segment, locale);
      assert.equal(plan.length, 3, `${categorie}/${locale}`);
      // TEST D'ORIGINE, PAS DE FORME : le plan de service doit être DISJOINT du
      // plan DTC, titre par titre. Un ban de mots (« marketplace »,
      // « product page ») laisserait passer une table DTC reformulée — c'est
      // exactement la faute que la mutation MF3 du 23/09 a révélée.
      for (const action of plan) {
        assert.ok(
          !titresDtc.has(action.title),
          `${categorie}/${locale} — action du plan DTC servie à un métier de service : « ${action.title} »`
        );
      }
    }
  }
});

test("plan d'actions — il décrit ce que GETPICK fait, jamais un geste demandé au client", () => {
  // La landing en production jure « zéro geste technique ». Les trois actions
  // du plan DTC sont toutes des impératifs adressés au client (« Add… »,
  // « Create… », « Ask 3 customers… ») : servies à un cabinet, elles
  // contredisent l'offre vendue.
  for (const locale of ["fr", "en"] as const) {
    const plan = buildPlainActions(questionsCabinet(), "accounting firm", [], detectIcpSegment("accounting firm"), locale);
    for (const action of plan) {
      assert.match(action.title, /^GetPick\b/, `${locale} — le titre doit nommer qui fait le travail : « ${action.title} »`);
      assert.match(action.doThis, /GetPick/, `${locale} — « ${action.doThis} »`);
      assert.doesNotMatch(
        action.doThis,
        /^(Add|Create|Publish|Ask|Update|Refresh|Earn|Build|Maintain|Rewrite|Pitch|Collect|Ajoute|Crée|Publie|Demande)\b/,
        `${locale} — impératif adressé au client : « ${action.doThis} »`
      );
    }
  }
});

test("plan d'actions — les deux langues ne se recouvrent pas, et le français est servi en français", () => {
  const fr = buildPlainActions(questionsCabinet(), "accounting firm", [], detectIcpSegment("accounting firm"), "fr");
  const en = buildPlainActions(questionsCabinet(), "accounting firm", [], detectIcpSegment("accounting firm"), "en");
  assert.equal(fr.length, en.length);

  for (let index = 0; index < fr.length; index += 1) {
    assert.notEqual(fr[index].title, en[index].title, `titre identique dans les deux langues (rang ${index})`);
    assert.notEqual(fr[index].doThis, en[index].doThis, `texte identique dans les deux langues (rang ${index})`);
    assert.notEqual(fr[index].where, en[index].where, `« where » identique dans les deux langues (rang ${index})`);
  }
});

test("plan d'actions — le `basedOn` reste dérivé des questions réellement vérifiées", () => {
  // Même discipline que le plan DTC : une action sans question qui la soutient
  // reste sans `basedOn`, et aucun texte de question n'est fabriqué.
  const questions = questionsCabinet();
  const plan = buildPlainActions(questions, "accounting firm", [], detectIcpSegment("accounting firm"), "fr");
  const posees = questions.map((question) => question.prompt);

  for (const action of plan) {
    for (const source of action.basedOn ?? []) {
      assert.ok(posees.includes(source), `« ${source} » n'est pas une question de cet audit`);
    }
  }
  // La 3e action vise les questions où la marque n'est PAS citée : une seule ici.
  assert.deepEqual(plan[2].basedOn, ["Meilleur cabinet d'expertise comptable pour une TPE à Lyon ?"]);
});

test("segment omis — le défaut est DÉRIVÉ de la catégorie, jamais l'ICP d'avant le pivot", () => {
  // LA FAMILLE DE DÉFAUTS QUE CE LOT FERME. `detectIcpSegment()` a été fausse
  // 24 h le 22/09 précisément parce qu'elle ne prenait AUCUN argument : rien ne
  // pouvait la faire rougir. `buildPlainActions` portait la même maladie sous
  // une autre forme — un DÉFAUT DE PARAMÈTRE constant. Un appelant qui oubliait
  // le segment recevait le plan d'avant le pivot, en silence.
  const sansSegment = buildPlainActions(questionsCabinet(), "accounting firm", [], undefined, "fr");
  const avecSegment = buildPlainActions(questionsCabinet(), "accounting firm", [], detectIcpSegment("accounting firm"), "fr");
  assert.deepEqual(sansSegment, avecSegment, "segment omis : le plan doit être celui du métier inféré");

  // Et rien ne change pour l'ICP historique.
  const marque = buildPlainActions(questionsCabinet(), "DTC footwear brand", [], undefined, "en");
  assert.match(marque[0].title, /product-page/);
});

test("aucun défaut ICP gelé ne subsiste dans la chaîne d'audit", () => {
  // RECETTE DE LA LIGNE DE BACKLOG DU 23/09, exécutable : aucune fonction de la
  // chaîne ne doit rendre une valeur ICP sans l'avoir dérivée d'une donnée.
  // Deux formes bannies, ce sont les deux qui ont réellement existé :
  //   `= ICP_SEGMENTS.small_brand_ecommerce`  (défaut de paramètre)
  //   `?? ICP_SEGMENTS.small_brand_ecommerce` (repli d'un champ manquant)
  // Ce verrou se scope au fichier qu'il protège : la chaîne d'audit.
  const defauts = SOURCE.match(/=\s*ICP_SEGMENTS\.small_brand_ecommerce/g) ?? [];
  const replis = SOURCE.match(/\?\?\s*ICP_SEGMENTS\.small_brand_ecommerce/g) ?? [];
  assert.equal(
    defauts.length,
    0,
    "défaut de paramètre figé sur l'ICP d'avant le pivot : le défaut doit dériver de la catégorie"
  );
  assert.equal(
    replis.length,
    0,
    "repli figé sur l'ICP d'avant le pivot : un `icpSegment` manquant se recalcule par `detectIcpSegment(category)`"
  );
});

/**
 * Découpe les arguments de chaque appel `buildPlainActions(...)` du fichier, en
 * comptant les parenthèses — pas par regex. Le verrou qui suit a d'abord été
 * écrit comme un COMPTE (`>= 3` occurrences d'une expression de langue) : la
 * mutation MG4, qui retire la langue d'UN chemin, est passée VERTE, parce qu'il
 * en restait trois. *Un seuil avec du mou ne détecte pas la perte d'une unité.*
 */
function appelsBuildPlainActions(source: string): string[][] {
  const appels: string[][] = [];
  const marqueur = "buildPlainActions(";
  let index = source.indexOf(marqueur);

  while (index !== -1) {
    // La DÉFINITION de la fonction n'est pas un appel.
    const avant = source.slice(Math.max(0, index - 20), index);
    if (!/function\s*$/.test(avant)) {
      let profondeur = 0;
      let curseur = index + marqueur.length - 1;
      const debut = curseur + 1;

      do {
        const caractere = source[curseur];
        if (caractere === "(") profondeur += 1;
        else if (caractere === ")") profondeur -= 1;
        curseur += 1;
      } while (profondeur > 0 && curseur < source.length);

      const corps = source.slice(debut, curseur - 1);
      const args: string[] = [];
      let niveau = 0;
      let courant = "";

      for (const caractere of corps) {
        if ("([{".includes(caractere)) niveau += 1;
        if (")]}".includes(caractere)) niveau -= 1;
        if (caractere === "," && niveau === 0) {
          args.push(courant.trim());
          courant = "";
        } else {
          courant += caractere;
        }
      }
      if (courant.trim()) args.push(courant.trim());
      appels.push(args);
    }
    index = source.indexOf(marqueur, index + 1);
  }

  return appels;
}

test("chaque appel du plan d'actions passe un segment ET une langue LUS sur la ligne d'audit", () => {
  // La couture : `reportFromRow`, `monitoringSnapshotFromRuns` et
  // `generateGeoAgentAssetsFromAudit` lisent tous `raw_results.icpSegment` et
  // `raw_results.locale`. Avant ce lot, le premier recalculait le segment et les
  // deux autres figeaient le DTC ; aucun des trois ne lisait la langue.
  //
  // `monitoringSnapshotFromRuns` et `getAuditMonitoringSnapshot` ne sont pas
  // exportés et lisent `pool` : ce verrou-ci est donc SUR LA SOURCE, et il le
  // dit. Ce qui est exercé par exécution, c'est tout le reste de ce fichier.
  const appels = appelsBuildPlainActions(SOURCE);
  assert.ok(appels.length >= 4, `appels trouvés : ${appels.length}`);

  let avecCategorie = 0;

  for (const args of appels) {
    // Un appel sans catégorie (`emptyMonitoringSnapshot`) est légitime : ses
    // `actions` sont soit écrasées juste après par le spread appelant, soit
    // rendues pour un audit introuvable. Il ne doit simplement rien figer.
    if (args.length < 2) continue;
    avecCategorie += 1;

    assert.equal(args.length, 5, `appel incomplet — segment et langue requis : buildPlainActions(${args.join(", ")})`);
    assert.doesNotMatch(args[3], /ICP_SEGMENTS\.small_brand_ecommerce/, `segment figé sur l'ICP d'avant le pivot : ${args[3]}`);
    assert.doesNotMatch(
      args[4],
      /^"(fr|en)"$/,
      `langue écrite en dur au lieu d'être lue sur la ligne d'audit : ${args[4]}`
    );
    assert.match(args[4], /locale/i, `la langue doit dériver du champ \`locale\` de l'audit : ${args[4]}`);
  }

  assert.ok(avecCategorie >= 4, `appels porteurs d'une catégorie : ${avecCategorie}`);
});
