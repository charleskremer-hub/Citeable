import type { BrandSentiment, BuyerIntentPromptResult, PlainAction } from "./audit-engine";
import { brandSentimentText, localizePlainAction, type Locale } from "./i18n";

const CHAT_TIMEOUT_MS = 20_000;
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
const DEFAULT_OPENAI_MODEL = ["gpt", "4o", "mini"].join("-");

type AuditAgentChatAudit = {
  id: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  competitors_found: string[] | null;
  raw_results: {
    category?: string;
    answerEngine?: { engine?: string; model?: string; realLlmCall?: boolean };
    brandSentiment?: BrandSentiment;
    buyerIntentPrompts?: BuyerIntentPromptResult[];
    monitoring?: { actions?: PlainAction[] };
  } | null;
};

export type AuditAgentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type EngineChatResult = {
  engine: "ChatGPT" | "Gemini";
  model: string;
  ok: boolean;
  answer?: string;
  error?: string;
};

export type AuditAgentChatResponse = {
  answer: string;
  sources: string[];
  engines: EngineChatResult[];
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

type OpenAIChatCompletionResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

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

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function currentGeminiModel() {
  const configured = (process.env.GEMINI_MODEL ?? process.env.GOOGLE_GEMINI_MODEL)?.trim();
  if (configured && !/^gemini-(?:1\.5|2\.0)(?:-|$)/i.test(configured)) return configured;
  return DEFAULT_GEMINI_MODEL;
}

function currentOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
}

function geminiApiKey() {
  return process.env.GEMINI_API_KEY ?? process.env.NANO_USER_GEMINI_API_KEY ?? "";
}

