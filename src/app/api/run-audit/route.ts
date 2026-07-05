import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { runAudit, runQueuedAudit, validateAuditInput } from "@/lib/audit-engine";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const payload = await req.json();
    const auditId = typeof payload.audit_id === "string" ? payload.audit_id : undefined;

    if (auditId) {
      const existing = await pool.query<{
        id: string;
        score: number | null;
        engines_checked: unknown;
        competitors_found: unknown;
        fixes: unknown;
        raw_results: { status?: string; error?: string } | null;
      }>(`SELECT id, score, engines_checked, competitors_found, fixes, raw_results FROM audits WHERE id = $1`, [auditId]);

      const row = existing.rows[0];
      if (!row) {
        return NextResponse.json({ error: "Audit not found" }, { status: 404 });
      }

      if (row.score !== null && row.score !== undefined) {
        return NextResponse.json({
          audit_id: row.id,
          score: row.score,
          engines: row.engines_checked ?? [],
          competitors: row.competitors_found ?? [],
          fixes: row.fixes ?? [],
        });
      }

      if (row.raw_results?.status === "failed") {
        return NextResponse.json({ audit_id: row.id, status: "failed", error: row.raw_results.error }, { status: 500 });
      }

      const result = await runQueuedAudit(auditId);
      if (result.status === "running") {
        return NextResponse.json({ audit_id: auditId, status: "running" }, { status: 202 });
      }

      if (result.status === "complete" && result.report) {
        return NextResponse.json({
          audit_id: result.report.audit_id,
          score: result.report.score,
          engines: result.report.engines,
          competitors: result.report.competitors,
          fixes: result.report.fixes,
        });
      }

      return NextResponse.json({ audit_id: auditId, status: result.status, score: result.score });
    }

    const { email, brandName, websiteUrl } = validateAuditInput(payload);
    const report = await runAudit({ email, brandName, websiteUrl });

    return NextResponse.json({
      audit_id: report.audit_id,
      score: report.score,
      engines: report.engines,
      competitors: report.competitors,
      fixes: report.fixes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audit failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
