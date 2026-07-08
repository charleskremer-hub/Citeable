import { pool } from "./db";
import { brandSentimentText, localizePlainAction, recommendationText, type Locale } from "./i18n";

const USER_AGENT = "Mozilla/5.0 (compatible; CiteeableBot/1.0)";
const CHECK_TIMEOUT_MS = 8_000;
const ANSWER_TIMEOUT_MS = 18_000;
const WEB_SEARCH_UNAVAILABLE = "Native NanoCorp web_search unavailable; this report uses only checks that completed.";
const GEMINI_UNAVAILABLE = "Gemini indisponible, réessaie.";
const OPENAI_UNAVAILABLE = "ChatGPT/OpenAI indisponible, réessaie.";
const FREE_AUDIT_CACHE_HOURS = 24;
const FREE_AUDIT_EMAIL_DAILY_LIMIT = 3;
const FREE_AUDIT_DOMAIN_DAILY_LIMIT = 10;
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const COMPETITOR_EXTRACTION_VERSION = "gemini_recommended_brands_sentiment_v4";

export type AuditTier = "free" | "monitor_9eur" | "agent_49eur";

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
  brandSentiment?: BrandSentiment;
  kind?: "ai_engine" | "supplementary" | "locked";
  status?: "checked" | "not_connected" | "locked" | "failed";
  engine?: string;
  model?: string;
  recommendationLabel?: string;
  realLlmCall?: boolean;
};

export type BuyerIntentPromptResult = {
  prompt: string;
  available: boolean;
  brandMentioned: boolean;
  competitors: string[];
  surfaces: BuyerIntentSurfaceResult[];
};

export type ScoreTrendPoint = {
  auditId: string;
  score: number;
  createdAt: string;
  runType: string;
};

export type CompetitorMovement = {
  prompt: string;
  competitor: string;
  type: "new_competitor" | "overtook_brand";
  detail: string;
};

export type SourceCitationReport = {
  domain: string;
  sourceType: string;
  prompts: string[];
  mentions: number;
  example: string;
  action: string;
};

export type PlainAction = {
  title: string;
  doThis: string;
  where: string;
  basedOn?: string[];
};

export type BrandSentimentLabel = "positive" | "neutral" | "negative" | "not_enough_signal";

export type BrandSentiment = {
  label: BrandSentimentLabel;
  justification: string;
};

export type MonitoringSnapshot = {
  trend: ScoreTrendPoint[];
  scoreDelta: number | null;
  competitorMovements: CompetitorMovement[];
  actions: PlainAction[];
  sources: SourceCitationReport[];
  previousAuditId?: string;
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
  monitoring: MonitoringSnapshot;
  auditTier: AuditTier;
  brandSentiment: BrandSentiment;
  answerEngine?: {
    engine: string;
    model: string;
    realLlmCall: boolean;
  };
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
  monitoring?: MonitoringSnapshot;
  auditTier?: AuditTier;
  brandSentiment?: BrandSentiment;
  answerEngine?: {
    engine: string;
    model: string;
    realLlmCall: boolean;
  };
  geoAgentDescription?: string;
  competitorExtractionVersion?: string;
  weeklyEmailSent?: boolean;
  weeklyEmailError?: string;
  locale?: Locale;
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
  monitored_brand_id?: string | null;
  run_type?: string | null;
  previous_audit_id?: string | null;
  created_at?: Date;
};

type StoredPromptRow = {
  id: string;
  score: number | null;
  raw_results: AuditRawResults | null;
  created_at: Date;
  run_type: string | null;
};

type RunAuditParams = {
  auditId: string;
  brandName: string;
  websiteUrl: string;
  email: string;
  auditTier?: AuditTier;
  locale?: Locale;
};

type MonitoredBrandRow = {
  id: string;
  email: string;
  brand_name: string;
  website_url: string;
  last_audit_id: string | null;
};

type CachedFreeAuditRow = {
  id: string;
  website_url: string;
  created_at: Date;
};

export type FreeAuditQuotaResult =
  | { allowed: true }
  | { allowed: false; error: string; limitType: "email" | "domain"; retryAfterHours: number };

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

export function auditTierFromPayload(input: Record<string, unknown>): AuditTier {
  if (input.audit_tier === "agent_49eur" || input.tier === "agent_49eur" || input.paid_tier === "agent_49eur" || input.agent_49eur === true) {
    return "agent_49eur";
  }

  if (input.audit_tier === "monitor_9eur" || input.tier === "monitor_9eur" || input.paid_tier === "monitor_9eur" || input.monitor_9eur === true) {
    return "monitor_9eur";
  }

  return "free";
}

export async function findFreshFreeGeminiAudit(brandName: string, websiteUrl: string) {
  const domain = domainFromWebsite(websiteUrl);
  const cached = await pool.query<CachedFreeAuditRow>(
    `SELECT id, website_url, created_at
     FROM audits
     WHERE lower(brand_name) = lower($1)
       AND score IS NOT NULL
       AND created_at >= now() - ($2::text || ' hours')::interval
       AND COALESCE(raw_results->>'auditTier', 'free') = 'free'
       AND COALESCE((raw_results->'answerEngine'->>'realLlmCall')::boolean, false) = true
       AND raw_results->'answerEngine'->>'engine' = 'Gemini'
       AND raw_results->>'competitorExtractionVersion' = $3
     ORDER BY created_at DESC
     LIMIT 20`,
    [brandName.trim(), String(FREE_AUDIT_CACHE_HOURS), COMPETITOR_EXTRACTION_VERSION]
  );

  return cached.rows.find((row) => safeDomainFromWebsite(row.website_url) === domain) ?? null;
}

