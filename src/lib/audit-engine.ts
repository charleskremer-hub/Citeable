import { pool } from "./db";

const USER_AGENT = "Mozilla/5.0 (compatible; CiteableAudit/1.0; +https://getciteable.nanocorp.app)";
const CHECK_TIMEOUT_MS = 10_000;

export type PromptResult = {
  prompt: string;
  rawAnswerSnippet: string;
  brandMentioned: boolean;
  competitors: string[];
  mentionProminence: "first" | "middle" | "late" | "not_mentioned";
  citationPoints: number;
};

export type EngineResult = {
  engine: string;
  reachable: boolean;
  unavailableReason?: string;
  promptsRun: number;
  brandMentioned: boolean;
  competitors: string[];
  rawAnswerSnippet: string;
  promptResults: PromptResult[];
  check?: AuditCheckName;
  score?: number;
  maxScore?: number;
  detail?: string;
};

export type AuditCheckName = "search_visibility" | "structured_data" | "wikipedia" | "ai_visibility" | "technical_seo";

export type AuditCheckResult = {
  check: AuditCheckName;
  score: number;
  maxScore: number;
  detail: string;
  found?: boolean;
  reachable?: boolean;
  evidence?: string;
};

export type AuditReport = {
  audit_id: string;
  score: number;
  engines: EngineResult[];
  competitors: string[];
  fixes: string[];
  formula: string;
  structuredDataFound: boolean;
  category: string;
  emailSent: boolean;
  emailError?: string;
  checks: AuditCheckResult[];
};

export type QueuedAuditResult =
  | { status: "complete"; report: AuditReport }
  | { status: "running" }
  | { status: "failed"; error: string };

type AuditRawResults = {
  status?: string;
  error?: string;
  formula?: string;
  category?: string;
  structuredDataFound?: boolean;
  emailSent?: boolean;
  emailError?: string;
  checks?: AuditCheckResult[];
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
};

type AuditRow = {
  id: string;
  email: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  engines_checked: EngineResult[] | null;
  competitors_found: string[] | null;
  fixes: string[] | null;
  raw_results: AuditRawResults | null;
};

type RunAuditParams = {
  auditId: string;
  brandName: string;
  websiteUrl: string;
  email: string;
};

export function normalizeWebsiteUrl(input: string) {
  const raw = input.trim();

  if (!raw || /\s/.test(raw)) {
    throw new Error("Website must be a domain like keyban.fr, www.keyban.fr, or https://keyban.fr.");
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  const hostname = url.hostname.toLowerCase();

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Website must start with http:// or https:// when a scheme is included.");
  }

  if (hostname !== "localhost" && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(hostname)) {
    throw new Error("Website must be a domain like keyban.fr, www.keyban.fr, or https://keyban.fr.");
  }

  url.hostname = hostname;
  return url.toString();
}

export function validateAuditInput(input: Record<string, unknown>) {
  const email = String(input.email ?? "").trim().toLowerCase();
  const brandName = String(input.brand_name ?? "").trim();
  const rawWebsiteUrl = String(input.website_url ?? "").trim();

  if (!email || !email.includes("@")) {
    throw new Error("A valid email is required.");
  }

  if (!brandName) {
    throw new Error("Brand name is required.");
  }

  if (!rawWebsiteUrl) {
    throw new Error("Website URL is required.");
  }

  return { email, brandName, websiteUrl: normalizeWebsiteUrl(rawWebsiteUrl) };
}

function reportFromRow(row: AuditRow): AuditReport {
  const checks = row.raw_results?.checks ?? checksFromEngines(row.engines_checked ?? []);

  return {
    audit_id: row.id,
    score: row.score ?? 0,
    engines: row.engines_checked ?? [],
    competitors: row.competitors_found ?? [],
    fixes: row.fixes ?? [],
    formula: row.raw_results?.formula ?? formulaText(),
    structuredDataFound: Boolean(row.raw_results?.structuredDataFound),
    category: row.raw_results?.category ?? "unknown",
    emailSent: Boolean(row.raw_results?.emailSent),
    emailError: row.raw_results?.emailError,
    checks,
  };
}

function withTimeout(url: string, init: RequestInit = {}) {
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
      ...init.headers,
    },
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
}

function htmlSnippet(html: string, needle: string) {
  const compact = html.replace(/\s+/g, " ").trim();
  const index = compact.toLowerCase().indexOf(needle.toLowerCase());
  const start = index >= 0 ? Math.max(0, index - 120) : 0;
  return compact.slice(start, start + 320);
}

function domainFromWebsite(websiteUrl: string) {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  return new URL(normalized).hostname.replace(/^www\./, "").toLowerCase();
}

