import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import type { AuditRawResults, BuyerIntentPromptResult } from "@/lib/audit-engine";
import { type Locale } from "@/lib/i18n";
import { computeShiftProof } from "@/lib/shift-proof";

export const dynamic = "force-dynamic";

type ShiftAuditRow = {
  id: string;
  brand_name: string;
  previous_audit_id: string | null;
  raw_results: AuditRawResults | null;
};

function promptsOf(row: ShiftAuditRow | null): BuyerIntentPromptResult[] {
  return row?.raw_results?.buyerIntentPrompts ?? [];
}

async function loadAudit(auditId: string): Promise<ShiftAuditRow | null> {
  const result = await pool.query<ShiftAuditRow>(
    `SELECT id, brand_name, previous_audit_id, raw_results
     FROM audits
     WHERE id = $1 AND score IS NOT NULL`,
    [auditId],
  );
  return result.rows[0] ?? null;
}

export async function GET(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const auditId = (req.nextUrl.searchParams.get("audit_id") ?? "").trim();
    if (!auditId) return NextResponse.json({ ok: false, error: "audit_id is required" }, { status: 400 });

    const current = await loadAudit(auditId);
    if (!current) return NextResponse.json({ ok: false, error: "audit not found or not completed" }, { status: 404 });

    const previous = current.previous_audit_id ? await loadAudit(current.previous_audit_id) : null;
    const locale: Locale = current.raw_results?.locale === "en" ? "en" : "fr";

    const proof = computeShiftProof(
      promptsOf(current),
      current.previous_audit_id ? promptsOf(previous) : null,
      locale,
    );

    return NextResponse.json({
      ok: true,
      audit_id: auditId,
      brand_name: current.brand_name,
      previous_audit_id: current.previous_audit_id,
      proof,
    });
  } catch (error) {
    console.error(`[getpick] shift-proof GET failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
