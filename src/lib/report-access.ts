/**
 * Qui a le droit de voir le DÉTAIL d'un rapport d'audit.
 *
 * LE TROU QU'ON FERME. La page décidait :
 *
 *     const reportLocked = isAnonymousEmail(audit.email) && complete && !failed;
 *
 * — c'est-à-dire « gaté seulement si l'audit a été lancé sans email ». Tout audit
 * lancé AVEC un vrai email était donc intégralement ouvert à qui possédait
 * l'URL, tier payant compris. C'est précisément le cas de tous les audits de
 * prospection : on distribuait gratuitement le produit vendu 9 €/mois, et le
 * funnel n'avait plus une seule marche à franchir (`email_captured = 0`,
 * `checkout_opened = 0`).
 *
 * LA RÈGLE, MAINTENANT. L'anonymat de l'email ne décide plus de rien à lui seul.
 * Ce qui décide, c'est ce qui a été PAYÉ ou EXPLICITEMENT AUTORISÉ :
 *
 *   1. jeton de partage valide  -> ouvert  (le lien nommé de la prospection) ;
 *   2. abonnement actif          -> ouvert ;
 *   3. tier payant sans abonnement vérifiable -> gaté (le cas qui fuyait) ;
 *   4. tier gratuit non réclamé  -> gaté (inchangé, porte de capture d'email) ;
 *   5. tier gratuit réclamé      -> ouvert (inchangé).
 *
 * FAIL-SAFE DANS UN SEUL SENS, comme `src/lib/entitlement.ts`. L'appelant qui ne
 * PEUT PAS prouver l'abonnement (base indisponible, table absente) passe
 * `hasActiveSubscription: false` : on refuse un accès qu'on ne sait pas
 * justifier plutôt que d'ouvrir le produit payant sur une panne.
 *
 * ON NE TOUCHE PAS À CE QUI EST AU-DESSUS DE LA PORTE. Verdict et score restent
 * visibles : la porte se referme sur le détail (questions d'achat, concurrents
 * nommés, contenus à coller, fichiers techniques), pas sur le diagnostic.
 *
 * MODULE PUR : aucune base, aucun réseau, aucun import applicatif. La décision
 * est donc testable seule, et le sera.
 */

/** Les tiers qui correspondent à un produit vendu. */
export const PAID_AUDIT_TIERS = ["monitor_9eur", "agent_19eur", "agent_49eur"] as const;

export type PaidAuditTier = (typeof PAID_AUDIT_TIERS)[number];

export function isPaidAuditTier(tier: string | null | undefined): tier is PaidAuditTier {
  return PAID_AUDIT_TIERS.includes(String(tier ?? "").trim() as PaidAuditTier);
}

export type ReportAccessInput = {
  /** `raw_results.auditTier`, tel qu'il est stocké. Absent = `free`. */
  auditTier: string | null | undefined;
  /** L'audit a-t-il été lancé sans email (identifiant synthétique) ? */
  emailIsAnonymous: boolean;
  /** L'audit a-t-il un score ? */
  complete: boolean;
  /** L'audit s'est-il soldé par un échec ? */
  failed: boolean;
  /** Un abonnement actif est-il rattaché à cet audit ? `false` si indécidable. */
  hasActiveSubscription: boolean;
  /** L'URL portait-elle un jeton de partage valide pour CET audit ? */
  shareTokenValid: boolean;
};

/**
 * `reason` sert à l'affichage, pas à la décision :
 *   - `claim`   : porte de capture d'email (audit gratuit non réclamé) ;
 *   - `paywall` : porte de paiement (tier payant sans abonnement).
 */
export type ReportAccess =
  | { locked: false; reason: "open" }
  | { locked: true; reason: "claim" | "paywall" };

export function resolveReportAccess(input: ReportAccessInput): ReportAccess {
  // Un audit qui tourne ou qui a échoué n'a pas de détail à protéger, et la page
  // doit continuer d'y afficher son état. Gater ici afficherait une porte devant
  // un rapport vide.
  if (!input.complete || input.failed) return { locked: false, reason: "open" };

  if (input.shareTokenValid) return { locked: false, reason: "open" };
  if (input.hasActiveSubscription) return { locked: false, reason: "open" };

  if (isPaidAuditTier(input.auditTier)) return { locked: true, reason: "paywall" };

  return input.emailIsAnonymous ? { locked: true, reason: "claim" } : { locked: false, reason: "open" };
}
