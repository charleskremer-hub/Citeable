/**
 * Connexions « Connecter mon site » et publication de la page-réponses sur le
 * WordPress du cabinet. Voir `wp-connect.ts` pour le pourquoi.
 */
import { ensureAuditSchema, pool } from "@/lib/db";
import { generateAiSiteAnswers, loadAiSite } from "@/lib/ai-site-store";
import { decryptSecret, encryptSecret, upsertWpPage, wpAnswerPage } from "@/lib/wp-connect";

export type CmsConnection = {
  domain: string;
  platform: string;
  site_url: string;
  rest_url: string;
  user_login: string;
  secret_enc: string;
  status: string;
  page_id: number | null;
  page_url: string | null;
  published_at: string | null;
  last_error: string | null;
};

export async function saveWordPressConnection(args: { domain: string; siteUrl: string; restUrl: string; userLogin: string; password: string }) {
  await ensureAuditSchema();
  await pool.query(
    `INSERT INTO cms_connections (domain, platform, site_url, rest_url, user_login, secret_enc, status)
     VALUES ($1, 'wordpress', $2, $3, $4, $5, 'connected')
     ON CONFLICT (domain) DO UPDATE SET platform = 'wordpress', site_url = EXCLUDED.site_url, rest_url = EXCLUDED.rest_url,
       user_login = EXCLUDED.user_login, secret_enc = EXCLUDED.secret_enc, status = 'connected', last_error = NULL, updated_at = now()`,
    [args.domain, args.siteUrl, args.restUrl, args.userLogin, encryptSecret(args.password)]
  );
}

export async function loadCmsConnection(domain: string): Promise<CmsConnection | null> {
  await ensureAuditSchema();
  const result = await pool.query<CmsConnection>(`SELECT * FROM cms_connections WHERE domain = $1`, [domain]);
  return result.rows[0] ?? null;
}

/**
 * Publie (ou met à jour) la page-réponses sur le site connecté. Écrit les
 * réponses d'abord si l'agent de contenu ne l'a pas encore fait.
 */
export async function publishAnswersToWordPress(domain: string): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const connection = await loadCmsConnection(domain);
  if (!connection || connection.platform !== "wordpress") return { ok: false, reason: "not_connected" };
  const password = decryptSecret(connection.secret_enc);
  if (!password) return { ok: false, reason: "secret_unreadable" };

  // On ne publie sur le site du cabinet QUE des réponses écrites par l'agent
  // depuis ses faits — jamais le gabarit de repli de la fiche `ai.`.
  const written = async () =>
    (await pool.query<{ ok: boolean }>(`SELECT (content ? 'answers') AS ok FROM ai_sites WHERE domain = $1`, [domain])).rows[0]?.ok === true;
  if (!(await written())) await generateAiSiteAnswers(domain);
  if (!(await written())) return { ok: false, reason: "no_content" };
  const site = await loadAiSite(domain);
  if (!site || !site.faq.length) return { ok: false, reason: "no_content" };

  const page = wpAnswerPage(site, { tradeLabel: site.tradeLabel, city: site.city });
  const saved = await upsertWpPage(connection.rest_url, { login: connection.user_login, password }, { ...page, id: connection.page_id });
  if (!saved.ok) {
    await pool.query(`UPDATE cms_connections SET last_error = $2, status = CASE WHEN $2 LIKE 'http_401%' OR $2 LIKE 'http_403%' THEN 'revoked' ELSE status END, updated_at = now() WHERE domain = $1`, [domain, saved.reason]);
    return saved;
  }
  await pool.query(
    `UPDATE cms_connections SET page_id = $2, page_url = $3, published_at = now(), status = 'published', last_error = NULL, updated_at = now() WHERE domain = $1`,
    [domain, saved.id, saved.link]
  );
  return { ok: true, url: saved.link };
}
