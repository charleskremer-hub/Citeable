import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { runAudit, validateAuditInput } from "@/lib/audit-engine";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const payload = await req.json();
    const { email, brandName, websiteUrl } = validateAuditInput(payload);
    const auditId = typeof payload.audit_id === "string" ? payload.audit_id : undefined;

    if (auditId) {
      const existing = await pool.query<{
        id: string;
        score: number | null;
        engines_checked: unknown;
        competitors_found: unknown;
        fixes: unknown;
      }>(`SELECT id, score, engines_checked, competitors_found, fixes FROM audits WHERE id = $1`, [auditId]);

      if (existing.rows[0]?.score !== null && existing.rows[0]?.score !== undefined) {
        return NextResponse.json({
          audit_id: existing.rows[0].id,
          score: existing.rows[0].score,
          engines: existing.rows[0].engines_checked ?? [],
          competitors: existing.rows[0].competitors_found ?? [],
          fixes: existing.rows[0].fixes ?? [],
        });
      }

      const lockClient = await pool.connect();
      try {
        const lock = await lockClient.query<{ locked: boolean }>(
          `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
          [auditId]
        );

        if (!lock.rows[0]?.locked) {
          return NextResponse.json({ audit_id: auditId, status: "running" }, { status: 202 });
        }

        await pool.query(
          `UPDATE audits
           SET raw_results = $2
           WHERE id = $1 AND score IS NULL`,
          [auditId, { status: "running", startedAt: new Date().toISOString() }]
        );

        const report = await runAudit({ auditId, email, brandName, websiteUrl });

        return NextResponse.json({
          audit_id: report.audit_id,
          score: report.score,
          engines: report.engines,
          competitors: report.competitors,
          fixes: report.fixes,
        });
      } finally {
        await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [auditId]).catch(() => undefined);
        lockClient.release();
      }
    }

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
