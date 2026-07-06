import { pool } from "./db";

const USER_AGENT = "Mozilla/5.0 (compatible; CiteeableBot/1.0)";
const CHECK_TIMEOUT_MS = 8_000;

export type PromptResult = {
  prompt: string;
  rawAnswerSnippet: string;
  brandMentioned: boolean;
  competitors: string[];
  mentionProminence: "first" | "middle" | "late" | "not_mentioned";
  citationPoints: number;
};

export type BuyerIntentSurfaceResult = {
  surface: string;
  reachable: boolean;
  unavailableReason?: string;
  brandMentioned: boolean;
  competitors: string[];
  rawAnswerSnippet: string;
};

export type BuyerIntentPromptResult = {
  prompt: string;
  available: boolean;
  brandMentioned: boolean;
  competitors: string[];
  surfaces: BuyerIntentSurfaceResult[];
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
  score?: number | null;
  maxScore?: number;
  detail?: string;
};

export type AuditCheckName = "search_visibility" | "structured_data" | "wikipedia" | "ai_visibility" | "technical_seo";

export type AuditCheckResult = {
  check: AuditCheckName;
  score: number | null;
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
  buyerIntentPrompts: BuyerIntentPromptResult[];
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
  buyerIntentPrompts?: BuyerIntentPromptResult[];
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
    buyerIntentPrompts: row.raw_results?.buyerIntentPrompts ?? [],
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

function isBotChallenge(html: string) {
  return /anomaly\.js|challenge-form|captcha|unusual traffic|verify you are human/i.test(html);
}

type SurfaceFetchResult = {
  source: string;
  url: string;
  ok: boolean;
  status?: number;
  html?: string;
  error?: string;
};

async function fetchSurface(source: string, url: string): Promise<SurfaceFetchResult> {
  try {
    const response = await withTimeout(url);
    if (!response.ok) {
      console.log(`[citeable] surface fetch ${source}: HTTP ${response.status}`);
      return { source, url, ok: false, status: response.status, error: `HTTP ${response.status}` };
    }

    const html = await response.text();
    if (isBotChallenge(html)) {
      console.log(`[citeable] surface fetch ${source}: blocked by challenge page`);
      return { source, url, ok: false, status: response.status, error: `HTTP ${response.status} challenge page` };
    }

    console.log(`[citeable] surface fetch ${source}: ok ${response.status}`);
    return { source, url, ok: true, status: response.status, html };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch error";
    console.log(`[citeable] surface fetch ${source}: failed ${message}`);
    return { source, url, ok: false, error: message };
  }
}

function htmlSnippet(html: string, needle: string) {
  const compact = html.replace(/\s+/g, " ").trim();
  const index = compact.toLowerCase().indexOf(needle.toLowerCase());
  const start = index >= 0 ? Math.max(0, index - 120) : 0;
  return compact.slice(start, start + 320);
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function includesTerm(text: string, term: string) {
  return text.toLowerCase().includes(term.toLowerCase());
}

function domainVariants(domain: string) {
  const bare = domain.replace(/^www\./i, "").toLowerCase();
  return [bare, `www.${bare}`];
}

function mentionsBrandOrDomain(text: string, brandName: string, domain: string) {
  return includesTerm(text, brandName) || domainVariants(domain).some((variant) => includesTerm(text, variant));
}

function uniqueInOrder(values: string[], limit = values.length) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) continue;

    seen.add(key);
    unique.push(normalized);

    if (unique.length >= limit) break;
  }

  return unique;
}

function escapedRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function displayNameFromDomain(domain: string) {
  return domain
    .replace(/^www\./i, "")
    .split(".")[0]
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractHomepageSignals(html: string) {
  const metaDescription = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]
    ?? "";
  const ogDescription = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1]
    ?? "";
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const jsonLd = (html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [])
    .map((script) => stripHtml(script))
    .join(" ");

  return stripHtml([title, metaDescription, ogDescription, jsonLd, html].join(" ")).slice(0, 12_000);
}

