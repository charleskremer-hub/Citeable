import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema } from "@/lib/db";
import { getRescanQueueStatus, runDueWeeklyRescans } from "@/lib/audit-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;

  return req.headers.get("authorization") === `Bearer ${expected}` || req.nextUrl.searchParams.get("secret") === expected;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAuditSchema();
  // Mesuré AVANT `runDueWeeklyRescans` : `due_count` est « le nombre de marques
  // dues à l'instant de la requête », pas le reste après consommation de la
  // file. Une marque due rescannée dans ce même appel compte donc pour 1.
  const queue = await getRescanQueueStatus();
  const results = await runDueWeeklyRescans(2);

  return NextResponse.json({
    ok: true,
    checked_at: new Date().toISOString(),
    rescans: results,
    due_count: queue.due_count,
    next_due_at: queue.next_due_at,
  });
}
