import { ensureAuditSchema, pool } from "@/lib/db";
import { descriptionFromAudit, extractHomepageSignals, geminiGenerateJson, type AuditRawResults } from "@/lib/audit-engine";
import { localizeCategoryLabel } from "@/lib/i18n";
import { cityFromPrompts } from "@/lib/hosted-answer-page";
import {
  AI_SUBDOMAIN,
  addDomainToVercel,
  aiSiteAnswersPrompt,
  aiSiteContent,
  aiSiteToken,
  normalizeRootDomain,
  parseAiSiteAnswers,
  type AiSiteAnswer,
  type AiSiteContent,
} from "@/lib/ai-site";

type Row = {
  domain: string;
  status: string;
  brand_name: string;
  raw_results: AuditRawResults | null;
  content: { summary?: string; services?: string[]; answers?: AiSiteAnswer[] } | null;
};

function tradeLabelFor(category: string) {
  return category === "accounting firm" ? "cabinet d'expertise comptable" : localizeCategoryLabel(category, "fr") || "cabinet";
}

/** Les questions à traiter : celles que le cabinet PERD d'abord. */
function questionsFor(raw: AuditRawResults | null): string[] {
  const prompts = raw?.buyerIntentPrompts ?? [];
  const lost = prompts.filter((prompt) => !prompt.brandMentioned).map((prompt) => prompt.prompt);
  const won = prompts.filter((prompt) => prompt.brandMentioned).map((prompt) => prompt.prompt);
  return [...lost, ...won].filter(Boolean);
}

/**
 * Le contenu du sous-domaine `ai.` d'un cabinet. `null` si le domaine n'est pas
 * confié à GetPick : on ne sert JAMAIS une page pour un domaine non enregistré.
 */
export async function loadAiSite(domainInput: string): Promise<(AiSiteContent & { domain: string; status: string; tradeLabel: string; city: string | null }) | null> {
  const domain = normalizeRootDomain(decodeURIComponent(domainInput));
  if (!domain) return null;
  await ensureAuditSchema();
  const result = await pool.query<Row>(
    `SELECT s.domain, s.status, s.content, a.brand_name, a.raw_results
     FROM ai_sites s JOIN audits a ON a.id = s.audit_id
     WHERE s.domain = $1`,
    [domain]
  );
  const row = result.rows[0];
  if (!row) return null;
  const prompts = (row.raw_results?.buyerIntentPrompts ?? []).map((prompt) => prompt.prompt).filter(Boolean);
  const tradeLabel = tradeLabelFor(row.raw_results?.category ?? "");
  const city = cityFromPrompts(prompts);
  const content = aiSiteContent({
    brandName: row.brand_name,
    domain,
    tradeLabel,
    city,
    description: row.content?.summary || descriptionFromAudit(row.raw_results) || "",
    questions: questionsFor(row.raw_results),
    answers: row.content?.answers,
    services: row.content?.services,
  });
  return { ...content, domain, status: row.status, tradeLabel, city };
}

/**
 * L'AGENT DE CONTENU : écrit, depuis les faits du site du cabinet, la réponse à
 * chacune des questions de ses clients (les perdues d'abord) et la stocke.
 * Aucune invention (voir `aiSiteAnswersPrompt`). Rend true si du contenu a été écrit.
 */
export async function generateAiSiteAnswers(domainInput: string): Promise<boolean> {
  const domain = normalizeRootDomain(domainInput);
  if (!domain) return false;
  await ensureAuditSchema();
  const result = await pool.query<Row>(
    `SELECT s.domain, s.status, s.content, a.brand_name, a.raw_results
     FROM ai_sites s JOIN audits a ON a.id = s.audit_id WHERE s.domain = $1`,
    [domain]
  );
  const row = result.rows[0];
  if (!row) return false;
  let siteText = "";
  try {
    const response = await fetch(`https://${domain}`, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (GetPick fiche IA)" } });
    if (response.ok) siteText = extractHomepageSignals(await response.text());
  } catch {
    siteText = "";
  }
  if (!siteText) siteText = descriptionFromAudit(row.raw_results) ?? "";
  const prompts = questionsFor(row.raw_results);
  const parsed = parseAiSiteAnswers(
    await geminiGenerateJson(
      aiSiteAnswersPrompt({
        brandName: row.brand_name,
        tradeLabel: tradeLabelFor(row.raw_results?.category ?? ""),
        city: cityFromPrompts(prompts),
        domain,
        questions: prompts.slice(0, 8),
        siteText,
      })
    )
  );
  if (!parsed) return false;
  await pool.query(`UPDATE ai_sites SET content = $2::jsonb, content_generated_at = now() WHERE domain = $1`, [domain, JSON.stringify(parsed)]);
  return true;
}

/**
 * Ouvre la fiche `ai.` d'un cabinet à partir de son email de paiement : retrouve
 * son dernier diagnostic, enregistre le domaine, l'ajoute au projet Vercel,
 * lance l'agent de contenu. Rend le lien d'onboarding (message webmaster), ou null.
 */
export async function openAiSiteForCustomer(email: string): Promise<{ domain: string; onboardingUrl: string } | null> {
  await ensureAuditSchema();
  const audit = await pool.query<{ id: string; website_url: string }>(
    `SELECT id, website_url FROM audits WHERE lower(email) = lower($1) AND score IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    [email]
  );
  const row = audit.rows[0];
  const domain = row ? normalizeRootDomain(row.website_url) : null;
  if (!row || !domain) return null;
  await pool.query(
    `INSERT INTO ai_sites (domain, audit_id) VALUES ($1, $2) ON CONFLICT (domain) DO UPDATE SET audit_id = EXCLUDED.audit_id`,
    [domain, row.id]
  );
  await addDomainToVercel(`${AI_SUBDOMAIN}.${domain}`);
  await generateAiSiteAnswers(domain);
  return { domain, onboardingUrl: `https://www.getpick.ai/brancher/${encodeURIComponent(domain)}?k=${aiSiteToken(domain)}` };
}
