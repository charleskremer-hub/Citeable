/**
 * LE SUIVI MENSUEL D'UN AUDIT D'AVANT LE PIVOT NE PART PLUS AVEC LE SEGMENT
 * D'AVANT LE PIVOT — LOT H.
 *
 * Suite directe du LOT G (24/09), qui a unifié le REPLI des trois chemins de
 * lecture sur `detectIcpSegment(category)`. Ce repli ne s'applique qu'aux
 * lignes où `raw_results.icpSegment` est ABSENT. Or `runAudit` écrit ce champ
 * sur CHAQUE audit complété (`icpSegment: report.icpSegment`) : une ligne
 * écrite avant le déploiement du LOT F le porte donc PRÉSENT et égal au défaut
 * d'avant le pivot — y compris les trois cabinets audités par le CEO le 23/09,
 * qui sont ressortis `small_brand_ecommerce` avec des correctifs parlant de
 * product pages et de marketplaces.
 *
 * CE QUE ÇA COÛTE : le suivi mensuel est persisté dans `raw_results` ET envoyé
 * par email (`sendMonthlyMonitoringEmail`). Un cabinet audité avant le
 * déploiement recevrait un plan DTC, en anglais, à l'impératif, INDÉFINIMENT,
 * jusqu'à un re-audit. Le compteur visé est `email_captured.human` : un
 * prospect dont le second rapport se trompe de métier ne laisse pas son
 * adresse.
 *
 * LA DÉCISION, ÉCRITE UNE FOIS ET VALABLE POUR LES TROIS CHEMINS : le segment
 * est une valeur DÉRIVÉE de la catégorie. Quand la valeur stockée est le défaut
 * d'avant le pivot ET que la catégorie de la MÊME ligne dit autre chose, la
 * valeur stockée est une dérivation périmée, pas un choix — on la recalcule.
 * La réconciliation est À SENS UNIQUE : un segment stocké non-DTC n'est jamais
 * remplacé. C'est ce qui empêche ce lot de réécrire un rapport déjà servi dans
 * un sens que personne n'a demandé.
 *
 * OÙ LA PREUVE S'ARRÊTE, dit en clair : `reportFromRow`,
 * `monitoringSnapshotFromRuns` et `generateGeoAgentAssetsFromAudit` ne sont pas
 * exportés (les deux derniers lisent `pool`). Leur couture est verrouillée ici
 * SUR LA SOURCE relue en clair, pas par exécution. Ce qui est exercé par
 * exécution : `resolveIcpSegment` elle-même, et le plan qu'elle fait servir.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildPlainActions,
  detectIcpSegment,
  resolveIcpSegment,
  type BuyerIntentPromptResult,
  type IcpSegmentMetadata,
} from "@/lib/audit-engine";

const SOURCE = readFileSync(path.join(process.cwd(), "src/lib/audit-engine.ts"), "utf-8");

/** Ce que porte une ligne `audits` écrite AVANT le déploiement du LOT F. */
const SEGMENT_STOCKE_AVANT_PIVOT: IcpSegmentMetadata = detectIcpSegment("DTC footwear brand");

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
      competitors: ["Keobiz"],
      surfaces: [],
    },
  ];
}

test("segment périmé — une ligne d'avant le pivot dont la catégorie est un métier de service est réconciliée", () => {
  assert.equal(SEGMENT_STOCKE_AVANT_PIVOT.key, "small_brand_ecommerce", "prémisse du test");

  for (const categorie of ["accounting firm", "law firm", "architecture firm", "dentist"]) {
    const resolu = resolveIcpSegment(SEGMENT_STOCKE_AVANT_PIVOT, categorie);
    assert.equal(
      resolu.key,
      "service_professional",
      `${categorie} — une ligne d'avant le pivot doit être réconciliée, pas reconduite`
    );
  }
});

test("segment périmé — la réconciliation est À SENS UNIQUE : rien d'autre ne bouge", () => {
  // 1. Une ligne DTC avec une catégorie DTC : inchangée, à l'identité près.
  const dtc = resolveIcpSegment(SEGMENT_STOCKE_AVANT_PIVOT, "DTC footwear brand");
  assert.equal(dtc, SEGMENT_STOCKE_AVANT_PIVOT, "une ligne DTC légitime ne doit pas être touchée");

  // 2. Une ligne DTC sans catégorie lisible : inchangée. `detectIcpSegment`
  //    rendrait le défaut DTC de toute façon, mais on ne s'en remet pas à ça —
  //    on veut la valeur STOCKÉE, pour qu'un futur changement de défaut ne
  //    réécrive pas des lignes en silence.
  for (const categorie of [undefined, null, "", "unknown"]) {
    assert.equal(
      resolveIcpSegment(SEGMENT_STOCKE_AVANT_PIVOT, categorie),
      SEGMENT_STOCKE_AVANT_PIVOT,
      `catégorie ${JSON.stringify(categorie)} — rien à réconcilier`
    );
  }

  // 3. Un segment stocké NON-DTC n'est JAMAIS remplacé, même si la catégorie
  //    de la ligne n'est plus reconnue comme un métier de service (cas réel du
  //    jour où `SERVICE_CATEGORIES` bougera). Un rapport déjà servi ne se
  //    dégrade pas après coup.
  const service = detectIcpSegment("accounting firm");
  assert.equal(service.key, "service_professional", "prémisse du test");
  assert.equal(resolveIcpSegment(service, "DTC footwear brand"), service);
  assert.equal(resolveIcpSegment(service, undefined), service);

  // 4. Champ absent : le comportement du LOT G, inchangé.
  assert.deepEqual(resolveIcpSegment(undefined, "accounting firm"), detectIcpSegment("accounting firm"));
  assert.deepEqual(resolveIcpSegment(null, "DTC footwear brand"), detectIcpSegment("DTC footwear brand"));
});

