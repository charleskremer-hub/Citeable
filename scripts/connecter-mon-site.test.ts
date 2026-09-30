/**
 * « CONNECTER MON SITE » — 29/09/2026 (Charles : « un agent GEO comme Delos,
 * pas de fichier à pousser au webmaster »).
 *
 * Le cabinet approuve GetPick dans SON WordPress (écran natif
 * `authorize-application.php`), l'agent publie lui-même une page de réponses.
 * Mesure lot 1 : 10 WordPress sur 14 sites joignables, 6 avec la connexion
 * d'application ouverte. Fixtures = index REST et HTML réels (extraits),
 * aucun réseau : `fetch` est simulé.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  GETPICK_WP_APP_ID,
  authorizeUrlFromRestIndex,
  decryptSecret,
  discoverSite,
  encryptSecret,
  parseWpCallback,
  upsertWpPage,
  verifyWpCredentials,
  wpAnswerPage,
  wpAuthorizeLink,
  wpEndpoint,
  wpRestUrlFromHtml,
} from "@/lib/wp-connect";
import { aiSiteContent } from "@/lib/ai-site";

const REST_INDEX_OPEN = {
  name: "Cabinet Fontanès",
  authentication: { "application-passwords": { endpoints: { authorization: "https://www.lesbonscomptes.fr/wp-admin/authorize-application.php" } } },
};
const HOME_WP = `<html><head><link rel="https://api.w.org/" href="https://www.lesbonscomptes.fr/wp-json/" /></head><body>…</body></html>`;

function fakeFetch(routes: Record<string, { status?: number; body: unknown; url?: string }>, calls: Array<{ url: string; init?: RequestInit }> = []) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const hit = routes[url];
    if (!hit) return new Response("not found", { status: 404 });
    const body = typeof hit.body === "string" ? hit.body : JSON.stringify(hit.body);
    const response = new Response(body, { status: hit.status ?? 200 });
    Object.defineProperty(response, "url", { value: hit.url ?? url });
    return response;
  }) as typeof fetch;
}

test("détection — WordPress qui annonce l'écran d'autorisation ⇒ connectable en un clic", async () => {
  const site = await discoverSite(
    "lesbonscomptes.fr",
    fakeFetch({
      "https://lesbonscomptes.fr/": { body: HOME_WP, url: "https://www.lesbonscomptes.fr/" },
      "https://www.lesbonscomptes.fr/wp-json/": { body: REST_INDEX_OPEN },
    })
  );
  assert.equal(site.kind, "wordpress");
  assert.equal(site.kind === "wordpress" && site.authorizeUrl, "https://www.lesbonscomptes.fr/wp-admin/authorize-application.php");
});

test("détection — WordPress verrouillé (extension de sécurité), Wix, injoignable", async () => {
  const locked = await discoverSite(
    "cleco-ec.fr",
    fakeFetch({ "https://cleco-ec.fr/": { body: `<link rel="https://api.w.org/" href="https://cleco-ec.fr/wp-json/">` }, "https://cleco-ec.fr/wp-json/": { body: { authentication: [] } } })
  );
  assert.equal(locked.kind, "wordpress_locked");
  const wix = await discoverSite("exeko-expertise.fr", fakeFetch({ "https://exeko-expertise.fr/": { body: `<meta name="generator" content="Wix.com Website Builder"><img src="https://static.wixstatic.com/x.png">` } }));
  assert.equal(wix.kind, "wix");
  assert.equal((await discoverSite("absent.fr", fakeFetch({}))).kind, "unreachable");
  assert.equal(authorizeUrlFromRestIndex({ authentication: { "application-passwords": { endpoints: { authorization: "http://insecure/wp-admin/authorize-application.php" } } } }), null);
});

test("API REST — base /wp-json/ ou ?rest_route=/ (permaliens simples)", () => {
  assert.equal(wpEndpoint("https://a.fr/wp-json/", "wp/v2/pages"), "https://a.fr/wp-json/wp/v2/pages");
  assert.equal(wpEndpoint("https://a.fr/?rest_route=/", "wp/v2/pages/12"), "https://a.fr/?rest_route=%2Fwp%2Fv2%2Fpages%2F12");
  assert.equal(wpRestUrlFromHtml(`<link rel='https://api.w.org/' href='https://a.fr/index.php?rest_route=/&amp;x=1' />`, "https://a.fr/"), "https://a.fr/index.php?rest_route=/&x=1");
  assert.equal(wpRestUrlFromHtml("<html>pas WordPress</html>", "https://a.fr/"), null);
});

test("aller-retour — le lien d'autorisation porte l'app, et un retour qui garde domaine + jeton", () => {
  const link = new URL(wpAuthorizeLink("https://www.lesbonscomptes.fr/wp-admin/authorize-application.php", { domain: "lesbonscomptes.fr", token: "T0K" }));
  assert.equal(link.searchParams.get("app_id"), GETPICK_WP_APP_ID);
  const success = new URL(link.searchParams.get("success_url") ?? "");
  assert.equal(success.origin + success.pathname, "https://www.getpick.ai/api/connect/wordpress/callback");
  assert.equal(success.searchParams.get("d"), "lesbonscomptes.fr");
  assert.equal(success.searchParams.get("k"), "T0K");
  assert.equal(new URL(link.searchParams.get("reject_url") ?? "").searchParams.get("refus"), "1");
});

test("retour — accepte le site du cabinet, refuse un autre site, lit le refus", () => {
  const ok = parseWpCallback(new URLSearchParams({ site_url: "https://www.lesbonscomptes.fr", user_login: "np", password: "abcd efgh ijkl" }), "lesbonscomptes.fr");
  assert.deepEqual(ok, { ok: true, siteUrl: "https://www.lesbonscomptes.fr", userLogin: "np", password: "abcd efgh ijkl" });
  assert.deepEqual(parseWpCallback(new URLSearchParams({ site_url: "https://evil.example", user_login: "x", password: "y" }), "lesbonscomptes.fr"), { ok: false, reason: "other_site" });
  assert.deepEqual(parseWpCallback(new URLSearchParams({ refus: "1" }), "lesbonscomptes.fr"), { ok: false, reason: "refused" });
  assert.deepEqual(parseWpCallback(new URLSearchParams({ site_url: "https://lesbonscomptes.fr" }), "lesbonscomptes.fr"), { ok: false, reason: "incomplete" });
});

test("secret — chiffré au repos, illisible avec une autre clé", () => {
  const sealed = encryptSecret("abcd efgh ijkl", { AUDIT_SHARE_SECRET: "k1" });
  assert.ok(!sealed.includes("abcd"));
  assert.equal(decryptSecret(sealed, { AUDIT_SHARE_SECRET: "k1" }), "abcd efgh ijkl");
  assert.equal(decryptSecret(sealed, { AUDIT_SHARE_SECRET: "k2" }), null);
});

test("vérification — il faut pouvoir publier une page", async () => {
  const me = "https://a.fr/wp-json/wp/v2/users/me?context=edit";
  assert.deepEqual(await verifyWpCredentials("https://a.fr/wp-json/", "u", "p", fakeFetch({ [me]: { body: { capabilities: { publish_pages: true } } } })), { ok: true });
  assert.deepEqual(await verifyWpCredentials("https://a.fr/wp-json/", "u", "p", fakeFetch({ [me]: { body: { capabilities: { edit_posts: true } } } })), { ok: false, reason: "cannot_publish_pages" });
  assert.deepEqual(await verifyWpCredentials("https://a.fr/wp-json/", "u", "p", fakeFetch({ [me]: { status: 401, body: {} } })), { ok: false, reason: "auth_401" });
});

const site = aiSiteContent({
  brandName: "Les Bons Comptes",
  domain: "lesbonscomptes.fr",
  tradeLabel: "cabinet d'expertise comptable",
  city: "Joué-lès-Tours",
  description: "Cabinet pour TPE/PME et créateurs d'Indre-et-Loire.",
  questions: [],
  answers: [{ question: "Quel expert-comptable à Joué-lès-Tours pour une création de SASU ?", answer: "Les Bons Comptes, à Joué-lès-Tours, accompagne les créateurs <script>x</script> d'Indre-et-Loire, d'après son site." }],
});

test("page publiée — faits seulement, HTML échappé, rien sur GetPick ni les confrères", () => {
  const page = wpAnswerPage(site, { tradeLabel: "cabinet d'expertise comptable", city: "Joué-lès-Tours" });
  assert.equal(page.title, "Questions fréquentes — cabinet d'expertise comptable à Joué-lès-Tours");
  assert.equal(page.slug, "questions-frequentes-joue-les-tours");
  assert.match(page.content, /<h2>Quel expert-comptable à Joué-lès-Tours/);
  assert.doesNotMatch(page.content, /<script>/);
  assert.doesNotMatch(page.content, /GetPick/i);
});

test("publication — crée la page, puis la met à jour EN PLACE (jamais de doublon), recrée si supprimée", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const page = wpAnswerPage(site, { tradeLabel: "cabinet d'expertise comptable", city: "Joué-lès-Tours" });
  const created = await upsertWpPage("https://a.fr/wp-json/", { login: "u", password: "p" }, page, fakeFetch({ "https://a.fr/wp-json/wp/v2/pages": { status: 201, body: { id: 42, link: "https://a.fr/questions-frequentes-joue-les-tours/" } } }, calls));
  assert.deepEqual(created, { ok: true, id: 42, link: "https://a.fr/questions-frequentes-joue-les-tours/" });
  assert.equal(JSON.parse(String(calls[0].init?.body)).status, "publish");
  assert.match(String((calls[0].init?.headers as Record<string, string>).Authorization), /^Basic /);

  const updated = await upsertWpPage("https://a.fr/wp-json/", { login: "u", password: "p" }, { ...page, id: 42 }, fakeFetch({ "https://a.fr/wp-json/wp/v2/pages/42": { body: { id: 42, link: "l" } } }));
  assert.deepEqual(updated, { ok: true, id: 42, link: "l" });

  const recreated = await upsertWpPage("https://a.fr/wp-json/", { login: "u", password: "p" }, { ...page, id: 7 }, fakeFetch({ "https://a.fr/wp-json/wp/v2/pages": { status: 201, body: { id: 43, link: "l2" } } }));
  assert.deepEqual(recreated, { ok: true, id: 43, link: "l2" });
});

test("mail au cabinet — première publication : le lien, qu'il garde la main, et le rendez-vous du mois", async () => {
  const { buildPublishedEmail } = await import("@/lib/cms-connection-store");
  const first = buildPublishedEmail({ domain: "lesbonscomptes.fr", url: "https://lesbonscomptes.fr/questions-frequentes-joue-les-tours/", firstTime: true });
  assert.match(first.subject, /en ligne sur lesbonscomptes\.fr/);
  assert.match(first.text, /questions-frequentes-joue-les-tours/);
  assert.match(first.text, /modifier ou la retirer/);
  assert.match(first.text, /Dans un mois/);
  const monthly = buildPublishedEmail({ domain: "lesbonscomptes.fr", url: "u", firstTime: false });
  assert.match(monthly.subject, /Mise à jour mensuelle/);
});

test("détection — apex muet, www répond (6 cabinets sur 19 du lot 1, 30/09)", async () => {
  const site = await discoverSite(
    "sofrac-troyes.fr",
    fakeFetch({
      "https://www.sofrac-troyes.fr/": { body: `<link rel="https://api.w.org/" href="https://www.sofrac-troyes.fr/wp-json/">` },
      "https://www.sofrac-troyes.fr/wp-json/": { body: { authentication: { "application-passwords": { endpoints: { authorization: "https://www.sofrac-troyes.fr/wp-admin/authorize-application.php" } } } } },
    })
  );
  assert.equal(site.kind, "wordpress");
});

test("rapport (inspiré Pinniq, 30/09) — besoin client et place dans la réponse", async () => {
  const { questionNeed, brandPositionInAnswer, needsSummary } = await import("@/app/audit/[id]/report-insights");
  assert.equal(questionNeed("Quel expert-comptable à Palaiseau pour la création d'une société civile immobilière ?"), "SCI & immobilier");
  assert.equal(questionNeed("Quel cabinet à Palaiseau pour gérer la paie de mes salariés ?"), "Paie & social");
  assert.equal(questionNeed("Un expert-comptable à Palaiseau spécialisé professions libérales ?"), "Professions libérales");
  assert.equal(questionNeed("Où trouver un expert-comptable à Palaiseau pour la création d'entreprise ?"), "Création & reprise");
  const snippet = "recommended_brands: Cabinet GFE (Gestion Financière Externalisée - Réseau Cabex, Cabinet Bonnet & Pascot, Cabinet Broc (Gendrot & Associés, Sodeva Audit, Aufiges\nPour la création…";
  assert.deepEqual(brandPositionInAnswer(snippet, "Gendrot"), { rank: 3, of: 5 });
  assert.deepEqual(brandPositionInAnswer("recommended_brands: Gendrot Expertise Conseil\nOui.", "Gendrot"), { rank: 1, of: 1 });
  assert.equal(brandPositionInAnswer("pas de liste", "Gendrot"), null);
  const summary = needsSummary([
    { prompt: "a", state: "missing", rivals: [], pages: [], need: "Paie & social", position: null },
    { prompt: "b", state: "recommended", rivals: [], pages: [], need: "SCI & immobilier", position: null },
  ]);
  assert.equal(summary[0].need, "Paie & social", "les angles morts d'abord");
});
