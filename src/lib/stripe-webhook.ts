import { SERVICE_PLAN_PRICE_EUR } from "./plan-promises";
import { createHmac } from "node:crypto";

/**
 * Verification de signature Stripe, sans la dependance `stripe`.
 *
 * POURQUOI PAS LE SDK. La verification tient en 20 lignes de HMAC. Ajouter le
 * paquet `stripe` pour ca, c'est ajouter une piece au lieu d'en retirer une, et
 * une piece qu'il faudra maintenir. Si un jour on appelle l'API Stripe depuis le
 * serveur, on reevaluera — aujourd'hui on ne fait que RECEVOIR.
 *
 * SCHEMA. L'en-tete `stripe-signature` vaut `t=<timestamp>,v1=<sig>[,v1=<sig2>]`.
 * La charge signee est litteralement `${t}.${corps brut}`, en HMAC-SHA256 avec le
 * secret du endpoint (`whsec_...`), en hexadecimal.
 *
 * DEUX PIEGES, TOUS DEUX DEJA VUS AILLEURS :
 * 1. **Le corps doit etre BRUT.** `JSON.parse` puis `JSON.stringify` reordonne
 *    les cles et change un espace : la signature ne tombe plus jamais juste.
 * 2. **Sans controle de fraicheur, une requete valide capturee est rejouable
 *    indefiniment.** D'ou la tolerance de 5 minutes, celle que Stripe recommande.
 */

export const SIGNATURE_HEADER = "stripe-signature";
export const TOLERANCE_SECONDS = 300;

export type SignatureVerdict =
  | { ok: true; timestamp: number }
  | { ok: false; reason: "missing_header" | "malformed_header" | "no_signature" | "stale" | "mismatch" };

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): SignatureVerdict {
  if (!header) return { ok: false, reason: "missing_header" };

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key?.trim() === "t") timestamp = Number.parseInt(value ?? "", 10);
    if (key?.trim() === "v1" && value) signatures.push(value.trim());
  }

  if (timestamp === null || Number.isNaN(timestamp)) return { ok: false, reason: "malformed_header" };
  if (signatures.length === 0) return { ok: false, reason: "no_signature" };

  // Rejeu : on borne des deux cotes. Une horloge en avance est aussi suspecte
  // qu'une requete vieille de deux heures.
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return { ok: false, reason: "stale" };

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");

  // Stripe peut envoyer plusieurs v1 pendant une rotation de secret : il suffit
  // qu'UNE corresponde. On les compare toutes, sans court-circuit.
  let matched = false;
  for (const candidate of signatures) if (timingSafeEqualHex(candidate, expected)) matched = true;

  return matched ? { ok: true, timestamp } : { ok: false, reason: "mismatch" };
}

/**
 * Les seuls plans qu'un abonnement peut porter. Tout autre libelle est ignore.
 *
 * `service` AJOUTE LE 22/09/2026, ET C'EST UN PREALABLE AU PAIEMENT, PAS UNE
 * FINITION. La landing vend depuis ce jour UN plan unique a 49 EUR/mois. Avant
 * cet ajout, `planFromStripeObject` rendait `null` pour tout abonnement qui ne
 * portait pas `monitor_9eur` ou `agent_19eur` : un client aurait paye 49 EUR par
 * mois et n'aurait recu AUCUN droit — l'abonnement encaisse, le produit ferme.
 * Le lien de paiement ne doit pas exister avant que ce code soit en production.
 *
 * Les deux anciens restent : ils portent de l'historique, et un droit deja vendu
 * ne se retire pas parce que la page a change.
 */
export type EntitlementPlan = "monitor_9eur" | "agent_19eur" | "service";

const PLAN_BY_PRICE: Record<string, EntitlementPlan> = {
  price_1TzBZoCZqJGb866fjK9GMVkv: "monitor_9eur",
  price_1TzBZvCZqJGb866fAbl5SMre: "agent_19eur",
};

/**
 * Le plan porte par un abonnement.
 *
 * DEUX SOURCES, DANS CET ORDRE, ET L'ORDRE EST LE POINT. On lit d'abord
 * `metadata.getpick_plan` — pose a la main sur les prix et les Payment Links, donc
 * stable si un prix est un jour recree. On retombe sur la table d'identifiants de
 * prix seulement si la metadonnee manque. L'inverse serait fragile : un prix
 * recree (changement de tarif, de devise) change d'identifiant et le droit
 * disparaitrait silencieusement pour tous les abonnes existants.
 */
