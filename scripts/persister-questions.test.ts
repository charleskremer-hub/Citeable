import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

/**
 * LOT A de la commande du 20/09 — « PERSISTER LES QUESTIONS ».
 *
 * Le défaut : `generateBuyerIntentPromptsAI` tourne à `temperature: 0.7` et
 * était appelé à CHAQUE exécution, rescan compris. Deux audits de la même
 * marque ne posaient pas les mêmes questions, et `compareCompetitorMovement`
 * apparie les mois par le TEXTE de la question. Résultat vendu au client :
 * chaque rival annoncé comme « apparu ce mois-ci », tous les mois.
 *
 * Ce que ce fichier prouve, et ce qu'il ne prouve pas.
 *
 * - **Prouvé par exécution** : la décision (`planBuyerIntentPrompts`), la
 *   comparaison (`compareCompetitorMovement`), et les trois requêtes de
 *   stockage contre un `pool` doublé — la frontière technique, et elle seule,
 *   est doublée ; la doublure LÈVE sur toute requête inattendue.
 * - **Prouvé par lecture de la SOURCE** : le câblage dans `audit-engine.ts`
 *   (chargement avant le pipeline, écriture après l'upsert, rejeu sans appel
 *   Gemini). Entrer par la route demanderait un serveur Next ET Postgres ET
 *   des appels Gemini réels : hors de portée d'une suite unitaire. *Une
 *   fonction juste ne prouve pas que l'appel l'utilise* — c'est la forme des
 *   fautes des 14/09 et 16/09, d'où le verrou de source plutôt que rien.
 * - **NON prouvé** : qu'un vrai Postgres accepte le DDL, et qu'un vrai cycle
 *   de rescan repose les mêmes questions en production. La première preuve
 *   viendra du premier rescan après déploiement.
 */

const repoRoot = resolve(import.meta.dirname, "..");
const dbUrl = pathToFileURL(resolve(repoRoot, "src/lib/db.ts")).href;

type QueryCall = { text: string; params: unknown[] };

const queries: QueryCall[] = [];
let brandRows: Array<{ id: string }> = [];
let promptRows: Array<{ prompts: unknown; category: string; prompt_count: number }> = [];

mock.module(dbUrl, {
  namedExports: {
    ensureAuditSchema: async () => {},
    pool: {
      query: async (text: string, params: unknown[] = []) => {
        queries.push({ text, params });
        if (text.includes("FROM monitored_brands")) return { rows: brandRows };
        if (text.includes("FROM monitored_brand_prompts")) return { rows: promptRows };
        if (text.includes("INSERT INTO monitored_brand_prompts")) return { rows: [] };
        // La doublure LÈVE sur l'inattendu : une requête non prévue est un
        // changement de comportement, pas un détail à absorber en silence.
        throw new Error(`Requête inattendue dans la doublure : ${text.slice(0, 80)}`);
      },
    },
  },
});

const { planBuyerIntentPrompts, resolveBuyerIntentPromptSet, loadPromptSetForAudit, persistPromptSetAfterAudit, detectPromptSetAnomaly, findMonitoredBrandId, loadStoredPromptSet, saveStoredPromptSet } = await import("@/lib/stored-prompts");
const { compareCompetitorMovement } = await import("@/lib/audit-engine");

const engineSource = readFileSync(resolve(repoRoot, "src/lib/audit-engine.ts"), "utf8");
const dbSource = readFileSync(resolve(repoRoot, "src/lib/db.ts"), "utf8");
const BRAND_ID = "11111111-1111-4111-8111-111111111111";
const QUESTIONS = [
  "quelle marque de baskets vegan livre en 48h en france",
  "meilleure alternative durable aux sneakers de sport",
  "quelles baskets écoresponsables sous 120 euros",
];

function reset() {
  queries.length = 0;
  brandRows = [];
  promptRows = [];
}

/** Un résultat de sondage minimal — seuls `prompt`, `brandMentioned` et `competitors` sont lus par la comparaison. */
function promptResult(prompt: string, competitors: string[], brandMentioned = true) {
  return { prompt, available: true, brandMentioned, competitors, surfaces: [] };
}

