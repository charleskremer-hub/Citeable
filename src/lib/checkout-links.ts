/**
 * Liens de paiement.
 *
 * POURQUOI CE FICHIER A CHANGE (31/07/2026) — constat, pas opinion : les quatre URLs
 * etaient codees en dur vers `checkout.nanocorp.so`, la plateforme dont GetPick est
 * sorti, et ces liens repondaient encore **HTTP 200** en production. Un prospect qui
 * cliquait « s'abonner » partait donc payer chez un tiers, sur une caisse que nous ne
 * controlons plus — et comme il n'existe par ailleurs aucun lien paiement -> droit dans
 * le depot, il n'aurait rien recu en retour.
 *
 * LE FAIL-SAFE VA DANS UN SEUL SENS, comme pour `resolveAuditTier` : variable absente
 * ou vide -> **chaine vide**, donc **pas de caisse**. Une erreur de configuration doit
 * couter une vente qu'on ne peut pas encaisser, JAMAIS un paiement qui part ailleurs.
 * A 0 vente et 0 `checkout_opened` sur 14 jours, le cout de ce choix est nul aujourd'hui.
 *
 * POUR REACTIVER : creer deux Stripe Payment Links puis renseigner dans Vercel
 *   NEXT_PUBLIC_MONITOR_CHECKOUT_URL   (plan Monitor 9 EUR/mois)
 *   NEXT_PUBLIC_AGENT_CHECKOUT_URL     (plan Agent 19 EUR/mois)
 * Aucun changement de code, aucun deploiement : deux variables et c'est en ligne.
 *
 * Le prefixe `NEXT_PUBLIC_` est necessaire : ces constantes sont lues cote client
 * (`HomeClient.tsx`, `FunnelCheckoutLink.tsx`). Ce ne sont pas des secrets — une URL de
 * paiement est publique par construction.
 */

const env = (name: string): string => (process.env[name] ?? "").trim();

export const MONITOR_CHECKOUT_URL = env("NEXT_PUBLIC_MONITOR_CHECKOUT_URL");
export const AGENT_CHECKOUT_URL = env("NEXT_PUBLIC_AGENT_CHECKOUT_URL");

export const MONITOR_TEST_CHECKOUT_URL = env("NEXT_PUBLIC_MONITOR_TEST_CHECKOUT_URL");
export const AGENT_TEST_CHECKOUT_URL = env("NEXT_PUBLIC_AGENT_TEST_CHECKOUT_URL");

/**
 * `true` seulement si l'URL est exploitable. Les appelants doivent masquer le CTA
 * plutot que rendre un lien mort : un bouton « s'abonner » qui ne mene nulle part
 * abime plus la confiance qu'un bouton absent.
 */
export const isCheckoutConfigured = (url: string): boolean => url.startsWith("https://");
