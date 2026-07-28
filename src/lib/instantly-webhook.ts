import { createHash } from "node:crypto";
import type { InstantlyEventRecord, OptOutReason } from "./prospection";

/**
 * Lecture des webhooks Instantly v2.
 *
 * Module PUR (aucun accès base, aucun `process.env`) pour être testable sans
 * réseau — la route se contente de l'appeler puis d'écrire.
 *
 * Référence : https://developer.instantly.ai/guides/webhook-events
 *
 * Deux choses que la doc ne fournit pas et qu'il faut donc construire ici :
 *
 *  - AUCUN identifiant d'événement. Pas d'`id`, pas de `delivery_id`. Instantly
 *    peut rejouer un webhook (retry sur timeout) et on n'aurait aucun moyen de
 *    le voir. On fabrique donc une clé de dédup déterministe à partir des champs
 *    qui identifient l'occurrence : type + campagne + destinataire + horodatage
 *    + identifiant d'email. Deux livraisons du même événement produisent la même
 *    clé, deux événements distincts n'en produisent jamais la même.
 *  - AUCUNE signature ni secret documenté. La vérification se fait donc sur un
 *    secret partagé qu'on met nous-mêmes dans l'URL du webhook côté Instantly
 *    (`?key=…`), avec un header `x-instantly-secret` accepté en alternative si
 *    Instantly ajoute un jour les en-têtes personnalisés. Voir la route.
 */

export const INSTANTLY_EVENT_TYPES = [
  "email_sent",
  "email_opened",
  "link_clicked",
  "reply_received",
  "auto_reply_received",
  "email_bounced",
  "lead_unsubscribed",
  "lead_interested",
  "lead_neutral",
  "lead_not_interested",
  "lead_out_of_office",
  "lead_wrong_person",
  "lead_meeting_booked",
  "lead_meeting_completed",
  "lead_closed",
  "campaign_completed",
  "account_error",
] as const;

export type InstantlyEventType = (typeof INSTANTLY_EVENT_TYPES)[number];

function text(value: unknown, max = 500): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isoTimestamp(value: unknown): string | null {
  const raw = text(value, 64);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Corps conservé en base, expurgé.
 *
 * `email_html`, `email_text`, `reply_html` et `reply_text` contiennent le corps
 * intégral des messages — donc, sur `reply_received`, le texte qu'un prospect
 * nous a écrit, potentiellement personnel et sans rapport avec la prospection.
 * On garde l'extrait (`reply_text_snippet`), qui suffit à décider s'il faut lire
 * la réponse dans Instantly, et on jette le reste. Minimisation, article 5.1.c.
 */
const DROPPED_FIELDS = new Set(["email_html", "email_text", "reply_html", "reply_text"]);

export function minimizePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([key]) => !DROPPED_FIELDS.has(key)));
}

export function dedupeKeyFor(payload: Record<string, unknown>): string {
  const parts = [
    text(payload.event_type, 64) ?? "unknown",
    text(payload.campaign_id, 64) ?? "-",
    (text(payload.lead_email, 200) ?? "-").toLowerCase(),
    isoTimestamp(payload.timestamp) ?? "-",
    text(payload.email_id, 128) ?? "-",
    text(payload.step, 32) ?? "-",
  ];
  // Condensat plutôt que concaténation : la colonne est UNIQUE et bornée, et un
  // sujet ou un email long ne doit pas pouvoir la faire déborder.
  return `instantly:${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 40)}`;
}

export function isKnownEventType(value: unknown): value is InstantlyEventType {
  return typeof value === "string" && (INSTANTLY_EVENT_TYPES as readonly string[]).includes(value);
}

export function parseInstantlyEvent(payload: unknown): InstantlyEventRecord | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const body = payload as Record<string, unknown>;

  const eventType = text(body.event_type, 64);
  // Les libellés personnalisés d'un workspace arrivent AUSSI dans `event_type`.
  // On les accepte et on les journalise : refuser ce qu'on ne connaît pas, sur un
  // capteur dont le rôle est de combler un angle mort, serait recréer l'angle mort.
  if (!eventType) return null;

  return {
    dedupeKey: dedupeKeyFor(body),
    eventType,
    occurredAt: isoTimestamp(body.timestamp),
    workspaceId: text(body.workspace, 64),
    campaignId: text(body.campaign_id, 64),
    campaignName: text(body.campaign_name, 200),
    leadEmail: text(body.lead_email, 200)?.toLowerCase() ?? null,
    emailAccount: text(body.email_account, 200)?.toLowerCase() ?? null,
    step: text(body.step, 32),
    variant: text(body.variant, 32),
    isFirst: bool(body.is_first),
    emailId: text(body.email_id, 128),
    subject: text(body.reply_subject, 300) ?? text(body.email_subject, 300),
    replySnippet: text(body.reply_text_snippet, 1000),
    payload: minimizePayload(body),
  };
}

/**
 * Événements qui valent opposition. `email_bounced` en fait partie : Instantly ne
 * distingue pas hard et soft bounce dans le webhook, et re-solliciter une adresse
 * qui rebondit abîme la délivrabilité des deux domaines de chauffe. On préfère
 * perdre un contact récupérable que brûler un domaine.
 */
const OPT_OUT_REASONS: Partial<Record<string, OptOutReason>> = {
  lead_unsubscribed: "unsubscribed",
  email_bounced: "bounced",
  lead_not_interested: "not_interested",
  lead_wrong_person: "wrong_person",
};

export function optOutReasonFor(eventType: string): OptOutReason | null {
  return OPT_OUT_REASONS[eventType] ?? null;
}
