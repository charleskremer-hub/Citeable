/**
 * G2 — LA DÉCISION D'AVERTIR LE DEMANDEUR QU'UN ENVOI A RATÉ.
 *
 * Elle vit dans un `.ts` et non dans le composant `.tsx` pour une raison
 * mesurable : le lanceur de tests (`node --test` + type stripping) n'exécute
 * pas de JSX. Une règle enfermée dans un `.tsx` ne peut être vérifiée que par
 * lecture de source — c'est-à-dire en redisant le patch. Ici, la suite
 * exécute la vraie fonction.
 */
export type EmailDeliveryNoticeState = {
  /** Le rapport est terminé. Rien à annoncer tant qu'il tourne. */
  complete: boolean;
  /** L'audit lui-même a échoué : il a déjà son bloc, et parler d'email
   *  par-dessus noierait la vraie cause. */
  failed: boolean;
  /** Adresse synthétique d'un audit anonyme : personne n'attend d'email,
   *  avertir serait un faux positif. */
  emailIsAnonymous: boolean;
  /** `undefined` = envoi PAS ENCORE TENTÉ. Seul `false` est un échec. */
  emailSent: boolean | undefined;
};

export function emailDeliveryNoticeVisible({ complete, failed, emailIsAnonymous, emailSent }: EmailDeliveryNoticeState) {
  if (!complete || failed) return false;
  if (emailIsAnonymous) return false;
  return emailSent === false;
}
