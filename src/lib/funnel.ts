import { pool } from "./db";
import { TRAFFIC_CLASSES, trafficClassOrUnknown, type TrafficClass } from "./traffic-filter";

export const FUNNEL_EVENTS = [
  "audit_started",
  "audit_completed",
  "report_viewed",
  // Audit sans friction : l'audit démarre sans email, le lead est capturé plus
  // tard sur le rapport en échange du détail (voir /api/claim-audit).
  "email_captured",
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

export type FunnelCounts = Record<FunnelEventName, number>;
export type FunnelCountsByTrafficClass = Record<FunnelEventName, Record<TrafficClass, number>>;

/**
 * Replie les lignes d'un `GROUP BY (event_name, traffic_class)` en deux vues.
 *
 * `counts[event]` est DÉRIVÉ de la somme des 4 classes, jamais compté à part :
 * l'invariant `human + bot + internal + unknown === counts[event]` est alors
 * structurel et ne peut pas dériver entre deux requêtes SQL.
 *
 * Toute classe non reconnue — clé absente sur l'historique d'avant le 29/07,
 * casse différente, valeur envoyée par un client — est repliée sur `unknown`.
 * Aucune ligne n'est jamais promue `human` par défaut.
 */
export function foldFunnelCounts(
  rows: { event_name: string; traffic_class: string | null; count: string | number }[]
): { counts: FunnelCounts; countsByTrafficClass: FunnelCountsByTrafficClass } {
  const countsByTrafficClass = Object.fromEntries(
    FUNNEL_EVENTS.map((eventName) => [eventName, Object.fromEntries(TRAFFIC_CLASSES.map((klass) => [klass, 0]))])
  ) as FunnelCountsByTrafficClass;

  for (const row of rows) {
    if (!isFunnelEventName(row.event_name)) continue;

    const value = Number(row.count);
    if (!Number.isFinite(value)) continue;

    countsByTrafficClass[row.event_name][trafficClassOrUnknown(row.traffic_class)] += value;
  }

  const counts = Object.fromEntries(
    FUNNEL_EVENTS.map((eventName) => [
      eventName,
      TRAFFIC_CLASSES.reduce((total, klass) => total + countsByTrafficClass[eventName][klass], 0),
    ])
  ) as FunnelCounts;

  return { counts, countsByTrafficClass };
}
