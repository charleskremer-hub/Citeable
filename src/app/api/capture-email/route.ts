import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { validateAuditInput } from "@/lib/audit-engine";

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

    console.log(`[citeable] audit queued: ${audit.rows[0].id} for ${email}`);

    return NextResponse.json({ ok: true, audit_id: audit.rows[0].id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