test("segment périmé — le plan servi à la ligne réconciliée est celui du métier, pas celui du DTC", () => {
  // Bout en bout sur ce qui sort réellement : le suivi mensuel d'un cabinet
  // audité avant le déploiement ne doit plus contenir une seule action du plan
  // DTC. Test d'ORIGINE, titre par titre — pas un ban de mots, qui laisserait
  // passer une table DTC reformulée.
  const titresDtc = new Set(
    buildPlainActions(questionsCabinet(), "DTC footwear brand", [], SEGMENT_STOCKE_AVANT_PIVOT, "en").map(
      (action) => action.title
    )
  );
  assert.equal(titresDtc.size, 3, "le plan DTC de référence doit rendre ses trois actions");

  for (const locale of ["fr", "en"] as const) {
    const plan = buildPlainActions(
      questionsCabinet(),
      "accounting firm",
      [],
      resolveIcpSegment(SEGMENT_STOCKE_AVANT_PIVOT, "accounting firm"),
      locale
    );
    assert.equal(plan.length, 3, locale);
    for (const action of plan) {
      assert.ok(
        !titresDtc.has(action.title),
        `${locale} — action du plan DTC servie à un cabinet audité avant le pivot : « ${action.title} »`
      );
      assert.match(action.title, /^GetPick\b/, `${locale} — « ${action.title} »`);
    }
  }
});

/**
 * Découpe les arguments d'un appel dont on connaît le nom, en comptant les
 * parenthèses — jamais par regex. Même instrument que le LOT G : un verrou qui
 * interroge une QUANTITÉ au lieu d'une STRUCTURE est un verrou qui a l'air d'un
 * verrou (MG4 du 24/09, passée verte sur un seuil `>= 3`).
 */
function appelsDe(nom: string, source: string): string[][] {
  const appels: string[][] = [];
  const marqueur = `${nom}(`;
  let index = source.indexOf(marqueur);

  while (index !== -1) {
    const avant = source.slice(Math.max(0, index - 30), index);
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

test("aucun chemin ne lit `icpSegment` sans le réconcilier, et les trois le font pareil", () => {
  // LA RÉGRESSION QUE CE VERROU ATTRAPE : un quatrième chemin de lecture ajouté
  // demain avec un `?? detectIcpSegment(...)`, qui reconduirait en silence le
  // segment d'avant le pivot — c'est-à-dire exactement la forme que le LOT G
  // avait laissée derrière lui.
  const lectures = SOURCE.match(/raw_results\??\.\s*icpSegment/g) ?? [];
  assert.ok(lectures.length >= 3, `lectures de \`raw_results.icpSegment\` trouvées : ${lectures.length}`);

  const replis = SOURCE.match(/raw_results\??\.\s*icpSegment\s*\?\?/g) ?? [];
  assert.equal(
    replis.length,
    0,
    "un `??` ne voit pas un champ PRÉSENT et périmé : toute lecture de `icpSegment` passe par `resolveIcpSegment`"
  );

  // Chaque appel de réconciliation passe la valeur stockée ET une catégorie
  // LUE SUR LA MÊME LIGNE — réconcilier avec la catégorie d'une autre ligne
  // serait pire que ne rien faire.
  const appels = appelsDe("resolveIcpSegment", SOURCE);
  assert.equal(appels.length, 3, `appels de \`resolveIcpSegment\` : ${appels.length} (attendu 3, un par chemin de lecture)`);

  for (const args of appels) {
    assert.equal(args.length, 2, `appel incomplet : resolveIcpSegment(${args.join(", ")})`);
    assert.match(args[0], /icpSegment/, `le 1er argument doit être la valeur stockée : ${args[0]}`);
    assert.doesNotMatch(args[1], /^"[^"]*"$/, `catégorie écrite en dur au lieu d'être lue sur la ligne : ${args[1]}`);
    assert.match(args[1], /categor/i, `le 2e argument doit être la catégorie de la ligne : ${args[1]}`);
  }
});
