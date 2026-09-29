import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { AI_SUBDOMAIN, cnamePointsToUs, dohLookup, normalizeRootDomain, pingIndexNow, verifyAiSiteToken } from "@/lib/ai-site";

export const dynamic = "force-dynamic";

/**
 * « Vérifier » — appelé par la page d'onboarding. Trois états, du point de vue
 * du cabinet : DNS pas encore vu · DNS vu, certificat en cours · en ligne.
 * « En ligne » n'est déclaré que si `https://ai.<domaine>/llms.txt` répond :
 * on vérifie la chose elle-même, pas un indice.
 */
export async function GET(req: NextRequest) {
  const domain = normalizeRootDomain(req.nextUrl.searchParams.get("domain") ?? "");
  const token = req.nextUrl.searchParams.get("k") ?? "";
  if (!domain || !verifyAiSiteToken(domain, token)) return NextResponse.json({ ok: false, error: "invalid link" }, { status: 403 });

  const host = `${AI_SUBDOMAIN}.${domain}`;
  const cname = await dohLookup(host, "CNAME");
  if (!cnamePointsToUs(cname)) return NextResponse.json({ ok: true, state: "dns_missing", cname });

  let live = false;
  try {
    const response = await fetch(`https://${host}/llms.txt`, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    live = response.ok && (await response.text()).startsWith("# ");
  } catch {
    live = false;
  }
  if (!live) return NextResponse.json({ ok: true, state: "certificate_pending" });

  await ensureAuditSchema();
  const updated = await pool.query<{ indexnow_pinged_at: string | null }>(
    `UPDATE ai_sites SET status = 'live', live_at = COALESCE(live_at, now()) WHERE domain = $1 RETURNING indexnow_pinged_at`,
    [domain]
  );
  if (updated.rows[0] && !updated.rows[0].indexnow_pinged_at) {
    const ping = await pingIndexNow(host);
    if (ping.ok) await pool.query(`UPDATE ai_sites SET indexnow_pinged_at = now() WHERE domain = $1`, [domain]);
  }
  return NextResponse.json({ ok: true, state: "live", url: `https://${host}/` });
}