/* ------------------------------------------------------------------ *
 * 1. LA DÉCISION — régénération sur déclencheur explicite, jamais en silence
 * ------------------------------------------------------------------ */

test("marque neuve (aucun jeu stocké) — régénère, motif `new_brand`", () => {
  const plan = planBuyerIntentPrompts(null, { category: "sneakers", count: 12 });
  assert.equal(plan.action, "regenerate");
  assert.equal(plan.reason, "new_brand");
});

test("jeu stocké vide — régénère, et ne rejoue JAMAIS une liste vide", () => {
  const plan = planBuyerIntentPrompts({ prompts: [], category: "sneakers", count: 12 }, { category: "sneakers", count: 12 });
  assert.equal(plan.action, "regenerate");
  assert.equal(plan.reason, "new_brand");
  assert.deepEqual(plan.prompts, []);
});

test("changement de catégorie — régénère, motif `category_changed`", () => {
  const plan = planBuyerIntentPrompts({ prompts: QUESTIONS, category: "sneakers", count: 12 }, { category: "cosmetiques", count: 12 });
  assert.equal(plan.action, "regenerate");
  assert.equal(plan.reason, "category_changed");
});

test("changement de compte (tier) — régénère, motif `tier_changed` et non un rejeu partiel", () => {
  const plan = planBuyerIntentPrompts({ prompts: QUESTIONS, category: "sneakers", count: 6 }, { category: "sneakers", count: 12 });
  assert.equal(plan.action, "regenerate");
  assert.equal(plan.reason, "tier_changed");
});

test("demande du client — régénère MÊME avec un jeu stocké valide, motif `client_request`", () => {
  const plan = planBuyerIntentPrompts({ prompts: QUESTIONS, category: "sneakers", count: 12 }, { category: "sneakers", count: 12, force: true });
  assert.equal(plan.action, "regenerate");
  assert.equal(plan.reason, "client_request");
});

test("aucun déclencheur — rejoue TELLES QUELLES, contenu ET ordre, sans muter le jeu stocké", () => {
  const stored = { prompts: QUESTIONS, category: "sneakers", count: 12 };
  const plan = planBuyerIntentPrompts(stored, { category: "sneakers", count: 12 });
  assert.equal(plan.action, "replay");
  assert.equal(plan.reason, "stored");
  assert.deepEqual(plan.prompts, QUESTIONS);
  plan.prompts.push("question injectée par un appelant négligent");
  assert.equal(stored.prompts.length, 3, "le jeu stocké a été muté par l'appelant");
});

/* ------------------------------------------------------------------ *
 * 2. LA COMPARAISON — une question sans historique ne produit AUCUN mouvement
 * ------------------------------------------------------------------ */

test("question ABSENTE du run précédent — zéro mouvement, ni `new_competitor` ni `overtook_brand`", () => {
  const movements = compareCompetitorMovement(
    [promptResult("question neuve jamais posée", ["Veja", "Allbirds"], false)],
    [promptResult("une tout autre question", ["Veja"])]
  );
  assert.deepEqual(movements, [], "une question neuve n'a pas d'historique : elle ne peut rien annoncer");
});

test("question PRÉSENTE aux deux runs — un rival réellement nouveau est annoncé, un rival déjà là ne l'est pas", () => {
  const movements = compareCompetitorMovement(
    [promptResult(QUESTIONS[0], ["Veja", "Allbirds"])],
    [promptResult(QUESTIONS[0], ["Veja"])]
  );
  assert.equal(movements.length, 1);
  assert.equal(movements[0].competitor, "Allbirds");
  assert.equal(movements[0].type, "new_competitor");
});

test("l'appariement est insensible à la casse et aux espaces, comme `normalizePromptKey`", () => {
  const movements = compareCompetitorMovement(
    [promptResult("  QUELLE   Marque De Baskets  ", ["Veja"])],
    [promptResult("quelle marque de baskets", ["veja"])]
  );
  assert.deepEqual(movements, []);
});

/* ------------------------------------------------------------------ *
 * 3. LA NON-RÉGRESSION DEMANDÉE PAR LA COMMANDE (critère 4)
 * ------------------------------------------------------------------ */

