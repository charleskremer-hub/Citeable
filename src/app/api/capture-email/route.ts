import { NextRequest, NextResponse, after } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { auditTierFromPayload, checkFreeAuditQuota, findFreshFreeGeminiAudit, runQueuedAudit, validateAuditInput } from "@/lib/audit-engine";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const payload = await req.json();
    const { email, brandName, websiteUrl } = validateAuditInput(payload);
    const auditTier = auditTierFromPayload(payload);

    await pool.query(
      `INSERT INTO email_captures (email, brand_name, website_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
       SET brand_name = EXCLUDED.brand_name,
           website_url = EXCLUDED.website_url`,
      [email, brandName, websiteUrl]
    );

    if (auditTier === "free") {
      const cachedAudit = await findFreshFreeGeminiAudit(brandName, websiteUrl);

      if (cachedAudit) {
        return NextResponse.json(
          {
            ok: true,
            audit_id: cachedAudit.id,
            website_url: cachedAudit.website_url,
            redirect_url: `/audit/${cachedAudit.id}`,
            status: "completed",
            audit_tier: auditTier,
            cached: true,
          },
          { status: 200 }
        );
      }

      const quota = await checkFreeAuditQuota(email, websiteUrl);

      if (!quota.allowed) {
        return NextResponse.json({ error: quota.error, limit_type: quota.limitType, retry_after_hours: quota.retryAfterHours }, { status: 429 });
      }
    }

    const audit = await pool.query<{ id: string }>(
      `INSERT INTO audits (email, brand_name, website_url, raw_results)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email, brandName, websiteUrl, { status: "running", queuedAt: new Date().toISOString(), auditTier }]
    );

    const auditId = audit.rows[0].id;

    after(async () => {
      const result = await runQueuedAudit(auditId);

      if (result.status === "failed") {
        console.error(`[citeable] audit ${auditId} failed after capture: ${result.error}`);
      }
    });

    console.log(`[citeable] audit queued immediately: ${auditId} for ${email}`);

    return NextResponse.json(
      {
        ok: true,
        audit_id: auditId,
        website_url: websiteUrl,
        redirect_url: `/audit/${auditId}`,
        status: "queued",
        audit_tier: auditTier,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
