import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import type { AuditRawResults, BuyerIntentPromptResult } from "@/lib/audit-engine";
import { type Locale } from "@/lib/i18n";
import { computeGeoVisibility } from "@/lib/geo-visibility";

export const dynamic = "force-dynamic";

type VisibilityAuditRow = {
  id: string;
  brand_name: string;
  raw_results: AuditRawResults | null;
};

export async function GET(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const auditId = (req.nextUrl.searchParams.get("audit_id") ?? "").trim();
    if (!auditId) return NextResponse.json({ ok: false, error: "audit_id is required" }, { status: 400 });

    const result = await pool.query<VisibilityAuditRow>(
      `SELECT id, brand_name, raw_results FROM audits WHERE id = $1 AND score IS NOT NULL`,
      [auditId],
    );
    const audit = result.rows[0];
    if (!audit) return NextResponse.json({ ok: false, error: "audit not found or not completed" }, { status: 404 });

    const prompts: BuyerIntentPromptResult[] = audit.raw_results?.buyerIntentPrompts ?? [];
    const locale: Locale = audit.raw_results?.locale === "en" ? "en" : "fr";
    const visibility = computeGeoVisibility(prompts, audit.brand_name, locale);

    return NextResponse.json({ ok: true, audit_id: auditId, brand_name: audit.brand_name, visibility });
  } catch (error) {
    console.error(`[getpick] geo-visibility GET failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
