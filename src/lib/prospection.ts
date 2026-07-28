import { pool } from "./db";
import { PROSPECTION_COMPLIANCE_SQL } from "./prospection-schema";

/**
 * Accès applicatif à la couche de conformité de la prospection.
 *
 * Le schéma est décrit une seule fois dans `prospection-schema.ts` et versionné
 * dans `migrations/001_prospection_compliance.sql`. `ensureProspectionSchema()`
 * rejoue ce SQL idempotent au premier appel du process — même filet que
 * `ensureAuditSchema()`, pour qu'un déploiement sur une base fraîche (preview
 * Vercel, base de test) ne dépende pas d'une commande manuelle.
 */

let schemaReady: Promise<void> | null = null;

export async function ensureProspectionSchema() {
  // Une seule exécution par process, et on relâche la mémoïsation en cas d'échec
  // pour qu'une panne réseau transitoire ne condamne pas le process entier.
  schemaReady ??= pool.query(PROSPECTION_COMPLIANCE_SQL).then(
    () => undefined,
    (error) => {
      schemaReady = null;
      throw error;
    }
  );
  return schemaReady;
}

export type OptOutReason =
  | "unsubscribed"
  | "reply_stop"
  | "bounced"
  | "complaint"
  | "not_interested"
  | "wrong_person"
  | "manual"
  | "internal";

export function domainOf(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase() ?? "";
  const domain = value.split("@")[1];
  return domain || null;
}

/**
 * Enregistre une opposition.
 *
 * Écrit DEUX fois, volontairement : dans `prospection_opt_outs` (le registre
 * neuf, source de vérité) et dans `audit_email_suppression_list` (que les
 * chemins d'envoi existants — relances J+1/J+3, monitoring hebdo — interrogent
 * déjà). Tant que ces chemins n'ont pas migré vers `prospection_is_suppressed()`,
 * n'écrire que dans la table neuve laisserait partir un email à quelqu'un qui
 * vient de se désinscrire. La duplication est le prix de la sécurité ; elle est
 * temporaire et documentée dans SALES_STACK_DECISION.md.
 */
export async function recordOptOut(input: {
  email: string;
  reason: OptOutReason;
  source: string;
  evidence?: Record<string, unknown>;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return;

  await pool.query(
    `INSERT INTO prospection_opt_outs (kind, value, reason, source, evidence)
     VALUES ('email', $1, $2, $3, $4::jsonb)
     ON CONFLICT (kind, value) DO NOTHING`,
    [email, input.reason, input.source, JSON.stringify(input.evidence ?? {})]
  );

  await pool.query(
    `INSERT INTO audit_email_suppression_list (kind, value, reason)
     VALUES ('email', $1, $2)
     ON CONFLICT (kind, value) DO NOTHING`,
    [email, `${input.reason} (${input.source})`]
  );
}

export async function isSuppressed(email: string): Promise<boolean> {
  const result = await pool.query<{ suppressed: boolean }>(
    `SELECT prospection_is_suppressed($1) AS suppressed`,
    [email.trim().toLowerCase()]
  );
  return result.rows[0]?.suppressed === true;
}

export type InstantlyEventRecord = {
  dedupeKey: string;
  eventType: string;
  occurredAt: string | null;
  workspaceId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  leadEmail: string | null;
  emailAccount: string | null;
  step: string | null;
  variant: string | null;
  isFirst: boolean | null;
  emailId: string | null;
  subject: string | null;
  replySnippet: string | null;
  payload: Record<string, unknown>;
};

/**
 * @returns true si l'événement a été inséré, false s'il était déjà connu.
 */
export async function recordInstantlyEvent(event: InstantlyEventRecord): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO instantly_webhook_events (
       dedupe_key, event_type, occurred_at, workspace_id, campaign_id, campaign_name,
       lead_email, lead_domain, email_account, step, variant, is_first, email_id,
       subject, reply_snippet, payload
     )
     VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [
      event.dedupeKey,
      event.eventType,
      event.occurredAt,
      event.workspaceId,
      event.campaignId,
      event.campaignName,
      event.leadEmail,
      domainOf(event.leadEmail),
      event.emailAccount,
      event.step,
      event.variant,
      event.isFirst,
      event.emailId,
      event.subject,
      event.replySnippet,
      JSON.stringify(event.payload),
    ]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Met à jour le registre de prospection à partir d'un événement Instantly.
 *
 * UPDATE seulement, jamais d'INSERT : une ligne du registre doit porter la
 * provenance de l'adresse (URL publique, date de collecte, base légale). La
 * créer depuis un webhook produirait une entrée sans provenance — exactement la
 * ligne qu'on serait incapable de justifier le jour où on nous la demande. Les
 * lignes naissent au sourcing ; le webhook ne fait que les faire vivre.
 */
export async function applyInstantlyEventToRegistry(eventType: string, leadEmail: string | null) {
  if (!leadEmail) return;
  const email = leadEmail.trim().toLowerCase();

  if (eventType === "email_sent") {
    await pool.query(
      `UPDATE prospection_contacts
       SET status = CASE WHEN status IN ('sourced', 'queued') THEN 'contacted' ELSE status END,
           first_contacted_at = COALESCE(first_contacted_at, now()),
           last_contacted_at = now(),
           contact_count = contact_count + 1
       WHERE email = $1`,
      [email]
    );
    return;
  }

  const status =
    eventType === "reply_received" || eventType === "lead_interested"
      ? "replied"
      : eventType === "lead_unsubscribed"
        ? "opted_out"
        : eventType === "email_bounced"
          ? "bounced"
          : null;

  if (!status) return;

  await pool.query(`UPDATE prospection_contacts SET status = $2 WHERE email = $1`, [email, status]);
}
