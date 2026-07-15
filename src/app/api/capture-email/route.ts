import { NextRequest, NextResponse, after } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { auditTierFromPayload, checkFreeAuditQuota, findFreshFreeGeminiAudit, brandDedupeDomain, createCachedFreeAuditForLead, recipientLocaleFromSignals, runQueuedAudit, validateAuditInput } from "@/lib/audit-engine";
import { recordFunnelEvent } from "@/lib/funnel";
import { localeFromUnknown } from "@/lib/i18n";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const payload = await req.json();
    const { email, brandName, websiteUrl } = validateAuditInput(payload);
    const auditTier = auditTierFromPayload(payload);
    const locale = payload && typeof payload === "object" && "locale" in payload ? localeFromUnknown((payload as Record<string, unknown>).locale) : recipientLocaleFromSignals(email, websiteUrl);
    const dedupeDomain = brandDedupeDomain(websiteUrl);

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
        const cachedLeadAudit = await createCachedFreeAuditForLead({ cachedAuditId: cachedAudit.id, email, brandName, websiteUrl, locale });
        const auditId = cachedLeadAudit?.audit_id ?? cachedAudit.id;

        await recordFunnelEvent({
          eventName: "audit_started",
          auditId,
          source: "capture_email_cached",
          metadata: { brandName, websiteUrl, auditTier, cachedFromAuditId: cachedAudit.id, locale },
          dedupeKey: `audit_started:${auditId}`,
        });
        await recordFunnelEvent({
          eventName: "audit_completed",
          auditId,
          source: "capture_email_cached",
          metadata: { brandName, websiteUrl, auditTier, cachedFromAuditId: cachedAudit.id, locale },
          dedupeKey: `audit_completed:${auditId}`,
        });

        return NextResponse.json(
          {
            ok: true,
            audit_id: auditId,
            website_url: cachedLeadAudit?.website_url ?? cachedAudit.website_url,
            redirect_url: `/audit/${auditId}`,
            status: "completed",
            audit_tier: auditTier,
            cached: true,
            cached_from_audit_id: cachedLeadAudit?.cached_from_audit_id ?? cachedAudit.id,
            email_sent: cachedLeadAudit?.email_sent,
            email_error: cachedLeadAudit?.email_error,
            scheduled_post_audit_emails: cachedLeadAudit?.scheduled_post_audit_emails ?? [],
            locale,
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
      `INSERT INTO audits (email, brand_name, website_url, dedupe_domain, raw_results)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [email, brandName, websiteUrl, dedupeDomain, { status: "running", queuedAt: new Date().toISOString(), auditTier, locale }]
    );

    const auditId = audit.rows[0].id;

    await recordFunnelEvent({
      eventName: "audit_started",
      auditId,
      source: "capture_email",
      metadata: { brandName, websiteUrl, auditTier, locale },
      dedupeKey: `audit_started:${auditId}`,
    });

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
        locale,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
