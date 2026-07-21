/**
 * Adaptateur d'envoi d'email indépendant de NanoCorp (Resend).
 *
 * Si aucune clé n'est fournie, `sendMail` renvoie `sent: false` avec
 * `notConfigured: true` — l'appelant doit se dégrader proprement plutôt que planter.
 *
 * Variables reconnues :
 *   RESEND_API_KEY
 *   EMAIL_FROM      ex. "GetPick <charles@getpick.ai>" (défaut : GetPick <hello@getpick.ai>)
 *   EMAIL_REPLY_TO  (optionnel)
 */

export type MailProviderName = "resend";

export type MailSendResult = {
  sent: boolean;
  provider?: MailProviderName;
  id?: string;
  status?: number;
  error?: string;
  /** true quand aucune clé n'est configurée : absence de config, pas panne du fournisseur. */
  notConfigured?: boolean;
};

export type MailMessage = {
  to: string;
  subject: string;
  /** Corps en texte brut. Les emails GetPick sont composés en texte. */
  text: string;
  html?: string;
};

export type MailOptions = {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
};

const DEFAULT_TIMEOUT_MS = 18_000;
const DEFAULT_FROM = "GetPick <hello@getpick.ai>";

function readEnv(env: Record<string, string | undefined>, key: string) {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function mailProvider(env: Record<string, string | undefined> = process.env): MailProviderName | null {
  return readEnv(env, "RESEND_API_KEY") ? "resend" : null;
}

export function isMailConfigured(env: Record<string, string | undefined> = process.env) {
  return mailProvider(env) !== null;
}

export function mailFromAddress(env: Record<string, string | undefined> = process.env) {
  return readEnv(env, "EMAIL_FROM") ?? DEFAULT_FROM;
}

function errorMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const message = parsed.message ?? parsed.error ?? parsed.detail;
    if (typeof message === "string" && message.trim()) return message.trim();
    if (message !== undefined) return String(message);
  } catch {
    // corps non-JSON
  }

  return body.slice(0, 300) || "empty response";
}

export function parseResendId(payload: unknown): string | undefined {
  const id = (payload as { id?: unknown } | null)?.id;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

export async function sendMail(message: MailMessage, options: MailOptions = {}): Promise<MailSendResult> {
  const env = options.env ?? process.env;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const provider = mailProvider(env);

  if (!provider) {
    return { sent: false, notConfigured: true, error: "No email provider configured (set RESEND_API_KEY)" };
  }

  const apiKey = readEnv(env, "RESEND_API_KEY");

  if (!apiKey) {
    return { sent: false, provider, notConfigured: true, error: "Missing RESEND_API_KEY" };
  }

  const replyTo = readEnv(env, "EMAIL_REPLY_TO");
  const payload: Record<string, unknown> = {
    from: mailFromAddress(env),
    to: [message.to],
    subject: message.subject,
    text: message.text,
  };

  if (message.html) payload.html = message.html;
  if (replyTo) payload.reply_to = replyTo;

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();

    if (!response.ok) {
      return { sent: false, provider, status: response.status, error: `resend HTTP ${response.status}: ${errorMessage(body)}` };
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }

    return { sent: true, provider, status: response.status, id: parseResendId(parsed) };
  } catch (error) {
    const message_ = error instanceof Error ? error.message : "Unknown resend error";
    return { sent: false, provider, error: `resend: ${message_}` };
  }
}
