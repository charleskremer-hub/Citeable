/**
 * Adaptateur de recherche web indépendant de NanoCorp.
 *
 * Le fournisseur est choisi par variable d'environnement. Si aucune clé n'est
 * fournie, `runWebSearch` renvoie `ok: false` avec `notConfigured: true` — l'appelant
 * doit alors se dégrader proprement (ne pas planter, ne pas inventer de résultats).
 *
 * Variables reconnues :
 *   WEB_SEARCH_PROVIDER  (optionnel) force "brave" | "serper" | "tavily"
 *   BRAVE_SEARCH_API_KEY
 *   SERPER_API_KEY
 *   TAVILY_API_KEY
 */

export type WebSearchProviderName = "brave" | "serper" | "tavily";

export type WebSearchResult = {
  title?: string;
  url?: string;
  snippet?: string;
};

export type WebSearchSuccess = {
  ok: true;
  provider: WebSearchProviderName;
  status: number;
  results: WebSearchResult[];
};

export type WebSearchFailure = {
  ok: false;
  provider: WebSearchProviderName | null;
  status?: number;
  error: string;
  /** true quand aucune clé n'est configurée : ce n'est pas une panne, c'est une absence de config. */
  notConfigured?: boolean;
};

export type WebSearchResponse = WebSearchSuccess | WebSearchFailure;

export type WebSearchOptions = {
  maxResults?: number;
  timeoutMs?: number;
  /** Injectable pour les tests. */
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
};

const DEFAULT_MAX_RESULTS = 8;
const DEFAULT_TIMEOUT_MS = 18_000;

function readEnv(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function providerKey(provider: WebSearchProviderName, env: Record<string, string | undefined>) {
  if (provider === "brave") return readEnv(env, "BRAVE_SEARCH_API_KEY");
  if (provider === "serper") return readEnv(env, "SERPER_API_KEY");
  return readEnv(env, "TAVILY_API_KEY");
}

/**
 * Fournisseur retenu, ou null si aucune clé n'est configurée.
 * Un `WEB_SEARCH_PROVIDER` explicite n'est honoré que si sa clé existe :
 * sinon on retombe sur l'ordre de préférence, plutôt que d'échouer en silence.
 */
export function webSearchProvider(env: Record<string, string | undefined> = process.env): WebSearchProviderName | null {
  const order: WebSearchProviderName[] = ["brave", "serper", "tavily"];
  const forced = readEnv(env, "WEB_SEARCH_PROVIDER")?.toLowerCase();

  if (forced === "brave" || forced === "serper" || forced === "tavily") {
    if (providerKey(forced, env)) return forced;
  }

  return order.find((candidate) => providerKey(candidate, env)) ?? null;
}

export function isWebSearchConfigured(env: Record<string, string | undefined> = process.env) {
  return webSearchProvider(env) !== null;
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseBrave(payload: unknown, maxResults: number): WebSearchResult[] {
  const web = (payload as { web?: { results?: unknown } } | null)?.web;
  const rows = Array.isArray(web?.results) ? web.results : [];

  return rows.slice(0, maxResults).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      title: asText(item.title),
      url: asText(item.url),
      snippet: asText(item.description) ?? asText(item.snippet),
    };
  });
}

function parseSerper(payload: unknown, maxResults: number): WebSearchResult[] {
  const rows = Array.isArray((payload as { organic?: unknown } | null)?.organic)
    ? ((payload as { organic: unknown[] }).organic)
    : [];

  return rows.slice(0, maxResults).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      title: asText(item.title),
      url: asText(item.link) ?? asText(item.url),
      snippet: asText(item.snippet),
    };
  });
}

function parseTavily(payload: unknown, maxResults: number): WebSearchResult[] {
  const rows = Array.isArray((payload as { results?: unknown } | null)?.results)
    ? ((payload as { results: unknown[] }).results)
    : [];

  return rows.slice(0, maxResults).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      title: asText(item.title),
      url: asText(item.url),
      snippet: asText(item.content) ?? asText(item.snippet),
    };
  });
}

export function parseWebSearchPayload(
  provider: WebSearchProviderName,
  payload: unknown,
  maxResults = DEFAULT_MAX_RESULTS
): WebSearchResult[] {
  const parsed =
    provider === "brave"
      ? parseBrave(payload, maxResults)
      : provider === "serper"
        ? parseSerper(payload, maxResults)
        : parseTavily(payload, maxResults);

  // Une ligne sans titre NI extrait n'apporte rien au moteur d'audit.
  return parsed.filter((result) => result.title || result.snippet);
}

