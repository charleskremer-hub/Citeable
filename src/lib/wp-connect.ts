/**
 * « CONNECTER MON SITE » — l'agent GEO publie DIRECTEMENT sur le site du cabinet.
 *
 * Demande de Charles (29/09/2026) : « un agent GEO comme Delos — pas de fichier
 * à pousser au webmaster ». Le modèle Delos : on recrute un agent, on connecte
 * ses outils, il agit seul. Ici l'outil, c'est le site du cabinet.
 *
 * Mesuré le 29/09 sur le lot 1 (14 sites joignables) : 10 WordPress, 1 Wix,
 * 3 autres. Sur les 10 WordPress, 6 exposent la connexion d'application native
 * (WordPress ≥ 5.6, `authorize-application.php`) : le cabinet clique
 * « Connecter », se connecte à SON WordPress, clique « Approuver » — c'est tout.
 * Pas de plugin, pas de DNS, pas de webmaster. WordPress nous rend un mot de
 * passe d'application révocable à tout moment depuis son profil.
 *
 * Pourquoi c'est mieux que `ai.<domaine>` : le Baromètre #0 montre qu'un cabinet
 * cité par Gemini a vu SON site lu dans 22 cas sur 24. Une page publiée sur le
 * domaine établi du cabinet hérite de son ancienneté ; un sous-domaine neuf part
 * de zéro. `ai.` reste le repli pour les sites non connectables.
 *
 * Règles : le secret est chiffré au repos (AES-256-GCM) ; on ne publie qu'une
 * page de FAITS (aucune mention de GetPick, aucun concurrent, aucun superlatif) ;
 * une seule page par cabinet, mise à jour en place (jamais de doublons).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { AiSiteContent } from "@/lib/ai-site";

/** Identifiant fixe de l'application GetPick côté WordPress (UUID exigé par WP). */
export const GETPICK_WP_APP_ID = "5f0c9a3e-2b7d-4c61-9e84-8a1d3f6b2c47";
export const GETPICK_WP_APP_NAME = "GetPick — agent GEO";

type Env = Record<string, string | undefined>;
type FetchImpl = typeof fetch;
const UA = "Mozilla/5.0 (compatible; GetPick/1.0; +https://www.getpick.ai)";

// --- Détection : ce site est-il connectable en un clic ? ------------------------

export type SiteDiscovery =
  | { kind: "wordpress"; siteUrl: string; restUrl: string; authorizeUrl: string }
  | { kind: "wordpress_locked"; siteUrl: string; restUrl: string | null }
  | { kind: "wix"; siteUrl: string }
  | { kind: "other"; siteUrl: string }
  | { kind: "unreachable"; siteUrl: string };