test("deux exécutions successives d'une marque surveillée : questions IDENTIQUES et ZÉRO new_competitor à réponses inchangées", async () => {
  reset();

  // Cycle 1 — marque neuve : régénération, puis stockage du jeu.
  const cycle1 = planBuyerIntentPrompts(null, { category: "sneakers", count: 12 });
  assert.equal(cycle1.action, "regenerate");
  brandRows = [{ id: BRAND_ID }];
  await saveStoredPromptSet(BRAND_ID, { prompts: QUESTIONS, category: "sneakers", count: 12 });

  // Le stockage a bien reçu la liste complète, dans l'ordre.
  const insert = queries.find((call) => call.text.includes("INSERT INTO monitored_brand_prompts"));
  assert.ok(insert, "aucune écriture du jeu de questions");
  assert.deepEqual(JSON.parse(String(insert.params[1])), QUESTIONS);

  // Cycle 2 — le moteur relit et rejoue. AUCUNE régénération.
  promptRows = [{ prompts: QUESTIONS, category: "sneakers", prompt_count: 12 }];
  const stored = await loadStoredPromptSet(BRAND_ID);
  const cycle2 = planBuyerIntentPrompts(stored, { category: "sneakers", count: 12 });
  assert.equal(cycle2.action, "replay");
  assert.deepEqual(cycle2.prompts, QUESTIONS, "le cycle 2 doit reposer exactement les questions stockées au cycle 1");

  // Réponses inchangées d'un cycle à l'autre ⇒ aucun mouvement annoncé.
  const answers = QUESTIONS.map((question) => promptResult(question, ["Veja", "Allbirds"]));
  assert.deepEqual(compareCompetitorMovement(answers, answers), []);
});

test("le défaut d'origine, reproduit : questions régénérées ⇒ tous les rivaux annoncés « apparus »", () => {
  // Ce test décrit le comportement QUE LE LOT SUPPRIME, sur des questions
  // différentes d'un cycle à l'autre. Il échouerait si la correction était
  // retirée — et il documente ce que le client recevait.
  const before = QUESTIONS.map((question) => promptResult(question, ["Veja", "Allbirds"]));
  const regenerated = QUESTIONS.map((question) => promptResult(`${question} (reformulée par le modèle)`, ["Veja", "Allbirds"]));
  assert.deepEqual(compareCompetitorMovement(regenerated, before), [], "des questions régénérées ne doivent plus produire le moindre mouvement");
});

/* ------------------------------------------------------------------ *
 * 4. LE STOCKAGE — trois requêtes, contre un `pool` doublé
 * ------------------------------------------------------------------ */

test("`findMonitoredBrandId` cherche sur le triplet (email, marque, url) et rend null quand la marque n'est pas surveillée", async () => {
  reset();
  assert.equal(await findMonitoredBrandId("a@b.c", "Acme", "https://acme.com"), null);
  assert.deepEqual(queries[0].params, ["a@b.c", "Acme", "https://acme.com"]);

  brandRows = [{ id: BRAND_ID }];
  assert.equal(await findMonitoredBrandId("a@b.c", "Acme", "https://acme.com"), BRAND_ID);
});

test("`loadStoredPromptSet` : absence de ligne ⇒ null, et JSONB corrompu ⇒ null (jamais un jeu vide)", async () => {
  reset();
  assert.equal(await loadStoredPromptSet(BRAND_ID), null);

  promptRows = [{ prompts: { pas: "une liste" }, category: "sneakers", prompt_count: 12 }];
  assert.equal(await loadStoredPromptSet(BRAND_ID), null, "une ligne corrompue doit régénérer, pas éteindre les questions");

  promptRows = [{ prompts: QUESTIONS, category: "sneakers", prompt_count: 12 }];
  assert.deepEqual(await loadStoredPromptSet(BRAND_ID), { prompts: QUESTIONS, category: "sneakers", count: 12 });
});

test("`saveStoredPromptSet` refuse d'écrire un jeu vide — aucune requête émise", async () => {
  reset();
  await saveStoredPromptSet(BRAND_ID, { prompts: [], category: "sneakers", count: 12 });
  assert.equal(queries.length, 0, "écrire un jeu vide rendrait la marque définitivement muette");
});

