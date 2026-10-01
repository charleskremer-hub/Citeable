import { NextResponse } from "next/server";

/**
 * getpick.ai/rdv — « 15 minutes avec Charles » (01/10/2026, demande de Charles).
 *
 * Lien court AU NOM DE GETPICK pour les emails de prospection : un lien vers un
 * autre domaine dans un email signé GetPick a l'air louche (délivrabilité,
 * confiance). La cible peut changer sans toucher aux emails déjà envoyés.
 * Redirection temporaire (307) pour ne jamais être mise en cache comme définitive.
 */
// info.gumdrop.ai/calendly est la page d'INSCRIPTION Supercal, pas un agenda :
// en attendant le lien de réservation de Charles, le prospect écrit directement.
export const RDV_TARGET = "mailto:hello@getpick.ai?subject=15%20minutes%20pour%20en%20parler";

export function GET() {
  return NextResponse.redirect(RDV_TARGET, 307);
}
