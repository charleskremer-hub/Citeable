/**
 * Connexions « Connecter mon site » et publication de la page-réponses sur le
 * WordPress du cabinet. Voir `wp-connect.ts` pour le pourquoi.
 */
import { ensureAuditSchema, pool } from "@/lib/db";
import { generateAiSiteAnswers, loadAiSite } from "@/lib/ai-site-store";
import { normalizeRootDomain } from "@/lib/ai-site";
import { sendMail } from "@/lib/mailer";
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
export async function publishAnswersToWordPress(domain: string): Promise<{ ok: true; url: string; firstTime: boolean } | { ok: false; reason: string }> {
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
  return { ok: true, url: saved.link, firstTime: !connection.page_id };
}

/** Texte du mail « c'est publié » envoyé au cabinet (sans I/O, testable). */
export function buildPublishedEmail(args: { domain: string; url: string; firstTime: boolean }) {
  return args.firstTime
    ? {
        subject: `C'est en ligne sur ${args.domain}`,
        text: [
          "Bonjour,",
          "",
          "Ton agent GEO vient de publier sur ton site les réponses aux questions que tes clients posent à l'IA :",
          args.url,
          "",
          "Une seule page, écrite à partir des informations de ton site. Tu peux la relire, la modifier ou la retirer depuis ton WordPress, comme n'importe quelle page.",
          "",
          "Dans un mois, on repose les mêmes questions à l'IA et on met la page à jour. Tu recevras le résultat : qui est cité, toi ou ton confrère.",
          "",
          "Charles — GetPick",
        ].join("\n"),
      }
    : {
        subject: `Mise à jour mensuelle publiée sur ${args.domain}`,
        text: [
          "Bonjour,",
          "",
          "Ton agent GEO a reposé les questions de tes clients à l'IA et mis à jour ta page :",
          args.url,
          "",
          "Charles — GetPick",
        ].join("\n"),
      };
}

/** Prévient le cabinet (l'email de son diagnostic). Jamais bloquant. */
export async function notifyCustomerPublished(domain: string, url: string, firstTime: boolean): Promise<void> {
  try {
    const row = await pool.query<{ email: string | null }>(
      `SELECT a.email FROM ai_sites s JOIN audits a ON a.id = s.audit_id WHERE s.domain = $1`,
      [domain]
    );
    const to = row.rows[0]?.email;
    if (!to || !to.includes("@")) return;
    const mail = buildPublishedEmail({ domain, url, firstTime });
    await sendMail({ to, subject: mail.subject, text: mail.text });
  } catch (error) {
    console.error("published email failed", error instanceof Error ? error.message : error);
  }
}

/**
 * LA PROMESSE « tenue à jour chaque mois ». Appelée par le cron quotidien :
 * pour chaque site connecté dont la page a plus de 30 jours (ou qui n'a jamais
 * été publiée 10 minutes après la connexion), on rattache la fiche au DERNIER
 * diagnostic du domaine, l'agent réécrit les réponses, on republie en place.
 */
export async function refreshDueConnectedSites(limit = 2): Promise<Array<{ domain: string; ok: boolean; detail: string }>> {
  await ensureAuditSchema();
  const due = await pool.query<{ domain: string }>(
    `SELECT domain FROM cms_connections
     WHERE status IN ('connected', 'published')
       AND ((published_at IS NULL AND created_at < now() - interval '10 minutes') OR published_at < now() - interval '30 days')
     ORDER BY COALESCE(published_at, created_at) ASC
     LIMIT $1`,
    [limit]
  );
  const results: Array<{ domain: string; ok: boolean; detail: string }> = [];
  for (const { domain } of due.rows) {
    const audits = await pool.query<{ id: string; website_url: string }>(
      `SELECT id, website_url FROM audits WHERE website_url ILIKE $1 AND score IS NOT NULL ORDER BY created_at DESC LIMIT 5`,
      [`%${domain}%`]
    );
    const latest = audits.rows.find((row) => normalizeRootDomain(row.website_url) === domain);
    if (latest) await pool.query(`UPDATE ai_sites SET audit_id = $2 WHERE domain = $1`, [domain, latest.id]);
    await generateAiSiteAnswers(domain);
    const published = await publishAnswersToWordPress(domain);
    if (published.ok) await notifyCustomerPublished(domain, published.url, published.firstTime);
    results.push({ domain, ok: published.ok, detail: published.ok ? published.url : published.reason });
  }
  return results;
}