test("`saveStoredPromptSet` est un upsert sur la clé de marque — un deuxième appel écrase sans doubler la ligne", async () => {
  reset();
  await saveStoredPromptSet(BRAND_ID, { prompts: QUESTIONS, category: "sneakers", count: 12 });
  const text = queries[0].text;
  assert.match(text, /ON CONFLICT \(monitored_brand_id\) DO UPDATE/);
  assert.equal(queries[0].params[0], BRAND_ID);
});

/* ------------------------------------------------------------------ *
 * 5. LE CÂBLAGE — lu dans la SOURCE, parce qu'il n'est pas exécutable ici
 * ------------------------------------------------------------------ */

/* -- l'orchestration, EXÉCUTABLE avec des doublures (écrit après l'audit
      adversarial du 21/09, qui a trouvé trois contournements dans exactement
      cette logique, tous invisibles pour un verrou de source) -- */

const CTX = { auditTier: "monitor_9eur", email: "a@b.c", brandName: "Acme", websiteUrl: "https://acme.com" };
const SET = { prompts: QUESTIONS, category: "sneakers", count: 12 };

function loadDeps(overrides: Partial<{ found: string | null; stored: typeof SET | null }> = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      findMonitoredBrandId: async () => { calls.push("find"); return overrides.found === undefined ? BRAND_ID : overrides.found; },
      loadStoredPromptSet: async () => { calls.push("load"); return overrides.stored === undefined ? SET : overrides.stored; },
    },
  };
}

test("chargement : une marque surveillée reçoit son jeu stocké", async () => {
  const { calls, deps } = loadDeps();
  const out = await loadPromptSetForAudit(CTX, deps);
  assert.equal(out.monitoredBrandId, BRAND_ID);
  assert.deepEqual(out.storedPromptSet, SET);
  assert.deepEqual(calls, ["find", "load"]);
});

test("chargement : le tier GRATUIT ne touche pas la base du tout", async () => {
  const { calls, deps } = loadDeps();
  const out = await loadPromptSetForAudit({ ...CTX, auditTier: "free" }, deps);
  assert.deepEqual(out, { monitoredBrandId: null, storedPromptSet: null });
  assert.deepEqual(calls, [], "un audit gratuit n'a pas de marque surveillée : aucune requête ne doit partir");
});

test("chargement : inverser le test de tier priverait les marques PAYANTES de leur jeu", async () => {
  // Contournement C1 de l'audit du 21/09 : `auditTier !== "free"` changé en
  // `===`. Cette jambe tombe alors, là où le verrou de source ne voyait rien.
  const { deps } = loadDeps();
  const paid = await loadPromptSetForAudit(CTX, deps);
  const free = await loadPromptSetForAudit({ ...CTX, auditTier: "free" }, deps);
  assert.ok(paid.storedPromptSet !== null && free.storedPromptSet === null, "c'est le tier PAYANT qui doit charger, pas le gratuit");
});

test("chargement : marque pas encore surveillée ⇒ null, sans relire un jeu inexistant", async () => {
  const { calls, deps } = loadDeps({ found: null });
  const out = await loadPromptSetForAudit(CTX, deps);
  assert.deepEqual(out, { monitoredBrandId: null, storedPromptSet: null });
  assert.deepEqual(calls, ["find"]);
});

function saveDeps(found: string | null = BRAND_ID) {
  const saves: Array<{ id: string; set: unknown }> = [];
  return {
    saves,
    deps: {
      findMonitoredBrandId: async () => found,
      saveStoredPromptSet: async (id: string, set: unknown) => { saves.push({ id, set }); },
    },
  };
}

test("écriture : un jeu GÉNÉRÉ est persisté", async () => {
  const { saves, deps } = saveDeps();
  const out = await persistPromptSetAfterAudit({ ...CTX, monitoredBrandId: BRAND_ID }, { promptSet: SET, promptSetSource: "generated" }, deps);
  assert.deepEqual(out, { saved: true, reason: "saved" });
  assert.equal(saves.length, 1);
  assert.equal(saves[0].id, BRAND_ID);
});

test("écriture : un jeu REJOUÉ n'est pas réécrit", async () => {
  const { saves, deps } = saveDeps();
  const out = await persistPromptSetAfterAudit({ ...CTX, monitoredBrandId: BRAND_ID }, { promptSet: SET, promptSetSource: "stored" }, deps);
  assert.deepEqual(out, { saved: false, reason: "replayed" });
  assert.equal(saves.length, 0);
});

