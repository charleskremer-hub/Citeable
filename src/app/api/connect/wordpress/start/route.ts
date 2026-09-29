import { NextRequest, NextResponse } from "next/server";
import { normalizeRootDomain, verifyAiSiteToken } from "@/lib/ai-site";
import { discoverSite, wpAuthorizeLink } from "@/lib/wp-connect";

export const dynamic = "force-dynamic";

/**
 * « Connecter mon site » — envoie le cabinet sur l'écran « Autoriser
 * l'application » de SON WordPress. Site non connectable : retour à la page
 * d'onboarding, qui propose le repli.
 */
export async function GET(req: NextRequest) {
  const domain = normalizeRootDomain(req.nextUrl.searchParams.get("d") ?? "");
  const token = req.nextUrl.searchParams.get("k") ?? "";
  if (!domain || !verifyAiSiteToken(domain, token)) return NextResponse.json({ ok: false, error: "invalid link" }, { status: 403 });

  const site = await discoverSite(domain);
  if (site.kind === "wordpress") {
    return NextResponse.redirect(wpAuthorizeLink(site.authorizeUrl, { domain, token, baseUrl: req.nextUrl.origin }), 303);
  }
  const back = new URL(`/brancher/${encodeURIComponent(domain)}`, req.nextUrl.origin);
  back.searchParams.set("k", token);
  back.searchParams.set("site", site.kind);
  return NextResponse.redirect(back, 303);
}