function checkToEngine(result: AuditCheckResult): EngineResult {
  const mentioned = Boolean(result.found || result.score > 0);

  return {
    engine: result.check,
    reachable: result.reachable !== false,
    unavailableReason: result.reachable === false ? result.detail : undefined,
    promptsRun: 1,
    brandMentioned: mentioned,
    competitors: [],
    rawAnswerSnippet: result.evidence ?? result.detail,
    promptResults: [
      {
        prompt: result.check,
        rawAnswerSnippet: result.evidence ?? result.detail,
        brandMentioned: mentioned,
        competitors: [],
        mentionProminence: mentioned ? "middle" : "not_mentioned",
        citationPoints: result.score,
      },
    ],
    check: result.check,
    score: result.score,
    maxScore: result.maxScore,
    detail: result.detail,
  };
}

function settledToChecks(checks: PromiseSettledResult<AuditCheckResult>[]) {
  return checks.map((result, index): AuditCheckResult => {
    if (result.status === "fulfilled") return result.value;

    const names: AuditCheckName[] = ["search_visibility", "structured_data", "wikipedia", "ai_visibility", "technical_seo"];
    const maxScores = [25, 25, 20, 15, 15];
    const message = result.reason instanceof Error ? result.reason.message : "Unknown check failure";

    return {
      check: names[index],
      score: 0,
      maxScore: maxScores[index],
      detail: message,
      reachable: false,
      evidence: message,
    };
  });
}

function checksFromEngines(engines: EngineResult[]) {
  return engines
    .filter((engine): engine is EngineResult & { check: AuditCheckName; score: number; maxScore: number; detail: string } => Boolean(engine.check))
    .map((engine) => ({
      check: engine.check,
      score: engine.score,
      maxScore: engine.maxScore,
      detail: engine.detail,
      reachable: engine.reachable,
      evidence: engine.rawAnswerSnippet,
    }));
}

async function checkSearchVisibility(brandName: string, domain: string): Promise<AuditCheckResult> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(brandName)}`;
  const response = await withTimeout(url);

  if (!response.ok) {
    return {
      check: "search_visibility",
      score: 0,
      maxScore: 25,
      detail: `DuckDuckGo returned HTTP ${response.status}`,
      reachable: false,
      evidence: `DuckDuckGo returned HTTP ${response.status}`,
    };
  }

  const html = await response.text();
  const lowerHtml = html.toLowerCase();
  const found = lowerHtml.includes(domain.toLowerCase()) || lowerHtml.includes(`www.${domain.toLowerCase()}`);

  return {
    check: "search_visibility",
    score: found ? 25 : 0,
    maxScore: 25,
    detail: found ? "Brand domain found in DuckDuckGo results" : "Brand domain not found in DuckDuckGo top HTML results",
    found,
    reachable: true,
    evidence: htmlSnippet(html, found ? domain : brandName),
  };
}

async function checkSchemaMarkup(websiteUrl: string): Promise<AuditCheckResult> {
  const response = await withTimeout(normalizeWebsiteUrl(websiteUrl));

  if (!response.ok) {
    return {
      check: "structured_data",
      score: 0,
      maxScore: 25,
      detail: `Homepage returned HTTP ${response.status}`,
      reachable: false,
      evidence: `Homepage returned HTTP ${response.status}`,
    };
  }

  const html = await response.text();
  const hasSchema = /application\/ld\+json|schema\.org/i.test(html);
  const hasOpenGraph = /property=["']og:title["']|name=["']og:title["']/i.test(html) && /property=["']og:description["']|name=["']og:description["']/i.test(html);
  const score = (hasSchema ? 15 : 0) + (hasOpenGraph ? 10 : 0);

  return {
    check: "structured_data",
    score,
    maxScore: 25,
    detail: `Schema.org: ${hasSchema}, OpenGraph: ${hasOpenGraph}`,
    found: hasSchema || hasOpenGraph,
    reachable: true,
    evidence: htmlSnippet(html, hasSchema ? "ld+json" : "og:title"),
  };
}

async function checkWikiPresence(brandName: string): Promise<AuditCheckResult> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(brandName)}`;
  const response = await withTimeout(url, { headers: { Accept: "application/json" } });
  const found = response.status === 200;
  const evidence = found ? await response.text() : `Wikipedia returned HTTP ${response.status}`;

  return {
    check: "wikipedia",
    score: found ? 20 : 0,
    maxScore: 20,
    detail: found ? "Brand has a Wikipedia article" : "No exact Wikipedia article found",
    found,
    reachable: response.status < 500,
    evidence: evidence.slice(0, 320),
  };
}

