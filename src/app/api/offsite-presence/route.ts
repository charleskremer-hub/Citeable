import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { descriptionFromAudit, generateGeoAgentAssetsFromAudit } from "@/lib/audit-engine";
import type { AuditRawResults } from "@/lib/audit-engine";
import { type Locale } from "@/lib/i18n";
import { cityFromPrompts, hostedAnswerPageSlug } from "@/lib/hosted-answer-page";
import {
  buildPresencePack,
  isKnownOffsiteSourceKey,
  isValidPresenceStatus,
  type OffsitePresenceStatus,
} from "@/lib/offsite-sources";

export const dynamic = "force-dynamic";

const siteUrl = "https://www.getpick.ai";

type PresenceAuditRow = {
  id: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  competitors_found: string[] | null;
  raw_results: AuditRawResults | null;
};

async function loadAudit(auditId: string): Promise<PresenceAuditRow | null> {
  const result = await pool.query<PresenceAuditRow>(
    `SELECT id, brand_name, website_url, score, competitors_found, raw_results
     FROM audits
     WHERE id = $1 AND score IS NOT NULL`,
    [auditId],
  );
  return result.rows[0] ?? null;
}

async function statusByKey(auditId: string): Promise<Record<string, OffsitePresenceStatus>> {
  const result = await pool.query<{ source_key: string; status: string }>(
    `SELECT source_key, status FROM offsite_presence WHERE audit_id = $1`,
    [auditId],
  );
  const map: Record<string, OffsitePresenceStatus> = {};
  for (const row of result.rows) {
    if (isValidPresenceStatus(row.status)) map[row.source_key] = row.status;
  }
  return map;
}

export async function GET(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const auditId = (req.nextUrl.searchParams.get("audit_id") ?? "").trim();
    if (!auditId) return NextResponse.json({ ok: false, error: "audit_id is required" }, { status: 400 });

    const audit = await loadAudit(auditId);
    if (!audit) return NextResponse.json({ ok: false, error: "audit not found or not completed" }, { status: 404 });

    const assets = generateGeoAgentAssetsFromAudit(audit);
    const locale: Locale = audit.raw_results?.locale === "en" ? "en" : "fr";
    const pack = buildPresencePack(
      locale,
      {
        brandName: audit.brand_name,
        category: assets.category,
        city: cityFromPrompts(assets.prompts),
        websiteUrl: audit.website_url,
        description: descriptionFromAudit(audit.raw_results),
        competitors: assets.competitors,
        prompts: assets.prompts,
        hostedPageUrl: `${siteUrl}/reponses/${hostedAnswerPageSlug(audit.brand_name, audit.id)}`,
      },
      await statusByKey(auditId),
    );

    return NextResponse.json({ ok: true, audit_id: auditId, pack });
  } catch (error) {
    console.error(`[getpick] offsite-presence GET failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const body = (await req.json()) as { audit_id?: unknown; source_key?: unknown; status?: unknown };
    const auditId = typeof body.audit_id === "string" ? body.audit_id.trim() : "";
    const sourceKey = typeof body.source_key === "string" ? body.source_key.trim() : "";

    if (!auditId) return NextResponse.json({ ok: false, error: "audit_id is required" }, { status: 400 });
    if (!isKnownOffsiteSourceKey(sourceKey)) return NextResponse.json({ ok: false, error: "unknown source_key" }, { status: 400 });
    if (!isValidPresenceStatus(body.status)) return NextResponse.json({ ok: false, error: "invalid status" }, { status: 400 });

    const audit = await loadAudit(auditId);
    if (!audit) return NextResponse.json({ ok: false, error: "audit not found or not completed" }, { status: 404 });

    await pool.query(
      `INSERT INTO offsite_presence (audit_id, source_key, status, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (audit_id, source_key)
       DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
      [auditId, sourceKey, body.status],
    );

    return NextResponse.json({ ok: true, audit_id: auditId, source_key: sourceKey, status: body.status });
  } catch (error) {
    console.error(`[getpick] offsite-presence POST failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
