import { NextRequest, NextResponse, after } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { runQueuedAudit, validateAuditInput } from "@/lib/audit-engine";

export const maxDuration = 60;

type AuditRow = {
  id: string;
  email: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  engines_checked: unknown;
  competitors_found: unknown;
  fixes: unknown;
  raw_results: { status?: string; error?: string; checks?: unknown; emailSent?: boolean; emailError?: string } | null;
};

function runAuditAfterResponse(auditId: string) {
  after(async () => {
    const result = await runQueuedAudit(auditId);
    if (result.status === "failed") {
      console.error(`[citeable] audit ${auditId} failed: ${result.error}`);
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const payload = await req.json();
    const auditId = typeof payload.audit_id === "string" ? payload.audit_id : undefined;

    if (auditId) {
      const existing = await pool.query<AuditRow>(`SELECT * FROM audits WHERE id = $1`, [auditId]);
      const row = existing.rows[0];

      if (!row) {
        return NextResponse.json({ error: "Audit not found" }, { status: 404 });
      }

      if (row.score !== null && row.score !== undefined) {
        return NextResponse.json({
          audit_id: row.id,
          status: "completed",
          score: row.score,
          engines: row.engines_checked ?? [],
          competitors: row.competitors_found ?? [],
          fixes: row.fixes ?? [],
          checks: row.raw_results?.checks ?? [],
          email_sent: Boolean(row.raw_results?.emailSent),
          email_error: row.raw_results?.emailError,
        });
      }

      if (row.raw_results?.status === "failed") {
        return NextResponse.json({ audit_id: row.id, status: "failed", error: row.raw_results.error }, { status: 500 });
      }

      runAuditAfterResponse(auditId);
      return NextResponse.json({ audit_id: auditId, status: "running" }, { status: 202 });
    }

    const { email, brandName, websiteUrl } = validateAuditInput(payload);
    const audit = await pool.query<{ id: string }>(
      `INSERT INTO audits (email, brand_name, website_url, raw_results)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email, brandName, websiteUrl, { status: "queued", queuedAt: new Date().toISOString() }]
    );
    const createdAuditId = audit.rows[0].id;

    runAuditAfterResponse(createdAuditId);

    return NextResponse.json({ audit_id: createdAuditId, status: "running" }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audit failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
