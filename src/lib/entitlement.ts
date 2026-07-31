import type { AuditTier } from "@/lib/audit-engine";
import { resolveAuditTier } from "@/lib/audit-engine";
import { entitlementForEmail } from "@/lib/subscriptions";

/**
 * Le tier servi, une fois l'intention confrontee au droit REEL du client.
 *
 * `resolveAuditTier()` n'est PAS modifiee. Elle reste ce qu'elle est depuis le
 * 30/07 : une lecture d'intention plus une cle serveur pour notre outillage.
 * C'est le melange lecture/autorisation qui avait ouvert le trou du tier payant ;
 * on ajoute une couche, on ne rouvre pas la couture.
 *
 * ORDRE, ET IL EST DELIBERE :
 *   1. cle interne valide  -> tier demande (outillage, protocoles de mesure) ;
 *   2. abonnement actif    -> le plan de l'abonnement ;
 *   3. sinon               -> `free`.
 *
 * ON SERT LE PLAN DE L'ABONNEMENT, PAS LE TIER DEMANDE. Un abonne Monitor qui
 * poste `agent_19eur` obtient Monitor : sinon on aurait deplace le trou du 30/07
 * d'un cran, un abonnement a 9 EUR suffisant a demander le produit a 19.
 *
 * FAIL-SAFE DANS UN SEUL SENS. Toute panne de base est rattrapee et sert `free`.
 * Neon indisponible doit couter un audit gratuit de trop, jamais le produit
 * payant donne — et surtout jamais une erreur 500 sur une route publique parce
 * que la table des abonnements ne repond pas.
 */
export async function resolveAuditTierWithEntitlement(
  payload: Record<string, unknown>,
  headers: { get(name: string): string | null },
  email: string | null | undefined
): Promise<{ tier: AuditTier; requested: AuditTier; downgradedFrom: AuditTier | null; source: "internal_key" | "subscription" | "free" }> {
  const base = resolveAuditTier(payload, headers);

  // Cle interne : deja autorise, on ne touche a rien et on n'interroge pas la base.
  if (base.downgradedFrom === null && base.tier !== "free") {
    return { ...base, source: "internal_key" };
  }
  if (base.requested === "free" || !email) {
    return { ...base, source: "free" };
  }

  let plan: Awaited<ReturnType<typeof entitlementForEmail>> = null;
  try {
    plan = await entitlementForEmail(email);
  } catch {
    return { ...base, source: "free" };
  }

  if (!plan) return { ...base, source: "free" };

  return {
    tier: plan,
    requested: base.requested,
    downgradedFrom: plan === base.requested ? null : base.requested,
    source: "subscription",
  };
}