function openAIApiKey() {
  return process.env.OPENAI_API_KEY ?? process.env.NANO_USER_CHATGPT_API_KEY ?? "";
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

function promptEvidence(prompt: BuyerIntentPromptResult, index: number, locale: Locale) {
  const aiSurface = prompt.surfaces.find((surface) => surface.kind === "ai_engine") ?? prompt.surfaces[0];

  return {
    id: `Q${index + 1}`,
    question: prompt.prompt,
    brandMentioned: prompt.brandMentioned,
    competitors: uniqueInOrder(prompt.competitors, 8),
    engine: aiSurface?.engine ?? aiSurface?.surface ?? "audit",
    status: aiSurface?.status ?? (prompt.available ? "checked" : "unavailable"),
    answerSnippet: aiSurface?.rawAnswerSnippet?.slice(0, 500) || undefined,
    label: locale === "fr"
      ? `${prompt.brandMentioned ? "marque citée" : "marque non citée"}${prompt.competitors.length ? ` ; concurrents : ${prompt.competitors.join(", ")}` : ""}`
      : `${prompt.brandMentioned ? "brand cited" : "brand not cited"}${prompt.competitors.length ? `; competitors: ${prompt.competitors.join(", ")}` : ""}`,
  };
}

function auditContext(audit: AuditAgentChatAudit, locale: Locale) {
  const prompts = audit.raw_results?.buyerIntentPrompts ?? [];
  const competitors = uniqueInOrder([...(audit.competitors_found ?? []), ...prompts.flatMap((prompt) => prompt.competitors)], 12);
  const promptEvidenceItems = prompts.map((prompt, index) => promptEvidence(prompt, index, locale));
  const priorityGaps = promptEvidenceItems
    .filter((prompt) => prompt.status === "checked" && (!prompt.brandMentioned || prompt.competitors.length > 0))
    .sort((left, right) => Number(left.brandMentioned) - Number(right.brandMentioned));
  const actions = (audit.raw_results?.monitoring?.actions ?? []).slice(0, 3).map((action) => localizePlainAction(action, locale));

  return {
    auditId: audit.id,
    brandName: audit.brand_name,
    websiteUrl: audit.website_url,
    score: audit.score,
    category: audit.raw_results?.category ?? null,
    answerEngine: audit.raw_results?.answerEngine ?? null,
    brandSentiment: brandSentimentText(audit.raw_results?.brandSentiment ?? { label: "not_enough_signal", justification: "not enough signal" }, locale),
    competitors,
    promptEvidence: promptEvidenceItems,
    priorityGaps: priorityGaps.slice(0, 5),
    actions,
  };
}

function contextSources(context: ReturnType<typeof auditContext>, locale: Locale) {
  const scoreSource = locale === "fr"
    ? `Audit ${context.auditId}: score ${context.score ?? "non disponible"}, catégorie ${context.category ?? "non disponible"}`
    : `Audit ${context.auditId}: score ${context.score ?? "unavailable"}, category ${context.category ?? "unavailable"}`;
  const promptSources = context.promptEvidence.slice(0, 5).map((prompt) => `${prompt.id}: ${prompt.question} — ${prompt.label}`);

  return [scoreSource, ...promptSources];
}

function systemPrompt(locale: Locale) {
  if (locale === "fr") {
    return [
      "Tu es l'Agent Citeable réservé aux acheteurs Agent 19 €.",
      "Réponds en français naturel, direct, utile.",
      "Tu dois t'appuyer uniquement sur le JSON d'audit fourni et sur les observations Gemini/ChatGPT produites dans cette conversation.",
      "N'invente jamais de données, de citations, de chiffres, de raisons SEO, de concurrents ou de sources qui ne sont pas dans l'audit.",
      "Si une information manque, dis clairement qu'elle manque dans l'audit.",
      "Quand l'utilisateur demande un correctif, fournis un bloc prêt à coller et relie-le explicitement à un gap réel de l'audit (Q1, Q2, etc.).",
      "Si tu expliques pourquoi un concurrent apparaît, limite-toi aux faits observés : il est cité par l'audit sur telle question, la marque auditée est citée ou non, et la catégorie détectée.",
    ].join("\n");
  }

  return [
    "You are the Citeable Agent reserved for Agent €19 buyers.",
    "Answer in natural, direct, useful English.",
    "Use only the provided audit JSON and the Gemini/ChatGPT observations generated in this conversation.",
    "Never invent data, citations, numbers, SEO reasons, competitors, or sources that are not in the audit.",
    "If information is missing, say it is missing from the audit.",
    "When the user asks for a fix, provide a ready-to-paste block and explicitly tie it to a real audit gap (Q1, Q2, etc.).",
    "If explaining why a competitor appears, stay limited to observed facts: it was cited by the audit for a question, the audited brand was cited or not, and the detected category.",
  ].join("\n");
}

function userPrompt(args: { audit: AuditAgentChatAudit; locale: Locale; message: string; history: AuditAgentChatMessage[] }) {
  const context = auditContext(args.audit, args.locale);
  const recentHistory = args.history.slice(-6);

  return [
    `AUDIT_CONTEXT_JSON:\n${JSON.stringify(context, null, 2)}`,
    recentHistory.length ? `RECENT_CHAT_JSON:\n${JSON.stringify(recentHistory, null, 2)}` : "RECENT_CHAT_JSON: []",
    `USER_QUESTION:\n${args.message}`,
  ].join("\n\n");
}

async function askGemini(system: string, user: string): Promise<EngineChatResult> {
  const apiKey = geminiApiKey();
  const model = currentGeminiModel();

  if (!apiKey) return { engine: "Gemini", model, ok: false, error: "Gemini API key is not configured." };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1100 },
      }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
    const responseText = await response.text();
    const parsed = safeJsonParse<GeminiGenerateContentResponse>(responseText, {});

    if (!response.ok) {
      return { engine: "Gemini", model, ok: false, error: parsed.error?.message ?? `Gemini HTTP ${response.status}` };
    }

    const answer = geminiAnswerText(parsed);
    return answer ? { engine: "Gemini", model, ok: true, answer } : { engine: "Gemini", model, ok: false, error: "Gemini returned an empty answer." };
  } catch (error) {
    return { engine: "Gemini", model, ok: false, error: error instanceof Error ? error.message : "Gemini unavailable." };
  }
}