export function planFromStripeObject(obj: Record<string, unknown>): EntitlementPlan | null {
  const meta = (obj.metadata ?? {}) as Record<string, unknown>;
  const declared = typeof meta.getpick_plan === "string" ? meta.getpick_plan : null;
  if (declared === "monitor_9eur" || declared === "agent_19eur" || declared === "service") return declared;

  const items = (obj.items as { data?: Array<{ price?: { id?: string; metadata?: Record<string, unknown> } }> })?.data ?? [];
  for (const item of items) {
    const priceMeta = item.price?.metadata?.getpick_plan;
    if (priceMeta === "monitor_9eur" || priceMeta === "agent_19eur" || priceMeta === "service") return priceMeta;
    const byId = item.price?.id ? PLAN_BY_PRICE[item.price.id] : undefined;
    if (byId) return byId;
    // Dernier filet (28/09/2026) : le prix 69 € a été créé sans métadonnée ni
    // identifiant connu d'ici. Sans ce repli, le PREMIER client payant aurait
    // été ignoré (`skipped: incomplete`) — l'argent encaissé, aucun droit ouvert.
    // Un prix récurrent en EUR au montant exact de l'offre publique EST l'offre.
    const price = item.price as { unit_amount?: unknown; currency?: unknown; recurring?: unknown } | undefined;
    if (
      price &&
      price.unit_amount === SERVICE_PLAN_PRICE_EUR * 100 &&
      typeof price.currency === "string" &&
      price.currency.toLowerCase() === "eur" &&
      price.recurring
    ) {
      return "service";
    }
  }
  return null;
}

/**
 * Les statuts d'abonnement qui donnent droit au produit.
 *
 * `past_due` EST INCLUS, et c'est delibere : Stripe reessaie le prelevement
 * pendant plusieurs jours (Smart Retries). Couper l'acces des le premier echec
 * de carte punirait un client dont la carte a simplement expire, et produirait
 * une resiliation la ou une relance suffisait. `unpaid` et `canceled`, eux,
 * signifient que Stripe a renonce : la, on coupe.
 */
export const ENTITLING_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isEntitling(status: string | null | undefined): boolean {
  return ENTITLING_STATUSES.has((status ?? "").trim());
}

/**
 * CE QUE LE WEBHOOK ÉCRIT — décision pure, testée (28/09/2026).
 *
 * LE DÉFAUT QUE ÇA CORRIGE. L'ancienne route exigeait, sur UN SEUL événement,
 * l'email ET le plan ET l'abonnement. Or Stripe les répartit :
 *   - `checkout.session.completed` porte l'email… mais pas les lignes de prix
 *     (donc pas de plan si la métadonnée manque), et son `status` vaut
 *     « complete » — qui n'est PAS un statut d'abonnement : le droit écrit
 *     n'aurait jamais été ouvert ;
 *   - `customer.subscription.*` porte le prix et le vrai statut (`trialing`,
 *     `active`…) mais aucun email.
 * Résultat : chaque événement était ignoré (`skipped: incomplete`) ou écrit
 * fermé. Le premier client payant n'aurait rien reçu.
 *
 * LA RÈGLE. La session écrit la ligne complète (email + abonnement), statut
 * provisoire `active` (le paiement ou l'essai est acquis), plan « service »
 * par défaut quand c'est un abonnement — c'est la seule offre vendue. Les
 * événements d'abonnement METTENT À JOUR la même ligne (clé : l'identifiant
 * d'abonnement) avec le vrai plan et le vrai statut, sans toucher à l'email.
 */
export type WebhookWrite =
  | { kind: "full"; email: string; subscriptionId: string; plan: EntitlementPlan; status: string }
  | { kind: "partial"; subscriptionId: string; plan: EntitlementPlan | null; status: string }
  | { kind: "skip"; reason: string };

export function webhookWriteFor(eventType: string, object: Record<string, unknown>, email: string | null): WebhookWrite {
  if (eventType === "checkout.session.completed") {
    const subscriptionId = typeof object.subscription === "string" ? object.subscription : null;
    if (object.mode !== undefined && object.mode !== "subscription") return { kind: "skip", reason: "not a subscription checkout" };
    if (!subscriptionId) return { kind: "skip", reason: "no subscription id" };
    if (!email) return { kind: "skip", reason: "no email" };
    const plan = planFromStripeObject(object) ?? "service";
    return { kind: "full", email, subscriptionId, plan, status: "active" };
  }

  if (eventType.startsWith("customer.subscription.")) {
    const subscriptionId = typeof object.id === "string" ? object.id : null;
    if (!subscriptionId) return { kind: "skip", reason: "no subscription id" };
    const status =
      eventType === "customer.subscription.deleted" ? "canceled" : typeof object.status === "string" ? object.status : "active";
    return { kind: "partial", subscriptionId, plan: planFromStripeObject(object), status };
  }

  return { kind: "skip", reason: `unhandled ${eventType}` };
}

/**
 * MODE TEST STRIPE (30/09, Charles : « Stripe permet des paiements tests ») :
 * un événement signé par le secret du webhook de TEST ouvre le parcours complet
 * (droit, fiche, mail de bienvenue) mais l'abonnement est préfixé `internal_test_`
 * — exclu du MRR comme tout `internal_%`, et reconnaissable d'un coup d'œil.
 */
export function markTestWrite<T extends { kind: string; subscriptionId?: string }>(write: T): T {
  if (write.kind === "skip" || !write.subscriptionId || write.subscriptionId.startsWith("internal_test_")) return write;
  return { ...write, subscriptionId: `internal_test_${write.subscriptionId}` };
}
