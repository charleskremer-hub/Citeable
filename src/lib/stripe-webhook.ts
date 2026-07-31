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

/** Les seuls plans qu'un abonnement peut porter. Tout autre libelle est ignore. */
export type EntitlementPlan = "monitor_9eur" | "agent_19eur";

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
  if (declared === "monitor_9eur" || declared === "agent_19eur") return declared;

  const items = (obj.items as { data?: Array<{ price?: { id?: string; metadata?: Record<string, unknown> } }> })?.data ?? [];
  for (const item of items) {
    const priceMeta = item.price?.metadata?.getpick_plan;
    if (priceMeta === "monitor_9eur" || priceMeta === "agent_19eur") return priceMeta;
    const byId = item.price?.id ? PLAN_BY_PRICE[item.price.id] : undefined;
    if (byId) return byId;
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
