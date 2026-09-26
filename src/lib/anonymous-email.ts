/**
 * MODULE FEUILLE — aucune dépendance, pour qu'il puisse être importé de
 * partout sans créer de cycle.
 *
 * Extrait de `audit-engine.ts` le 26/09 : `subscriptions.ts` a besoin de
 * reconnaître une adresse anonyme, et `audit-engine` importe déjà
 * `subscriptions` — l'importer en retour aurait fermé un cycle. Dupliquer la
 * constante aurait été pire : deux vérités sur la même adresse.
 *
 * `audit-engine` ré-exporte les deux symboles ; tous les appelants existants
 * continuent d'importer depuis là.
 */
export const ANONYMOUS_EMAIL_DOMAIN = "anonymous.citeable.invalid";

export function isAnonymousEmail(email: string) {
  return email.trim().toLowerCase().endsWith(`@${ANONYMOUS_EMAIL_DOMAIN}`);
}
