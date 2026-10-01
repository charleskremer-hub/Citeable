import { NextResponse } from "next/server";

/**
 * getpick.ai/rdv — « 15 minutes avec Charles » (01/10/2026, demande de Charles).
 *
 * Lien court AU NOM DE GETPICK pour les emails de prospection : un lien vers un
 * autre domaine dans un email signé GetPick a l'air louche (délivrabilité,
 * confiance). La cible peut changer sans toucher aux emails déjà envoyés.
 * Redirection temporaire (307) pour ne jamais être mise en cache comme définitive.
 */
// Lien de réservation « 15 minute meeting » de Charles sur Gumdrop/Supercal
// (01/10). NE PAS remettre info.gumdrop.ai/calendly : c'est la page
// d'inscription Supercal, pas un agenda.
export const RDV_TARGET = "https://gumdrop.ai/charleskremer/15";

export function GET() {
  return NextResponse.redirect(RDV_TARGET, 307);
}
