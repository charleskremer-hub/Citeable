import { randomUUID } from "crypto";
import { pool } from "./db";

const NANO_API_BASE_URL = process.env.NANOCORP_API_BASE_URL ?? "https://phospho-nanocorp-prod--nanocorp-api-fastapi-app.modal.run";

const DEFAULT_COMPANY_ID = "9ce8bf27-b673-4c40-8ef6-ddfa5a1d7504";
const DEFAULT_SITE_URL = "https://getciteable.nanocorp.app";

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

export type QueuedAuditResult =
  | { status: "complete"; report: AuditReport }
  | { status: "running"; taskId?: string }
  | { status: "failed"; error: string };

type AuditRawResults = {
  status?: string;
  error?: string;
  formula?: string;
  category?: string;
  structuredDataFound?: boolean;
  emailSent?: boolean;
  emailError?: string;
  workerTaskId?: string;
  callbackSecret?: string;
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

type NanoTaskResponse = {
  id?: string;
  detail?: unknown;
  error?: string;
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

function siteUrl() {
  return (process.env.CITEABLE_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_PROJECT_URL ?? DEFAULT_SITE_URL).replace(/\/$/, "");
}

function companyId() {
  return process.env.NANOCORP_COMPANY_ID ?? process.env.COMPANY_ID ?? DEFAULT_COMPANY_ID;
}

function taskEndpoint() {
  return `${NANO_API_BASE_URL.replace(/\/$/, "")}/internal/companies/${companyId()}/tasks`;
}

function taskCallbackUrl(auditId: string) {
  return `${siteUrl()}/api/audit-callback?audit_id=${encodeURIComponent(auditId)}`;
}

function reportFromRow(row: AuditRow): AuditReport {
  return {
    audit_id: row.id,
    score: row.score ?? 0,
    engines: row.engines_checked ?? [],
    competitors: row.competitors_found ?? [],
    fixes: row.fixes ?? [],
    formula: row.raw_results?.formula ?? "Formula unavailable.",
    structuredDataFound: Boolean(row.raw_results?.structuredDataFound),
    category: row.raw_results?.category ?? "unknown",
    emailSent: Boolean(row.raw_results?.emailSent),
    emailError: row.raw_results?.emailError,
  };
}

function buildAuditWorkerDescription(args: {
  auditId: string;
  brandName: string;
  websiteUrl: string;
  email: string;
  callbackUrl: string;
  callbackSecret: string;
}) {
  const payloadTemplate = {
    callback_secret: args.callbackSecret,
    score: 0,
    engines: [
      {
        engine: "NanoCorp web search",
        reachable: true,
        promptsRun: 0,
        brandMentioned: false,
        competitors: [],
        rawAnswerSnippet: "",
        promptResults: [],
      },
    ],
    competitors: [],
    fixes: [],
    formula: "",
    structuredDataFound: false,
    category: "",
    emailSent: false,
    emailError: "",
  };

  return `You are a NanoCorp worker running a Citeable AI visibility audit.

Hard constraints:
- Do not edit the repository, deploy, enable ads, change pricing, or create additional tasks.
- Do not call NanoCorp web_search, web_fetch, or send_email through HTTP endpoints or bearer-token REST calls.
- Use native worker sandbox tools only: prefer \`nanocorp web search\`, \`nanocorp web fetch\`, and \`nanocorp emails send\` from the CLI, or the equivalent native worker tools if exposed in your runtime.
- Never fabricate a score. If live research fails, POST a failed/low-confidence result with the real errors in \`rawAnswerSnippet\`/\`emailError\`.

Audit input:
- audit_id: ${args.auditId}
- brand_name: ${args.brandName}
- website_url: ${args.websiteUrl}
- report_email: ${args.email}
- callback_url: ${args.callbackUrl}

Execution steps:
1. Fetch the homepage with native web_fetch/\`nanocorp web fetch ${args.websiteUrl}\`. Detect whether schema.org or JSON-LD structured data is present and infer a short business category.
2. Run 3-5 native web_search queries that test AI visibility for the brand. Use these prompts:
   - ${args.brandName} ${args.websiteUrl}
   - ${args.brandName} recommended AI assistant
   - alternatives to ${args.brandName}
   - best tools like ${args.brandName}
   - ${args.brandName} reviews recommendations
3. Fetch one or two relevant result pages if snippets are not enough. Count an engine/result as reached only when a native web_search or web_fetch call returns usable live data.
4. Score 0-100 from real evidence: roughly 60 points for prompt coverage mentioning the brand, up to 30 points for prominence/citation quality, and up to 10 points for structured data. Well-known brands may score high, but the score must be derived from actual returned snippets/pages.
5. Build 3-5 prioritized fixes for improving AI-answer visibility.
6. Send a concise formatted email report to ${args.email} with \`nanocorp emails send --to ${args.email} --subject "Your Citeable AI visibility audit for ${args.brandName}"\`. Set emailSent true only if the send command succeeds.
7. POST the final JSON to ${args.callbackUrl}. Include header \`Content-Type: application/json\`. The JSON shape must match this template exactly, with real values replacing placeholders:

${JSON.stringify(payloadTemplate, null, 2)}

Callback example:
curl -X POST ${args.callbackUrl} \\
  -H 'Content-Type: application/json' \\
  --data '<final JSON>'

Finish your worker result summary with the audit_id, score, engines reached, emailSent, and whether the callback POST succeeded.`;
}

async function createAuditWorkerTask(row: AuditRow, callbackSecret: string) {
  if (!process.env.NANOCORP_TOKEN) {
    throw new Error("NANOCORP_TOKEN is required only for NanoCorp task creation; native audit tools run inside the spawned worker task.");
  }

  const response = await fetch(taskEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NANOCORP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: `Run Citeable AI visibility audit for ${row.brand_name}`,
      description: buildAuditWorkerDescription({
        auditId: row.id,
        brandName: row.brand_name,
        websiteUrl: row.website_url,
        email: row.email,
        callbackUrl: taskCallbackUrl(row.id),
        callbackSecret,
      }),
      runner: "worker",
      priority: "normal",
      parent_task_id: process.env.TASK_ID,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as NanoTaskResponse;

  if (!response.ok || !payload.id) {
    const detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail ?? payload.error ?? payload);
    throw new Error(`NanoCorp task creation failed with HTTP ${response.status}: ${detail}`);
  }

  return payload.id;
}

export async function runAudit(args: { auditId?: string; email: string; brandName: string; websiteUrl: string }) {
  const audit = args.auditId
    ? await pool.query<AuditRow>(`SELECT * FROM audits WHERE id = $1`, [args.auditId])
    : await pool.query<AuditRow>(
        `INSERT INTO audits (email, brand_name, website_url, raw_results)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [args.email, args.brandName, args.websiteUrl, { status: "queued", queuedAt: new Date().toISOString() }]
      );

  const row = audit.rows[0];
  if (!row) {
    throw new Error("Audit not found.");
  }

  await runQueuedAudit(row.id);

  return {
    audit_id: row.id,
    status: "running" as const,
    score: row.score,
    engines: row.engines_checked ?? [],
    competitors: row.competitors_found ?? [],
    fixes: row.fixes ?? [],
  };
}

export async function runQueuedAudit(auditId: string): Promise<QueuedAuditResult> {
  const existing = await pool.query<AuditRow>(`SELECT * FROM audits WHERE id = $1`, [auditId]);
  const row = existing.rows[0];

  if (!row) {
    return { status: "failed", error: "Audit not found." };
  }

  if (row.score !== null && row.score !== undefined) {
    return { status: "complete", report: reportFromRow(row) };
  }

  if (row.raw_results?.workerTaskId) {
    return { status: "running", taskId: row.raw_results.workerTaskId };
  }

  const callbackSecret = row.raw_results?.callbackSecret ?? randomUUID();

  await pool.query(
    `UPDATE audits
     SET raw_results = COALESCE(raw_results, '{}'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [
      auditId,
      {
        status: "creating_worker_task",
        callbackSecret,
        taskRequestedAt: new Date().toISOString(),
      },
    ]
  );

  try {
    const taskId = await createAuditWorkerTask(row, callbackSecret);

    await pool.query(
      `UPDATE audits
       SET raw_results = COALESCE(raw_results, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [
        auditId,
        {
          status: "worker_task_queued",
          workerTaskId: taskId,
          callbackUrl: taskCallbackUrl(auditId),
          workerTaskCreatedAt: new Date().toISOString(),
        },
      ]
    );

    return { status: "running", taskId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown task creation error";

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