export async function checkFreeAuditQuota(email: string, websiteUrl: string): Promise<FreeAuditQuotaResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const domain = domainFromWebsite(websiteUrl);
  const result = await pool.query<{ email: string; website_url: string }>(
    `SELECT email, website_url
     FROM audits
     WHERE created_at >= date_trunc('day', now())
       AND COALESCE(raw_results->>'auditTier', 'free') = 'free'`
  );
  const emailCount = result.rows.filter((row) => row.email.trim().toLowerCase() === normalizedEmail).length;
  const domainCount = result.rows.filter((row) => safeDomainFromWebsite(row.website_url) === domain).length;

  if (emailCount >= FREE_AUDIT_EMAIL_DAILY_LIMIT) {
    return {
      allowed: false,
      error: "Limite d'audits gratuits atteinte pour cet email aujourd'hui. Réessaie demain.",
      limitType: "email",
      retryAfterHours: 24,
    };
  }

  if (domainCount >= FREE_AUDIT_DOMAIN_DAILY_LIMIT) {
    return {
      allowed: false,
      error: "Limite d'audits gratuits atteinte pour ce domaine aujourd'hui. Réessaie demain.",
      limitType: "domain",
      retryAfterHours: 24,
    };
  }

  return { allowed: true };
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
  const buyerIntentPrompts = row.raw_results?.buyerIntentPrompts ?? [];
  const auditTier = row.raw_results?.auditTier ?? "free";

  return {
    audit_id: row.id,
    score: row.score ?? 0,
    engines: row.engines_checked ?? [],
    competitors: row.competitors_found ?? [],
    fixes: row.fixes ?? [],
    formula: row.raw_results?.formula ?? formulaTextForTier(auditTier),
    structuredDataFound: Boolean(row.raw_results?.structuredDataFound),
    category: row.raw_results?.category ?? "unknown",
    buyerIntentPrompts,
    emailSent: Boolean(row.raw_results?.emailSent),
    emailError: row.raw_results?.emailError,
    checks,
    monitoring: {
      ...emptyMonitoringSnapshot(buyerIntentPrompts),
      actions: buildPlainActions(buyerIntentPrompts, row.raw_results?.category ?? "your type of business", row.competitors_found ?? []),
    },
    auditTier,
    brandSentiment: normalizeBrandSentiment(row.raw_results?.brandSentiment ?? bestBrandSentimentFromPrompts(buyerIntentPrompts)),
    answerEngine: row.raw_results?.answerEngine,
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

type SurfaceFetchResult = {
  source: string;
  url: string;
  ok: boolean;
  status?: number;
  html?: string;
  text?: string;
  error?: string;
};

type NanoCorpSearchResult = {
  title?: unknown;
  url?: unknown;
  snippet?: unknown;
};

type NanoCorpToolResponse<T> = {
  success?: boolean;
  result?: T;
  error?: unknown;
};

type NanoCorpRuntimeCredential = {
  token: string;
  source: string;
};

type NanoCorpToolAttempt = {
  attempt: number;
  status?: number;
  message: string;
  tokenSource?: string;
};

type NanoCorpToolFailure = {
  ok: false;
  status?: number;
  error: string;
  message: string;
  attempts: NanoCorpToolAttempt[];
};

type NanoCorpToolSuccess<T> = {
  ok: true;
  status: number;
  result?: T;
  attempts: NanoCorpToolAttempt[];
};

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nanoCorpBackendUrl() {
  return (process.env.NANOCORP_BACKEND_URL ?? "https://phospho-nanocorp-prod--nanocorp-api-fastapi-app.modal.run").replace(/\/$/, "");
}

function envValue(key: string) {
  const value = (process.env as Record<string, string | undefined>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nanoCorpCompanyId() {
  return envValue("NANOCORP_COMPANY") ?? envValue("NANOCORP_COMPANY_ID");
}

function nanoCorpRuntimeCredential(excludeToken?: string): NanoCorpRuntimeCredential | undefined {
  const candidates: NanoCorpRuntimeCredential[] = [
    { source: "NANOCORP_TOKEN_RUNTIME", token: envValue("NANOCORP_TOKEN_RUNTIME") ?? "" },
    { source: "NANOCORP_TOKEN", token: envValue("NANOCORP_TOKEN") ?? "" },
    { source: "AGENT_SECRET", token: envValue("AGENT_SECRET") ?? "" },
    { source: "NANOCORP_API_TOKEN", token: envValue("NANOCORP_API_TOKEN") ?? "" },
    { source: "NANOCORP_TOKEN_FALLBACK", token: envValue("NANOCORP_TOKEN_FALLBACK") ?? "" },
  ].filter((candidate) => candidate.token);

  return candidates.find((candidate) => candidate.token !== excludeToken) ?? candidates[0];
}

function nanoCorpHeaders(credential: NanoCorpRuntimeCredential) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${credential.token}`,
    "Content-Type": "application/json",
  };
  const companyId = nanoCorpCompanyId();

  if (companyId) {
    headers["Nanocorp-Company"] = companyId;
  }

  return headers;
}

function responseMessage(body: string) {
  const parsed = safeJsonParse<Record<string, unknown> | null>(body, null);
  const message = parsed?.detail ?? parsed?.message ?? parsed?.error;

  if (typeof message === "string" && message.trim()) return message.trim();
  if (message !== undefined) return String(message);

  return body.slice(0, 300) || "empty response";
}

function isAuthStatus(status?: number) {
  return status === 401 || status === 403;
}

function nanoCorpToolError(tool: string, status: number | undefined, message: string) {
  return status
    ? `NanoCorp ${tool} HTTP ${status}: ${message}`
    : `NanoCorp ${tool}: ${message}`;
}

async function executeNanoCorpToolAttempt<T>(
  tool: string,
  args: Record<string, unknown>,
  timeoutMs: number,
  credential: NanoCorpRuntimeCredential,
  attempt: number
): Promise<NanoCorpToolSuccess<T> | NanoCorpToolFailure> {
  const attempts: NanoCorpToolAttempt[] = [];

  const response = await fetch(`${nanoCorpBackendUrl()}/internal/tools/${tool}/execute`, {
    method: "POST",
    headers: nanoCorpHeaders(credential),
    body: JSON.stringify({ arguments: args }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();

  if (!response.ok) {
    const message = responseMessage(body);
    return {
      ok: false,
      status: response.status,
      message,
      error: nanoCorpToolError(tool, response.status, message),
      attempts: [{ attempt, status: response.status, message, tokenSource: credential.source }],
    };
  }

  const parsed = safeJsonParse<NanoCorpToolResponse<T>>(body, {});

  if (parsed.success === false || parsed.error) {
    const message = String(parsed.error ?? "unknown error");
    return {
      ok: false,
      status: response.status,
      message,
      error: `NanoCorp ${tool} failed: ${message}`,
      attempts: [{ attempt, status: response.status, message, tokenSource: credential.source }],
    };
  }

  attempts.push({ attempt, status: response.status, message: "ok", tokenSource: credential.source });

  return { ok: true, status: response.status, result: parsed.result, attempts };
}

async function executeNanoCorpTool<T>(tool: string, args: Record<string, unknown>, timeoutMs = CHECK_TIMEOUT_MS) {
  const firstCredential = nanoCorpRuntimeCredential();

  if (!firstCredential) {
    return {
      ok: false,
      error: "NANOCORP_TOKEN is not configured",
      message: "NANOCORP_TOKEN is not configured",
      attempts: [],
    } as NanoCorpToolFailure;
  }

  const firstResult = await executeNanoCorpToolAttempt<T>(tool, args, timeoutMs, firstCredential, 1);

  if (firstResult.ok || !isAuthStatus(firstResult.status)) {
    return firstResult;
  }

  console.warn(`[citeable] NanoCorp ${tool} auth failed; refreshing runtime token once`, {
    status: firstResult.status,
    message: firstResult.message,
  });

  const refreshedCredential = nanoCorpRuntimeCredential(firstCredential.token);

  if (!refreshedCredential || refreshedCredential.token === firstCredential.token) {
    console.error(`[citeable] NanoCorp ${tool} auth retry skipped; no fresh runtime token available`, {
      status: firstResult.status,
      message: firstResult.message,
    });
    return firstResult;
  }

  const retryResult = await executeNanoCorpToolAttempt<T>(tool, args, timeoutMs, refreshedCredential, 2);
  const attempts = [...firstResult.attempts, ...retryResult.attempts];

  if (retryResult.ok) {
    console.info(`[citeable] NanoCorp ${tool} retry succeeded after runtime token refresh`, {
      status: retryResult.status,
    });
    return { ...retryResult, attempts };
  }

  console.error(`[citeable] NanoCorp ${tool} retry failed after runtime token refresh`, {
    status: retryResult.status,
    message: retryResult.message,
  });

  return { ...retryResult, attempts };
}

function searchResultDomain(value: unknown) {
  if (typeof value !== "string" || !value) return "";

  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function searchResultText(results: NanoCorpSearchResult[]) {
  return results
    .map((result) => {
      const domain = searchResultDomain(result.url);
      return [result.snippet, result.title, domain].filter((value): value is string => typeof value === "string" && value.length > 0).join(" — ");
    })
    .filter(Boolean)
    .join("\n");
}

type AnswerEngineProvider = {
  engine: string;
  model: string;
  configured: boolean;
  unavailableMessage: string;
  positiveLabel: string;
  negativeLabel: string;
  ask: (question: string, context: AnswerEngineQuestionContext) => Promise<AnswerEngineResponse>;
};

type AnswerEngineProviderKey = "gemini" | "openai" | "anthropic" | "xai" | "mistral";

type AnswerEngineProviderConfig = {
  key: AnswerEngineProviderKey;
  engine: string;
  apiKeyEnv: string;
  modelEnv: string;
  defaultModel: string;
  enabled: boolean;
};

type AnswerEngineQuestionContext = {
  brandName: string;
  domain: string;
};

type AnswerEngineAnswer = {
  answer: string;
  competitorBrands: string[];
  brandSentiment?: BrandSentiment;
  brandMentioned?: boolean;
  model?: string;
};

type AnswerEngineError = {
  error: "rate_limit" | "openai_error";
  status: number;
  message: string;
};

type AnswerEngineResponse = AnswerEngineAnswer | AnswerEngineError;

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

type GeminiStructuredBrandResponse = {
  recommended_brands?: unknown;
  audited_brand_sentiment?: unknown;
  audited_brand_sentiment_reason?: unknown;
};

type OpenAIChatCompletionResponse = {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string | number | null;
  };
};

const ANSWER_ENGINE_PROVIDER_CONFIGS: Record<AnswerEngineProviderKey, AnswerEngineProviderConfig> = {
  gemini: {
    key: "gemini",
    engine: "Gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: DEFAULT_GEMINI_MODEL,
    enabled: true,
  },
  openai: {
    key: "openai",
    engine: "ChatGPT",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: DEFAULT_OPENAI_MODEL,
    enabled: true,
  },
  anthropic: {
    key: "anthropic",
    engine: "Claude",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-4",
    enabled: false,
  },
  xai: {
    key: "xai",
    engine: "Grok",
    apiKeyEnv: "XAI_API_KEY",
    modelEnv: "XAI_MODEL",
    defaultModel: "grok-4",
    enabled: false,
  },
  mistral: {
    key: "mistral",
    engine: "Mistral",
    apiKeyEnv: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
    defaultModel: "mistral-large-latest",
    enabled: false,
  },
};

// To activate Claude/Grok/Mistral later, add an adapter matching createGeminiProvider/createOpenAIProvider,
// wire it in providerForKey(), and flip that provider's enabled flag only after its API key is configured.

const ANSWER_ENGINE_BY_TIER: Record<AuditTier, AnswerEngineProviderKey> = {
  free: "gemini",
  monitor_9eur: "gemini",
  agent_49eur: "openai",
};

function currentGeminiModel() {
  const configured = (process.env.GEMINI_MODEL ?? process.env.GOOGLE_GEMINI_MODEL)?.trim();
  if (configured && !/^gemini-(?:1\.5|2\.0)(?:-|$)/i.test(configured)) return configured;
  return DEFAULT_GEMINI_MODEL;
}

function geminiApiKey() {
  return process.env.GEMINI_API_KEY ?? process.env.NANO_USER_GEMINI_API_KEY ?? "";
}

function currentOpenAIModel() {
  return DEFAULT_OPENAI_MODEL;
}

function openAIApiKey() {
  return process.env.OPENAI_API_KEY ?? process.env.NANO_USER_CHATGPT_API_KEY ?? "";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiAnswerText(body: GeminiGenerateContentResponse) {
  return body.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text)
    .filter((text): text is string => Boolean(text?.trim()))
    .join("\n")
    .trim() ?? "";
}

function openAIAnswerText(body: OpenAIChatCompletionResponse) {
  return body.choices
    ?.map((choice) => choice.message?.content)
    .filter((text): text is string => Boolean(text?.trim()))
    .join("\n")
    .trim() ?? "";
}

function jsonObjectFromText(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = trimmed.indexOf("{");

  if (start === -1) return trimmed;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;

    if (depth === 0) return trimmed.slice(start, index + 1);
  }

  const end = trimmed.lastIndexOf("}");
  return end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function brandNameFromUnknown(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return stringFromUnknown(record.name) || stringFromUnknown(record.brand);
  }

  return "";
}

function normalizeBrandSentimentLabel(value: unknown): BrandSentimentLabel {
  const label = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";

  if (label === "positive" || label === "neutral" || label === "negative") return label;
  return "not_enough_signal";
}

function cleanSentimentReason(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").replace(/[.。]+$/u, "").slice(0, 180) : "";
}

function normalizeBrandSentiment(value: unknown): BrandSentiment {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const label = normalizeBrandSentimentLabel(record.label ?? record.sentiment ?? record.audited_brand_sentiment);
    const justification = cleanSentimentReason(record.justification ?? record.reason ?? record.audited_brand_sentiment_reason);

    if (label !== "not_enough_signal" && justification) return { label, justification };
  }

  return { label: "not_enough_signal", justification: "not enough signal" };
}

function sentimentFromStructuredResponse(parsed: GeminiStructuredBrandResponse | null): BrandSentiment {
  if (!parsed || typeof parsed !== "object") return { label: "not_enough_signal", justification: "not enough signal" };

  const label = normalizeBrandSentimentLabel(parsed.audited_brand_sentiment);
  const justification = cleanSentimentReason(parsed.audited_brand_sentiment_reason);

  if (label === "not_enough_signal" || !justification) return { label: "not_enough_signal", justification: "not enough signal" };
  return { label, justification };
}

function bestBrandSentimentFromPrompts(prompts: BuyerIntentPromptResult[]): BrandSentiment {
  const sentiment = prompts
    .flatMap((prompt) => prompt.surfaces)
    .filter((surface) => surface.kind === "ai_engine" && surface.status === "checked" && surface.realLlmCall === true)
    .map((surface) => normalizeBrandSentiment(surface.brandSentiment))
    .find((item) => item.label !== "not_enough_signal" && item.justification !== "not enough signal");

  return sentiment ?? { label: "not_enough_signal", justification: "not enough signal" };
}

export function brandSentimentLine(sentiment: BrandSentiment) {
  const normalized = normalizeBrandSentiment(sentiment);

  if (normalized.label === "not_enough_signal") return "How AI talks about you: not enough signal";

  const label = normalized.label.charAt(0).toUpperCase() + normalized.label.slice(1);
  return `How AI talks about you: ${label} - ${normalized.justification}.`;
}

function extractRecommendedBrandsFromLooseJson(text: string) {
  const match = text.match(/"recommended_brands"\s*:\s*\[([\s\S]*?)(?:\]|$)/i);

  if (!match) return [];

  return Array.from(match[1].matchAll(/"([^"\n]{2,80})"/g), (brandMatch) => brandMatch[1]);
}

function parseStructuredBrandResponse(text: string): AnswerEngineAnswer {
  const parsed = safeJsonParse<GeminiStructuredBrandResponse | null>(jsonObjectFromText(text), null);
  const brands = parsed && typeof parsed === "object" && Array.isArray(parsed.recommended_brands)
    ? parsed.recommended_brands.map(brandNameFromUnknown)
    : extractRecommendedBrandsFromLooseJson(text);
  const recommendedBrands = uniqueInOrder(brands.map(normalizeCompetitorName).filter(Boolean), 12);
  const brandSentiment = sentimentFromStructuredResponse(parsed);

  if (!recommendedBrands.length) return { answer: text, competitorBrands: [], brandSentiment };

  return {
    answer: `recommended_brands: ${recommendedBrands.join(", ")}`,
    competitorBrands: recommendedBrands,
    brandSentiment,
  };
}

function answerEngineErrorBody(error: AnswerEngineError) {
  return JSON.stringify(error);
}

function isAnswerEngineError(response: AnswerEngineResponse): response is AnswerEngineError {
  return "error" in response;
}

function createGeminiProvider(): AnswerEngineProvider {
  const model = currentGeminiModel();
  const apiKey = geminiApiKey();

  return {
    engine: "Gemini",
    model,
    configured: Boolean(apiKey),
    unavailableMessage: GEMINI_UNAVAILABLE,
    positiveLabel: "Gemini te recommande",
    negativeLabel: "Gemini ne te cite pas",
    async ask(question: string, context: AnswerEngineQuestionContext) {
      if (!apiKey) throw new Error(GEMINI_UNAVAILABLE);

      const prompt = [
        "You are answering a real buyer-intent recommendation question for a visibility audit.",
        `Buyer question: ${question}`,
        `Audited brand: ${context.brandName}`,
        `Audited domain: ${context.domain}`,
        "Return ONLY valid JSON with this exact shape:",
        '{"recommended_brands":["On","Hoka","Veja"],"audited_brand_sentiment":"positive","audited_brand_sentiment_reason":"described as a trusted premium option"}',
        "Rules:",
        "- recommended_brands must contain only real brand/company/product names that answer the buyer question.",
        `- Include ${context.brandName} only if you would genuinely recommend or cite it for this question.`,
        `- Do not include ${context.domain} unless it is itself the brand name.`,
        "- Do not include generic words, categories, adjectives, personas, locations, headings, explanations, URLs, or prose tokens.",
        "- If you cannot name any recommended brands, return an empty recommended_brands array.",
        `- audited_brand_sentiment must describe only how you are presenting ${context.brandName} in this answer: positive, neutral, negative, or not_enough_signal.`,
        "- Use not_enough_signal if the audited brand is not clearly described in the answer.",
        "- audited_brand_sentiment_reason must be one short, non-technical phrase in plain English, or exactly not enough signal.",
      ].join("\n");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      let lastError = GEMINI_UNAVAILABLE;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [{ text: prompt }],
                },
              ],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 700,
                responseMimeType: "application/json",
              },
            }),
            signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
          });
          const responseText = await response.text();
          const parsed = safeJsonParse<GeminiGenerateContentResponse>(responseText, {});

          if (response.ok) {
            const answer = geminiAnswerText(parsed);
            if (answer) return parseStructuredBrandResponse(answer);
            lastError = GEMINI_UNAVAILABLE;
          } else {
            lastError = parsed.error?.message ? `${GEMINI_UNAVAILABLE} HTTP ${response.status}: ${parsed.error.message}` : `${GEMINI_UNAVAILABLE} HTTP ${response.status}`;
            if (response.status !== 429 && response.status < 500) break;
          }
        } catch (error) {
          lastError = error instanceof Error ? `${GEMINI_UNAVAILABLE} ${error.message}` : GEMINI_UNAVAILABLE;
        }

        if (attempt < 2) await delay(500 * 2 ** attempt);
      }

      throw new Error(lastError);
    },
  };
}

function createOpenAIProvider(): AnswerEngineProvider {
  const model = currentOpenAIModel();
  const apiKey = openAIApiKey();

  return {
    engine: "ChatGPT",
    model,
    configured: Boolean(apiKey),
    unavailableMessage: OPENAI_UNAVAILABLE,
    positiveLabel: "ChatGPT te recommande",
    negativeLabel: "ChatGPT ne te cite pas",
    async ask(question: string, context: AnswerEngineQuestionContext) {
      if (!apiKey) throw new Error(OPENAI_UNAVAILABLE);

      const prompt = [
        "You are answering a real buyer-intent recommendation question for a visibility audit.",
        `Buyer question: ${question}`,
        `Audited brand: ${context.brandName}`,
        `Audited domain: ${context.domain}`,
        "Return ONLY valid JSON with this exact shape:",
        '{"recommended_brands":["On","Hoka","Veja"],"audited_brand_sentiment":"positive","audited_brand_sentiment_reason":"described as a trusted premium option"}',
        "Rules:",
        "- recommended_brands must contain only real brand/company/product names that answer the buyer question.",
        `- Include ${context.brandName} only if you would genuinely recommend or cite it for this question.`,
        `- Do not include ${context.domain} unless it is itself the brand name.`,
        "- Do not include generic words, categories, adjectives, personas, locations, headings, explanations, URLs, or prose tokens.",
        "- If you cannot name any recommended brands, return an empty recommended_brands array.",
        `- audited_brand_sentiment must describe only how you are presenting ${context.brandName} in this answer: positive, neutral, negative, or not_enough_signal.`,
        "- Use not_enough_signal if the audited brand is not clearly described in the answer.",
        "- audited_brand_sentiment_reason must be one short, non-technical phrase in plain English, or exactly not enough signal.",
      ].join("\n");
      let lastRateLimitError: AnswerEngineError | null = null;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content: "Return compact JSON only. Do not include prose outside JSON.",
                },
                {
                  role: "user",
                  content: prompt,
                },
              ],
              temperature: 0.2,
              max_tokens: 700,
              response_format: { type: "json_object" },
            }),
            signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
          });
          const responseText = await response.text();
          const parsed = safeJsonParse<OpenAIChatCompletionResponse>(responseText, {});
          const rawMessage = parsed.error?.message || responseText || `HTTP ${response.status}`;

          if (response.ok) {
            const answer = openAIAnswerText(parsed);
            if (answer) {
              return {
                ...parseStructuredBrandResponse(answer),
                model: parsed.model || model,
              };
            }

            return { error: "openai_error", status: response.status, message: rawMessage };
          }

          if (response.status === 429) {
            lastRateLimitError = { error: "rate_limit", status: 429, message: rawMessage };

            if (attempt === 0) {
              await delay(5_000);
              continue;
            }

            return lastRateLimitError;
          } else {
            return { error: "openai_error", status: response.status, message: rawMessage };
          }
        } catch (error) {
          return { error: "openai_error", status: 0, message: error instanceof Error ? error.message : OPENAI_UNAVAILABLE };
        }
      }

      return lastRateLimitError ?? { error: "openai_error", status: 0, message: OPENAI_UNAVAILABLE };
    },
  };
}

function providerForKey(key: AnswerEngineProviderKey): AnswerEngineProvider | null {
  const config = ANSWER_ENGINE_PROVIDER_CONFIGS[key];

  if (!config.enabled) return null;
  if (key === "gemini") return createGeminiProvider();
  if (key === "openai") return createOpenAIProvider();

  return null;
}

function answerEngineForTier(tier: AuditTier): AnswerEngineProvider | null {
  return providerForKey(ANSWER_ENGINE_BY_TIER[tier]);
}

function unavailableMessageForTier(tier: AuditTier) {
  return answerEngineForTier(tier)?.unavailableMessage ?? GEMINI_UNAVAILABLE;
}

async function fetchNanoCorpSearch(source: string, query: string): Promise<SurfaceFetchResult> {
  try {
    const toolResult = await executeNanoCorpTool<{ results?: NanoCorpSearchResult[] }>("web_search", { query, max_results: 8 }, ANSWER_TIMEOUT_MS);

    if (!toolResult.ok) {
      console.log(`[citeable] surface fetch ${source}: ${toolResult.error}`);
      return { source, url: "nanocorp:web_search", ok: false, status: toolResult.status, error: toolResult.error };
    }

    const results = Array.isArray(toolResult.result?.results) ? toolResult.result.results : [];
    const text = searchResultText(results);

    if (!text) {
      return { source, url: "nanocorp:web_search", ok: false, error: "NanoCorp web_search returned no usable results" };
    }

    console.log(`[citeable] surface fetch ${source}: NanoCorp web_search ok (${results.length} results)`);
    return { source, url: "nanocorp:web_search", ok: true, status: toolResult.status, html: text, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown NanoCorp web_search error";
    console.log(`[citeable] surface fetch ${source}: NanoCorp web_search failed ${message}`);
    return { source, url: "nanocorp:web_search", ok: false, error: message };
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

function sortedByFrequency(values: string[], limit = values.length) {
  const counts = new Map<string, { name: string; count: number; firstIndex: number }>();

  values.forEach((value, index) => {
    const name = value.trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();

    if (!name) return;

    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { name, count: 1, firstIndex: index });
    }
  });

  return Array.from(counts.values())
    .sort((left, right) => right.count - left.count || left.firstIndex - right.firstIndex || left.name.localeCompare(right.name))
    .map((entry) => entry.name)
    .slice(0, limit);
}

function emptyMonitoringSnapshot(currentPrompts: BuyerIntentPromptResult[] = []): MonitoringSnapshot {
  return {
    trend: [],
    scoreDelta: null,
    competitorMovements: [],
    actions: buildPlainActions(currentPrompts),
    sources: extractSourceCitationReports(currentPrompts),
  };
}

export function buildPlainActions(
  prompts: BuyerIntentPromptResult[] = [],
  category = "your type of business",
  competitors: string[] = []
): PlainAction[] {
  const testedQuestions = uniqueInOrder(
    prompts.filter((prompt) => prompt.available).map((prompt) => prompt.prompt),
    5
  );
  const competitorExamples = uniqueInOrder(competitors.length ? competitors : prompts.flatMap((prompt) => prompt.competitors), 4);
  const questionText = testedQuestions.length
    ? testedQuestions.map((prompt) => `“${prompt}”`).join("; ")
    : "the buyer questions in this audit";
  const compareText = competitorExamples.length
    ? `Use the real names native web_search already surfaces: ${competitorExamples.join(", ")}.`
    : "Use the names buyers already compare you with, if any appear in future audits.";

  return [
    {
      title: "Add a FAQ page for the questions buyers search",
      doThis: `Create one page that answers these exact tested questions in simple words: ${questionText}.`,
      where: "On your own website, linked from the homepage and main navigation.",
      basedOn: testedQuestions,
    },
    {
      title: "Earn third-party mentions Gemini can trust",
      doThis: `Create or refresh short profiles for ${category}. Prioritise one directory/listing, one Reddit or Quora-style answer, and one relevant listicle or review page.`,
      where: "Directory/profile pages, Reddit or Quora/community threads, and relevant industry listicles.",
    },
    {
      title: "Ask 3 happy customers for a review this week",
      doThis: `Ask customers to mention the problem you solved and the result they got. ${compareText}`,
      where: "Google reviews, review sites, LinkedIn, and any marketplace or directory profile you already use.",
    },
  ];
}

function normalizePromptKey(prompt: string) {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}

function competitorsByPrompt(prompts: BuyerIntentPromptResult[]) {
  const byPrompt = new Map<string, Set<string>>();

  for (const prompt of prompts) {
    byPrompt.set(
      normalizePromptKey(prompt.prompt),
      new Set(prompt.competitors.map((competitor) => competitor.toLowerCase()))
    );
  }

  return byPrompt;
}

function brandMentionByPrompt(prompts: BuyerIntentPromptResult[]) {
  const byPrompt = new Map<string, boolean>();

  for (const prompt of prompts) {
    byPrompt.set(normalizePromptKey(prompt.prompt), prompt.brandMentioned);
  }

  return byPrompt;
}

function compareCompetitorMovement(currentPrompts: BuyerIntentPromptResult[], previousPrompts: BuyerIntentPromptResult[] = []) {
  const previousCompetitors = competitorsByPrompt(previousPrompts);
  const previousBrandMentioned = brandMentionByPrompt(previousPrompts);
  const movements: CompetitorMovement[] = [];

  for (const prompt of currentPrompts) {
    const promptKey = normalizePromptKey(prompt.prompt);
    const previousForPrompt = previousCompetitors.get(promptKey) ?? new Set<string>();
    const brandWasMentioned = previousBrandMentioned.get(promptKey) ?? false;

    for (const competitor of prompt.competitors) {
      if (!previousForPrompt.has(competitor.toLowerCase())) {
        movements.push({
          prompt: prompt.prompt,
          competitor,
          type: "new_competitor",
          detail: `${competitor} appeared in native web_search snippets for this prompt this run.`,
        });
      }
    }

    if (brandWasMentioned && !prompt.brandMentioned && prompt.competitors.length > 0) {
      movements.push({
        prompt: prompt.prompt,
        competitor: prompt.competitors[0],
        type: "overtook_brand",
        detail: `${prompt.competitors[0]} appears while the brand/domain no longer appears for this prompt.`,
      });
    }
  }

  return uniqueInOrder(
    movements.map((movement) => JSON.stringify(movement)),
    12
  ).map((movement) => JSON.parse(movement) as CompetitorMovement);
}

function extractDomains(text: string) {
  const domains = new Set<string>();
  const domainPattern = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+)\b/gi;
  const blocked = new Set(["keyban.io", "example.com", "localhost"]);
  let match: RegExpExecArray | null;

  while ((match = domainPattern.exec(text)) !== null) {
    const domain = match[1].toLowerCase().replace(/^www\./, "");
    const parts = domain.split(".");

    if (parts.length < 2 || blocked.has(domain) || /\.(js|css|png|jpg|jpeg|svg|gif)$/i.test(domain)) continue;
    domains.add(domain);
  }

  return Array.from(domains);
}

function inferSourceType(domain: string) {
  if (/(reddit|quora|stackexchange|stackoverflow|hackernews|news\.ycombinator)/i.test(domain)) return "Community discussion";
  if (/(g2|capterra|getapp|trustradius|softwareadvice|producthunt)/i.test(domain)) return "Review/listing site";
  if (/(youtube|youtu\.be|tiktok|instagram|linkedin|x\.com|twitter)/i.test(domain)) return "Social/video source";
  if (/(techcrunch|forbes|wired|theverge|businessinsider|coindesk|decrypt|news|blog)/i.test(domain)) return "Editorial/news";
  if (/(stripe|coinbase|visa|paypal|mastercard|amazon|openai|adyen|checkout|crossmint|nevermined|skyfire|rye|ramp)/i.test(domain)) return "Vendor/partner site";
  return "Cited domain";
}

function sourceAction(domain: string, sourceType: string) {
  if (sourceType === "Community discussion") return `Join relevant ${domain} threads and answer buyer questions with transparent examples.`;
  if (sourceType === "Review/listing site") return `Create or update the ${domain} listing, add category copy, screenshots, and customer proof.`;
  if (sourceType === "Social/video source") return `Publish a concise demo or comparison on ${domain} using the prompts buyers ask.`;
  if (sourceType === "Editorial/news") return `Pitch ${domain} with a concrete customer story or data point tied to this category.`;
  if (sourceType === "Vendor/partner site") return `Build an integration, comparison, or partner page that can earn mentions near ${domain}.`;
  return `Create a credible page or outreach angle that can earn a mention from ${domain}.`;
}

export function extractSourceCitationReports(prompts: BuyerIntentPromptResult[]) {
  const sourceMap = new Map<string, { prompts: Set<string>; examples: string[]; mentions: number }>();

  for (const prompt of prompts) {
    for (const surface of prompt.surfaces) {
      if (!surface.reachable || !surface.rawAnswerSnippet) continue;

      for (const domain of extractDomains(surface.rawAnswerSnippet)) {
        const current = sourceMap.get(domain) ?? { prompts: new Set<string>(), examples: [], mentions: 0 };
        current.prompts.add(prompt.prompt);
        current.mentions += 1;
        if (current.examples.length < 2) current.examples.push(surface.rawAnswerSnippet.slice(0, 180));
        sourceMap.set(domain, current);
      }
    }
  }

  return Array.from(sourceMap.entries())
    .map(([domain, data]) => {
      const sourceType = inferSourceType(domain);

      return {
        domain,
        sourceType,
        prompts: Array.from(data.prompts).slice(0, 3),
        mentions: data.mentions,
        example: data.examples[0] ?? "",
        action: sourceAction(domain, sourceType),
      };
    })
    .sort((left, right) => right.mentions - left.mentions || left.domain.localeCompare(right.domain))
    .slice(0, 8);
}

function monitoringSnapshotFromRuns(current: StoredPromptRow, runs: StoredPromptRow[]): MonitoringSnapshot {
  const trend = runs
    .filter((run) => run.score !== null && run.score !== undefined)
    .sort((left, right) => left.created_at.getTime() - right.created_at.getTime())
    .map((run) => ({
      auditId: run.id,
      score: run.score ?? 0,
      createdAt: run.created_at.toISOString(),
      runType: run.run_type ?? "manual",
    }));
  const currentIndex = trend.findIndex((point) => point.auditId === current.id);
  const previousTrendPoint = currentIndex > 0 ? trend[currentIndex - 1] : trend.length > 1 ? trend[trend.length - 2] : undefined;
  const currentPrompts = current.raw_results?.buyerIntentPrompts ?? [];
  const previousRun = runs
    .filter((run) => run.id !== current.id && run.created_at < current.created_at)
    .sort((left, right) => right.created_at.getTime() - left.created_at.getTime())[0];
  const previousPrompts = previousRun?.raw_results?.buyerIntentPrompts ?? [];

  return {
    trend,
    scoreDelta: previousTrendPoint && current.score !== null && current.score !== undefined ? current.score - previousTrendPoint.score : null,
    competitorMovements: compareCompetitorMovement(currentPrompts, previousPrompts),
    actions: buildPlainActions(currentPrompts, current.raw_results?.category ?? "your type of business"),
    sources: extractSourceCitationReports(currentPrompts),
    previousAuditId: previousRun?.id,
  };
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
    [/\bosprey\b|backpacks?|rucksacks?|daypacks?|packs?\b|travel packs?|hiking packs?|outdoor gear|hydration packs?|luggage|packfinder|trekking/, "backpacks and outdoor gear"],
    [/\ballbirds\b|sustainable sneakers?|eco-?friendly shoes?|wool shoes?|tree runners?|running shoes?|walking shoes?|sneakers?|footwear|chaussures?/, "DTC footwear brand"],
    [/apparel|clothing|fashion|garments?|menswear|womenswear/, "fashion brand"],
    [/skin care|skincare|beauty|cosmetics/, "beauty brand"],
    [/coffee|tea|beverage|drinks?|snacks?|food & beverage|food and beverage/, "food & beverage"],
    [/plombier|plumbing|leak repair|chauffagiste/, "plumber"],
    [/[ée]lectricien|electrician|electrical contractor/, "electrician"],
    [/restaurant|bistro|brasserie|traiteur|catering/, "restaurant"],
    [/dentiste|dental|orthodont/, "dentist"],
    [/avocat|law firm|lawyer|legal services/, "law firm"],
    [/expert-?comptable|accountant|bookkeeping/, "accounting firm"],
    [/agence immobili[èe]re|real estate agency|property agency/, "real estate agency"],
    [/agence web|site internet|web design|seo agency|marketing agency/, "web agency"],
    [/salon de coiffure|hair salon|barber/, "hair salon"],
    [/coach sportif|personal trainer|fitness coach/, "fitness coach"],
    [/garage auto|auto repair|car repair|mechanic/, "auto repair shop"],
    [/architecte|architectural studio|architecture firm/, "architecture firm"],
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

function isGenericCategory(category: string) {
  return /^(general business|business|company|website|online store|ecommerce platform|software platform|developer platform|unknown|your type of business)$/i.test(category.trim());
}

function categoryLooksLikeTechStack(category: string, homepageText: string) {
  const lowerCategory = category.toLowerCase();
  const lowerText = homepageText.toLowerCase();
  const productSignals = /\ballbirds\b|sustainable sneakers?|eco-?friendly shoes?|wool shoes?|tree runners?|running shoes?|walking shoes?|sneakers?|footwear|chaussures?|apparel|clothing|fashion|skincare|beauty|coffee|beverage|food/.test(lowerText);

  return productSignals && /e-?commerce|online store|shopify|website|platform|developer platform|software platform/.test(lowerCategory);
}

function detectBuyerQuestionLanguage(text: string, domain: string) {
  const lower = text.toLowerCase();

  if (/\b(le|la|les|des|pour|avec|sans|devis|prix|tarif|pas cher|meilleur|agence|entreprise|service|client|contact)\b/.test(lower) || domain.endsWith(".fr")) {
    return "fr" as const;
  }

  return "en" as const;
}

const LOCATION_HINTS = [
  "Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Nantes", "Montpellier", "Strasbourg", "Bordeaux", "Lille",
  "Rennes", "Reims", "Saint-Étienne", "Toulon", "Grenoble", "Dijon", "Angers", "Nîmes", "Villeurbanne", "Clermont-Ferrand",
  "London", "New York", "Los Angeles", "Chicago", "San Francisco", "Austin", "Seattle", "Boston", "Miami", "Toronto",
];

function inferLocationFromHomepage(text: string, domain: string) {
  const normalized = text.replace(/\s+/g, " ");
  const postalMatch = normalized.match(/\b\d{5}\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ' -]{2,38})\b/);
  const nearMatch = normalized.match(/\b(?:à|a|in|near|based in|situ[eé]\s+[aà])\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ' -]{2,38})\b/);
  const knownCity = LOCATION_HINTS.find((city) => new RegExp(`\\b${escapedRegex(city)}\\b`, "i").test(normalized));
  const city = postalMatch?.[1] ?? nearMatch?.[1] ?? knownCity;

  if (city) {
    return city
      .replace(/\b(?:France|Europe|Contact|Accueil|Home|Services|Clients|About|Legal)\b.*$/i, "")
      .trim()
      .slice(0, 40);
  }

  if (domain.endsWith(".fr")) return "France";
  return "near me";
}

function inferAudienceFromHomepage(text: string, language: "en" | "fr") {
  const lower = text.toLowerCase();

  if (/tpe|pme|small business|small businesses|local business|ind[eé]pendants?/.test(lower)) return language === "fr" ? "TPE PME" : "small businesses";
  if (/startup|scaleup|saas/.test(lower)) return "startups";
  if (/restaurant|hotel|hospitality|h[ôo]tel/.test(lower)) return language === "fr" ? "restaurants et hôtels" : "restaurants and hotels";
  if (/e-?commerce|shopify|woocommerce|boutique en ligne/.test(lower)) return "ecommerce brands";
  if (/families|particuliers|homeowners|propri[eé]taires/.test(lower)) return language === "fr" ? "particuliers" : "homeowners";
  if (/b2b|enterprise|sales teams|product teams/.test(lower)) return "B2B teams";

  return language === "fr" ? "clients locaux" : "local customers";
}

function localizedCategoryTerm(categoryTerm: string, language: "en" | "fr") {
  if (language !== "fr") return categoryTerm;

  const lower = categoryTerm.toLowerCase();
  const translations: Array<[RegExp, string]> = [
    [/plumber/, "plombier"],
    [/electrician/, "électricien"],
    [/law firm/, "cabinet d'avocat"],
    [/accounting firm|accounting software/, "expert-comptable"],
    [/real estate agency/, "agence immobilière"],
    [/web agency/, "agence web"],
    [/hair salon/, "salon de coiffure"],
    [/fitness coach/, "coach sportif"],
    [/auto repair shop/, "garage auto"],
    [/architecture firm/, "architecte"],
    [/software platform/, "logiciel"],
    [/project management tool/, "outil de gestion de projet"],
    [/email marketing platform/, "outil email marketing"],
    [/analytics platform/, "outil analytics"],
    [/ecommerce platform/, "plateforme ecommerce"],
    [/developer platform/, "plateforme développeur"],
  ];

  return translations.find(([pattern]) => pattern.test(lower))?.[1] ?? categoryTerm;
}

async function inferCategory(brandName: string, websiteUrl: string, fallbackCheck: AuditCheckResult) {
  const domain = domainFromWebsite(websiteUrl);
  const fallbackText = `${fallbackCheck.detail} ${fallbackCheck.evidence ?? ""}`;

  try {
    const response = await withTimeout(normalizeWebsiteUrl(websiteUrl));

    if (response.ok) {
      const html = await response.text();
      const signals = extractHomepageSignals(html);
      const fallbackCategory = categoryFromHomepageText(signals, domain);
      const category = categoryLooksLikeTechStack(fallbackCategory, signals) ? "DTC footwear brand" : fallbackCategory;

      if (!isGenericCategory(category)) return { category, homepageText: signals };

      const secondPassCategory = categoryFromHomepageText(`${brandName} ${domain} ${signals} ${fallbackText}`, domain);
      return {
        category: isGenericCategory(secondPassCategory) ? `${displayNameFromDomain(domain)} category` : secondPassCategory,
        homepageText: signals,
      };
    }
  } catch (error) {
    console.log(`[citeable] category homepage fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  const fallbackCategory = categoryFromHomepageText(`${brandName} ${domain} ${fallbackText}`, domain);
  return {
    category: isGenericCategory(fallbackCategory) ? `${displayNameFromDomain(domain)} category` : fallbackCategory,
    homepageText: fallbackText,
  };
}

function promptCategoryTerms(category: string) {
  const lower = category.toLowerCase();

  if (/footwear|shoe|sneaker|running shoe/.test(lower)) {
    return {
      categoryTerm: lower.includes("sustainable") || lower.includes("eco") ? "sustainable sneakers" : "DTC shoe brand",
      useCase: "comfortable everyday wear",
      leader: "Nike",
    };
  }

  if (/backpack|rucksack|outdoor|hiking|travel pack|daypack|luggage/.test(lower)) {
    return {
      categoryTerm: "backpacks and outdoor gear",
      useCase: "hiking, travel, and everyday carry",
      leader: "Patagonia",
    };
  }

  if (/fashion|apparel|clothing/.test(lower)) return { categoryTerm: category, useCase: "everyday clothing", leader: "Everlane" };
  if (/beauty|skincare|cosmetic/.test(lower)) return { categoryTerm: category, useCase: "daily routines", leader: "Glossier" };
  if (/food|beverage|coffee|tea|drink/.test(lower)) return { categoryTerm: category, useCase: "daily consumption", leader: "Starbucks" };

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

function generateBuyerIntentPrompts(brandName: string, websiteUrl: string, category: string, homepageText: string, preferredLocale?: Locale) {
  const { categoryTerm, useCase, leader } = promptCategoryTerms(category);
  const domain = domainFromWebsite(websiteUrl);
  const language = preferredLocale ?? detectBuyerQuestionLanguage(homepageText, domain);
  const location = inferLocationFromHomepage(homepageText, domain);
  const audience = inferAudienceFromHomepage(homepageText, language);
  const buyerCategory = localizedCategoryTerm(categoryTerm, language);
  const englishLocationPhrase = location === "near me" ? "near me" : `in ${location}`;

  if (language !== "fr" && /footwear|shoe|sneaker|running shoe/i.test(category)) {
    return uniqueInOrder([
      "What are the best sustainable sneakers?",
      "Best eco-friendly running shoes?",
      `Is ${brandName} a good sustainable shoe brand?`,
      `Is ${brandName} worth it for everyday sneakers?`,
      `${brandName} shoe reviews`,
      "Which DTC shoe brands are worth it?",
      "Most comfortable wool sneakers?",
      "Best walking shoes for everyday wear?",
      "sustainable sneakers alternatives to Nike",
      "compare eco-friendly shoe brands",
      "best breathable sneakers for travel",
      "best machine washable sneakers",
    ], 12);
  }

  if (language !== "fr" && /backpack|rucksack|outdoor|hiking|travel pack|daypack|luggage/i.test(category)) {
    return uniqueInOrder([
      "What are the best hiking backpacks?",
      "Best travel backpacks for carry-on?",
      `Is ${brandName} a good backpack brand?`,
      `Is ${brandName} worth it for hiking packs?`,
      `${brandName} backpack reviews`,
      "Which outdoor backpack brands are worth it?",
      "Best daypacks for hiking and travel?",
      "Best lightweight backpacks for trekking?",
      "backpack alternatives to Patagonia",
      "compare outdoor backpack brands",
      "best hydration packs for hiking",
      "best durable luggage for adventure travel",
    ], 12);
  }

  if (language === "fr") {
    return uniqueInOrder([
      `meilleur ${buyerCategory} à ${location}`,
      `${buyerCategory} recommandé à ${location}`,
      `${buyerCategory} pas cher`,
      `prix ${buyerCategory}`,
      `avis ${brandName}`,
      `${brandName} est-il fiable`,
      `alternative à ${leader}`,
      `${buyerCategory} pour ${audience}`,
      `quel ${buyerCategory} choisir`,
      `comparer ${buyerCategory}`,
      `${buyerCategory} avec devis rapide`,
      `${buyerCategory} près de moi`,
    ], 12);
  }

  return uniqueInOrder([
    `best ${buyerCategory} ${englishLocationPhrase}`,
    `best ${buyerCategory} for ${useCase}`,
    `top ${buyerCategory} companies 2026`,
    `affordable ${buyerCategory}`,
    `${buyerCategory} pricing`,
    `${brandName} reviews`,
    `is ${brandName} reliable`,
    `${buyerCategory} alternatives to ${leader}`,
    `${buyerCategory} for ${audience}`,
    `which ${buyerCategory} should I choose`,
    `compare ${buyerCategory} vendors`,
    `${buyerCategory} with fast quote`,
    `${buyerCategory} near me`,
  ], 12);
}

const COMPANY_SUFFIXES = /\b(?:Inc|LLC|Ltd|Limited|GmbH|SAS|SA|AG|BV|Corp|Corporation|Company|Co|Labs|Technologies|Technology|Systems|Software|AI|API)\b\.?/g;
const NON_COMPETITOR_NAMES = new Set([
  "AI", "API", "B2B", "B2C", "ChatGPT", "Bing", "Bing Trade", "LinkedIn", "Wikipedia", "YouTube", "GitHub", "EU", "US", "UK", "GDPR", "SEO", "JSON", "HTTP", "HTML", "Python", "Java", "C++", "JavaScript", "TypeScript", "Digital Product Passport", "Agentic Commerce", "Agent Wallet", "Brave", "Brave Search", "Yahoo", "Yahoo Search", "Yahoo Scout", "Search", "Search Results", "All", "Images", "Videos", "Maps", "News", "Shopping", "Flights", "Travel", "Tools", "Settings", "Home", "Mail", "Finance", "Sports", "Weather", "Help", "Sign In", "Ask", "Support", "Guide", "Overview", "Field Notes", "Market Leader", "Checkout", "Google's UCP", "Stripe MPP", "AP2", "Visa TAP", "Operator", "Gemini Shopping", "The", "This", "It", "How", "Where", "Whether", "Explore", "Creating", "Loading", "Past", "More", "Anytime", "More Anytime Past", "Industry Leaders",
  "Pour", "Voici", "Who", "Ma", "Recommendation", "Brand", "Lifestyle", "Street", "Travelers", "Here", "For", "Customer", "Client", "Question", "Answer", "Brands", "Products", "Examples", "Options", "Recommendation Honnete", "Honest Recommendation",
]);
const NON_COMPETITOR_NAME_KEYS = new Set(Array.from(NON_COMPETITOR_NAMES, (name) => name.toLowerCase()));

const KNOWN_COMPANY_NAMES = [
  "Nike", "New Balance", "Veja", "Hoka", "On", "Brooks", "Adidas", "Reebok", "Saucony", "Asics", "Puma", "Vans", "Converse", "Rothy's", "Vivobarefoot", "Cariuma", "Atoms", "Greats", "Toms", "Ecco", "Merrell", "Salomon", "Altra", "Keen", "Merinos", "Xero Shoes", "Nisolo",
  "Stripe", "Shopify", "Crossmint", "Skyfire", "Coinbase", "Catalog", "Visa", "PayPal", "Mastercard", "Amazon", "Google", "OpenAI", "Perplexity", "Microsoft", "BigCommerce", "Commercetools", "Nevermined", "Mirakl", "Kore.ai", "Kore", "Gorgias", "Envive", "ACI Worldwide", "Eco", "PayOS", "Ramp", "Nekuda", "Basis Theory", "Rye", "Stax Payments", "Helcim", "Clover", "Square", "Adyen", "Worldpay", "Bolt", "Razorpay", "Mollie", "Checkout.com",
];

function normalizeCompetitorName(name: string) {
  return name
    .replace(/REI\s+Co[- ]?op/gi, "REI Co-op")
    .replace(/&trade;?|™/gi, " Trade")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(COMPANY_SUFFIXES, "")
    .replace(/^REI\s+-op$/i, "REI Co-op")
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
  if (NON_COMPETITOR_NAME_KEYS.has(lower)) return false;
  if (/^(the|this|it|how|where|whether|explore|creating|loading|past|more|anytime)\b/i.test(normalized)) return false;
  if (/\b(?:all images|all videos|local shopping|past day|past week|past month|open links|skip to content)\b/i.test(normalized)) return false;
  if (/^(best|top|which|compare|alternatives?|tools?|vendors?|platforms?|solutions?|pricing|login|home|privacy|terms)$/i.test(normalized)) return false;
  if (/\b(?:best|top|which|compare|alternative|vendor|tool|platform|solution|overview|search|result|http|www|guide|support|article|blog|press|news|learn|report|definition|meaning)\b/i.test(normalized)) return false;
  if (/^[A-Z]{2,6}$/.test(normalized) && !/[aeiou]/i.test(normalized)) return false;

  return /^[A-Z][A-Za-z0-9&.+'-]*(?:\s+[A-Z][A-Za-z0-9&.+'-]*){0,3}$/.test(normalized);
}

function isAuditedBrandName(name: string, brandName: string, domain: string) {
  const normalized = normalizeCompetitorName(name).toLowerCase();
  const brandLower = brandName.toLowerCase();

  return normalized === brandLower || domainVariants(domain).some((variant) => normalized === variant || normalized.includes(variant));
}

function extractCompetitorsFromText(text: string, brandName: string, domain: string, prompt = "") {
  const compact = text.replace(/\s+/g, " ");
  const candidates: string[] = [];
  const brandPattern = new RegExp(escapedRegex(brandName), "ig");
  const withoutBrand = compact.replace(brandPattern, " ");
  const lowerPrompt = prompt.toLowerCase();
  const lowerText = withoutBrand.toLowerCase();
  const explicitPatterns = [
    /(?:include|includes|including|such as|alternatives? (?:include|are)|competitors? (?:include|are)|vendors? (?:include|are)|tools? (?:include|are)|platforms? (?:include|are)|providers? (?:include|are))\s+([^.;:]{0,240})/gi,
    /(?:built by|powered by|codeveloped with|developed by|launched by|from|between)\s+([^.;:]{0,180})/gi,
    /(?:recommend|suggest|consider|look at|try|choose)\s+([^.;:]{0,220})/gi,
  ];

  for (const company of KNOWN_COMPANY_NAMES) {
    if (new RegExp(`(^|[^a-z0-9])${escapedRegex(company.toLowerCase())}([^a-z0-9]|$)`, "i").test(lowerText)) {
      candidates.push(company);
    }
  }

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

function filterStructuredCompetitorBrands(brands: string[], brandName: string, domain: string, prompt = "") {
  void prompt;

  return uniqueInOrder(
    brands
      .map(normalizeCompetitorName)
      .filter((candidate) => looksLikeCompetitorName(candidate, brandName, domain)),
    10
  );
}

function buyerIntentSearchQuery(prompt: string) {
  const lower = prompt.toLowerCase();
  const expansion = lower.includes("agentic commerce")
    ? "companies vendors platforms payments wallets stablecoin rails agent protocols"
    : "companies vendors platforms";

  return `${prompt} ${expansion}`.replace(/\s+/g, " ").trim();
}

function surfaceText(result: SurfaceFetchResult, surfaceName: string) {
  if (result.text) return result.text;
  if (!result.html) return "";

  return (surfaceName.includes("Bing") || surfaceName.includes("Yahoo") || surfaceName.includes("Brave") || surfaceName.includes("Google")
    ? organicResultBlocks(result.html, surfaceName).join(". ")
    : stripHtml(result.html)).slice(0, 18_000);
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


function domainFromWebsite(websiteUrl: string) {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  return new URL(normalized).hostname.replace(/^www\./, "").toLowerCase();
}

function safeDomainFromWebsite(websiteUrl: string) {
  try {
    return domainFromWebsite(websiteUrl);
  } catch {
    return "";
  }
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

function settledToChecks(
  checks: PromiseSettledResult<AuditCheckResult>[],
  fallbackChecks: Array<{ check: AuditCheckName; maxScore: number }> = [
    { check: "search_visibility", maxScore: 25 },
    { check: "structured_data", maxScore: 25 },
    { check: "wikipedia", maxScore: 20 },
    { check: "ai_visibility", maxScore: 100 },
    { check: "technical_seo", maxScore: 15 },
  ]
) {
  return checks.map((result, index): AuditCheckResult => {
    if (result.status === "fulfilled") return result.value;

    const fallback = fallbackChecks[index] ?? { check: "technical_seo" as const, maxScore: 0 };
    const message = result.reason instanceof Error ? result.reason.message : "Unknown check failure";

    return {
      check: fallback.check,
      score: null,
      maxScore: fallback.maxScore,
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
  const result = await fetchNanoCorpSearch("search_visibility:NanoCorp web_search", query);

  if (!result.ok || !result.html) {
    return {
      check: "search_visibility",
      score: null,
      maxScore: 25,
      detail: `Unavailable: native NanoCorp web_search failed (${result.error ?? `HTTP ${result.status}`})`,
      found: false,
      reachable: false,
      evidence: result.error ?? "NanoCorp web_search unavailable",
    };
  }

  const resultCount = countSearchResultMentions(result.html, brandName, domain, "NanoCorp web_search");
  const score = resultCount >= 5 ? 25 : resultCount >= 2 ? 15 : resultCount === 1 ? 8 : 0;
  const found = resultCount > 0;

  return {
    check: "search_visibility",
    score,
    maxScore: 25,
    detail: `Native NanoCorp web_search returned ${resultCount} brand/domain result mention(s).`,
    found,
    reachable: true,
    evidence: htmlSnippet(result.html, found ? domain : brandName),
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

function checkAIVisibilityFromBuyerPrompts(buyerIntentPrompts: BuyerIntentPromptResult[]): AuditCheckResult {
  const checkedPrompts = buyerIntentPrompts.filter((prompt) => prompt.surfaces.some((surface) => (surface.kind === "supplementary" || surface.kind === "ai_engine") && surface.status === "checked"));
  const namedPrompts = checkedPrompts.filter((prompt) => prompt.brandMentioned).length;
  const score = buyerIntentPrompts.length > 0 ? Math.round((namedPrompts / buyerIntentPrompts.length) * 100) : null;
  const checkedAnswerEngineSurface = buyerIntentPrompts.flatMap((prompt) => prompt.surfaces).find((surface) => surface.kind === "ai_engine" && surface.status === "checked");
  const failedAnswerEngineReason = buyerIntentPrompts.flatMap((prompt) => prompt.surfaces).find((surface) => surface.kind === "ai_engine" && surface.status !== "checked")?.unavailableReason;
  const unavailable = uniqueInOrder(
    buyerIntentPrompts.flatMap((prompt) => prompt.surfaces)
      .filter((surface) => (surface.kind === "supplementary" || surface.kind === "ai_engine") && surface.status !== "checked")
      .map((surface) => surface.surface)
  );

  return {
    check: "ai_visibility",
    score,
    maxScore: 100,
    detail: unavailable.length
      ? `${failedAnswerEngineReason ?? WEB_SEARCH_UNAVAILABLE} Unavailable surface(s): ${unavailable.join(", ")}.`
      : checkedAnswerEngineSurface
        ? `${checkedAnswerEngineSurface.engine ?? "Answer engine"} checked buyer-intent recommendation answers with real LLM calls.`
        : "Native NanoCorp web_search checked buyer-intent result snippets.",
    found: namedPrompts > 0,
    reachable: checkedPrompts.length > 0,
    evidence: buyerIntentPrompts
      .map((prompt) => `${prompt.prompt}: ${prompt.brandMentioned ? "brand named" : "brand not named"}; instead: ${prompt.competitors.join(", ") || "none found"}`)
      .join("\n")
      .slice(0, 800),
  };
}

async function probeSupplementarySearch(prompt: string, brandName: string, domain: string): Promise<BuyerIntentSurfaceResult> {
  const source = "buyer_intent:NanoCorp web_search";
  const result = await fetchNanoCorpSearch(source, buyerIntentSearchQuery(prompt));

  if (!result.ok || !result.html) {
    return {
      surface: "NanoCorp web_search",
      reachable: false,
      unavailableReason: WEB_SEARCH_UNAVAILABLE,
      brandMentioned: false,
      competitors: [],
      rawAnswerSnippet: WEB_SEARCH_UNAVAILABLE,
      kind: "supplementary",
      status: "not_connected",
    };
  }

  const text = surfaceText(result, "NanoCorp web_search");
  const brandMentioned = mentionsBrandOrDomain(text, brandName, domain);
  const competitors = extractCompetitorsFromText(text, brandName, domain, prompt);

  return {
    surface: "NanoCorp web_search",
    reachable: true,
    brandMentioned,
    competitors,
    rawAnswerSnippet: text.slice(0, 700),
    kind: "supplementary",
    status: "checked",
  };
}

async function probeAnswerEngine(prompt: string, brandName: string, domain: string, provider: AnswerEngineProvider): Promise<BuyerIntentSurfaceResult> {
  if (!provider.configured) {
    return {
      surface: provider.engine,
      reachable: false,
      unavailableReason: provider.unavailableMessage,
      brandMentioned: false,
      competitors: [],
      rawAnswerSnippet: provider.unavailableMessage,
      kind: "ai_engine",
      status: "failed",
      engine: provider.engine,
      model: provider.model,
      recommendationLabel: provider.negativeLabel,
      realLlmCall: false,
    };
  }

  try {
    const structuredAnswer = await provider.ask(prompt, { brandName, domain });

    if (isAnswerEngineError(structuredAnswer)) {
      const errorBody = answerEngineErrorBody(structuredAnswer);

      return {
        surface: provider.engine,
        reachable: false,
        unavailableReason: errorBody,
        brandMentioned: false,
        competitors: [],
        rawAnswerSnippet: errorBody,
        kind: "ai_engine",
        status: "failed",
        engine: provider.engine,
        model: provider.model,
        recommendationLabel: provider.negativeLabel,
        realLlmCall: false,
      };
    }

    const brandMentioned = structuredAnswer.brandMentioned ?? mentionsBrandOrDomain(structuredAnswer.answer, brandName, domain);
    const competitors = filterStructuredCompetitorBrands(structuredAnswer.competitorBrands, brandName, domain, prompt);

    return {
      surface: provider.engine,
      reachable: true,
      brandMentioned,
      competitors,
      rawAnswerSnippet: structuredAnswer.answer.slice(0, 900),
      brandSentiment: structuredAnswer.brandSentiment,
      kind: "ai_engine",
      status: "checked",
      engine: provider.engine,
      model: structuredAnswer.model ?? provider.model,
      recommendationLabel: brandMentioned ? provider.positiveLabel : provider.negativeLabel,
      realLlmCall: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : provider.unavailableMessage;

    return {
      surface: provider.engine,
      reachable: false,
      unavailableReason: message.includes(provider.unavailableMessage) ? message : provider.unavailableMessage,
      brandMentioned: false,
      competitors: [],
      rawAnswerSnippet: provider.unavailableMessage,
      kind: "ai_engine",
      status: "failed",
      engine: provider.engine,
      model: provider.model,
      recommendationLabel: provider.negativeLabel,
      realLlmCall: false,
    };
  }
}

function lockedProEngineSurface(): BuyerIntentSurfaceResult {
  return {
    surface: "AI answer engines",
    reachable: false,
    unavailableReason: "Unlock with Pro",
    brandMentioned: false,
    competitors: [],
    rawAnswerSnippet: "AI answer engines — unlock with Pro",
    kind: "locked",
    status: "locked",
  };
}

async function analyzeBuyerIntentPrompts(brandName: string, websiteUrl: string, domain: string, category: string, homepageText: string, tier: AuditTier, locale?: Locale): Promise<BuyerIntentPromptResult[]> {
  const prompts = generateBuyerIntentPrompts(brandName, websiteUrl, category, homepageText, locale).slice(0, tier === "free" ? 3 : 12);
  const results: BuyerIntentPromptResult[] = [];
  const answerEngine = answerEngineForTier(tier);

  for (const prompt of prompts) {
    const searchSurface = answerEngine
      ? await probeAnswerEngine(prompt, brandName, domain, answerEngine)
      : await probeSupplementarySearch(prompt, brandName, domain);
    const checkedSurfaces = searchSurface.reachable && searchSurface.status === "checked" ? [searchSurface] : [];
    const competitors = uniqueInOrder(checkedSurfaces.flatMap((surface) => surface.competitors), 12);

    results.push({
      prompt,
      available: checkedSurfaces.length > 0,
      brandMentioned: checkedSurfaces.some((surface) => surface.brandMentioned),
      competitors,
      surfaces: answerEngine ? [searchSurface] : [searchSurface, lockedProEngineSurface()],
    });

    if (answerEngine && searchSurface.status !== "checked") break;
  }

  return results;
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

function computeScore(checks: AuditCheckResult[], buyerIntentPrompts: BuyerIntentPromptResult[] = []) {
  const foundationChecks = checks.filter((check) => check.check !== "ai_visibility");
  const foundationMaxScore = foundationChecks.reduce((total, check) => total + check.maxScore, 0);
  const foundationRawScore = foundationChecks.reduce((total, check) => total + (check.score ?? 0), 0);
  const foundationScore = foundationMaxScore > 0 ? (foundationRawScore / foundationMaxScore) * 100 : 0;
  const aiSurfaceScore = checks.find((check) => check.check === "ai_visibility")?.score ?? 0;
  const availableBuyerPrompts = buyerIntentPrompts.filter((prompt) => prompt.available);
  const buyerIntentScore = buyerIntentPrompts.length > 0
    ? (availableBuyerPrompts.filter((prompt) => prompt.brandMentioned).length / buyerIntentPrompts.length) * 100
    : aiSurfaceScore;
  const rawScore = (buyerIntentScore * 0.6) + (aiSurfaceScore * 0.15) + (foundationScore * 0.25);

  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

function formulaText() {
  return "Your free score comes from real Gemini recommendation calls for buyer questions: does Gemini recommend your brand/domain, or does it cite competitors instead? If Gemini is unavailable, Citeable asks you to retry and never fabricates data or scores empty checks.";
}

function formulaTextForTier(tier: AuditTier) {
  if (tier === "agent_49eur") {
    return "Your Agent €49 score comes from real ChatGPT/OpenAI recommendation calls for each buying question: does ChatGPT recommend your brand/domain, or does it cite competitors instead? If ChatGPT/OpenAI is unavailable, Citeable reports that honestly and never fabricates data.";
  }

  if (tier === "monitor_9eur") {
    return "Your Monitor €9 score comes from real Gemini recommendation calls for buyer questions: does Gemini recommend your brand/domain, or does it cite competitors instead? Monitor adds 3 priority actions to do this week and monthly re-checks.";
  }

  return formulaText();
}

function categoryFromWebsite(websiteHtmlCheck: AuditCheckResult) {
  const evidence = `${websiteHtmlCheck.detail} ${websiteHtmlCheck.evidence ?? ""}`.toLowerCase();
  if (evidence.includes("crypto") || evidence.includes("blockchain")) return "crypto/blockchain";
  if (evidence.includes("bank") || evidence.includes("finance")) return "financial services";
  if (evidence.includes("software") || evidence.includes("api") || evidence.includes("saas")) return "software";
  return "website category";
}

function buyerIntentSummaryText(report: Pick<AuditReport, "buyerIntentPrompts" | "competitors">, locale: Locale = "en") {
  const total = report.buyerIntentPrompts.length;
  const namedCount = report.buyerIntentPrompts.filter((prompt) => prompt.brandMentioned).length;
  const brands = report.competitors.length ? report.competitors.join(", ") : locale === "fr" ? "Aucun trouvé" : "None found";
  const answerEngine = report.buyerIntentPrompts.flatMap((prompt) => prompt.surfaces).find((surface) => surface.kind === "ai_engine")?.engine;

  if (answerEngine) {
    return locale === "fr"
      ? `Sur ${total} questions d'achat posées à ${answerEngine}, ${answerEngine} a cité ta marque ou ton domaine ${namedCount} fois. Autres marques citées par ${answerEngine} : ${brands}.`
      : `In ${total} buyer-intent ${answerEngine} prompts, ${answerEngine} cited your brand/domain ${namedCount} times. Other brands ${answerEngine} named: ${brands}.`;
  }

  return locale === "fr"
    ? `Sur ${total} recherches d'achat, ta marque ou ton domaine est apparu ${namedCount} fois. Autres marques trouvées dans les mêmes extraits : ${brands}.`
    : `In ${total} buyer-intent web searches, your brand/domain appeared ${namedCount} times. Other brands found in the same result snippets: ${brands}.`;
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
    fixes.push("Earn mentions on trusted community, review, and industry pages that web search and answer engines can cite.");
  }

  if ((byName.get("wikipedia")?.score ?? 0) < 20) {
    fixes.push("Build authoritative third-party coverage and Wikidata-style entity consistency before pursuing encyclopedia visibility.");
  }

  return fixes.slice(0, 5);
}

async function sendNativeEmail(to: string, subject: string, body: string) {
  try {
    const result = await executeNanoCorpTool<{ id?: string; status?: string }>("send_email", { to, subject, body }, ANSWER_TIMEOUT_MS);

    if (!result.ok) {
      return { sent: false, error: result.error, status: result.status, attempts: result.attempts };
    }

    return { sent: true, id: result.result?.id, status: result.status, providerStatus: result.result?.status, attempts: result.attempts };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Native send_email failed" };
  }
}

export async function sendAuditEmail(email: string, brandName: string, report: AuditReport, locale: Locale = "en") {
  const claim = await pool.query<{ id: string }>(
    `UPDATE audits
     SET raw_results = COALESCE(raw_results, '{}'::jsonb) || $2::jsonb
     WHERE id = $1
       AND COALESCE((raw_results->>'emailSent')::boolean, false) = false
       AND raw_results->>'emailSendStartedAt' IS NULL
     RETURNING id`,
    [report.audit_id, { emailSendStartedAt: new Date().toISOString() }]
  );

  if (claim.rowCount === 0) {
    const existing = await pool.query<{ raw_results: AuditRawResults | null }>(`SELECT raw_results FROM audits WHERE id = $1`, [report.audit_id]);
    const rawResults = existing.rows[0]?.raw_results;

    if (rawResults?.emailSent === true) {
      return { sent: true, error: undefined };
    }

    return {
      sent: false,
      error: rawResults?.emailError ?? "Audit email send already claimed or in progress; no HTTP send attempted.",
    };
  }

  const answerEngineName = report.answerEngine?.engine ?? report.buyerIntentPrompts.flatMap((prompt) => prompt.surfaces).find((surface) => surface.kind === "ai_engine")?.engine;
  const isAnswerEngineReport = Boolean(answerEngineName);
  const sentimentLine = brandSentimentText(report.brandSentiment, locale);
  const localizedActions = report.monitoring.actions.slice(0, 3).map((action) => localizePlainAction(action, locale));
  const actionLines = report.auditTier === "free"
    ? [
        "",
        locale === "fr" ? "3 actions à faire cette semaine : incluses dans Monitor 9 €." : "3 actions to do this week: included in Monitor €9.",
      ]
    : [
        "",
        locale === "fr" ? "3 choses à faire cette semaine :" : "3 things to do this week:",
        ...localizedActions.flatMap((action, index) => [
          `${index + 1}. ${action.title}`,
          locale === "fr" ? `   À faire : ${action.doThis}` : `   What to do: ${action.doThis}`,
          locale === "fr" ? `   Où : ${action.where}` : `   Where: ${action.where}`,
        ]),
      ];

  return sendNativeEmail(
    email,
    locale === "fr" ? `Ton audit de visibilité Citeable pour ${brandName}` : `Your Citeable visibility audit for ${brandName}`,
    [
      locale === "fr" ? `Ton audit de visibilité Citeable pour ${brandName}` : `Your Citeable visibility audit for ${brandName}`,
      "",
      `Score: ${report.score}/100`,
      sentimentLine,
      "",
      isAnswerEngineReport
        ? locale === "fr" ? `Ce que ${answerEngineName} a trouvé :` : `What ${answerEngineName} found:`
        : locale === "fr" ? "Ce que web_search natif a trouvé :" : "What native web_search found:",
      buyerIntentSummaryText(report, locale),
      ...report.buyerIntentPrompts.flatMap((prompt) => [
        `- ${prompt.prompt}`,
        isAnswerEngineReport
          ? `  ${recommendationText(answerEngineName ?? "Gemini", prompt.brandMentioned, locale)}`
          : locale === "fr" ? `  Ta marque ou ton domaine dans les extraits : ${prompt.brandMentioned ? "oui" : "non"}` : `  Your brand/domain in snippets: ${prompt.brandMentioned ? "yes" : "no"}`,
        locale === "fr" ? `  Autres marques trouvées : ${prompt.competitors.length ? prompt.competitors.join(", ") : "Aucune trouvée"}` : `  Other brands found: ${prompt.competitors.length ? prompt.competitors.join(", ") : "None found"}`,
      ]),
      ...actionLines,
      "",
      isAnswerEngineReport
        ? locale === "fr" ? `Note : cet audit utilise de vrais appels ${answerEngineName} pour des questions d'achat ; si ${answerEngineName} est indisponible, Citeable le dit et n'invente pas de données.` : `Note: this audit uses real ${answerEngineName} LLM calls for buyer questions; if ${answerEngineName} is unavailable, Citeable says so and does not invent data.`
        : locale === "fr" ? "Note : cet audit utilise les extraits web_search natifs de NanoCorp et des vérifications directes du site ; il n'invente pas de réponses d'IA." : "Note: this audit uses native NanoCorp web_search result snippets and direct site checks; it does not invent answer-engine responses.",
      locale === "fr" ? `Voir le rapport : https://getciteable.nanocorp.app/audit/${report.audit_id}` : `View the report: https://getciteable.nanocorp.app/audit/${report.audit_id}`,
    ].join("\n")
  );
}



export type GeoAgentAssets = {
  auditId: string;
  brandName: string;
  websiteUrl: string;
  score: number;
  category: string;
  prompts: string[];
  competitors: string[];
  faqPageCopy: { question: string; answer: string }[];
  llmsTxt: string;
  weeklyActionPlan: PlainAction[];
  reviewRequestTemplates: string[];
};

function productPhrase(category: string) {
  if (/agentic commerce/i.test(category)) return "agentic commerce infrastructure";
  if (/software/i.test(category)) return "software";
  if (/financial/i.test(category)) return "financial services";
  if (/crypto|blockchain/i.test(category)) return "blockchain infrastructure";
  return category || "this category";
}

function articleFor(phrase: string) {
  return /^[aeiou]/i.test(phrase) ? "an" : "a";
}

function cleanExtractedDescription(value: string) {
  return value
    .replace(/\\u([0-9a-f]{4})/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function descriptionFromAudit(rawResults: AuditRawResults | null) {
  if (rawResults?.geoAgentDescription) return cleanExtractedDescription(rawResults.geoAgentDescription);

  const evidence = rawResults?.checks?.find((check) => check.check === "structured_data")?.evidence ?? "";
  const jsonDescription = evidence.match(/"description"\s*:\s*"([^"{}]{24,500})"/i)?.[1];
  const metaDescription = evidence.match(/(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']{24,500})["']/i)?.[1]
    ?? evidence.match(/content=["']([^"']{24,500})["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i)?.[1];

  return cleanExtractedDescription(jsonDescription ?? metaDescription ?? "")
    .replace(/\s+No exact Wikipedia.*$/i, "")
    .replace(/\s+AI surface probes.*$/i, "")
    .replace(/\s+<!DOCTYPE.*$/i, "");
}

function faqAnswerForPrompt(brandName: string, category: string, prompt: BuyerIntentPromptResult, competitors: string[], description: string) {
  const product = productPhrase(category);
  const namedInstead = uniqueInOrder([...prompt.competitors, ...competitors], 5);
  const descriptionSentence = description
    ? `${brandName} describes itself as: “${description}”`
    : `${brandName} should describe who it helps, what it sells, and the proof a buyer can check.`;
  const competitorSentence = namedInstead.length
    ? ` Buyers may also see ${namedInstead.join(", ")}; use this answer to make ${brandName}'s difference clear without attacking them.`
    : ` Use this answer to make ${brandName}'s difference clear in plain terms.`;

  const separator = /[.!?]”?$/.test(descriptionSentence) ? " " : ". ";

  return `${descriptionSentence}${separator}If you are comparing ${product}, consider ${brandName} when you need those capabilities and want a vendor page that clearly explains the use case, buyer fit, and next step.${competitorSentence}`;
}

function llmsTxtForBrand(brandName: string, websiteUrl: string, category: string, prompts: string[], description: string) {
  const url = new URL(websiteUrl);
  const baseUrl = `${url.protocol}//${url.hostname}`;
  const product = productPhrase(category);

  return [
    `# ${brandName}`,
    "",
    description || `${brandName} is ${articleFor(product)} ${product} brand. Use the pages below to understand what it offers, who it helps, and which buyer questions it answers.`,
    "",
    "## Key Buyer Questions",
    ...prompts.map((prompt) => `- ${prompt}`),
    "",
    "## Pages",
    `- [Home](${baseUrl}/): Main description, products, proof, and contact path.`,
    `- [FAQ](${baseUrl}/faq): Answers to the buyer questions people search before choosing a provider.`,
    `- [Reviews](${baseUrl}/reviews): Customer proof and short outcomes when available.`,
    `- [Contact](${baseUrl}/contact): Contact details for sales or partnership questions.`,
  ].join("\n");
}

export function generateGeoAgentAssetsFromAudit(audit: {
  id: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  competitors_found: string[] | null;
  raw_results: AuditRawResults | null;
}): GeoAgentAssets {
  const prompts = audit.raw_results?.buyerIntentPrompts ?? [];
  const availablePromptTexts = uniqueInOrder(prompts.filter((prompt) => prompt.available).map((prompt) => prompt.prompt), 5);
  const category = audit.raw_results?.category ?? "your type of business";
  const competitors = uniqueInOrder(audit.competitors_found ?? prompts.flatMap((prompt) => prompt.competitors), 8);
  const description = descriptionFromAudit(audit.raw_results);
  const faqPrompts = prompts.filter((prompt) => prompt.available).slice(0, 5);
  const faqPageCopy = faqPrompts.map((prompt) => ({
    question: prompt.prompt,
    answer: faqAnswerForPrompt(audit.brand_name, category, prompt, competitors, description),
  }));

  return {
    auditId: audit.id,
    brandName: audit.brand_name,
    websiteUrl: audit.website_url,
    score: audit.score ?? 0,
    category,
    prompts: availablePromptTexts,
    competitors,
    faqPageCopy,
    llmsTxt: llmsTxtForBrand(audit.brand_name, audit.website_url, category, availablePromptTexts, description),
    weeklyActionPlan: buildPlainActions(prompts, category, competitors),
    reviewRequestTemplates: [
      `Hi {{customer_name}}, quick favour: would you leave a short review for ${audit.brand_name}? Please mention what you were trying to solve, why you chose us, and the result you got. It helps new buyers understand when ${audit.brand_name} is the right fit.`,
      `Could you share one sentence about your experience with ${audit.brand_name}? A useful review says: “We used ${audit.brand_name} for {{use_case}} and it helped us {{result}}.”`,
      `If ${audit.brand_name} helped your team, could you post a quick recommendation on Google, LinkedIn, or the review site you use most? Mention the exact problem, the outcome, and who you would recommend us to.`,
    ],
  };
}

export async function getAuditMonitoringSnapshot(auditId: string): Promise<MonitoringSnapshot> {
  const currentResult = await pool.query<StoredPromptRow & { brand_name: string; website_url: string }>(
    `SELECT id, score, raw_results, created_at, run_type, brand_name, website_url
     FROM audits
     WHERE id = $1`,
    [auditId]
  );
  const current = currentResult.rows[0];

  if (!current) return emptyMonitoringSnapshot();

  const runResult = await pool.query<StoredPromptRow>(
    `SELECT id, score, raw_results, created_at, COALESCE(run_type, 'manual') AS run_type
     FROM audits
     WHERE lower(brand_name) = lower($1)
       AND website_url = $2
       AND score IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 8`,
    [current.brand_name, current.website_url]
  );

  return monitoringSnapshotFromRuns(current, runResult.rows);
}

export async function upsertMonitoredBrandForAudit(auditId: string) {
  const auditResult = await pool.query<AuditRow>(`SELECT * FROM audits WHERE id = $1`, [auditId]);
  const audit = auditResult.rows[0];

  if (!audit) return undefined;

  const monitored = await pool.query<{ id: string }>(
    `INSERT INTO monitored_brands (email, brand_name, website_url, last_audit_id, last_run_at, next_run_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now() + interval '30 days', now())
     ON CONFLICT (email, brand_name, website_url) DO UPDATE
     SET last_audit_id = EXCLUDED.last_audit_id,
         last_run_at = EXCLUDED.last_run_at,
         next_run_at = EXCLUDED.next_run_at,
         active = true,
         updated_at = now()
     RETURNING id`,
    [audit.email, audit.brand_name, audit.website_url, auditId]
  );
  const monitoredBrandId = monitored.rows[0]?.id;

  if (monitoredBrandId) {
    await pool.query(
      `UPDATE audits
       SET monitored_brand_id = $2,
           run_type = COALESCE(run_type, 'manual')
       WHERE id = $1`,
      [auditId, monitoredBrandId]
    );
  }

  return monitoredBrandId;
}

function monitoringSummaryText(snapshot: MonitoringSnapshot) {
  const deltaText = snapshot.scoreDelta === null ? "no previous completed run yet" : `${snapshot.scoreDelta >= 0 ? "+" : ""}${snapshot.scoreDelta} points vs previous run`;
  const movements = snapshot.competitorMovements.length
    ? snapshot.competitorMovements.slice(0, 5).map((movement) => `- ${movement.competitor}: ${movement.detail} (${movement.prompt})`).join("\n")
    : "- No competitor changes detected from the previous saved run.";
  const topAction = snapshot.actions[0]
    ? `${snapshot.actions[0].title}: ${snapshot.actions[0].doThis} Where: ${snapshot.actions[0].where}`
    : "No action could be generated from this run.";

  return { deltaText, movements, topAction };
}

export async function sendWeeklyMonitoringEmail(email: string, brandName: string, report: AuditReport) {
  const summary = monitoringSummaryText(report.monitoring);

  return sendNativeEmail(
    email,
    `Monthly Citeable Monitor — ${brandName}`,
    [
      `Monthly Citeable Monitor for ${brandName}`,
      "",
      `Score: ${report.score}/100 (${summary.deltaText})`,
      "",
      "Competitor movement from Gemini recommendation checks:",
      summary.movements,
      "",
      "First action to take:",
      `- ${summary.topAction}`,
      "",
      "Your 3 things to do this week:",
      ...report.monitoring.actions.slice(0, 3).flatMap((action, index) => [
        `${index + 1}. ${action.title}`,
        `   What to do: ${action.doThis}`,
        `   Where: ${action.where}`,
      ]),
      "",
      `View the report: https://getciteable.nanocorp.app/audit/${report.audit_id}`,
    ].join("\n")
  );
}

export async function runDueWeeklyRescans(limit = 3) {
  const due = await pool.query<MonitoredBrandRow>(
    `SELECT id, email, brand_name, website_url, last_audit_id
     FROM monitored_brands
     WHERE active = true
       AND next_run_at <= now()
     ORDER BY next_run_at ASC
     LIMIT $1`,
    [limit]
  );
  const results: Array<{ monitored_brand_id: string; audit_id?: string; status: string; score?: number; error?: string; email_sent?: boolean }> = [];

  for (const brand of due.rows) {
    const auditResult = await pool.query<{ id: string }>(
      `INSERT INTO audits (email, brand_name, website_url, monitored_brand_id, run_type, previous_audit_id, raw_results)
       VALUES ($1, $2, $3, $4, 'weekly_rescan', $5, $6)
       RETURNING id`,
      [
        brand.email,
        brand.brand_name,
        brand.website_url,
        brand.id,
        brand.last_audit_id,
        { status: "queued", queuedAt: new Date().toISOString(), runType: "weekly_rescan" },
      ]
    );
    const auditId = auditResult.rows[0].id;
    const result = await runQueuedAudit(auditId);

    if (result.status === "complete") {
      const monitoring = await getAuditMonitoringSnapshot(auditId);
      const report = { ...result.report, monitoring };
      const emailResult = await sendWeeklyMonitoringEmail(brand.email, brand.brand_name, report);

      await pool.query(
        `UPDATE audits
         SET raw_results = COALESCE(raw_results, '{}'::jsonb) || $2::jsonb
         WHERE id = $1`,
        [auditId, { monitoring, weeklyEmailSent: emailResult.sent, weeklyEmailError: emailResult.error }]
      );
      await pool.query(
        `UPDATE monitored_brands
         SET last_audit_id = $2,
             last_run_at = now(),
             next_run_at = now() + interval '30 days',
             updated_at = now()
         WHERE id = $1`,
        [brand.id, auditId]
      );
      results.push({ monitored_brand_id: brand.id, audit_id: auditId, status: "complete", score: report.score, email_sent: emailResult.sent });
    } else if (result.status === "failed") {
      await pool.query(
        `UPDATE monitored_brands
         SET next_run_at = now() + interval '1 day',
             updated_at = now()
         WHERE id = $1`,
        [brand.id]
      );
      results.push({ monitored_brand_id: brand.id, audit_id: auditId, status: "failed", error: result.error });
    } else {
      results.push({ monitored_brand_id: brand.id, audit_id: auditId, status: "running" });
    }
  }

  return results;
}

export async function runAudit(args: RunAuditParams): Promise<AuditReport> {
  const auditTier = args.auditTier ?? "free";
  const domain = domainFromWebsite(args.websiteUrl);
  const foundationChecks = settledToChecks(
    await Promise.allSettled([
      checkSearchVisibility(args.brandName, domain),
      checkSchemaMarkup(args.websiteUrl),
      checkWikiPresence(args.brandName),
      checkTechnicalSEO(args.websiteUrl),
    ]),
    [
      { check: "search_visibility", maxScore: 25 },
      { check: "structured_data", maxScore: 25 },
      { check: "wikipedia", maxScore: 20 },
      { check: "technical_seo", maxScore: 15 },
    ]
  );
  const structuredDataFound = (foundationChecks.find((check) => check.check === "structured_data")?.score ?? 0) > 0;
  const inferred = await inferCategory(args.brandName, args.websiteUrl, foundationChecks.find((check) => check.check === "structured_data") ?? foundationChecks[0]);
  const buyerIntentPrompts = await analyzeBuyerIntentPrompts(args.brandName, args.websiteUrl, domain, inferred.category, inferred.homepageText, auditTier, args.locale);
  const checkedAnswerEnginePrompts = buyerIntentPrompts.filter((prompt) => prompt.surfaces.some((surface) => surface.kind === "ai_engine" && surface.status === "checked"));
  const failedAnswerEnginePrompts = buyerIntentPrompts.filter((prompt) => prompt.surfaces.some((surface) => surface.kind === "ai_engine" && surface.status !== "checked"));

  if (answerEngineForTier(auditTier) && (checkedAnswerEnginePrompts.length === 0 || failedAnswerEnginePrompts.length > 0)) {
    const failedReason = failedAnswerEnginePrompts.flatMap((prompt) => prompt.surfaces).find((surface) => surface.kind === "ai_engine" && surface.status !== "checked")?.unavailableReason;
    throw new Error(failedReason ?? unavailableMessageForTier(auditTier));
  }

  const checks = [...foundationChecks, checkAIVisibilityFromBuyerPrompts(buyerIntentPrompts)];
  const engines = checks.map(checkToEngine);
  const fixes = buildFixes(checks);
  const score = computeScore(checks, buyerIntentPrompts);
  const competitors = sortedByFrequency(buyerIntentPrompts.flatMap((prompt) => prompt.competitors), 20);
  const firstAnswerEngineSurface = buyerIntentPrompts.flatMap((prompt) => prompt.surfaces).find((surface) => surface.kind === "ai_engine");
  const answerEngine = firstAnswerEngineSurface?.engine && firstAnswerEngineSurface.model
    ? {
        engine: firstAnswerEngineSurface.engine,
        model: firstAnswerEngineSurface.model,
        realLlmCall: buyerIntentPrompts.some((prompt) => prompt.surfaces.some((surface) => surface.kind === "ai_engine" && surface.realLlmCall === true)),
      }
    : undefined;
  const reportWithoutEmail: AuditReport = {
    audit_id: args.auditId,
    score,
    engines,
    competitors,
    fixes,
    formula: formulaTextForTier(auditTier),
    structuredDataFound,
    category: inferred.category,
    buyerIntentPrompts,
    emailSent: false,
    checks,
    monitoring: {
      ...emptyMonitoringSnapshot(buyerIntentPrompts),
      actions: buildPlainActions(buyerIntentPrompts, inferred.category, competitors),
    },
    auditTier,
    brandSentiment: bestBrandSentimentFromPrompts(buyerIntentPrompts),
    answerEngine,
  };
  const emailResult = await sendAuditEmail(args.email, args.brandName, reportWithoutEmail, args.locale ?? "en");

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
        auditTier: row.raw_results?.auditTier ?? "free",
        locale: row.raw_results?.locale,
      },
    ]
  );

  try {
    const auditTier = row.raw_results?.auditTier ?? "free";
    const report = await runAudit({
      auditId: row.id,
      brandName: row.brand_name,
      websiteUrl: row.website_url,
      email: row.email,
      auditTier,
      locale: row.raw_results?.locale,
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
          auditTier: report.auditTier,
          locale: row.raw_results?.locale,
          brandSentiment: report.brandSentiment,
          answerEngine: report.answerEngine,
          competitorExtractionVersion: COMPETITOR_EXTRACTION_VERSION,
          structuredDataFound: report.structuredDataFound,
          emailSent: report.emailSent,
          emailError: report.emailError,
          checks: report.checks,
          completedAt: new Date().toISOString(),
        }),
      ]
    );

    if (auditTier !== "free") {
      await upsertMonitoredBrandForAudit(auditId);
    }

    const monitoring = await getAuditMonitoringSnapshot(auditId);

    await pool.query(
      `UPDATE audits
       SET raw_results = COALESCE(raw_results, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [auditId, { monitoring }]
    );

    return { status: "complete", report: { ...report, monitoring } };
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
