/**
 * Connexions « Connecter mon site » et publication de la page-réponses sur le
 * WordPress du cabinet. Voir `wp-connect.ts` pour le pourquoi.
 */
import { ensureAuditSchema, pool } from "@/lib/db";
import { generateAiSiteAnswers, loadAiSite } from "@/lib/ai-site-store";
import { normalizeRootDomain } from "@/lib/ai-site";
import { sendMail } from "@/lib/mailer";
import { decryptSecret, encryptSecret, ensureLlmsTxtPlugin, siteServesLlmsTxt, upsertWpPage, wpAnswerPage } from "@/lib/wp-connect";

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
  llms_txt_status?: string | null;
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
export async function publishAnswersToWordPress(domain: string): Promise<{ ok: true; url: string; firstTime: boolean; llmsTxt?: string | null } | { ok: false; reason: string }> {
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

  const creds = { login: connection.user_login, password };
  // llms.txt AVANT la page : l'extension régénère le fichier à chaque mise à
  // jour de contenu — la publication qui suit déclenche donc sa génération.
  // Une seule tentative par connexion (sauf échec réseau) ; jamais bloquant.
  let llmsStatus = connection.llms_txt_status ?? null;
  if (!llmsStatus || llmsStatus.startsWith("failed")) {
    const setup = await ensureLlmsTxtPlugin(connection.rest_url, connection.site_url, creds);
    llmsStatus = "detail" in setup ? `${setup.status}:${setup.detail}` : setup.status;
  }

  const page = wpAnswerPage(site, { tradeLabel: site.tradeLabel, city: site.city });
  const saved = await upsertWpPage(connection.rest_url, creds, { ...page, id: connection.page_id });
  if (!saved.ok) {
    await pool.query(`UPDATE cms_connections SET last_error = $2, status = CASE WHEN $2 LIKE 'http_401%' OR $2 LIKE 'http_403%' THEN 'revoked' ELSE status END, updated_at = now() WHERE domain = $1`, [domain, saved.reason]);
    return saved;
  }
  // Réveille WP-Cron du site (génération à +30 s) — sans l'attendre.
  if (llmsStatus === "activated") void fetch(new URL("/wp-cron.php?doing_wp_cron", connection.site_url).toString(), { signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  // Preuve, pas promesse : `live` seulement si /llms.txt répond vraiment.
  if (llmsStatus === "activated" && (await siteServesLlmsTxt(connection.site_url))) llmsStatus = "live";
  await pool.query(
    `UPDATE cms_connections SET page_id = $2, page_url = $3, published_at = now(), status = 'published', last_error = NULL, llms_txt_status = $4, updated_at = now() WHERE domain = $1`,
    [domain, saved.id, saved.link, llmsStatus]
  );
  return { ok: true, url: saved.link, firstTime: !connection.page_id, llmsTxt: llmsStatus };
}

/** Texte du mail « c'est publié » envoyé au cabinet (sans I/O, testable). */
export function buildPublishedEmail(args: { domain: string; url: string; firstTime: boolean; llmsTxt?: string | null }) {
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
          ...(args.llmsTxt === "live" || args.llmsTxt === "activated"
            ? [
                `Ton site sert aussi désormais un fichier llms.txt (https://${args.domain}/llms.txt) : la fiche que ChatGPT, Claude et Perplexity lisent pour comprendre ton cabinet. Il est généré par l'extension gratuite « Website LLMs.txt », désactivable à tout moment dans WordPress → Extensions.`,
                "",
              ]
            : []),
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
export async function notifyCustomerPublished(domain: string, url: string, firstTime: boolean, llmsTxt?: string | null): Promise<void> {
  try {
    const row = await pool.query<{ email: string | null }>(
      `SELECT a.email FROM ai_sites s JOIN audits a ON a.id = s.audit_id WHERE s.domain = $1`,
      [domain]
    );
    const to = row.rows[0]?.email;
    if (!to || !to.includes("@")) return;
    const mail = buildPublishedEmail({ domain, url, firstTime, llmsTxt });
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
/**
 * llms.txt « activé » → « live ». L'extension génère le fichier par WP-Cron,
 * ~30 s après la publication de la page (vérifié sur un vrai WordPress le
 * 01/10/2026) : on ne bloque pas la requête de connexion pour l'attendre. Le
 * cron quotidien réveille WP-Cron du site (comme le ferait une visite) puis
 * vérifie que /llms.txt répond vraiment.
 */
export async function confirmPendingLlmsTxt(limit = 10, fetchImpl: typeof fetch = fetch): Promise<Array<{ domain: string; live: boolean }>> {
  await ensureAuditSchema();
  const pending = await pool.query<{ domain: string; site_url: string }>(
    `SELECT domain, site_url FROM cms_connections WHERE llms_txt_status = 'activated' ORDER BY updated_at ASC LIMIT $1`,
    [limit]
  );
  const out: Array<{ domain: string; live: boolean }> = [];
  for (const { domain, site_url } of pending.rows) {
    try {
      await fetchImpl(new URL("/wp-cron.php?doing_wp_cron", site_url).toString(), { signal: AbortSignal.timeout(10000) });
    } catch {
      /* le cron du site tournera à la prochaine visite */
    }
    const live = await siteServesLlmsTxt(site_url, fetchImpl);
    if (live) await pool.query(`UPDATE cms_connections SET llms_txt_status = 'live', updated_at = now() WHERE domain = $1`, [domain]);
    out.push({ domain, live });
  }
  return out;
}

export async function refreshDueConnectedSites(limit = 2): Promise<Array<{ domain: string; ok: boolean; detail: string }>> {
  await ensureAuditSchema();
  try {
    await confirmPendingLlmsTxt();
  } catch (error) {
    console.error("[getpick] llms.txt confirmation failed", error instanceof Error ? error.message : error);
  }
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
    if (published.ok) await notifyCustomerPublished(domain, published.url, published.firstTime, published.llmsTxt);
    results.push({ domain, ok: published.ok, detail: published.ok ? published.url : published.reason });
  }
  return results;
}
