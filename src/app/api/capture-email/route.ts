import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { runQueuedAudit, validateAuditInput } from "@/lib/audit-engine";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const payload = await req.json();
    const { email, brandName, websiteUrl } = validateAuditInput(payload);

    await pool.query(
      `INSERT INTO email_captures (email, brand_name, website_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
       SET brand_name = EXCLUDED.brand_name,
           website_url = EXCLUDED.website_url`,
      [email, brandName, websiteUrl]
    );

    const audit = await pool.query<{ id: string }>(
      `INSERT INTO audits (email, brand_name, website_url, raw_results)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email, brandName, websiteUrl, { status: "queued", queuedAt: new Date().toISOString() }]
    );

    const auditId = audit.rows[0].id;
    const result = await runQueuedAudit(auditId);

    console.log(`[citeable] audit queued: ${auditId} for ${email}; in-process status: ${result.status}`);

    if (result.status === "failed") {
      return NextResponse.json({ ok: false, audit_id: auditId, error: result.error }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        audit_id: auditId,
        website_url: websiteUrl,
        status: result.status === "complete" ? "completed" : "running",
        score: result.status === "complete" ? result.report.score : null,
        checks: result.status === "complete" ? result.report.checks : [],
        email_sent: result.status === "complete" ? result.report.emailSent : false,
        email_error: result.status === "complete" ? result.report.emailError : undefined,
      },
      { status: 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
