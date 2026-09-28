import { isAnonymousEmail } from "@/lib/anonymous-email";
import { pool } from "@/lib/db";
import type { PlanTier } from "@/lib/plan-promises";
import type { EntitlementPlan } from "@/lib/stripe-webhook";
import { isEntitling } from "@/lib/stripe-webhook";

/**
 * Le chainon manquant : paiement -> droit.
 *
 * Avant cette table, le depot n'avait AUCUN moyen de transformer un paiement en
 * acces. `monitored_brands` ne pouvait pas jouer ce role : elle est peuplee PAR
 * un audit payant deja execute, donc s'en servir pour autoriser ce meme audit
 * serait circulaire.
 *
 * LA CLE EST L'EMAIL, en minuscules. C'est deja l'identifiant du funnel
 * (`email_captures`, `capture-email`), et le seul que le client et Stripe
 * partagent sans qu'on ait a construire un systeme de comptes.
 *
 * MODE DE PANNE LE PLUS COURANT, ET IL EST HUMAIN : le client paie avec une
 * adresse et demande son audit avec une autre. On ne peut pas l'empecher, mais on
 * peut le rendre VISIBLE — d'ou `stripe_customer_email` conserve tel quel a cote
 * de l'email normalise, pour qu'un support puisse recoller les deux.
 */

export type SubscriptionRow = {
  email: string;
  plan: EntitlementPlan;
  status: string;
  current_period_end: Date | null;
};

export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export async function ensureSubscriptionSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT NOT NULL,
      stripe_customer_email TEXT,
      plan TEXT NOT NULL,
      status TEXT NOT NULL,
      current_period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (stripe_subscription_id)
    )
  `);
  await createIndexSafely(`CREATE INDEX IF NOT EXISTS subscriptions_email_idx ON subscriptions (email, status)`);

  // Idempotence. Stripe REJOUE : sur timeout, sur 5xx, et parfois sans raison.
  // Sans cette table, un rejeu de `customer.subscription.deleted` arrive apres une
  // re-souscription couperait le droit d'un client qui vient de repayer.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

const DDL_RACE_CODES = new Set(["23505", "42P07"]);
async function createIndexSafely(sql: string) {
  try {
    await pool.query(sql);
  } catch (error) {
    if (DDL_RACE_CODES.has((error as { code?: string })?.code ?? "")) return;
    throw error;
  }
}

/** `true` si l'evenement est NOUVEAU. `false` s'il a deja ete traite. */
export async function claimWebhookEvent(eventId: string, eventType: string): Promise<boolean> {
  const res = await pool.query(
    `INSERT INTO stripe_webhook_events (event_id, event_type) VALUES ($1, $2)
     ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
    [eventId, eventType]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function upsertSubscription(input: {
  email: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  stripeCustomerEmail: string | null;
  plan: EntitlementPlan;
  status: string;
  currentPeriodEnd: Date | null;
}) {
  await pool.query(
    `INSERT INTO subscriptions
       (email, stripe_customer_id, stripe_subscription_id, stripe_customer_email, plan, status, current_period_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET
       email = EXCLUDED.email,
       stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
       stripe_customer_email = COALESCE(EXCLUDED.stripe_customer_email, subscriptions.stripe_customer_email),
       plan = CASE WHEN subscriptions.email = '' THEN subscriptions.plan ELSE EXCLUDED.plan END,
       -- Une session arrivée APRÈS l'événement d'abonnement ne remplace pas le
       -- vrai statut (« trialing ») par son statut provisoire.
       status = CASE WHEN subscriptions.email = '' THEN subscriptions.status ELSE EXCLUDED.status END,
       current_period_end = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
       updated_at = now()`,
    [
      normalizeEmail(input.email),
      input.stripeCustomerId,
      input.stripeSubscriptionId,
      input.stripeCustomerEmail,
      input.plan,
      input.status,
      input.currentPeriodEnd,
    ]
  );
}

/**
 * Mise à jour par un événement d'ABONNEMENT (pas d'email dans l'objet Stripe).
 * Si la session de paiement n'est pas encore arrivée (Stripe ne garantit pas
 * l'ordre), la ligne est créée avec un email vide — aucune adresse ne peut y
 * correspondre — et la session la complétera. L'email n'est jamais écrasé ici.
 */
