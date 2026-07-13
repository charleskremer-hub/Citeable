import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { FUNNEL_EVENTS, isFunnelEventName, recordFunnelEvent } from "@/lib/funnel";

export const dynamic = "force-dynamic";

type FunnelCountRow = {
  event_name: string;
  count: string;
};

type FunnelEventRow = {
  id: string;
  event_name: string;
  audit_id: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
};

function clientContext(req: NextRequest) {
  return {
    path: req.nextUrl.pathname,
    referrer: req.headers.get("referer")?.slice(0, 500) ?? null,
    userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
  };
}

export async function GET() {
  await ensureAuditSchema();

  const [countsResult, recentResult] = await Promise.all([
    pool.query<FunnelCountRow>(
      `SELECT event_name, COUNT(*)::text AS count
       FROM audit_funnel_events
       WHERE created_at >= now() - interval '14 days'
       GROUP BY event_name`
    ),
    pool.query<FunnelEventRow>(
      `SELECT id, event_name, audit_id, source, metadata, created_at
       FROM audit_funnel_events
       ORDER BY created_at DESC
       LIMIT 100`
    ),
  ]);

  const counts = Object.fromEntries(FUNNEL_EVENTS.map((eventName) => [eventName, 0])) as Record<(typeof FUNNEL_EVENTS)[number], number>;

  for (const row of countsResult.rows) {
    if (isFunnelEventName(row.event_name)) {
      counts[row.event_name] = Number(row.count);
    }
  }

  return NextResponse.json({
    ok: true,
    window: "14d",
    counts,
    recent_events: recentResult.rows.map((row) => ({
      id: row.id,
      event_name: row.event_name,
      audit_id: row.audit_id,
      source: row.source,
      metadata: row.metadata ?? {},
      created_at: row.created_at.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  await ensureAuditSchema();

  const payload = await req.json().catch(() => null);
  const events = Array.isArray(payload?.events) ? payload.events : [payload];
  let recorded = 0;

  for (const item of events) {
    if (!item || typeof item !== "object" || !isFunnelEventName((item as { event_name?: unknown }).event_name)) continue;

    const body = item as {
      event_name: (typeof FUNNEL_EVENTS)[number];
      audit_id?: unknown;
      source?: unknown;
      metadata?: unknown;
      dedupe_key?: unknown;
    };

    await recordFunnelEvent({
      eventName: body.event_name,
      auditId: typeof body.audit_id === "string" ? body.audit_id : null,
      source: typeof body.source === "string" ? body.source : "client",
      metadata: {
        ...clientContext(req),
        ...(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {}),
      },
      dedupeKey: typeof body.dedupe_key === "string" ? body.dedupe_key : null,
    });
    recorded += 1;
  }

  return NextResponse.json({ ok: true, recorded });
}