function categoryFromHomepageText(text: string, domain: string) {
  const lower = text.toLowerCase();
  const phraseRules: Array<[RegExp, string]> = [
    [/agentic commerce|commerce agentique/, "agentic commerce infrastructure"],
    [/agent wallet|wallets? embarqu[eé]s?|paiements? agentiques?|agentic payments?/, "agentic payments platform"],
    [/digital product passport|product passport|\bdpp\b/, "digital product passport platform"],
    [/project management|gestion de projet/, "project management tool"],
    [/customer relationship management|\bcrm\b/, "CRM for startups"],
    [/running shoes?|chaussures? de running/, "running shoes"],
    [/analytics|business intelligence|\bbi\b/, "analytics platform"],
    [/email marketing|newsletter/, "email marketing platform"],
    [/cybersecurity|security platform/, "cybersecurity platform"],
    [/accounting|bookkeeping/, "accounting software"],
    [/e-?commerce|online store/, "ecommerce platform"],
    [/blockchain|crypto|web3/, "blockchain infrastructure"],
    [/api|developer platform|sdk/, "developer platform"],
    [/software|saas|logiciel/, "software platform"],
  ];

  for (const [pattern, category] of phraseRules) {
    if (pattern.test(lower)) return category;
  }

  return `${displayNameFromDomain(domain)} alternatives`;
}