async function askOpenAI(system: string, user: string): Promise<EngineChatResult> {
  const apiKey = openAIApiKey();
  const model = currentOpenAIModel();

  if (!apiKey) return { engine: "ChatGPT", model, ok: false, error: "ChatGPT API key is not configured." };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 1100,
      }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
    const responseText = await response.text();
    const parsed = safeJsonParse<OpenAIChatCompletionResponse>(responseText, {});

    if (!response.ok) {
      return { engine: "ChatGPT", model, ok: false, error: parsed.error?.message ?? `ChatGPT HTTP ${response.status}` };
    }

    const answer = openAIAnswerText(parsed);
    return answer ? { engine: "ChatGPT", model: parsed.model ?? model, ok: true, answer } : { engine: "ChatGPT", model, ok: false, error: "ChatGPT returned an empty answer." };
  } catch (error) {
    return { engine: "ChatGPT", model, ok: false, error: error instanceof Error ? error.message : "ChatGPT unavailable." };
  }
}

function mentionsAny(text: string, values: string[]) {
  const lower = text.toLowerCase();
  return values.some((value) => value && lower.includes(value.toLowerCase()));
}

function selectedEvidence(context: ReturnType<typeof auditContext>, message: string) {
  const asksForGap = /gap|missing|not cited|not mentioned|biggest|priority|écart|manque|non cité/i.test(message);

  return context.priorityGaps.find((prompt) => mentionsAny(message, [prompt.question, ...prompt.competitors]))
    ?? (asksForGap ? context.priorityGaps[0] : undefined)
    ?? context.promptEvidence.find((prompt) => mentionsAny(message, [prompt.question, ...prompt.competitors]))
    ?? context.priorityGaps[0]
    ?? context.promptEvidence[0];
}

function pasteBlock(context: ReturnType<typeof auditContext>, evidence: ReturnType<typeof selectedEvidence>, message: string, locale: Locale) {
  if (!evidence) {
    return locale === "fr"
      ? "Je ne peux pas générer de correctif prêt à coller : l'audit ne contient aucune question d'achat exploitable."
      : "I cannot generate a ready-to-paste fix: the audit does not contain a usable buyer-intent question.";
  }

  const category = context.category ?? (locale === "fr" ? "ta catégorie" : "your category");
  const competitors = evidence.competitors.length ? evidence.competitors.slice(0, 3).join(", ") : locale === "fr" ? "les options déjà citées" : "the options already cited";
  const wantsGoogle = /google|business|profile|fiche/i.test(message);

  if (locale === "fr") {
    if (wantsGoogle) {
      return [
        "Texte Google Business prêt à coller :",
        `« ${context.brandName} aide les clients à évaluer ${category} avec des réponses claires aux questions comme : ${evidence.question}. Consulte notre site pour comparer les options, les preuves disponibles et la prochaine étape. »`,
      ].join("\n");
    }

    return [
      "Bloc FAQ prêt à coller :",
      `Q : ${evidence.question}`,
      `R : Pour comparer ${category}, commence par le besoin exact, les preuves disponibles et la prochaine étape. ${context.brandName} doit répondre clairement à cette question sur son site, puis aider le lecteur à comparer les options citées dans l'audit (${competitors}) avec des critères vérifiables plutôt que des promesses vagues.`,
    ].join("\n");
  }

  if (wantsGoogle) {
    return [
      "Ready-to-paste Google Business text:",
      `“${context.brandName} helps customers evaluate ${category} with clear answers to questions like: ${evidence.question}. Visit our site to compare options, review available proof, and choose the next step.”`,
    ].join("\n");
  }

  return [
    "Ready-to-paste FAQ block:",
    `Q: ${evidence.question}`,
    `A: When comparing ${category}, start with the exact use case, available proof, and the next step. ${context.brandName} should answer this question clearly on its site, then help the reader compare the options cited in this audit (${competitors}) using verifiable criteria instead of vague claims.`,
  ].join("\n");
}

