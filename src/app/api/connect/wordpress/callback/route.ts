import { after, NextRequest, NextResponse } from "next/server";
import { normalizeRootDomain, verifyAiSiteToken } from "@/lib/ai-site";
import { discoverSite, parseWpCallback, verifyWpCredentials } from "@/lib/wp-connect";
import { notifyCustomerPublished, publishAnswersToWordPress, saveWordPressConnection } from "@/lib/cms-connection-store";
import { sendFounderAlert } from "@/lib/lead-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Retour de l'écran WordPress « Approuver ». Le mot de passe d'application
 * arrive en paramètre (protocole WordPress) : on le vérifie, on le chiffre, et
 * on redirige AUSSITÔT vers une URL qui ne le porte plus. La publication part
 * après la réponse.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const domain = normalizeRootDomain(params.get("d") ?? "");
  const token = params.get("k") ?? "";
  if (!domain || !verifyAiSiteToken(domain, token)) return NextResponse.json({ ok: false, error: "invalid link" }, { status: 403 });

  const back = new URL(`/brancher/${encodeURIComponent(domain)}`, req.nextUrl.origin);
  back.searchParams.set("k", token);

  const parsed = parseWpCallback(params, domain);
  if (!parsed.ok) {
    back.searchParams.set("connexion", parsed.reason);
    return NextResponse.redirect(back, 303);
  }

  const site = await discoverSite(domain);
  const restUrl = site.kind === "wordpress" || site.kind === "wordpress_locked" ? site.restUrl : null;
  const check = restUrl ? await verifyWpCredentials(restUrl, parsed.userLogin, parsed.password) : { ok: false as const, reason: "no_rest" };
  if (!restUrl || !check.ok) {
    back.searchParams.set("connexion", check.ok ? "no_rest" : check.reason);
    return NextResponse.redirect(back, 303);
  }

  await saveWordPressConnection({ domain, siteUrl: parsed.siteUrl, restUrl, userLogin: parsed.userLogin, password: parsed.password });
  after(async () => {
    const published = await publishAnswersToWordPress(domain);
    if (published.ok) await notifyCustomerPublished(domain, published.url, published.firstTime);
    await sendFounderAlert(
      `[GetPick] Site connecté : ${domain}${published.ok ? " — page publiée" : " — publication en échec"}`,
      published.ok ? `Page publiée : ${published.url}` : `Échec : ${published.reason}. Relancer via /api/admin/ai-site (publish).`
    );
  });
  back.searchParams.set("connexion", "ok");
  return NextResponse.redirect(back, 303);
}