async function checkAIVisibility(brandName: string, domain: string): Promise<AuditCheckResult> {
  const queries = [
    `${brandName} site:reddit.com`,
    `${brandName} ${domain}`,
  ];

  const results = await Promise.allSettled(
    queries.map(async (query) => {
      const response = await withTimeout(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
      if (!response.ok) return { ok: false, query, text: `DuckDuckGo returned HTTP ${response.status}` };
      return { ok: true, query, text: await response.text() };
    })
  );

  const fulfilled = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const domainMentions = fulfilled.filter((result) => result.text.toLowerCase().includes(domain.toLowerCase())).length;
  const brandMentions = fulfilled.filter((result) => result.text.toLowerCase().includes(brandName.toLowerCase())).length;
  const found = domainMentions > 0 || brandMentions > 0;

  let score = 5;
  if (brandMentions > 0) score += 5;
  if (domainMentions > 0) score += 5;

  return {
    check: "ai_visibility",
    score: Math.min(score, 15),
    maxScore: 15,
    detail: found ? `Brand/domain surfaced in ${Math.max(domainMentions, brandMentions)} AI-context search result set(s)` : "No AI-context search evidence detected",
    found,
    reachable: fulfilled.some((result) => result.ok),
    evidence: fulfilled.map((result) => `${result.query}: ${htmlSnippet(result.text, domain)}`).join("\n").slice(0, 500),
  };
}

async function checkTechnicalSEO(websiteUrl: string): Promise<AuditCheckResult> {
  const base = normalizeWebsiteUrl(websiteUrl).replace(/\/$/, "");
  const [robotsResult, sitemapResult] = await Promise.allSettled([
    withTimeout(`${base}/robots.txt`),
    withTimeout(`${base}/sitemap.xml`),
  ]);
  const hasRobots = robotsResult.status === "fulfilled" && robotsResult.value.status === 200;
  const hasSitemap = sitemapResult.status === "fulfilled" && sitemapResult.value.status === 200;
  const score = (hasRobots ? 5 : 0) + (hasSitemap ? 10 : 0);

  return {
    check: "technical_seo",
    score,
    maxScore: 15,
    detail: `robots.txt: ${hasRobots}, sitemap.xml: ${hasSitemap}`,
    found: hasRobots || hasSitemap,
    reachable: true,
    evidence: `robots.txt: ${robotsResult.status === "fulfilled" ? robotsResult.value.status : "failed"}; sitemap.xml: ${sitemapResult.status === "fulfilled" ? sitemapResult.value.status : "failed"}`,
  };
}

function computeScore(checks: AuditCheckResult[]) {
  return Math.max(0, Math.min(100, checks.reduce((total, check) => total + check.score, 0)));
}

function formulaText() {
  return "Score = search visibility (25) + structured data/OpenGraph (25) + Wikipedia exact page (20) + AI-context search visibility (15) + robots/sitemap technical SEO (15). All checks use live HTTP fetches with 10s timeouts and no NanoCorp token.";
}

function categoryFromWebsite(websiteHtmlCheck: AuditCheckResult) {
  const evidence = `${websiteHtmlCheck.detail} ${websiteHtmlCheck.evidence ?? ""}`.toLowerCase();
  if (evidence.includes("crypto") || evidence.includes("blockchain")) return "crypto/blockchain";
  if (evidence.includes("bank") || evidence.includes("finance")) return "financial services";
  if (evidence.includes("software") || evidence.includes("api") || evidence.includes("saas")) return "software";
  return "general business";
}

function buildFixes(checks: AuditCheckResult[]) {
  const byName = new Map(checks.map((check) => [check.check, check]));
  const fixes: string[] = [];

  if ((byName.get("structured_data")?.score ?? 0) < 25) {
    fixes.push("Add Organization JSON-LD schema and complete OpenGraph title/description tags on the homepage.");
  }

  if ((byName.get("search_visibility")?.score ?? 0) < 25) {
    fixes.push("Create crawlable brand pages and third-party profiles that clearly connect the brand name to the official domain.");
  }

  if ((byName.get("technical_seo")?.score ?? 0) < 15) {
    fixes.push("Publish accessible robots.txt and sitemap.xml files so search and answer engines can discover key pages.");
  }

  if ((byName.get("ai_visibility")?.score ?? 0) < 15) {
    fixes.push("Earn mentions on trusted community, review, and industry pages that answer engines can cite.");
  }

  if ((byName.get("wikipedia")?.score ?? 0) < 20) {
    fixes.push("Build authoritative third-party coverage and Wikidata-style entity consistency before pursuing encyclopedia visibility.");
  }

  return fixes.slice(0, 5);
}

export async function sendAuditEmail(email: string, brandName: string, report: AuditReport) {
  if (!process.env.RESEND_API_KEY) {
    return {
      sent: false,
      error: "No RESEND_API_KEY configured; no token-free email provider is available in this deployment.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "Citeable <onboarding@resend.dev>",
      to: email,
      subject: `Your Citeable AI visibility audit for ${brandName}`,
      text: [
        `Your Citeable AI visibility audit for ${brandName}`,
        "",
        `Score: ${report.score}/100`,
        "",
        "Checks:",
        ...report.checks.map((check) => `- ${check.check}: ${check.score}/${check.maxScore} — ${check.detail}`),
        "",
        "Priority fixes:",
        ...report.fixes.map((fix, index) => `${index + 1}. ${fix}`),
        "",
        `View the report: https://getciteable.nanocorp.app/audit/${report.audit_id}`,
      ].join("\n"),
    }),
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return { sent: false, error: `Resend returned HTTP ${response.status}: ${detail.slice(0, 300)}` };
  }

  return { sent: true };
}

