import { NextRequest, NextResponse } from "next/server";
import { SIGNATURE_HEADER, isEntitling, planFromStripeObject, verifyStripeSignature } from "@/lib/stripe-webhook";
import { claimWebhookEvent, ensureSubscriptionSchema, upsertSubscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";

/**
 * Recepteur des webhooks Stripe. C'est ici, et NULLE PART AILLEURS, qu'un
 * paiement devient un droit.
 *
 * CODES DE RETOUR, ET ILS NE SONT PAS COSMETIQUES. Stripe rejoue tout ce qui
 * n'est pas 2xx, avec un backoff qui va jusqu'a plusieurs jours, puis desactive
 * l'endpoint. Donc :
 *   - 200 sur tout ce qui est traite, y compris un doublon et y compris un
 *     evenement qu'on choisit d'ignorer — sinon Stripe rejoue en boucle un
 *     evenement qu'on ne traitera jamais ;
 *   - 400 sur signature invalide : c'est le seul cas ou le rejeu est souhaitable,
 *     parce qu'il signale une vraie erreur de configuration ;
 *   - 503 si le secret manque cote serveur.
 *
 * SANS SECRET, ON REFUSE. Un recepteur d'abonnements non signe est une route
 * publique qui accorde des droits payants a qui poste le bon JSON. C'est
 * exactement la faute corrigee le 30/07 sur le tier payant ; on ne la refait pas
 * une porte plus loin.
 */
export async function POST(req: NextRequest) {
  const secret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  // Corps BRUT, jamais reserialise : JSON.parse + JSON.stringify reordonne les
  // cles et la signature ne tombe plus jamais juste.
  const rawBody = await req.text();
  const verdict = verifyStripeSignature(rawBody, req.headers.get(SIGNATURE_HEADER), secret);
  if (!verdict.ok) {
    return NextResponse.json({ error: "Invalid signature", reason: verdict.reason }, { status: 400 });
  }

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId = typeof event.id === "string" ? event.id : null;
  const eventType = typeof event.type === "string" ? event.type : "";
  if (!eventId) return NextResponse.json({ error: "Missing event id" }, { status: 400 });

  await ensureSubscriptionSchema();

  // Idempotence AVANT tout effet de bord. Un rejeu de
  // `customer.subscription.deleted` arrivant apres une re-souscription couperait
  // le droit d'un client qui vient de repayer.
  const isNew = await claimWebhookEvent(eventId, eventType);
  if (!isNew) return NextResponse.json({ ok: true, duplicate: true });

  const object = (event.data?.object ?? {}) as Record<string, unknown>;

  const handled = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ]);
  if (!handled.has(eventType)) {
    // 200 : on a pris acte. Un 4xx ferait rejouer indefiniment un evenement
    // qu'on ne traitera jamais.
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  const plan = planFromStripeObject(object);
  const email = emailFrom(object);
  const subscriptionId = subscriptionIdFrom(object, eventType);

  // On ne devine RIEN. Sans email ou sans identifiant d'abonnement il n'y a pas
  // de droit a ecrire ; on renvoie 200 pour ne pas declencher de rejeu, et on
  // laisse une trace exploitable dans la reponse.
  if (!email || !subscriptionId || !plan) {
    return NextResponse.json({
      ok: true,
      skipped: "incomplete",
      missing: { email: !email, subscriptionId: !subscriptionId, plan: !plan },
    });
  }

  const status =
    eventType === "customer.subscription.deleted"
      ? "canceled"
      : typeof object.status === "string"
        ? object.status
        : "active";

  await upsertSubscription({
    email,
    stripeCustomerId: typeof object.customer === "string" ? object.customer : null,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerEmail: rawCustomerEmail(object),
    plan,
    status,
    currentPeriodEnd: periodEndFrom(object),
  });

  return NextResponse.json({ ok: true, plan, entitled: isEntitling(status) });
}

/**
 * L'email, cherche dans l'ordre de fiabilite decroissante.
 *
 * `customer_details.email` (Checkout) est celui que le client a REELLEMENT tape
 * pour payer. `customer_email` est un champ de repli. On ne prend jamais un email
 * de facturation d'un objet imbrique sans savoir d'ou il vient.
 */
function emailFrom(object: Record<string, unknown>): string | null {
  const details = object.customer_details as { email?: unknown } | undefined;
  if (typeof details?.email === "string" && details.email.includes("@")) return details.email;
  if (typeof object.customer_email === "string" && object.customer_email.includes("@")) return object.customer_email;
  const meta = (object.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.email === "string" && meta.email.includes("@")) return meta.email;
  return null;
}

function rawCustomerEmail(object: Record<string, unknown>): string | null {
  const details = object.customer_details as { email?: unknown } | undefined;
  return typeof details?.email === "string" ? details.email : null;
}

/**
 * L'identifiant d'abonnement n'est pas au meme endroit selon l'evenement :
 * sur une session Checkout c'est `subscription`, sur un objet Subscription c'est
 * `id`. Confondre les deux ecrirait l'identifiant de SESSION comme cle unique et
 * creerait une ligne neuve a chaque renouvellement.
 */
function subscriptionIdFrom(object: Record<string, unknown>, eventType: string): string | null {
  if (eventType === "checkout.session.completed") {
    return typeof object.subscription === "string" ? object.subscription : null;
  }
  return typeof object.id === "string" ? object.id : null;
}

function periodEndFrom(object: Record<string, unknown>): Date | null {
  const raw = object.current_period_end;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return new Date(raw * 1000); // Stripe compte en secondes, JS en millisecondes.
}
