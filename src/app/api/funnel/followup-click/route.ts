import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema } from "@/lib/db";
import { AGENT_CHECKOUT_URL } from "@/lib/checkout-links";
import { recordFunnelEvent } from "@/lib/funnel";

export const dynamic = "force-dynamic";

const validUuid = (value: string | null) =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

function reportUrl(req: NextRequest, auditId: string) {
  return new URL(`/audit/${auditId}`, req.nextUrl.origin).toString();
}

export async function GET(req: NextRequest) {
  await ensureAuditSchema();

  const auditId = req.nextUrl.searchParams.get("audit_id");
  const step = req.nextUrl.searchParams.get("step") === "j3_offer" ? "j3_offer" : "j1_value";
  const target = req.nextUrl.searchParams.get("target") === "agent_checkout" ? "agent_checkout" : "report";
  const redirectUrl = validUuid(auditId) && target === "report" ? reportUrl(req, auditId as string) : AGENT_CHECKOUT_URL;

  await recordFunnelEvent({
    eventName: "followup_click",
    auditId: validUuid(auditId) ? auditId : null,
    source: "post_audit_email",
    metadata: {
      step,
      target,
      redirect_url: redirectUrl,
      referrer: req.headers.get("referer")?.slice(0, 500) ?? null,
      userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
  });

  return NextResponse.redirect(redirectUrl, { status: 302 });
}
