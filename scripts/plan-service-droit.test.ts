// Un client qui paie le plan vendu doit RECEVOIR quelque chose.
//
// POURQUOI CE FICHIER EXISTE (22/09/2026). Charles demande de configurer Stripe
// pour encaisser le plan unique à 69 €. En allant lire le webhook avant de
// toucher au dashboard : `planFromStripeObject` n'acceptait que `monitor_9eur`
// et `agent_19eur`. Un abonnement créé pour la nouvelle offre serait rentré avec
// `plan = null` — Stripe encaisse tous les mois, `subscriptions` ne porte aucun
// droit, et le client garde la porte de paiement devant son propre rapport.
//
// Le défaut n'aurait été visible qu'APRÈS le premier paiement, c'est-à-dire au
// pire endroit possible : sur le premier client. C'est la raison d'être de ce
// fichier — le lien de paiement ne doit pas exister avant que ce code tourne.
//
// Ce que ce test NE couvre PAS, et il faut le dire : ni Stripe, ni la base, ni
// la route de webhook. Il couvre la LECTURE d'un objet Stripe et la traduction
// plan -> tier. Le chemin complet ne sera exercé que par un vrai paiement.
//
// Fonctions pures, ZÉRO réseau, ZÉRO base. Lancer : npm test  (Node >= 23.6).
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { planFromStripeObject, type EntitlementPlan } from "@/lib/stripe-webhook";
import { ANSWER_ENGINE_KEYS_BY_TIER, BUYER_QUESTION_COUNT_BY_TIER, RECHECK_INTERVAL_DAYS } from "@/lib/plan-promises";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...segments: string[]) => readFileSync(resolve(repoRoot, ...segments), "utf8");
const subscriptionsSource = read("src", "lib", "subscriptions.ts");
const webhookSource = read("src", "lib", "stripe-webhook.ts");
const llmsTxtFlat = read("public", "llms.txt").replace(/\s+/g, " ");

// --- 1. le webhook reconnaît le plan vendu ----------------------------------

test("webhook — `service` est reconnu depuis la métadonnée de l'abonnement", () => {
  assert.equal(planFromStripeObject({ metadata: { getpick_plan: "service" } }), "service");
});

test("webhook — `service` est reconnu depuis la métadonnée du PRIX", () => {
  // C'est le chemin réel d'un Payment Link : la métadonnée est posée sur le
  // prix, et l'abonnement créé n'en porte pas forcément.
  const subscription = { items: { data: [{ price: { id: "price_inconnu", metadata: { getpick_plan: "service" } } }] } };
  assert.equal(planFromStripeObject(subscription), "service");
});

test("webhook — un libellé inconnu reste `null`, jamais un droit par défaut", () => {
  assert.equal(planFromStripeObject({ metadata: { getpick_plan: "premium" } }), null);
  assert.equal(planFromStripeObject({}), null);
});

test("webhook — les deux anciens plans restent reconnus (droits déjà vendus)", () => {
  assert.equal(planFromStripeObject({ metadata: { getpick_plan: "monitor_9eur" } }), "monitor_9eur");
  assert.equal(planFromStripeObject({ metadata: { getpick_plan: "agent_19eur" } }), "agent_19eur");
});

// --- 2. chaque plan reconnu a un tier servi ---------------------------------

/** L'union réelle, lue en source : une liste recopiée ici périmerait en silence. */
function declaredPlans(): string[] {
  const union = webhookSource.match(/export type EntitlementPlan = ([^;]+);/);
  assert.ok(union, "EntitlementPlan introuvable");
  return [...union[1].matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]);
}

test("droit — aucun plan reconnu ne peut rester sans tier servi", async () => {
  const { TIER_BY_ENTITLEMENT_PLAN } = await import("@/lib/subscriptions");
  for (const plan of declaredPlans()) {
    assert.ok(
      TIER_BY_ENTITLEMENT_PLAN[plan as EntitlementPlan],
      `le plan « ${plan} » est reconnu par le webhook mais ne sert aucun tier : le client paierait pour rien`
    );
  }
});

test("droit — `service` sert exactement ce que les surfaces publiques promettent", async () => {
  const { TIER_BY_ENTITLEMENT_PLAN } = await import("@/lib/subscriptions");
  const tier = TIER_BY_ENTITLEMENT_PLAN.service;
  const questions = BUYER_QUESTION_COUNT_BY_TIER[tier];
  assert.ok(
    llmsTxtFlat.includes(`${questions} buyer questions`),
    `llms.txt publie un compte de questions que le tier servi (${tier}) ne sert pas`
  );
  // La page vend Gemini et une cadence mensuelle : le tier servi doit les tenir.
  assert.deepEqual(ANSWER_ENGINE_KEYS_BY_TIER[tier], ["gemini"], "le tier servi doit interroger le moteur publié");
  assert.equal(RECHECK_INTERVAL_DAYS, 30, "la cadence publiée est mensuelle");
});

// --- 3. le plan vendu prime sur les anciens ---------------------------------

// Preuve de SOURCE, et elle s'arrête là : `entitlementForEmail` interroge la
// base, on ne l'exécute pas ici. Ce qui est vérifié, c'est l'ORDRE écrit.
test("classement — un abonné au plan vendu ne retombe pas sur un ancien palier", () => {
  const fn = subscriptionsSource.match(/export async function entitlementForEmail[\s\S]*?\n}/);
  assert.ok(fn, "entitlementForEmail introuvable");
  const body = fn[0];
  const servicePos = body.indexOf('row.plan === "service"');
  const agentPos = body.indexOf('row.plan === "agent_19eur"');
  assert.ok(servicePos !== -1, "`service` doit être classé");
  assert.ok(servicePos < agentPos, "`service` doit être testé AVANT les anciens paliers");
  assert.match(body, /return "service"/, "`service` doit court-circuiter, comme le plan le plus généreux");
});

test("séparation — le tier servi n'est plus l'identifiant du plan acheté", () => {
  // C'est ce qui permet de changer le prix public sans changer le moteur.
  assert.match(
    read("src", "lib", "entitlement.ts"),
    /servedTierForEmail/,
    "entitlement.ts doit passer par la traduction plan -> tier"
  );
  assert.doesNotMatch(
    read("src", "lib", "entitlement.ts"),
    /tier: plan,/,
    "le plan ne doit plus être servi tel quel comme tier"
  );
});
