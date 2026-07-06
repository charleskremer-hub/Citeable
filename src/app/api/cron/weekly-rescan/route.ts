import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema } from "@/lib/db";
import { runDueWeeklyRescans } from "@/lib/audit-engine";

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
  const results = await runDueWeeklyRescans(2);

  return NextResponse.json({ ok: true, checked_at: new Date().toISOString(), rescans: results });
}
