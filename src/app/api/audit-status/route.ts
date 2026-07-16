import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  email: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  engines_checked: unknown;
  competitors_found: unknown;
  fixes: unknown;
  raw_results: { status?: string; error?: string; checks?: unknown; emailSent?: boolean; emailError?: string; category?: string; icpSegment?: unknown; buyerIntentPrompts?: unknown; promptDebug?: string; auditTier?: string; answerEngine?: unknown; brandSentiment?: unknown; locale?: string } | null;
};

export async function GET(req: NextRequest) {
  await ensureAuditSchema();
  const auditId = req.nextUrl.searchParams.get("audit_id");

  if (!auditId) {
    return NextResponse.json({ error: "audit_id is required" }, { status: 400 });
  }

  const result = await pool.query<AuditRow>(`SELECT * FROM audits WHERE id = $1`, [auditId]);
  const audit = result.rows[0];

  if (!audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const completed = audit.score !== null && audit.score !== undefined;

  return NextResponse.json({
    audit_id: audit.id,
    status: completed ? "completed" : audit.raw_results?.status ?? "queued",
    brand_name: audit.brand_name,
    website_url: audit.website_url,
    score: audit.score,
    checks: audit.raw_results?.checks ?? [],
    engines: audit.engines_checked ?? [],
    competitors: audit.competitors_found ?? [],
    buyer_intent_prompts: audit.raw_results?.buyerIntentPrompts ?? [],
    prompt_debug: audit.raw_results?.promptDebug,
    category: audit.raw_results?.category,
    icp_segment: audit.raw_results?.icpSegment,
    audit_tier: audit.raw_results?.auditTier ?? "free",
    answer_engine: audit.raw_results?.answerEngine,
    brand_sentiment: audit.raw_results?.brandSentiment,
    fixes: audit.fixes ?? [],
    email_sent: Boolean(audit.raw_results?.emailSent),
    email_error: audit.raw_results?.emailError,
    locale: audit.raw_results?.locale ?? "en",
    error: audit.raw_results?.error,
  });
}
