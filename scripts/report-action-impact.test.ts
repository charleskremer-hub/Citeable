/**
 * L'impact des actions du rapport (lot P2 « impact calculé + phase ») :
 * chaque fix affiché porte un impact DÉRIVÉ des données stockées de l'audit —
 * le recouvrement entre les questions qu'il adresse (`basedOn`) et les
 * questions d'achat PERDUES — jamais un rang d'affichage déguisé en mesure.
 * Quatre règles, chacune testée ici :
 *   - l'impact est reproductible depuis les questions stockées ;
 *   - le tri suit l'impact calculé, pas l'ordre d'arrivée ;
 *   - trois fixes maximum sortent, quoi qu'il arrive en entrée ;
 *   - sans donnée mesurable, le libellé est neutre et ne porte AUCUN chiffre.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { BuyerIntentPromptResult, PlainAction } from "@/lib/audit-engine";
import { auditCopy } from "@/lib/i18n";
import { MAX_DISPLAYED_ACTIONS, actionImpact, actionPhase, rankActionsByImpact } from "@/app/audit/[id]/report-insights";

function question(prompt: string, brandMentioned: boolean, competitors: string[] = []): BuyerIntentPromptResult {
  return {
    prompt,
    available: true,
    brandMentioned,
    competitors,
    surfaces: [
      {
        surface: "gemini",
        reachable: true,
        brandMentioned,
        competitors,
        rawAnswerSnippet: "",
        kind: "ai_engine",
        status: "checked",
        engine: "Gemini",
      },
    ],
  };
}

function action(title: string, basedOn?: string[]): PlainAction {
  return { title, doThis: "do this", where: "there", basedOn };
}

test("impact dérivé correct : le compte vient du recouvrement basedOn × questions perdues, à la casse et aux espaces près", () => {
  const questions = [
    question("meilleur savon solide bio", false, ["Typology"]),
    question("quel shampoing pour cuir chevelu sensible", false, ["Melvita"]),
    question("crème hydratante naturelle avis", true),
    { ...question("question jamais vérifiée", false), available: false },
  ];
  // Deux perdues adressées (dont une avec casse/espaces différents), une gagnée
  // (elle ne compte pas), une indisponible (elle ne compte pas non plus).
  const impact = actionImpact(
    action("Add FAQ and product-page answers", [
      "Meilleur savon solide  bio",
      "quel shampoing pour cuir chevelu sensible",
      "crème hydratante naturelle avis",
    ]),
    questions
  );

  assert.deepEqual(impact, { measured: true, addressedLostCount: 2, lostCount: 2 });
});

test("tri par impact décroissant : l'impact calculé commande, pas l'ordre d'arrivée", () => {
  const questions = [
    question("perdue-1", false),
    question("perdue-2", false),
    question("perdue-3", false),
  ];
  const ranked = rankActionsByImpact(
    [
      action("Ask 3 customers for product-specific reviews"), // sans donnée : dernier
      action("Earn listicle and review mentions", ["perdue-2"]), // 1 sur 3
      action("Add FAQ and product-page answers", ["perdue-1", "perdue-2", "perdue-3"]), // 3 sur 3 : premier
    ],
    questions
  );

  assert.deepEqual(
    ranked.map((item) => item.action.title),
    ["Add FAQ and product-page answers", "Earn listicle and review mentions", "Ask 3 customers for product-specific reviews"]
  );
  assert.deepEqual(ranked[0].impact, { measured: true, addressedLostCount: 3, lostCount: 3 });
  assert.deepEqual(ranked[1].impact, { measured: true, addressedLostCount: 1, lostCount: 3 });
  assert.deepEqual(ranked[2].impact, { measured: false });
});

test("3 fixes maximum affichés, même si l'audit en stocke davantage", () => {
  const questions = [question("perdue-1", false)];
  const ranked = rankActionsByImpact(
    [
      action("Action A"),
      action("Action B", ["perdue-1"]),
      action("Action C"),
      action("Action D", ["perdue-1"]),
      action("Action E"),
    ],
    questions
  );

  assert.equal(MAX_DISPLAYED_ACTIONS, 3);
  assert.equal(ranked.length, 3);
  // Et dans les 3 gardés, les mesurés passent devant les non mesurés.
  assert.deepEqual(
    ranked.map((item) => item.action.title),
    ["Action B", "Action D", "Action A"]
  );
});

test("aucune donnée → impact non mesuré, libellé neutre, AUCUN chiffre fabriqué", () => {
  // Cas 1 : l'action n'a pas de basedOn — rien à croiser.
  assert.deepEqual(actionImpact(action("Ask 3 customers for product-specific reviews"), [question("perdue-1", false)]), {
    measured: false,
  });
  // Cas 2 : aucune question perdue — rien à mesurer, on n'invente pas un « 0 sur 0 ».
  assert.deepEqual(actionImpact(action("Add FAQ and product-page answers", ["gagnée"]), [question("gagnée", true)]), {
    measured: false,
  });
  // Le libellé neutre ne contient aucun chiffre, dans les deux langues.
  assert.equal(auditCopy.fr.actionImpactUnmeasured, "Impact non mesuré");
  assert.equal(auditCopy.en.actionImpactUnmeasured, "Impact not measured");
  assert.ok(!/\d/.test(auditCopy.fr.actionImpactUnmeasured));
  assert.ok(!/\d/.test(auditCopy.en.actionImpactUnmeasured));
});

test("le libellé mesuré n'affiche que les deux nombres dérivés — pas de pourcentage, pas de promesse de gain", () => {
  assert.equal(auditCopy.fr.actionImpactMeasured(2, 5), "Adresse 2 des 5 questions d'achat perdues");
  assert.equal(auditCopy.en.actionImpactMeasured(2, 5), "Addresses 2 of the 5 lost buyer questions");
  assert.equal(auditCopy.fr.actionImpactMeasured(1, 1), "Adresse la seule question d'achat perdue");
  assert.equal(auditCopy.fr.actionImpactMeasured(0, 4), "N'adresse aucune des 4 questions d'achat perdues");

  for (const locale of ["fr", "en"] as const) {
    const label = auditCopy[locale].actionImpactMeasured(2, 5);
    assert.ok(!label.includes("%"), `pas de pourcentage dans « ${label} »`);
    assert.ok(!label.includes("+"), `pas de promesse de gain dans « ${label} »`);
  }
});

test("chaque action porte un tag de phase parmi les trois, libellé FR et EN", () => {
  const phases = [
    [actionPhase(action("Update Google Business Profile for local intent")), "foundations"],
    [actionPhase(action("Refresh professional directory profiles")), "foundations"],
    [actionPhase(action("Align social bios with the creator niche")), "foundations"],
    [actionPhase(action("Add FAQ and product-page answers")), "content"],
    [actionPhase(action("Create a 'why choose me' local proof page")), "content"],
    [actionPhase(action("Earn listicle and review mentions")), "authority"],
    [actionPhase(action("Ask 3 customers for product-specific reviews")), "authority"],
    [actionPhase(action("Get included in top-creator listicles")), "authority"],
    [actionPhase(action("Build press and entity proof")), "authority"],
    // Action inconnue : une phase par défaut, jamais un trou à l'écran.
    [actionPhase(action("Titre inédit jamais vu")), "content"],
  ] as const;

  for (const [computed, expected] of phases) assert.equal(computed, expected);

  assert.deepEqual(auditCopy.fr.actionPhase, { foundations: "Fondations", content: "Contenu", authority: "Autorité" });
  assert.deepEqual(auditCopy.en.actionPhase, { foundations: "Foundations", content: "Content", authority: "Authority" });
});
