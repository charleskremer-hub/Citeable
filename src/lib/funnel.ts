import { pool } from "./db";

export const FUNNEL_EVENTS = [
  "audit_started",
  "audit_completed",
  "report_viewed",
  "teaser_cta_click",
  "checkout_opened",
  "followup_1_sent",
  "followup_2_sent",
  "followup_click",
] as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

type RecordFunnelEventArgs = {
  eventName: FunnelEventName;
  auditId?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
};

export function isFunnelEventName(value: unknown): value is FunnelEventName {
  return typeof value === "string" && FUNNEL_EVENTS.includes(value as FunnelEventName);
}

function validUuid(value: string | null | undefined) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function recordFunnelEvent({ eventName, auditId, source, metadata = {}, dedupeKey }: RecordFunnelEventArgs) {
  const safeAuditId = validUuid(auditId) ? auditId : null;
  const safeSource = source?.trim().slice(0, 120) || null;
  const safeDedupeKey = dedupeKey?.trim().slice(0, 240) || null;

  await pool.query(
    `INSERT INTO audit_funnel_events (event_name, audit_id, source, metadata, dedupe_key)
     VALUES ($1, $2::uuid, $3, $4::jsonb, $5)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [eventName, safeAuditId, safeSource, JSON.stringify(metadata), safeDedupeKey]
  );
}
