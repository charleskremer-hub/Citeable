import { NextRequest, NextResponse, after } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { validateAuditInput } from "@/lib/audit-engine";

export const maxDuration = 60;

function runAuditAfterResponse(auditId: string, requestUrl: string) {
  const runAuditUrl = new URL("/api/run-audit", requestUrl);

  after(async () => {
    try {
      const response = await fetch(runAuditUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_id: auditId }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error(`[citeable] audit ${auditId} trigger failed with HTTP ${response.status}: ${detail}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown run-audit trigger error";
      console.error(`[citeable] audit ${auditId} trigger failed: ${message}`);
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
    runAuditAfterResponse(auditId, req.url);

    console.log(`[citeable] audit queued: ${auditId} for ${email}; triggering in-process run-audit`);

    return NextResponse.json(
      {
        ok: true,
        audit_id: auditId,
        website_url: websiteUrl,
        status: "running",
      },
      { status: 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