async function inferCategory(websiteUrl: string, fallbackCheck: AuditCheckResult) {
  const domain = domainFromWebsite(websiteUrl);

  try {
    const response = await withTimeout(normalizeWebsiteUrl(websiteUrl));

    if (response.ok) {
      const html = await response.text();
      const signals = extractHomepageSignals(html);
      const category = categoryFromHomepageText(signals, domain);

      return { category, homepageText: signals };
    }
  } catch (error) {
    console.log(`[citeable] category homepage fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  return { category: categoryFromWebsite(fallbackCheck), homepageText: `${fallbackCheck.detail} ${fallbackCheck.evidence ?? ""}` };
}

function promptCategoryTerms(category: string) {
  const lower = category.toLowerCase();

  if (lower.includes("digital product passport")) {
    return {
      categoryTerm: "digital product passport platform",
      useCase: "EU product compliance",
      leader: "Scantrust",
    };
  }

  if (lower.includes("agentic commerce")) {
    return {
      categoryTerm: "agentic commerce infrastructure",
      useCase: "autonomous AI shopping agents",
      leader: "Stripe",
    };
  }

  if (lower.includes("agentic payments")) {
    return {
      categoryTerm: "agentic payments platform",
      useCase: "AI agent wallets",
      leader: "Stripe",
    };
  }

  if (lower.includes("blockchain")) {
    return {
      categoryTerm: "blockchain infrastructure platform",
      useCase: "commerce applications",
      leader: "Polygon",
    };
  }

  if (lower.includes("crm")) return { categoryTerm: category, useCase: "early-stage startups", leader: "HubSpot" };
  if (lower.includes("project management")) return { categoryTerm: category, useCase: "small teams", leader: "Asana" };
  if (lower.includes("email marketing")) return { categoryTerm: category, useCase: "B2B startups", leader: "Mailchimp" };
  if (lower.includes("analytics")) return { categoryTerm: category, useCase: "SaaS teams", leader: "Google Analytics" };
  if (lower.includes("developer")) return { categoryTerm: category, useCase: "product teams", leader: "Twilio" };

  return { categoryTerm: category, useCase: "growing companies", leader: "the market leader" };
}

function generateBuyerIntentPrompts(category: string) {
  const { categoryTerm, useCase, leader } = promptCategoryTerms(category);

  return uniqueInOrder([
    `best ${categoryTerm} for ${useCase}`,
    `top ${categoryTerm} tools 2026`,
    `${categoryTerm} alternatives to ${leader}`,
    `which ${categoryTerm} should I choose`,
    `compare ${categoryTerm} vendors`,
  ], 5);
}

const COMPANY_SUFFIXES = /\b(?:Inc|LLC|Ltd|Limited|GmbH|SAS|SA|AG|BV|Corp|Corporation|Company|Co|Labs|Technologies|Technology|Systems|Software|AI|API)\b\.?/g;
const NON_COMPETITOR_NAMES = new Set([
  "AI", "API", "B2B", "B2C", "ChatGPT", "Google", "Bing", "Perplexity", "LinkedIn", "Wikipedia", "YouTube", "GitHub", "EU", "US", "UK", "GDPR", "SEO", "JSON", "HTTP", "HTML", "Python", "Java", "C++", "JavaScript", "TypeScript", "Digital Product Passport", "Agentic Commerce", "Agent Wallet",
]);

function normalizeCompetitorName(name: string) {
  return name
    .replace(COMPANY_SUFFIXES, "")
    .replace(/^[-–—•\d.\s]+/, "")
    .replace(/[,:;.!?)\]}]+$/, "")
    .replace(/^[({\[]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeCompetitorName(name: string, brandName: string, domain: string) {
  const normalized = normalizeCompetitorName(name);
  const lower = normalized.toLowerCase();
  const brandLower = brandName.toLowerCase();

  if (normalized.length < 2 || normalized.length > 42) return false;
  if (lower === brandLower || domainVariants(domain).some((variant) => lower === variant || lower.includes(variant))) return false;
  if (NON_COMPETITOR_NAMES.has(normalized)) return false;
  if (/^(best|top|which|compare|alternatives?|tools?|vendors?|platforms?|solutions?|pricing|login|home|privacy|terms)$/i.test(normalized)) return false;
  if (/\b(?:best|top|which|compare|alternative|vendor|tool|platform|solution|overview|search|result|http|www)\b/i.test(normalized)) return false;
  if (/^[A-Z]{2,6}$/.test(normalized) && !/[aeiou]/i.test(normalized)) return false;

  return /^[A-Z][A-Za-z0-9&.+'-]*(?:\s+[A-Z][A-Za-z0-9&.+'-]*){0,3}$/.test(normalized);
}

function extractCompetitorsFromText(text: string, brandName: string, domain: string, prompt = "") {
  const compact = text.replace(/\s+/g, " ");
  const candidates: string[] = [];
  const brandPattern = new RegExp(escapedRegex(brandName), "ig");
  const withoutBrand = compact.replace(brandPattern, " ");
  const lowerPrompt = prompt.toLowerCase();
  const explicitPatterns = [
    /(?:include|includes|including|such as|alternatives? (?:include|are)|competitors? (?:include|are)|vendors? (?:include|are)|tools? (?:include|are)|platforms? (?:include|are)|providers? (?:include|are))\s+([^.;:]{0,240})/gi,
  ];

  for (const pattern of explicitPatterns) {
    for (const match of withoutBrand.matchAll(pattern)) {
      const group = match[1] ?? "";
      group.split(/,|\bor\b|\band\b|\/|\||·/i).forEach((part) => candidates.push(part));
    }
  }

  return uniqueInOrder(
    candidates
      .map(normalizeCompetitorName)
      .filter((candidate) => looksLikeCompetitorName(candidate, brandName, domain))
      .filter((candidate) => !lowerPrompt.includes(candidate.toLowerCase())),
    8
  );
}

function organicResultBlocks(html: string, source: string) {
  const patterns = source.toLowerCase().includes("bing")
    ? [/<li[^>]+class=["'][^"']*b_algo[^"']*["'][\s\S]*?<\/li>/gi]
    : source.toLowerCase().includes("duckduckgo")
      ? [/<div[^>]+class=["'][^"']*result[^"']*["'][\s\S]*?(?=<div[^>]+class=["'][^"']*result|<\/body>)/gi]
      : [/<div[^>]+class=["'][^"']*(?:g|MjjYud)[^"']*["'][\s\S]*?(?=<div[^>]+class=["'][^"']*(?:g|MjjYud)|<\/body>)/gi];
  const blocks = patterns.flatMap((pattern) => html.match(pattern) ?? []).map(stripHtml).filter(Boolean);

  if (blocks.length > 0) return blocks;

  return stripHtml(html)
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.length > 30)
    .slice(0, 20);
}

function countSearchResultMentions(html: string, brandName: string, domain: string, source = "search") {
  const lowerBrand = brandName.toLowerCase();
  const variants = domainVariants(domain);

  return organicResultBlocks(html, source).filter((block) => {
    const lower = block.toLowerCase();
    return lower.includes(lowerBrand) || variants.some((variant) => lower.includes(variant));
  }).length;
}

function hasBrandAlongsideDomain(html: string, brandName: string, domain: string) {
  const text = stripHtml(html);
  const lower = text.toLowerCase();
  const brandIndex = lower.indexOf(brandName.toLowerCase());
  const domainIndex = domainVariants(domain)
    .map((variant) => lower.indexOf(variant))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  if (brandIndex < 0 || domainIndex === undefined) return false;
  return Math.abs(brandIndex - domainIndex) <= 1_200;
}


function domainFromWebsite(websiteUrl: string) {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  return new URL(normalized).hostname.replace(/^www\./, "").toLowerCase();
}

function checkToEngine(result: AuditCheckResult): EngineResult {
  const mentioned = Boolean(result.found || (result.score ?? 0) > 0);

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
        citationPoints: result.score ?? 0,
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
    const maxScores = [25, 25, 20, 100, 15];
    const message = result.reason instanceof Error ? result.reason.message : "Unknown check failure";

    return {
      check: names[index],
      score: null,
      maxScore: maxScores[index],
      detail: message,
      reachable: false,
      evidence: message,
    };
  });
}

function checksFromEngines(engines: EngineResult[]) {
  return engines
    .filter((engine): engine is EngineResult & { check: AuditCheckName; score: number | null; maxScore: number; detail: string } => Boolean(engine.check))
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
  const query = `${brandName} ${domain}`;
  const sources = [
    { source: "DuckDuckGo", url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}` },
    { source: "Bing", url: `https://www.bing.com/search?q=${encodeURIComponent(query)}` },
    { source: "Google", url: `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10` },
  ];
  const failures: string[] = [];

  for (const source of sources) {
    const result = await fetchSurface(`search_visibility:${source.source}`, source.url);

    if (!result.ok || !result.html) {
      failures.push(`${source.source}: ${result.error ?? `HTTP ${result.status}`}`);
      continue;
    }

    const resultCount = countSearchResultMentions(result.html, brandName, domain, source.source);
    const score = resultCount >= 5 ? 25 : resultCount >= 2 ? 15 : resultCount === 1 ? 8 : 0;
    const found = resultCount > 0;

    return {
      check: "search_visibility",
      score,
      maxScore: 25,
      detail: `${source.source} returned ${resultCount} brand/domain result mention(s); fallback path: ${[...failures, `${source.source}: ok`].join("; ")}`,
      found,
      reachable: true,
      evidence: htmlSnippet(result.html, found ? domain : brandName),
    };
  }

  return {
    check: "search_visibility",
    score: null,
    maxScore: 25,
    detail: `Unavailable: all search providers failed (${failures.join("; ")})`,
    found: false,
    reachable: false,
    evidence: failures.join("; "),
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
  const exactBrand = `"${brandName}"`;
  const sources = await Promise.all([
    fetchSurface("ai_visibility:perplexity", `https://www.perplexity.ai/search?q=${encodeURIComponent(`${brandName} ${domain}`)}`),
    fetchSurface("ai_visibility:google_ai_overview_proxy", `https://www.bing.com/search?q=${encodeURIComponent(`${exactBrand} site:${domain}`)}`),
    fetchSurface("ai_visibility:google_ai_overview_query", `https://www.bing.com/search?q=${encodeURIComponent(`${exactBrand} AI overview`)}`),
    fetchSurface("ai_visibility:chatgpt_bing_proxy", `https://www.bing.com/search?q=${encodeURIComponent(`${exactBrand} ${domain}`)}`),
  ]);

  const perplexity = sources[0];
  const googleProxySources = sources.slice(1, 3);
  const chatgptProxy = sources[3];
  const respondedBuckets = [
    perplexity.ok && Boolean(perplexity.html),
    googleProxySources.some((source) => source.ok && Boolean(source.html)),
    chatgptProxy.ok && Boolean(chatgptProxy.html),
  ];
  const respondedCount = respondedBuckets.filter(Boolean).length;

  if (respondedCount === 0) {
    const failures = sources.map((source) => `${source.source}: ${source.error ?? `HTTP ${source.status}`}`).join("; ");

    return {
      check: "ai_visibility",
      score: null,
      maxScore: 100,
      detail: `Unavailable: all AI-surface probes failed (${failures})`,
      found: false,
      reachable: false,
      evidence: failures,
    };
  }

  const perplexityFound = Boolean(perplexity.ok && perplexity.html && mentionsBrandOrDomain(perplexity.html, brandName, domain));
  const googleProxyFound = googleProxySources.some((source) => source.ok && source.html && hasBrandAlongsideDomain(source.html, brandName, domain));
  const chatgptProxyFound = Boolean(chatgptProxy.ok && chatgptProxy.html && countSearchResultMentions(chatgptProxy.html, brandName, domain, "Bing") >= 1);
  const rawScore = (perplexityFound ? 40 : 0) + (googleProxyFound ? 35 : 0) + (chatgptProxyFound ? 25 : 0);
  const totalAvailablePoints = (respondedBuckets[0] ? 40 : 0) + (respondedBuckets[1] ? 35 : 0) + (respondedBuckets[2] ? 25 : 0);
  const score = totalAvailablePoints > 0 ? Math.min(100, Math.round((rawScore / totalAvailablePoints) * 100)) : null;
  const found = perplexityFound || googleProxyFound || chatgptProxyFound;
  const statusSummary = [
    `Perplexity: ${perplexity.ok ? "ok" : perplexity.error ?? `HTTP ${perplexity.status}`}`,
    `Google/Bing proxy: ${googleProxySources.some((source) => source.ok) ? "ok" : googleProxySources.map((source) => source.error ?? `HTTP ${source.status}`).join(", ")}`,
    `ChatGPT/Bing proxy: ${chatgptProxy.ok ? "ok" : chatgptProxy.error ?? `HTTP ${chatgptProxy.status}`}`,
  ].join("; ");
  const evidence = [perplexity, ...googleProxySources, chatgptProxy]
    .filter((source) => source.html)
    .map((source) => `${source.source}: ${htmlSnippet(source.html ?? "", mentionsBrandOrDomain(source.html ?? "", brandName, domain) ? domain : brandName)}`)
    .join("\n")
    .slice(0, 800);

  return {
    check: "ai_visibility",
    score,
    maxScore: 100,
    detail: `AI surface probes — Perplexity ${perplexityFound ? "+40" : "+0"}, Google/Bing snippets ${googleProxyFound ? "+35" : "+0"}, ChatGPT/Bing proxy ${chatgptProxyFound ? "+25" : "+0"}; ${statusSummary}`,
    found,
    reachable: true,
    evidence,
  };
}

async function probeBuyerIntentSurface(surface: { surface: string; url: string }, prompt: string, brandName: string, domain: string): Promise<BuyerIntentSurfaceResult> {
  const result = await fetchSurface(`buyer_intent:${surface.surface}`, surface.url);

  if (!result.ok || !result.html) {
    return {
      surface: surface.surface,
      reachable: false,
      unavailableReason: result.error ?? `HTTP ${result.status}`,
      brandMentioned: false,
      competitors: [],
      rawAnswerSnippet: result.error ?? `HTTP ${result.status ?? "unavailable"}`,
    };
  }

  const text = (surface.surface.includes("Bing") || surface.surface.includes("Google")
    ? organicResultBlocks(result.html, "Bing").join(". ")
    : stripHtml(result.html)).slice(0, 18_000);
  const brandMentioned = mentionsBrandOrDomain(text, brandName, domain);
  const competitors = extractCompetitorsFromText(text, brandName, domain, prompt);

  return {
    surface: surface.surface,
    reachable: true,
    brandMentioned,
    competitors,
    rawAnswerSnippet: text.slice(0, 700),
  };
}

async function analyzeBuyerIntentPrompts(brandName: string, domain: string, category: string): Promise<BuyerIntentPromptResult[]> {
  const prompts = generateBuyerIntentPrompts(category);

  return Promise.all(prompts.map(async (prompt) => {
    const surfaces = await Promise.all([
      probeBuyerIntentSurface(
        { surface: "Perplexity", url: `https://www.perplexity.ai/search?q=${encodeURIComponent(prompt)}` },
        prompt,
        brandName,
        domain
      ),
      probeBuyerIntentSurface(
        { surface: "Google AI Overview proxy", url: `https://www.bing.com/search?q=${encodeURIComponent(`${prompt} AI Overview`)}` },
        prompt,
        brandName,
        domain
      ),
      probeBuyerIntentSurface(
        { surface: "ChatGPT/Bing proxy", url: `https://www.bing.com/search?q=${encodeURIComponent(prompt)}` },
        prompt,
        brandName,
        domain
      ),
    ]);
    const availableSurfaces = surfaces.filter((surface) => surface.reachable);
    const competitors = uniqueInOrder(availableSurfaces.flatMap((surface) => surface.competitors), 12);

    return {
      prompt,
      available: availableSurfaces.length > 0,
      brandMentioned: availableSurfaces.some((surface) => surface.brandMentioned),
      competitors,
      surfaces,
    };
  }));
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
  const availableChecks = checks.filter((check) => check.score !== null);
  const availableMaxScore = availableChecks.reduce((total, check) => total + check.maxScore, 0);

  if (availableMaxScore === 0) return 0;

  const rawScore = availableChecks.reduce((total, check) => total + (check.score ?? 0), 0);
  return Math.max(0, Math.min(100, Math.round((rawScore / availableMaxScore) * 100)));
}

function formulaText() {
  return "Score = search visibility (25) + structured data/OpenGraph (25) + Wikipedia exact page (20) + real AI-surface visibility (100, normalized) + robots/sitemap technical SEO (15), normalized across available checks. Search falls back from DuckDuckGo to Bing to Google; unavailable dimensions are excluded rather than scored as zero. All checks use live HTTP fetches with 8s timeouts and no NanoCorp token.";
}

function categoryFromWebsite(websiteHtmlCheck: AuditCheckResult) {
  const evidence = `${websiteHtmlCheck.detail} ${websiteHtmlCheck.evidence ?? ""}`.toLowerCase();
  if (evidence.includes("crypto") || evidence.includes("blockchain")) return "crypto/blockchain";
  if (evidence.includes("bank") || evidence.includes("finance")) return "financial services";
  if (evidence.includes("software") || evidence.includes("api") || evidence.includes("saas")) return "software";
  return "general business";
}

function buyerIntentSummaryText(report: Pick<AuditReport, "buyerIntentPrompts" | "competitors">) {
  const total = report.buyerIntentPrompts.length;
  const namedCount = report.buyerIntentPrompts.filter((prompt) => prompt.brandMentioned).length;
  const brands = report.competitors.length ? report.competitors.join(", ") : "None found";

  return `In ${total} buyer questions, you were named ${namedCount} times. Brands named instead: ${brands}.`;
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
        "Who AI recommends instead of you:",
        buyerIntentSummaryText(report),
        ...report.buyerIntentPrompts.flatMap((prompt) => [
          `- ${prompt.prompt}`,
          `  Brand named: ${prompt.brandMentioned ? "yes" : "no"}${prompt.available ? "" : " (Unavailable)"}`,
          `  Competitors named instead: ${prompt.competitors.length ? prompt.competitors.join(", ") : prompt.available ? "None found" : "Unavailable"}`,
        ]),
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
  const inferred = await inferCategory(args.websiteUrl, checks.find((check) => check.check === "structured_data") ?? checks[0]);
  const buyerIntentPrompts = await analyzeBuyerIntentPrompts(args.brandName, domain, inferred.category);
  const competitors = uniqueInOrder(buyerIntentPrompts.flatMap((prompt) => prompt.competitors), 20);
  const reportWithoutEmail: AuditReport = {
    audit_id: args.auditId,
    score,
    engines,
    competitors,
    fixes,
    formula: formulaText(),
    structuredDataFound,
    category: inferred.category,
    buyerIntentPrompts,
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
          buyerIntentPrompts: report.buyerIntentPrompts,
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