function groundedAnswerFromAudit(context: ReturnType<typeof auditContext>, message: string, engines: EngineChatResult[], locale: Locale) {
  const evidence = selectedEvidence(context, message);
  const engineStatus = engines.map((engine) => `${engine.engine} ${engine.ok ? "✓" : `— ${engine.error ?? "unavailable"}`}`).join(" · ");

  if (!evidence) {
    return locale === "fr"
      ? `Je n'ai pas assez de données dans cet audit pour répondre précisément. Source disponible : audit ${context.auditId}, score ${context.score ?? "non disponible"}, catégorie ${context.category ?? "non disponible"}. Moteurs appelés : ${engineStatus}.`
      : `I do not have enough data in this audit to answer precisely. Available source: audit ${context.auditId}, score ${context.score ?? "unavailable"}, category ${context.category ?? "unavailable"}. Engines called: ${engineStatus}.`;
  }

  const competitors = evidence.competitors.length ? evidence.competitors.join(", ") : locale === "fr" ? "aucun concurrent clair" : "no clear competitors";
  const requestCopy = /paste|copy|faq|section|google|business|profile|fiche|coller|correctif|texte|paragraph|paragraphe/i.test(message);

  if (locale === "fr") {
    const fact = `Source audit ${context.auditId} : score ${context.score ?? "non disponible"}/100, catégorie ${context.category ?? "non disponible"}. Sur ${evidence.id} (« ${evidence.question} »), ${context.brandName} est ${evidence.brandMentioned ? "cité" : "non cité"}; concurrents observés : ${competitors}.`;
    const limit = `Ce que l'audit prouve : qui est cité sur cette question. Ce qu'il ne prouve pas : la raison interne exacte pour laquelle un moteur choisit ${competitors}.`;
    const fix = requestCopy ? pasteBlock(context, evidence, message, locale) : `Action : crée une section qui répond exactement à « ${evidence.question} » et compare les options observées (${competitors}) avec des preuves vérifiables.`;

    return `${fact}\n\n${limit}\n\n${fix}\n\nMoteurs appelés pour vérifier la réponse : ${engineStatus}.`;
  }

  const fact = `Audit source ${context.auditId}: score ${context.score ?? "unavailable"}/100, category ${context.category ?? "unavailable"}. On ${evidence.id} (“${evidence.question}”), ${context.brandName} is ${evidence.brandMentioned ? "cited" : "not cited"}; observed competitors: ${competitors}.`;
  const limit = `What the audit proves: who was cited for this question. What it does not prove: the engine's private reason for choosing ${competitors}.`;
  const fix = requestCopy ? pasteBlock(context, evidence, message, locale) : `Action: publish a section that answers “${evidence.question}” directly and compares the observed options (${competitors}) using verifiable criteria.`;

  return `${fact}\n\n${limit}\n\n${fix}\n\nEngines called to check the response: ${engineStatus}.`;
}

export async function answerAuditAgentChat(args: {
  audit: AuditAgentChatAudit;
  message: string;
  history?: AuditAgentChatMessage[];
  locale: Locale;
}): Promise<AuditAgentChatResponse> {
  const system = systemPrompt(args.locale);
  const user = userPrompt({ audit: args.audit, locale: args.locale, message: args.message, history: args.history ?? [] });
  const [chatGpt, gemini] = await Promise.all([askOpenAI(system, user), askGemini(system, user)]);
  const context = auditContext(args.audit, args.locale);
  const engines = [chatGpt, gemini];

  return {
    answer: groundedAnswerFromAudit(context, args.message, engines, args.locale),
    sources: contextSources(context, args.locale),
    engines: engines.map((engine) => ({ engine: engine.engine, model: engine.model, ok: engine.ok, error: engine.error })),
  };
}
