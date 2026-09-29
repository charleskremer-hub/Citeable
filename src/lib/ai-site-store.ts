import { ensureAuditSchema, pool } from "@/lib/db";
import { descriptionFromAudit, type AuditRawResults } from "@/lib/audit-engine";
import { localizeCategoryLabel } from "@/lib/i18n";
import { cityFromPrompts } from "@/lib/hosted-answer-page";
import { aiSiteContent, normalizeRootDomain, type AiSiteContent } from "@/lib/ai-site";

type Row = {
  domain: string;
  status: string;
  brand_name: string;
  raw_results: AuditRawResults | null;
};

/**
 * Le contenu du sous-domaine `ai.` d'un cabinet, depuis la base. `null` si le
 * domaine n'est pas enregistré chez GetPick : on ne sert JAMAIS une page pour
 * un domaine qui ne nous a pas été confié.
 */
export async function loadAiSite(domainInput: string): Promise<(AiSiteContent & { domain: string; status: string }) | null> {
  const domain = normalizeRootDomain(decodeURIComponent(domainInput));
  if (!domain) return null;
  await ensureAuditSchema();
  const result = await pool.query<Row>(
    `SELECT s.domain, s.status, a.brand_name, a.raw_results
     FROM ai_sites s JOIN audits a ON a.id = s.audit_id
     WHERE s.domain = $1`,
    [domain]
  );
  const row = result.rows[0];
  if (!row) return null;
  const prompts = (row.raw_results?.buyerIntentPrompts ?? []).map((prompt) => prompt.prompt).filter(Boolean);
  const category = row.raw_results?.category ?? "";
  const content = aiSiteContent({
    brandName: row.brand_name,
    domain,
    tradeLabel: category === "accounting firm" ? "cabinet d'expertise comptable" : localizeCategoryLabel(category, "fr") || "cabinet",
    city: cityFromPrompts(prompts),
    description: descriptionFromAudit(row.raw_results) ?? "",
    questions: prompts,
  });
  return { ...content, domain, status: row.status };
}
