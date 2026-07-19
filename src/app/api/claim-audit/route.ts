import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { isAnonymousEmail } from "@/lib/audit-engine";
import { recordFunnelEvent } from "@/lib/funnel";

export const dynamic = "force-dynamic";

/**
 * Rattache un email à un audit lancé anonymement.
 *
 * L'audit sans friction montre le verdict d'abord ; c'est ici que le lead est
 * réellement capturé, en échange du rapport détaillé. On ne réclame que les
 * audits encore anonymes : un audit déjà nominatif n'est jamais réattribué.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const body = (await req.json()) as { audit_id?: string; email?: string };
    const auditId = typeof body.audit_id === "string" ? body.audit_id.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!auditId) return NextResponse.json({ error: "audit_id is required." }, { status: 400 });
    if (!email || !email.includes("@")) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });

    const existing = await pool.query<{ id: string; email: string; brand_name: string; website_url: string }>(
      `SELECT id, email, brand_name, website_url FROM audits WHERE id = $1`,
      [auditId]
    );
    const audit = existing.rows[0];
    if (!audit) return NextResponse.json({ error: "Audit not found." }, { status: 404 });

    // Audit déjà nominatif : on ne l'écrase pas, on répond OK pour rester idempotent.
    if (!isAnonymousEmail(audit.email)) {
      return NextResponse.json({ ok: true, already_claimed: true }, { status: 200 });
    }

    await pool.query(`UPDATE audits SET email = $1 WHERE id = $2`, [email, auditId]);

    await pool.query(
      `INSERT INTO email_captures (email, brand_name, website_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
       SET brand_name = EXCLUDED.brand_name,
           website_url = EXCLUDED.website_url`,
      [email, audit.brand_name, audit.website_url]
    );

    await recordFunnelEvent({
      eventName: "email_captured",
      auditId,
      source: "report_gate",
      metadata: { brandName: audit.brand_name, websiteUrl: audit.website_url },
      dedupeKey: `email_captured:${auditId}`,
    });

    return NextResponse.json({ ok: true, already_claimed: false }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not claim this audit.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