test("écriture : désactiver la garde ferait réécrire à chaque cycle — la jambe le voit", async () => {
  // Contournement C2 de l'audit : `&& false` ajouté à la garde. Le verdict
  // rendu (`saved`/`reason`) rend la différence OBSERVABLE, là où un `void`
  // laissait passer.
  const { deps } = saveDeps();
  const gen = await persistPromptSetAfterAudit({ ...CTX, monitoredBrandId: BRAND_ID }, { promptSet: SET, promptSetSource: "generated" }, deps);
  const rep = await persistPromptSetAfterAudit({ ...CTX, monitoredBrandId: BRAND_ID }, { promptSet: SET, promptSetSource: "stored" }, deps);
  assert.ok(gen.saved && !rep.saved, "généré ⇒ écrit, rejoué ⇒ pas écrit ; toute autre combinaison casse le lot");
});

test("écriture : PREMIER audit payant — la marque n'existait pas avant le pipeline, elle est re-cherchée après l'upsert", async () => {
  const { saves, deps } = saveDeps(BRAND_ID);
  const out = await persistPromptSetAfterAudit({ ...CTX, monitoredBrandId: null }, { promptSet: SET, promptSetSource: "generated" }, deps);
  assert.deepEqual(out, { saved: true, reason: "saved" });
  assert.equal(saves[0].id, BRAND_ID, "sans ce second passage, le tout premier cycle ne stockerait rien");
});

test("écriture : tier gratuit et jeu absent ⇒ verdicts distincts, jamais une écriture", async () => {
  const { saves, deps } = saveDeps();
  assert.deepEqual(await persistPromptSetAfterAudit({ ...CTX, auditTier: "free", monitoredBrandId: BRAND_ID }, { promptSet: SET, promptSetSource: "generated" }, deps), { saved: false, reason: "free_tier" });
  assert.deepEqual(await persistPromptSetAfterAudit({ ...CTX, monitoredBrandId: BRAND_ID }, { promptSetSource: "generated" }, deps), { saved: false, reason: "no_prompt_set" });
  assert.equal(saves.length, 0);
});

test("invariant observable : un jeu chargé qui revient « régénéré » est une anomalie NOMMÉE", async () => {
  // Contournement C3 de l'audit : `args.storedPromptSet` jeté dans `runAudit`.
  // Cette ligne n'est atteignable ni par un test unitaire (réseau + base), ni
  // par un verrou de source robuste. Elle reçoit donc un invariant
  // OBSERVABLE : la contradiction est écrite dans l'audit de production.
  assert.equal(detectPromptSetAnomaly(null, { promptSetSource: "generated" }), null, "aucun jeu chargé : régénérer est normal");
  assert.equal(detectPromptSetAnomaly(SET, { promptSetSource: "stored" }), null, "jeu chargé et rejoué : normal");
  const anomaly = detectPromptSetAnomaly(SET, { promptSetSource: "generated", promptDebug: "ai:12|regen:new_brand" });
  assert.ok(anomaly && anomaly.includes("3") && anomaly.includes("generated"), "l'anomalie doit nommer ce qui a été chargé et ce qui est revenu");
  assert.match(engineSource, /promptSetAnomaly: detectPromptSetAnomaly\(storedPromptSet, report\),/, "l'invariant doit être écrit dans raw_results, sinon il n'est pas observable");
});

test("le jeu rendu est GELÉ : on ne peut plus le réécrire après le sondage", async () => {
  // Contournement C4 de l'audit : `resolved.promptSet.prompts = probed...`
  // satisfaisait toutes les assertions de source tout en rétablissant la
  // faute. Sur un objet gelé, en module ES (mode strict), l'affectation LÈVE.
  const resolved = await resolveBuyerIntentPromptSet(null, { category: "sneakers", count: 12 }, async () => ({ prompts: QUESTIONS, promptDebug: "ai:3" }));
  assert.ok(Object.isFrozen(resolved.promptSet));
  assert.throws(() => { (resolved.promptSet as { prompts: string[] }).prompts = ["tronquée"]; }, TypeError);
  assert.deepEqual(resolved.promptSet.prompts, QUESTIONS);
});