/** L'URL de l'API REST déclarée par WordPress lui-même (`<link rel="https://api.w.org/">`). */
export function wpRestUrlFromHtml(html: string, pageUrl: string): string | null {
  const tag = html.match(/<link[^>]+rel=["']https:\/\/api\.w\.org\/["'][^>]*>/i)?.[0];
  const href = tag?.match(/href=["']([^"']+)["']/i)?.[1];
  if (href) {
    try {
      return new URL(href.replace(/&amp;/g, "&"), pageUrl).toString();
    } catch {
      return null;
    }
  }
  if (/wp-content\/|wp-includes\//i.test(html)) {
    try {
      return new URL("/wp-json/", pageUrl).toString();
    } catch {
      return null;
    }
  }
  return null;
}

/** L'écran « Autoriser l'application » annoncé par l'index REST, ou null s'il est désactivé. */
export function authorizeUrlFromRestIndex(index: unknown): string | null {
  const auth = (index as { authentication?: Record<string, { endpoints?: { authorization?: unknown } }> } | null)?.authentication;
  const url = auth?.["application-passwords"]?.endpoints?.authorization;
  return typeof url === "string" && /^https:\/\//.test(url) ? url : null;
}

export async function discoverSite(domain: string, fetchImpl: FetchImpl = fetch): Promise<SiteDiscovery> {
  let html = "";
  let siteUrl = `https://${domain}/`;
  let reached = false;
  // Apex puis www : beaucoup de sites de cabinets ne répondent que sur une des deux (30/09).
  for (const start of [`https://${domain}/`, `https://www.${domain}/`]) {
    try {
      const response = await fetchImpl(start, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(8000) });
      if (!response.ok) continue;
      siteUrl = response.url || start;
      html = await response.text();
      reached = true;
      break;
    } catch {
      /* variante suivante */
    }
  }
  if (!reached) return { kind: "unreachable", siteUrl };
  if (/static\.wixstatic\.com|content="Wix\.com/i.test(html)) return { kind: "wix", siteUrl };
  const restUrl = wpRestUrlFromHtml(html, siteUrl);
  if (!restUrl) return { kind: "other", siteUrl };
  try {
    const response = await fetchImpl(restUrl, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    const authorizeUrl = response.ok ? authorizeUrlFromRestIndex(await response.json()) : null;
    return authorizeUrl ? { kind: "wordpress", siteUrl, restUrl, authorizeUrl } : { kind: "wordpress_locked", siteUrl, restUrl };
  } catch {
    return { kind: "wordpress_locked", siteUrl, restUrl };
  }
}

// --- L'aller-retour d'autorisation ----------------------------------------------

/**
 * L'écran WordPress où le cabinet clique « Approuver ». WordPress renvoie ensuite
 * vers `success_url` en y AJOUTANT `site_url`, `user_login`, `password` — nos
 * propres paramètres (domaine + jeton signé) sont conservés.
 */
export function wpAuthorizeLink(authorizeUrl: string, args: { domain: string; token: string; baseUrl?: string }): string {
  const base = (args.baseUrl ?? "https://www.getpick.ai").replace(/\/$/, "");
  const back = (outcome: "ok" | "refus") => {
    const url = new URL(`${base}/api/connect/wordpress/callback`);
    url.searchParams.set("d", args.domain);
    url.searchParams.set("k", args.token);
    if (outcome === "refus") url.searchParams.set("refus", "1");
    return url.toString();
  };
  const url = new URL(authorizeUrl);
  url.searchParams.set("app_name", GETPICK_WP_APP_NAME);
  url.searchParams.set("app_id", GETPICK_WP_APP_ID);
  url.searchParams.set("success_url", back("ok"));
  url.searchParams.set("reject_url", back("refus"));
  return url.toString();
}

export type WpCallback =
  | { ok: true; siteUrl: string; userLogin: string; password: string }
  | { ok: false; reason: "refused" | "incomplete" | "other_site" };

/** Lit le retour WordPress. Refuse un `site_url` qui n'est pas le domaine du cabinet. */
export function parseWpCallback(params: URLSearchParams, domain: string): WpCallback {
  if (params.get("refus") === "1" || params.get("success") === "false") return { ok: false, reason: "refused" };
  const siteUrl = params.get("site_url") ?? "";
  const userLogin = params.get("user_login") ?? "";
  const password = params.get("password") ?? "";
  if (!siteUrl || !userLogin || !password) return { ok: false, reason: "incomplete" };
  let host = "";
  try {
    host = new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return { ok: false, reason: "incomplete" };
  }
  if (host !== domain && !host.endsWith(`.${domain}`)) return { ok: false, reason: "other_site" };
  return { ok: true, siteUrl, userLogin, password };
}

// --- Secret au repos --------------------------------------------------------------

function key(env: Env = process.env) {
  const material = env.CMS_SECRET_KEY ?? env.AUDIT_SHARE_SECRET ?? env.UNSUBSCRIBE_SECRET ?? "getpick-cms-local";
  return createHash("sha256").update(`cms-connection:${material}`).digest();
}

export function encryptSecret(plain: string, env?: Env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(env), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decryptSecret(sealed: string, env?: Env): string | null {
  const [version, iv, tag, body] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(env), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// --- API REST WordPress -------------------------------------------------------------

/** `wp/v2/pages` sous la base REST, qu'elle soit `/wp-json/` ou `?rest_route=/`. */
export function wpEndpoint(restUrl: string, route: string): string {
  const url = new URL(restUrl);
  const clean = route.replace(/^\//, "");
  if (url.searchParams.has("rest_route")) {
    const prefix = (url.searchParams.get("rest_route") ?? "/").replace(/\/$/, "");
    url.searchParams.set("rest_route", `${prefix}/${clean}`);
    return url.toString();
  }
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${clean}`;
  return url.toString();
}

function basicAuth(login: string, password: string) {
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

/** Les identifiants marchent-ils, et permettent-ils de publier une page ? */
export async function verifyWpCredentials(
  restUrl: string,
  login: string,
  password: string,
  fetchImpl: FetchImpl = fetch
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const response = await fetchImpl(`${wpEndpoint(restUrl, "wp/v2/users/me")}${restUrl.includes("rest_route") ? "&" : "?"}context=edit`, {
      headers: { Authorization: basicAuth(login, password), "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { ok: false, reason: `auth_${response.status}` };
    const me = (await response.json()) as { capabilities?: Record<string, boolean> };
    return me.capabilities?.publish_pages ? { ok: true } : { ok: false, reason: "cannot_publish_pages" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "network" };
  }
}

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export type WpAnswerPage = { title: string; slug: string; content: string };

/**
 * La page publiée sur le site du cabinet : les questions de ses clients, une
 * réponse factuelle chacune, en HTML simple (lisible par tout thème, par les
 * robots, et par le cabinet). Rien sur GetPick, rien sur les confrères.
 */
export function wpAnswerPage(site: AiSiteContent, args: { tradeLabel: string; city: string | null }): WpAnswerPage {
  const where = args.city ? ` à ${args.city}` : "";
  const title = `Questions fréquentes — ${args.tradeLabel}${where}`;
  const slug = `questions-frequentes${args.city ? `-${slugify(args.city)}` : ""}`;
  const body = [
    `<p>${escapeHtml(site.summary)}</p>`,
    ...site.faq.map((item) => `<h2>${escapeHtml(item.question)}</h2>\n<p>${escapeHtml(item.answer)}</p>`),
  ].join("\n\n");
  return { title, slug, content: body };
}

/** Crée la page, ou met à jour celle déjà publiée (jamais de doublon). */
export async function upsertWpPage(
  restUrl: string,
  creds: { login: string; password: string },
  page: WpAnswerPage & { id?: number | null },
  fetchImpl: FetchImpl = fetch
): Promise<{ ok: true; id: number; link: string } | { ok: false; reason: string }> {
  const target = page.id ? wpEndpoint(restUrl, `wp/v2/pages/${page.id}`) : wpEndpoint(restUrl, "wp/v2/pages");
  try {
    const response = await fetchImpl(target, {
      method: "POST",
      headers: { Authorization: basicAuth(creds.login, creds.password), "Content-Type": "application/json", "User-Agent": UA, Accept: "application/json" },
      body: JSON.stringify({ title: page.title, slug: page.slug, content: page.content, status: "publish" }),
      signal: AbortSignal.timeout(15000),
    });
    // Page supprimée par le cabinet entre-temps : on la recrée, une seule fois.
    if (page.id && response.status === 404) return upsertWpPage(restUrl, creds, { ...page, id: null }, fetchImpl);
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    const saved = (await response.json()) as { id?: number; link?: string };
    return typeof saved.id === "number" ? { ok: true, id: saved.id, link: saved.link ?? "" } : { ok: false, reason: "no_id" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "network" };
  }
}