export async function upsertSubscriptionFromSubscriptionEvent(input: {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  plan: EntitlementPlan | null;
  status: string;
  currentPeriodEnd: Date | null;
}) {
  await pool.query(
    `INSERT INTO subscriptions
       (email, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
     VALUES ('', $1, $2, COALESCE($3, 'service'), $4, $5)
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET
       stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, subscriptions.stripe_customer_id),
       plan = COALESCE($3, subscriptions.plan),
       status = EXCLUDED.status,
       current_period_end = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
       updated_at = now()`,
    [input.stripeCustomerId, input.stripeSubscriptionId, input.plan, input.status, input.currentPeriodEnd]
  );
}

/**
 * Le plan auquel cette adresse a droit, ou `null`.
 *
 * Si quelqu'un cumule deux abonnements, on rend le PLUS GENEREUX. Rendre le moins
 * genereux ferait payer deux fois pour recevoir moins, ce qui est indefendable
 * face a un client.
 */
export async function entitlementForEmail(email: string): Promise<EntitlementPlan | null> {
  const res = await pool.query<SubscriptionRow>(
    `SELECT plan, status FROM subscriptions WHERE email = $1`,
    [normalizeEmail(email)]
  );
  let best: EntitlementPlan | null = null;
  for (const row of res.rows) {
    if (!isEntitling(row.status)) continue;
    // `service` est le plan VENDU depuis le 22/09 : il prime, sinon un ancien
    // abonne qui souscrit la nouvelle offre recevrait l'ancienne.
    if (row.plan === "service") return "service";
    if (row.plan === "agent_19eur") best = "agent_19eur";
    if (row.plan === "monitor_9eur" && best === null) best = "monitor_9eur";
  }
  return best;
}

/**
 * CE QUE LE PLAN VENDU FAIT SERVIR PAR LE MOTEUR — la traduction manquait.
 *
 * Le plan (ce que le client a acheté) et le tier (ce que le moteur exécute)
 * étaient le même identifiant : `entitlementForEmail` rendait un `EntitlementPlan`
 * qui était consommé tel quel comme `AuditTier`. Ça tenait tant que les deux
 * listes coïncidaient ; le plan `service` les sépare, et c'est tant mieux —
 * changer le prix public ne doit pas changer le moteur interrogé.
 *
 * `service` sert le tier `monitor_9eur` : 12 questions, cadence mensuelle et
 * Gemini, c'est-à-dire EXACTEMENT ce que `public/llms.txt` et la grille
 * publient. Pas `agent_19eur`, qui bascule le client sur ChatGPT et lui
 * promettrait un moteur que la page ne vend pas.
 */
// Le type dit l'invariant : un plan VENDU sert un tier dont la promesse est
// PUBLIÉE (`PlanTier`, la liste de `plan-promises.ts`). Un tier non publié —
// `agent_49eur` — ne peut pas être servi à un client par accident, et `tsc` le
// refuse à la compilation plutôt qu'au premier paiement.
export const TIER_BY_ENTITLEMENT_PLAN: Record<EntitlementPlan, PlanTier> = {
  service: "monitor_9eur",
  agent_19eur: "agent_19eur",
  monitor_9eur: "monitor_9eur",
};

/** Le tier servi à cette adresse, ou `null` si elle n'a aucun droit actif. */
export async function servedTierForEmail(email: string): Promise<PlanTier | null> {
  const plan = await entitlementForEmail(email);
  return plan === null ? null : TIER_BY_ENTITLEMENT_PLAN[plan];
}

/**
 * Un abonnement actif est-il rattaché à cet audit ? Le rattachement passe par
 * l'EMAIL, seul identifiant partagé avec Stripe.
 * FAIL-SAFE : toute panne de base rend `false` — ne pas pouvoir prouver le
 * droit n'est pas une raison de l'accorder.
 *
 * Vivait dans `/audit/[id]/page.tsx` ; déplacé ici le 26/09 — la page rend,
 * elle ne décide pas d'un droit, et le contrat AC1 la borne à 600 lignes.
 */
export async function hasActiveSubscriptionForAudit(email: string): Promise<boolean> {
  if (!email || isAnonymousEmail(email)) return false;
  try {
    return (await entitlementForEmail(email)) !== null;
  } catch {
    return false;
  }
}
