import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema } from "@/lib/db";
import { unsubscribeFromPostAuditEmails } from "@/lib/audit-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureAuditSchema();
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const email = await unsubscribeFromPostAuditEmails(token);

  if (!email) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  return new NextResponse("You have been unsubscribed from GetPick post-audit emails.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
