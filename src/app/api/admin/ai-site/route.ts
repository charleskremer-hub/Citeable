import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { AI_SUBDOMAIN, addDomainToVercel, aiSiteToken, normalizeRootDomain } from "@/lib/ai-site";
import { generateAiSiteAnswers } from "@/lib/ai-site-store";
import { publishAnswersToWordPress } from "@/lib/cms-connection-store";

export const dynamic = "force-dynamic";

const ADMIN_KEY = process.env.FUNNEL_ADMIN_KEY;

function secretMatches(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Ouvre le sous-domaine `ai.<domaine>` d'un cabinet (interne, clé admin) :
 * enregistre le rattachement à son audit, ajoute le domaine au projet Vercel,
 * et rend le lien d'onboarding à envoyer au cabinet (un seul geste DNS).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { audit_id?: unknown; domain?: unknown; key?: unknown; action?: unknown };
  const key = typeof body.key === "string" ? body.key : req.headers.get("x-admin-key");
  if (!secretMatches(key, ADMIN_KEY)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // Republier la page-réponses sur le WordPress connecté (après une mise à jour du contenu).
  if (body.action === "publish") {
    const target = typeof body.domain === "string" ? normalizeRootDomain(body.domain) : null;
    if (!target) return NextResponse.json({ ok: false, error: "domain is required" }, { status: 400 });
    return NextResponse.json(await publishAnswersToWordPress(target));
  }

  const auditId = typeof body.audit_id === "string" ? body.audit_id.trim() : "";
  const domain = typeof body.domain === "string" ? normalizeRootDomain(body.domain) : null;
  if (!auditId || !domain) return NextResponse.json({ ok: false, error: "audit_id and domain are required" }, { status: 400 });

  await ensureAuditSchema();
  const audit = await pool.query(`SELECT id FROM audits WHERE id = $1 AND score IS NOT NULL`, [auditId]);
  if (!audit.rowCount) return NextResponse.json({ ok: false, error: "audit not found or not completed" }, { status: 404 });

  await pool.query(
    `INSERT INTO ai_sites (domain, audit_id) VALUES ($1, $2)
     ON CONFLICT (domain) DO UPDATE SET audit_id = EXCLUDED.audit_id`,
    [domain, auditId]
  );
  const host = `${AI_SUBDOMAIN}.${domain}`;
  const vercel = await addDomainToVercel(host);
  const contentWritten = await generateAiSiteAnswers(domain);

  return NextResponse.json({
    ok: true,
    domain,
    host,
    vercel,
    content_written: contentWritten,
    onboarding_url: `https://www.getpick.ai/brancher/${encodeURIComponent(domain)}?k=${aiSiteToken(domain)}`,
  });
}