test("le moteur appelle bien l'orchestration, et une seule fois chacune", () => {
  assert.equal((engineSource.match(/await loadPromptSetForAudit\(/g) ?? []).length, 1);
  assert.equal((engineSource.match(/await persistPromptSetAfterAudit\(/g) ?? []).length, 1);
  assert.equal((engineSource.match(/generateBuyerIntentPromptsAI\(brandName, websiteUrl, category/g) ?? []).length, 1, "un second site d'appel à la génération contournerait la décision de rejeu");
  assert.ok(
    engineSource.indexOf("await loadPromptSetForAudit(") < engineSource.indexOf("const report = await runAudit({"),
    "charger après le pipeline ne servirait à rien : les questions sont déjà posées"
  );
  assert.ok(
    engineSource.indexOf("await upsertMonitoredBrandForAudit(auditId);") < engineSource.indexOf("await persistPromptSetAfterAudit("),
    "au tout premier audit payant la ligne de marque n'existe pas encore"
  );
});

test("un rejeu n'appelle JAMAIS la génération — prouvé par une doublure qui lève, pas par lecture de la source", async () => {
  const resolved = await resolveBuyerIntentPromptSet({ prompts: QUESTIONS, category: "sneakers", count: 12 }, { category: "sneakers", count: 12 }, async () => {
    throw new Error("la génération a été appelée alors que le jeu stocké devait être rejoué");
  });

  assert.equal(resolved.promptSetSource, "stored");
  assert.deepEqual(resolved.promptSet.prompts, QUESTIONS);
  assert.equal(resolved.promptDebug, "stored:3");
});

test("une régénération appelle la génération UNE fois et inscrit son motif dans `promptDebug`", async () => {
  let calls = 0;
  const resolved = await resolveBuyerIntentPromptSet(null, { category: "sneakers", count: 12 }, async () => {
    calls += 1;
    return { prompts: QUESTIONS, promptDebug: "ai:3" };
  });

  assert.equal(calls, 1);
  assert.equal(resolved.promptSetSource, "generated");
  assert.equal(resolved.promptDebug, "ai:3|regen:new_brand", "une régénération sans motif enregistré est une régénération silencieuse");
});

test("le jeu persisté est la liste rendue par la génération, AVANT tout sondage — jamais une liste tronquée", async () => {
  const resolved = await resolveBuyerIntentPromptSet(null, { category: "sneakers", count: 12 }, async () => ({ prompts: QUESTIONS, promptDebug: "ai:3" }));
  assert.deepEqual(resolved.promptSet.prompts, QUESTIONS);
  assert.equal(resolved.promptSet.count, 12);
  assert.equal(resolved.promptSet.category, "sneakers");
  // Le moteur sonde `resolved.prompts` et persiste `resolved.promptSet` : la
  // troncature de la règle d'arrêt se produit APRÈS, sur une autre valeur — et
  // l'objet est gelé, donc elle ne peut plus être réécrite dedans après coup.
  assert.match(engineSource, /await probeBuyerIntentPrompts\(resolved\.prompts, brandName, domain, tier\)/);
  assert.match(engineSource, /promptSet: resolved\.promptSet,/);
});

test("le moteur passe bien par la couture injectable — il ne rappelle pas le plan dans son coin", () => {
  assert.match(engineSource, /await resolveBuyerIntentPromptSet\(storedPromptSet, \{ category, count, force: forcePromptRegeneration \}, async \(\) => \{/);
  assert.equal(
    (engineSource.match(/generateBuyerIntentPromptsAI\(brandName, websiteUrl, category/g) ?? []).length,
    1,
    "un second site d'appel à la génération contournerait la décision de rejeu"
  );
});

test("la table de stockage existe dans le schéma et se détruit avec sa marque", () => {
  assert.match(dbSource, /CREATE TABLE IF NOT EXISTS monitored_brand_prompts/);
  assert.match(dbSource, /REFERENCES monitored_brands \(id\) ON DELETE CASCADE/);
  assert.match(dbSource, /monitored_brand_id UUID PRIMARY KEY/, "une marque ne doit porter qu'un seul jeu de questions");
});
