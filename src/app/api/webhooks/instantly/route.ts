import { NextRequest, NextResponse } from "next/server";
import { optOutReasonFor, parseInstantlyEvent } from "@/lib/instantly-webhook";
import { applyInstantlyEventToRegistry, ensureProspectionSchema, recordInstantlyEvent, recordOptOut } from "@/lib/prospection";

export const dynamic = "force-dynamic";

/**
 * Récepteur des webhooks Instantly v2 → Neon.
 *
 * CE QUE ÇA DÉBOUCHE. Au 28/07, la seule métrique Instantly jugée fiable était
 * « réponses », relevée à la main dans l'interface ; ouvertures et clics étaient
 * notés « non mesuré — angle mort assumé » dans le tableau de bord GTM. Tant que
 * les événements d'envoi ne sont pas en base à côté des événements funnel, on ne
 * peut pas relier « cet email est parti » à « ce rapport a été ouvert », et un
 * cycle de prospection ne décide de rien.
 *
 * VÉRIFICATION. La doc v2 ne documente ni signature ni secret. On pose donc notre
 * propre secret dans l'URL enregistrée chez Instantly :
 *
 *   https://www.getpick.ai/api/webhooks/instantly?key=<INSTANTLY_WEBHOOK_SECRET>
 *
 * et on accepte aussi un header `x-instantly-secret`, au cas où Instantly ajoute
 * les en-têtes personnalisés. Comparaison à temps constant, même fonction que
 * `/api/funnel`. Sans `INSTANTLY_WEBHOOK_SECRET` défini, la route répond 503 :
 * un récepteur ouvert accepterait de n'importe qui des désinscriptions et des
 * bounces, donc laisserait un tiers pourrir notre registre d'oppositions.
 *
 * CODES DE RETOUR. 200 sur tout ce qui est traitable, y compris un doublon
 * (`duplicate: true`) : un webhook qui reçoit un 4xx est rejoué en boucle par
 * l'émetteur. On ne renvoie une erreur que sur secret invalide (401) ou secret
 * absent côté serveur (503).
 */

function secretMatches(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return diff === 0;
}

export async function POST(req: NextRequest) {
  const expected = process.env.INSTANTLY_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "webhook_secret_not_configured" }, { status: 503 });
  }

  const provided = req.headers.get("x-instantly-secret") ?? req.nextUrl.searchParams.get("key");
  if (!secretMatches(provided, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const event = parseInstantlyEvent(payload);
  if (!event) {
    // Corps illisible : on répond 200 pour ne pas déclencher de boucle de retry
    // sur un événement qu'aucun rejeu ne rendra valide.
    return NextResponse.json({ ok: true, ignored: "unparsable_payload" });
  }

  await ensureProspectionSchema();

  const inserted = await recordInstantlyEvent(event);

  // Un doublon a déjà produit ses effets de bord au premier passage : on s'arrête
  // là. Rejouer l'opposition serait sans danger (ON CONFLICT DO NOTHING), mais
  // rejouer l'incrément de `contact_count` compterait deux envois pour un seul.
  if (!inserted) {
    return NextResponse.json({ ok: true, duplicate: true, event_type: event.eventType });
  }

  const optOutReason = optOutReasonFor(event.eventType);
  if (optOutReason && event.leadEmail) {
    await recordOptOut({
      email: event.leadEmail,
      reason: optOutReason,
      source: "instantly_webhook",
      evidence: {
        event_type: event.eventType,
        campaign_id: event.campaignId,
        occurred_at: event.occurredAt,
      },
    });
  }

  await applyInstantlyEventToRegistry(event.eventType, event.leadEmail);

  return NextResponse.json({ ok: true, event_type: event.eventType, opted_out: Boolean(optOutReason) });
}

/**
 * GET de vérification. Instantly appelle parfois l'URL à l'enregistrement pour
 * s'assurer qu'elle répond. On confirme que la route est là et que le secret est
 * configuré, sans jamais révéler sa valeur ni exposer la moindre donnée.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    receiver: "instantly_v2",
    configured: Boolean(process.env.INSTANTLY_WEBHOOK_SECRET),
  });
}
