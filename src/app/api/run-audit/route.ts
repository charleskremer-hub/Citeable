import { NextRequest, NextResponse, after } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { auditTierFromPayload, checkFreeAuditQuota, findFreshFreeGeminiAudit, brandDedupeDomain, createCachedFreeAuditForLead, recipientLocaleFromSignals, runQueuedAudit, validateAuditInput } from "@/lib/audit-engine";
import { recordFunnelEvent } from "@/lib/funnel";
import { localeFromUnknown } from "@/lib/i18n";

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
  raw_results: { status?: string; error?: string; checks?: unknown; emailSent?: boolean; emailError?: string; category?: string; icpSegment?: unknown; buyerIntentPrompts?: unknown; auditTier?: string; answerEngine?: unknown; startedAt?: string; locale?: string } | null;
};

function isFreshStartedAt(value: string | undefined) {
  if (!value) return false;

  const startedAt = Date.parse(value);
  return Number.isFinite(startedAt) && Date.now() - startedAt < 2 * 60 * 1000;
}

function runAuditAfterResponse(auditId: string) {
  after(async () => {
    const result = await runQueuedAudit(auditId);
    if (result.status === "failed") {
      console.error(`[getpick] audit ${auditId} failed: ${result.error}`);
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const payload = await req.json();
    const auditTier = auditTierFromPayload(payload);
    const requestedLocale = payload && typeof payload === "object" && "locale" in payload ? localeFromUnknown((payload as Record<string, unknown>).locale) : undefined;
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
          buyer_intent_prompts: row.raw_results?.buyerIntentPrompts ?? [],
          category: row.raw_results?.category,
          icp_segment: row.raw_results?.icpSegment,
          audit_tier: row.raw_results?.auditTier ?? "free",
          answer_engine: row.raw_results?.answerEngine,
          fixes: row.fixes ?? [],
          checks: row.raw_results?.checks ?? [],
          email_sent: Boolean(row.raw_results?.emailSent),
          email_error: row.raw_results?.emailError,
          locale: row.raw_results?.locale ?? "en",
        });
      }

      if (row.raw_results?.status === "failed") {
        return NextResponse.json({ audit_id: row.id, status: "failed", error: row.raw_results.error }, { status: 500 });
      }

      if ((auditTier !== "free" && row.raw_results?.auditTier !== auditTier) || !row.raw_results?.locale) {
        await pool.query(
          `UPDATE audits
           SET raw_results = COALESCE(raw_results, '{}'::jsonb) || $2::jsonb
           WHERE id = $1`,
          [auditId, { auditTier: auditTier !== "free" ? auditTier : row.raw_results?.auditTier ?? "free", locale: row.raw_results?.locale ?? "en" }]
        );
      }

      if (row.raw_results?.status === "running" && isFreshStartedAt(row.raw_results?.startedAt)) {
        return NextResponse.json({ audit_id: auditId, status: "running" }, { status: 202 });
      }

      runAuditAfterResponse(auditId);
      return NextResponse.json({ audit_id: auditId, status: "running" }, { status: 202 });
    }

    const { email, brandName, websiteUrl } = validateAuditInput(payload);
    const locale = requestedLocale ?? recipientLocaleFromSignals(email, websiteUrl);
    const dedupeDomain = brandDedupeDomain(websiteUrl);

    if (auditTier === "free") {
      const cachedAudit = await findFreshFreeGeminiAudit(brandName, websiteUrl);

      if (cachedAudit) {
        const cachedLeadAudit = await createCachedFreeAuditForLead({ cachedAuditId: cachedAudit.id, email, brandName, websiteUrl, locale });
        const createdOrCachedAuditId = cachedLeadAudit?.audit_id ?? cachedAudit.id;

        await recordFunnelEvent({
          eventName: "audit_started",
          auditId: createdOrCachedAuditId,
          source: "run_audit_cached",
          metadata: { brandName, websiteUrl, auditTier, cachedFromAuditId: cachedAudit.id, locale },
          dedupeKey: `audit_started:${createdOrCachedAuditId}`,
        });
        await recordFunnelEvent({
          eventName: "audit_completed",
          auditId: createdOrCachedAuditId,
          source: "run_audit_cached",
          metadata: { brandName, websiteUrl, auditTier, cachedFromAuditId: cachedAudit.id, locale },
          dedupeKey: `audit_completed:${createdOrCachedAuditId}`,
        });

        return NextResponse.json({
          audit_id: createdOrCachedAuditId,
          status: "completed",
          audit_tier: auditTier,
          cached: true,
          cached_from_audit_id: cachedLeadAudit?.cached_from_audit_id ?? cachedAudit.id,
          email_sent: cachedLeadAudit?.email_sent,
          email_error: cachedLeadAudit?.email_error,
          scheduled_post_audit_emails: cachedLeadAudit?.scheduled_post_audit_emails ?? [],
          locale,
        });
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
      [email, brandName, websiteUrl, dedupeDomain, { status: "queued", queuedAt: new Date().toISOString(), auditTier, locale }]
    );
    const createdAuditId = audit.rows[0].id;

    await recordFunnelEvent({
      eventName: "audit_started",
      auditId: createdAuditId,
      source: "run_audit",
      metadata: { brandName, websiteUrl, auditTier, locale },
      dedupeKey: `audit_started:${createdAuditId}`,
    });

    runAuditAfterResponse(createdAuditId);

    return NextResponse.json({ audit_id: createdAuditId, status: "running", audit_tier: auditTier, locale }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audit failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