type ProviderRequest = {
  url: string;
  init: RequestInit;
};

function buildRequest(
  provider: WebSearchProviderName,
  apiKey: string,
  query: string,
  maxResults: number
): ProviderRequest {
  if (provider === "brave") {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(Math.min(maxResults, 20)));

    return {
      url: url.toString(),
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          // Brave valide STRICTEMENT cet en-tête et rejette la requête en HTTP 422
          // s'il est absent : en environnement serverless (Vercel), un proxy insère
          // alors une directive comme `max-stale=0` que l'API refuse. C'était la
          // cause du `search_visibility` mort en prod (pilier 25/100 injoignable).
          // Réf. openclaw#2476.
          "Cache-Control": "no-cache",
          "X-Subscription-Token": apiKey,
        },
      },
    };
  }

  if (provider === "serper") {
    return {
      url: "https://google.serper.dev/search",
      init: {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: maxResults }),
      },
    };
  }

  return {
    url: "https://api.tavily.com/search",
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, max_results: maxResults, search_depth: "basic" }),
    },
  };
}

// Brave n'emballe pas son erreur comme Serper/Tavily : au lieu d'un `detail`/`message`
// plat, il renvoie `{"type":"ErrorResponse","error":{"detail":"…","meta":{"errors":[
// {"loc":["query","q"],"msg":"…"}]}}}`. L'ancienne version faisait `String(objet)` et
// affichait `[object Object]` — on ne voyait donc jamais QUEL paramètre Brave refusait.
// Cette version descend dans la structure imbriquée et cite le champ fautif.
function stringifyValidationErrors(errors: unknown): string | undefined {
  if (!Array.isArray(errors)) return undefined;
  const parts = errors
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      const where = Array.isArray(item.loc) ? item.loc.join(".") : undefined;
      const msg = typeof item.msg === "string" ? item.msg : undefined;
      return where && msg ? `${where}: ${msg}` : msg ?? where;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length ? parts.join("; ") : undefined;
}

function errorMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    // Candidat plat (Serper/Tavily) ou objet d'erreur imbriqué (Brave).
    const candidate = parsed.detail ?? parsed.message ?? parsed.error;

    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();

    if (candidate && typeof candidate === "object") {
      const nested = candidate as Record<string, unknown>;
      const meta = nested.meta as { errors?: unknown } | undefined;
      const detailed = stringifyValidationErrors(meta?.errors);
      const detail = typeof nested.detail === "string" ? nested.detail.trim() : undefined;
      const code = typeof nested.code === "string" ? nested.code.trim() : undefined;

      const message = [detail || code, detailed].filter(Boolean).join(" — ");
      if (message) return message;
    }

    if (candidate !== undefined && typeof candidate !== "object") return String(candidate);
  } catch {
    // corps non-JSON : on renvoie le texte brut tronqué
  }

  return body.slice(0, 300) || "empty response";
}

export async function runWebSearch(query: string, options: WebSearchOptions = {}): Promise<WebSearchResponse> {
  const env = options.env ?? process.env;
  const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const provider = webSearchProvider(env);

  if (!provider) {
    return {
      ok: false,
      provider: null,
      notConfigured: true,
      error: "No web search provider configured (set BRAVE_SEARCH_API_KEY, SERPER_API_KEY or TAVILY_API_KEY)",
    };
  }

  const apiKey = providerKey(provider, env);

  if (!apiKey) {
    return { ok: false, provider, notConfigured: true, error: `Missing API key for web search provider ${provider}` };
  }

  const { url, init } = buildRequest(provider, apiKey, query, maxResults);

  try {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.text();

    if (!response.ok) {
      return { ok: false, provider, status: response.status, error: `${provider} HTTP ${response.status}: ${errorMessage(body)}` };
    }

    let payload: unknown;

    try {
      payload = JSON.parse(body);
    } catch {
      return { ok: false, provider, status: response.status, error: `${provider} returned a non-JSON response` };
    }

    return { ok: true, provider, status: response.status, results: parseWebSearchPayload(provider, payload, maxResults) };
  } catch (error) {
    const message = error instanceof Error ? error.message : `Unknown ${provider} error`;
    return { ok: false, provider, error: `${provider}: ${message}` };
  }
}
