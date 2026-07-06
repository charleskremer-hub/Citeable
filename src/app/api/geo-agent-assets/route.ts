import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { generateGeoAgentAssetsFromAudit } from "@/lib/audit-engine";
import type { BuyerIntentPromptResult } from "@/lib/audit-engine";

export const dynamic = "force-dynamic";

type GeoAssetAuditRow = {
  id: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  competitors_found: string[] | null;
  raw_results: {
    category?: string;
    buyerIntentPrompts?: BuyerIntentPromptResult[];
    geoAgentDescription?: string;
  } | null;
};

async function fetchBrandDescription(websiteUrl: string) {
  try {
    const llmsUrl = new URL("/llms.txt", websiteUrl).toString();
    const response = await fetch(llmsUrl, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return "";

    const text = await response.text();
    const quote = text.match(/^>\s*(.+)$/m)?.[1];
    const paragraph = text.split(/\n\s*\n/).find((block) => block.trim() && !block.startsWith("#") && !block.startsWith(">"));
    return (quote ?? paragraph ?? "").replace(/\s+/g, " ").trim().slice(0, 700);
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const body = (await req.json()) as { audit_id?: string; brand_name?: string };
    const auditId = typeof body.audit_id === "string" ? body.audit_id.trim() : "";
    const brandName = typeof body.brand_name === "string" ? body.brand_name.trim() : "";

    const result = auditId
      ? await pool.query<GeoAssetAuditRow>(
          `SELECT id, brand_name, website_url, score, competitors_found, raw_results
           FROM audits
           WHERE id = $1 AND score IS NOT NULL`,
          [auditId]
        )
      : await pool.query<GeoAssetAuditRow>(
          `SELECT id, brand_name, website_url, score, competitors_found, raw_results
           FROM audits
           WHERE lower(brand_name) = lower($1) AND score IS NOT NULL
           ORDER BY created_at DESC
           LIMIT 1`,
          [brandName]
        );

    const audit = result.rows[0];

    if (!audit) {
      return NextResponse.json({ error: "Completed audit not found." }, { status: 404 });
    }

    const description = await fetchBrandDescription(audit.website_url);
    const enrichedAudit = description
      ? { ...audit, raw_results: { ...(audit.raw_results ?? {}), geoAgentDescription: description } }
      : audit;

    return NextResponse.json({ ok: true, assets: generateGeoAgentAssetsFromAudit(enrichedAudit) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate GEO Agent assets.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
