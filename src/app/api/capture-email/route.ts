import { after, NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { runQueuedAudit, validateAuditInput } from "@/lib/audit-engine";

export const maxDuration = 60;

function startQueuedAudit(auditId: string) {
  after(async () => {
    try {
      const result = await runQueuedAudit(auditId);
      console.log(`[citeable] audit ${auditId} ${result.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audit failed";
      console.error(`[citeable] audit ${auditId} failed: ${message}`);
    }
  });
}

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
    console.log(`[citeable] audit queued: ${auditId} for ${email}`);
    startQueuedAudit(auditId);

    return NextResponse.json({ ok: true, audit_id: auditId, website_url: websiteUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