export async function runAudit(args: RunAuditParams): Promise<AuditReport> {
  const domain = domainFromWebsite(args.websiteUrl);
  const checks = settledToChecks(
    await Promise.allSettled([
      checkSearchVisibility(args.brandName, domain),
      checkSchemaMarkup(args.websiteUrl),
      checkWikiPresence(args.brandName),
      checkAIVisibility(args.brandName, domain),
      checkTechnicalSEO(args.websiteUrl),
    ])
  );
  const score = computeScore(checks);
  const engines = checks.map(checkToEngine);
  const structuredDataFound = (checks.find((check) => check.check === "structured_data")?.score ?? 0) > 0;
  const fixes = buildFixes(checks);
  const reportWithoutEmail: AuditReport = {
    audit_id: args.auditId,
    score,
    engines,
    competitors: [],
    fixes,
    formula: formulaText(),
    structuredDataFound,
    category: categoryFromWebsite(checks.find((check) => check.check === "structured_data") ?? checks[0]),
    emailSent: false,
    checks,
  };
  const emailResult = await sendAuditEmail(args.email, args.brandName, reportWithoutEmail);

  return {
    ...reportWithoutEmail,
    emailSent: emailResult.sent,
    emailError: emailResult.error,
  };
}

export async function completeQueuedAudit(auditId: string): Promise<QueuedAuditResult> {
  const existing = await pool.query<AuditRow>(`SELECT * FROM audits WHERE id = $1`, [auditId]);
  const row = existing.rows[0];

  if (!row) {
    return { status: "failed", error: "Audit not found." };
  }

  if (row.score !== null && row.score !== undefined) {
    return { status: "complete", report: reportFromRow(row) };
  }

  await pool.query(
    `UPDATE audits
     SET raw_results = COALESCE(raw_results, '{}'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [
      auditId,
      {
        status: "running",
        startedAt: new Date().toISOString(),
      },
    ]
  );

  try {
    const report = await runAudit({
      auditId: row.id,
      brandName: row.brand_name,
      websiteUrl: row.website_url,
      email: row.email,
    });

    await pool.query(
      `UPDATE audits
       SET score = $2,
           engines_checked = $3::jsonb,
           competitors_found = $4::jsonb,
           fixes = $5::jsonb,
           raw_results = COALESCE(raw_results, '{}'::jsonb) || $6::jsonb
       WHERE id = $1`,
      [
        auditId,
        report.score,
        JSON.stringify(report.engines),
        JSON.stringify(report.competitors),
        JSON.stringify(report.fixes),
        JSON.stringify({
          status: "completed",
          formula: report.formula,
          category: report.category,
          structuredDataFound: report.structuredDataFound,
          emailSent: report.emailSent,
          emailError: report.emailError,
          checks: report.checks,
          completedAt: new Date().toISOString(),
        }),
      ]
    );

    return { status: "complete", report };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown audit error";

    await pool.query(
      `UPDATE audits
       SET raw_results = COALESCE(raw_results, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [
        auditId,
        {
          status: "failed",
          error: message,
          failedAt: new Date().toISOString(),
        },
      ]
    );

    return { status: "failed", error: message };
  }
}

export async function runQueuedAudit(auditId: string): Promise<QueuedAuditResult> {
  const lock = await pool.query<{ locked: boolean }>(`SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked`, [auditId]);

  if (!lock.rows[0]?.locked) {
    return { status: "running" };
  }

  try {
    return await completeQueuedAudit(auditId);
  } finally {
    await pool.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [auditId]);
  }
}
