import { pool } from "./db";

const NANO_BACKEND_URL =
  process.env.NANOCORP_BACKEND_URL ??
  "https://phospho-nanocorp-prod--nanocorp-api-fastapi-app.modal.run";

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
};

type ToolEnvelope<T> = {
  success?: boolean;
  result?: T;
  error?: string | null;
  detail?: unknown;
};

type WebSearchResult = {
  results?: Array<{ title?: string; url?: string; snippet?: string }>;
};

type WebFetchResult = {
  content?: string;
  title?: string;
  url?: string;
  total_chars?: number;
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

export async function callNanoTool<T>(toolName: string, args: Record<string, unknown>) {
  if (!process.env.NANOCORP_TOKEN) {
    throw new Error(
      "NANOCORP_TOKEN is not configured for server-side NanoCorp tool access. Set a durable NanoCorp service token in Company Settings > Secrets as NANOCORP_TOKEN."
    );
  }

  const response = await fetch(`${NANO_BACKEND_URL}/internal/tools/${toolName}/execute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NANOCORP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ arguments: args }),
  });

  const payload = (await response.json().catch(() => ({}))) as ToolEnvelope<T>;

  if (!response.ok || payload.error || payload.success === false) {
    const detail = typeof payload.detail === "string" ? `: ${payload.detail}` : "";
    throw new Error(payload.error ?? `NanoCorp ${toolName} failed with HTTP ${response.status}${detail}`);
  }

  if (!payload.result) {
    throw new Error(`NanoCorp ${toolName} returned no result.`);
  }

  return payload.result;
}

function cleanSnippet(value: string, maxLength = 1400) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function includesBrand(text: string, brandName: string) {
  return text.toLowerCase().includes(brandName.toLowerCase());
}

function mentionProminence(text: string, brandName: string): PromptResult["mentionProminence"] {
  const lower = text.toLowerCase();
  const index = lower.indexOf(brandName.toLowerCase());

  if (index < 0) return "not_mentioned";

  const ratio = index / Math.max(lower.length, 1);
  if (ratio <= 0.33) return "first";
  if (ratio <= 0.66) return "middle";
  return "late";
}

function citationPoints(prominence: PromptResult["mentionProminence"]) {
  if (prominence === "first") return 30;
  if (prominence === "middle") return 15;
  if (prominence === "late") return 8;
  return 0;
}

function hostnameBrand(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".")[0];
    if (!base || base.length < 3) return "";
    return base
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "";
  }
}

function extractCompetitors(text: string, brandName: string, urls: string[] = []) {
  const blocked = new Set(
    [
      "Answer",
      "Links",
      "Images",
      "Share",
      "Sources",
      "Search",
      "Computer",
      "Model",
      "Cookie Policy",
      "Perplexity",
      "Google",
      "ChatGPT",
      "Gemini",
      "Copilot",
      "France",
      "French",
      "Small Businesses",
      "Best Tools",
      "Recommended",
      "Alternatives",
      "Who",
      "What",
      "The",
      "This",
      "That",
      "These",
      "Those",
      "ANY",
      "FAQ",
      "Best AI Visibility Tools",
      "Citing Sources",
      "A Student Guide",
      "Student Guide",
      "Am I",
      "KeyCite",
      "Cookie Policy Sources",
      "Who Is",
      "What Is",
      brandName,
    ].map((word) => word.toLowerCase())
  );

  const candidates = new Map<string, number>();
  const add = (candidate: string) => {
    const cleaned = candidate.replace(/\s+/g, " ").trim();
    const lower = cleaned.toLowerCase();
    const words = cleaned.split(" ");
    if (
      cleaned.length < 3 ||
      cleaned.length > 48 ||
      blocked.has(lower) ||
      lower.includes(brandName.toLowerCase()) ||
      /^\d+$/.test(cleaned) ||
      (/^[A-Z][a-z]+$/.test(cleaned) && ["the", "this", "that", "what", "who", "best", "recommended"].includes(lower)) ||
      (words.length > 3 && !/[A-Z]{2,}|&|\+/.test(cleaned))
    ) {
      return;
    }
    candidates.set(cleaned, (candidates.get(cleaned) ?? 0) + 1);
  };

  urls.map(hostnameBrand).forEach(add);

  const matches = text.match(/\b([A-Z][a-zA-Z0-9&.+-]*(?:\s+[A-Z][a-zA-Z0-9&.+-]*){0,3})\b/g) ?? [];
  matches.forEach(add);

  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name)
    .slice(0, 8);
}

function detectCategory(homepageContent: string, brandName: string) {
  const content = homepageContent.toLowerCase();
  const rules: Array<[string, string[]]> = [
    ["AI visibility software", ["ai visibility", "answer engine", "geo", "aeo", "llm", "citation"]],
    ["B2B SaaS tools", ["saas", "software", "platform", "dashboard", "api", "automation"]],
    ["marketing agencies", ["agency", "marketing", "seo", "content", "growth", "campaign"]],
    ["ecommerce solutions", ["shop", "ecommerce", "commerce", "checkout", "retail"]],
    ["professional services", ["consulting", "advisory", "service", "clients"]],
    ["hospitality businesses", ["restaurant", "hotel", "booking", "menu", "rooms"]],
  ];

  const match = rules.find(([, keywords]) => keywords.some((keyword) => content.includes(keyword)));
  return match?.[0] ?? `${brandName} alternatives and business solutions`;
}

function hasStructuredData(content: string) {
  const lower = content.toLowerCase();
  return lower.includes("schema.org") || lower.includes("application/ld+json") || lower.includes("json-ld");
}

function buildPrompts(brandName: string, category: string) {
  return [
    `best ${category} for small businesses`,
    `who is ${brandName} and are they good`,
    `alternatives to ${brandName}`,
    `top ${category} recommendations`,
  ];
}

async function fetchHomepage(websiteUrl: string) {
  try {
    const result = await callNanoTool<WebFetchResult>("web_fetch", { url: websiteUrl });
    return {
      reachable: true,
      content: cleanSnippet(`${result.title ?? ""}\n${result.content ?? ""}`, 6000),
      reason: "",
    };
  } catch (error) {
    return {
      reachable: false,
      content: "",
      reason: error instanceof Error ? error.message : "Unknown fetch error",
    };
  }
}

async function runBravePrompt(prompt: string, brandName: string): Promise<PromptResult> {
  const result = await callNanoTool<WebSearchResult>("web_search", { query: prompt, limit: 5 });
  const rows = result.results ?? [];
  const raw = rows
    .map((row, index) => `${index + 1}. ${row.title ?? "Untitled"} — ${row.snippet ?? ""} (${row.url ?? ""})`)
    .join("\n");
  const snippet = cleanSnippet(raw || "No web_search results returned.");
  const prominence = mentionProminence(snippet, brandName);

  return {
    prompt,
    rawAnswerSnippet: snippet,
    brandMentioned: includesBrand(snippet, brandName),
    competitors: extractCompetitors(snippet, brandName, rows.map((row) => row.url ?? "").filter(Boolean)),
    mentionProminence: prominence,
    citationPoints: citationPoints(prominence),
  };
}

async function runPerplexityPrompt(prompt: string, brandName: string): Promise<PromptResult> {
  const url = `https://www.perplexity.ai/search?q=${encodeURIComponent(prompt)}`;
  const result = await callNanoTool<WebFetchResult>("web_fetch", { url });
  const snippet = cleanSnippet(`${result.title ?? ""}\n${result.content ?? ""}` || "No Perplexity content returned.");
  const prominence = mentionProminence(snippet, brandName);

  return {
    prompt,
    rawAnswerSnippet: snippet,
    brandMentioned: includesBrand(snippet, brandName),
    competitors: extractCompetitors(snippet, brandName, [url]),
    mentionProminence: prominence,
    citationPoints: citationPoints(prominence),
  };
}

async function runEngine(
  engine: string,
  prompts: string[],
  brandName: string,
  runner: (prompt: string, brandName: string) => Promise<PromptResult>
): Promise<EngineResult> {
  const promptResults: PromptResult[] = [];

  try {
    for (const prompt of prompts) {
      promptResults.push(await runner(prompt, brandName));
    }
  } catch (error) {
    const unavailableReason = error instanceof Error ? error.message : "Unknown engine error";
    return {
      engine,
      reachable: promptResults.length > 0,
      unavailableReason: promptResults.length > 0 ? `partial results — ${unavailableReason}` : unavailableReason,
      promptsRun: promptResults.length,
      brandMentioned: promptResults.some((result) => result.brandMentioned),
      competitors: [...new Set(promptResults.flatMap((result) => result.competitors))],
      rawAnswerSnippet: cleanSnippet(promptResults.map((result) => result.rawAnswerSnippet).join("\n\n")),
      promptResults,
    };
  }

  return {
    engine,
    reachable: true,
    promptsRun: promptResults.length,
    brandMentioned: promptResults.some((result) => result.brandMentioned),
    competitors: [...new Set(promptResults.flatMap((result) => result.competitors))],
    rawAnswerSnippet: cleanSnippet(promptResults.map((result) => result.rawAnswerSnippet).join("\n\n")),
    promptResults,
  };
}

function unavailableEngines(): EngineResult[] {
  return [
    {
      engine: "ChatGPT web answer",
      reachable: false,
      unavailableReason: "unavailable — no public unauthenticated HTTP answer endpoint is reachable from NanoCorp web_search/web_fetch.",
      promptsRun: 0,
      brandMentioned: false,
      competitors: [],
      rawAnswerSnippet: "",
      promptResults: [],
    },
    {
      engine: "You.com AI answer",
      reachable: false,
      unavailableReason: "unavailable — public web_fetch reaches You.com, but the answer page requires login before returning an AI answer.",
      promptsRun: 0,
      brandMentioned: false,
      competitors: [],
      rawAnswerSnippet: "",
      promptResults: [],
    },
    {
      engine: "Phind AI search",
      reachable: false,
      unavailableReason: "unavailable — public web_fetch to the search URL returned 404/DEPLOYMENT_NOT_FOUND instead of an answer page.",
      promptsRun: 0,
      brandMentioned: false,
      competitors: [],
      rawAnswerSnippet: "",
      promptResults: [],
    },
    {
      engine: "Google AI Overviews",
      reachable: false,
      unavailableReason: "unavailable — AI Overview blocks are not exposed through the NanoCorp Brave web_search result payload or a stable public fetch URL.",
      promptsRun: 0,
      brandMentioned: false,
      competitors: [],
      rawAnswerSnippet: "",
      promptResults: [],
    },
    {
      engine: "Gemini web answer",
      reachable: false,
      unavailableReason: "unavailable — no public unauthenticated HTTP answer endpoint/API key is configured for Gemini in this environment.",
      promptsRun: 0,
      brandMentioned: false,
      competitors: [],
      rawAnswerSnippet: "",
      promptResults: [],
    },
    {
      engine: "Microsoft Copilot web answer",
      reachable: false,
      unavailableReason: "unavailable — no stable unauthenticated HTTP answer endpoint is reachable via NanoCorp web_fetch.",
      promptsRun: 0,
      brandMentioned: false,
      competitors: [],
      rawAnswerSnippet: "",
      promptResults: [],
    },
  ];
}

function calculateScore(promptResults: PromptResult[], structuredDataFound: boolean) {
  const totalPrompts = promptResults.length;
  const mentionedPrompts = promptResults.filter((result) => result.brandMentioned).length;
  const mentionCoverage = totalPrompts > 0 ? (mentionedPrompts / totalPrompts) * 60 : 0;
  const structuredDataBonus = structuredDataFound ? 10 : 0;
  const citationQualityBonus =
    totalPrompts > 0
      ? promptResults.reduce((sum, result) => sum + result.citationPoints, 0) / totalPrompts
      : 0;
  const score = Math.max(0, Math.min(100, Math.round(mentionCoverage + structuredDataBonus + citationQualityBonus)));

  return {
    score,
    formula: `Score = (${mentionedPrompts}/${totalPrompts} prompts mentioning the brand × 60) + ${structuredDataBonus} structured-data bonus + ${citationQualityBonus.toFixed(
      1
    )} average citation-quality bonus = ${score}/100. Citation quality: first-third mention = 30, middle-third = 15, late mention = 8, not mentioned = 0. Unavailable engines are listed but excluded from prompt denominator.`,
  };
}

function buildFixes(args: {
  brandName: string;
  category: string;
  structuredDataFound: boolean;
  mentionedPrompts: number;
  totalPrompts: number;
  competitors: string[];
  engines: EngineResult[];
}) {
  const fixes: string[] = [];

  if (!args.structuredDataFound) {
    fixes.push("Add Organization, WebSite, Product/Service, and FAQ schema to the homepage so AI crawlers can parse the brand, category, and core offers cleanly.");
  }

  if (args.mentionedPrompts < Math.ceil(args.totalPrompts / 2)) {
    fixes.push(`Create a dedicated “About ${args.brandName}” page with a 2–3 sentence canonical description, target customers, location, and proof points.`);
  }

  if (args.competitors.length > 0) {
    fixes.push(`Publish comparison pages against ${args.competitors.slice(0, 3).join(", ")} and explain when ${args.brandName} is the better fit.`);
  }

  if (args.engines.some((engine) => engine.reachable && !engine.brandMentioned)) {
    fixes.push(`Earn mentions in at least three reputable ${args.category} roundups, directories, or buyer guides that AI answer engines already cite.`);
  }

  fixes.push("Add an FAQ section that answers category-intent queries directly, including pricing, alternatives, use cases, geography, and integration questions.");
  fixes.push("Keep brand naming, homepage title, meta description, social profiles, and directory listings consistent so answer engines merge citations correctly.");

  return fixes.slice(0, 5);
}

function textList(items: string[]) {
  return items.length ? items.map(escapeHtml).join(", ") : "None found";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtml(report: AuditReport, brandName: string, websiteUrl: string) {
  const safeBrandName = escapeHtml(brandName);
  const safeWebsiteUrl = escapeHtml(websiteUrl);
  const checked = report.engines.filter((engine) => engine.reachable).map((engine) => engine.engine);
  const unavailable = report.engines
    .filter((engine) => !engine.reachable || engine.unavailableReason)
    .map((engine) => `${engine.engine}: ${engine.unavailableReason ?? "partial issue"}`);

  const engineRows = report.engines
    .map(
      (engine) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(engine.engine)}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${engine.reachable ? "Reachable" : "Unavailable"}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${engine.brandMentioned ? "Mentioned" : "Not mentioned"}</td>
          <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${textList(engine.competitors)}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.55;max-width:680px;margin:0 auto;">
      <p>Your free Citeable AI Visibility Report for <strong>${safeBrandName}</strong> (${safeWebsiteUrl}) is ready.</p>
      <div style="background:#111827;color:#f9fafb;border-radius:18px;padding:24px;margin:20px 0;text-align:center;">
        <div style="font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#caff3c;">AI visibility score</div>
        <div style="font-size:64px;font-weight:800;line-height:1;color:#caff3c;">${report.score}/100</div>
      </div>
      <p><strong>Formula:</strong> ${escapeHtml(report.formula)}</p>
      <p><strong>Engines checked:</strong> ${textList(checked)}</p>
      <p><strong>Engines unavailable:</strong> ${textList(unavailable)}</p>
      <h2>Engine breakdown</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead><tr><th align="left">Engine</th><th align="left">Reachable</th><th align="left">Brand</th><th align="left">Competitors seen</th></tr></thead>
        <tbody>${engineRows}</tbody>
      </table>
      <h2>Competitors cited instead</h2>
      <p>${textList(report.competitors)}</p>
      <h2>Prioritized fixes</h2>
      <ol>${report.fixes.map((fix) => `<li style="margin-bottom:8px;">${escapeHtml(fix)}</li>`).join("")}</ol>
      <p><a href="https://getciteable.nanocorp.app/audit/${report.audit_id}">Open the full report page</a></p>
    </div>`;
}

async function sendAuditEmail(report: AuditReport, email: string, brandName: string, websiteUrl: string) {
  const body = buildEmailHtml(report, brandName, websiteUrl);
  await callNanoTool<{ email_id?: string; status?: string }>("send_email", {
    to: email,
    subject: `Your Citeable AI Visibility Report — ${brandName}`,
    body,
  });
}

export async function runAudit(args: { auditId?: string; email: string; brandName: string; websiteUrl: string }) {
  const homepage = await fetchHomepage(args.websiteUrl);
  const category = detectCategory(homepage.content, args.brandName);
  const structuredDataFound = hasStructuredData(homepage.content);
  const prompts = buildPrompts(args.brandName, category);

  const reachableEngines = [
    await runEngine("Brave web_search snippets", prompts, args.brandName, runBravePrompt),
    await runEngine("Perplexity.ai public search page", prompts, args.brandName, runPerplexityPrompt),
  ];

  const engines = [...reachableEngines, ...unavailableEngines()];
  const scoredPromptResults = reachableEngines.flatMap((engine) => engine.promptResults);

  if (scoredPromptResults.length === 0) {
    const reasons = reachableEngines
      .map((engine) => `${engine.engine}: ${engine.unavailableReason ?? "no prompt results"}`)
      .join("; ");
    throw new Error(
      `No NanoCorp prompts ran. Replace Company Settings > Secrets secret NANOCORP_TOKEN with a durable NanoCorp service token that can run web_search, web_fetch, and send_email. ${reasons}`
    );
  }
  const { score, formula } = calculateScore(scoredPromptResults, structuredDataFound);
  const competitors = [
    ...new Set(reachableEngines.flatMap((engine) => engine.competitors).filter((name) => !includesBrand(name, args.brandName))),
  ].slice(0, 12);
  const fixes = buildFixes({
    brandName: args.brandName,
    category,
    structuredDataFound,
    mentionedPrompts: scoredPromptResults.filter((result) => result.brandMentioned).length,
    totalPrompts: scoredPromptResults.length,
    competitors,
    engines,
  });

  const auditId =
    args.auditId ??
    (
      await pool.query<{ id: string }>(
        `INSERT INTO audits (email, brand_name, website_url, raw_results)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [args.email, args.brandName, args.websiteUrl, { status: "running" }]
      )
    ).rows[0].id;

  const report: AuditReport = {
    audit_id: auditId,
    score,
    engines,
    competitors,
    fixes,
    formula,
    structuredDataFound,
    category,
    emailSent: false,
  };

  try {
    await sendAuditEmail(report, args.email, args.brandName, args.websiteUrl);
    report.emailSent = true;
  } catch (error) {
    report.emailError = error instanceof Error ? error.message : "Unknown email error";
  }

  await pool.query(
    `UPDATE audits
     SET score = $2,
         engines_checked = $3,
         competitors_found = $4,
         fixes = $5,
         raw_results = $6
     WHERE id = $1`,
    [
      auditId,
      report.score,
      JSON.stringify(report.engines),
      JSON.stringify(report.competitors),
      JSON.stringify(report.fixes),
      JSON.stringify({
        status: "complete",
        formula,
        structuredDataFound,
        category,
        homepageReachable: homepage.reachable,
        homepageFetchReason: homepage.reason,
        emailSent: report.emailSent,
        emailError: report.emailError,
        completedAt: new Date().toISOString(),
      }),
    ]
  );

  return report;
}

export async function runQueuedAudit(auditId: string) {
  await pool.query(
    `UPDATE audits
     SET raw_results = raw_results || $2::jsonb
     WHERE id = $1 AND score IS NULL`,
    [auditId, JSON.stringify({ status: "starting", startedAt: new Date().toISOString() })]
  );

  const lockClient = await pool.connect();
  try {
    const lock = await lockClient.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
      [auditId]
    );

    if (!lock.rows[0]?.locked) {
      return { audit_id: auditId, status: "running" as const };
    }

    const existing = await lockClient.query<{
      id: string;
      email: string;
      brand_name: string;
      website_url: string;
      score: number | null;
    }>(`SELECT id, email, brand_name, website_url, score FROM audits WHERE id = $1`, [auditId]);

    const audit = existing.rows[0];
    if (!audit) {
      throw new Error(`Audit ${auditId} was not found.`);
    }

    if (audit.score !== null && audit.score !== undefined) {
      return { audit_id: audit.id, status: "complete" as const, score: audit.score };
    }

    await lockClient.query(
      `UPDATE audits
       SET raw_results = raw_results || $2::jsonb
       WHERE id = $1 AND score IS NULL`,
      [auditId, JSON.stringify({ status: "running", startedAt: new Date().toISOString() })]
    );

    try {
      const report = await runAudit({
        auditId,
        email: audit.email,
        brandName: audit.brand_name,
        websiteUrl: audit.website_url,
      });

      return { audit_id: report.audit_id, status: "complete" as const, score: report.score, report };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Audit failed";
      await lockClient.query(
        `UPDATE audits
         SET raw_results = raw_results || $2::jsonb
         WHERE id = $1 AND score IS NULL`,
        [
          auditId,
          JSON.stringify({
            status: "failed",
            error: message,
            failedAt: new Date().toISOString(),
          }),
        ]
      );
      throw error;
    }
  } finally {
    await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [auditId]).catch(() => undefined);
    lockClient.release();
  }
}
