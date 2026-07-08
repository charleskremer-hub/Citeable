import { NextRequest, NextResponse } from "next/server";
import { answerAuditAgentChat, type AuditAgentChatMessage } from "@/lib/audit-agent-chat";
import { AGENT_CHECKOUT_URL } from "@/lib/checkout-links";
import { ensureAuditSchema, pool } from "@/lib/db";
import { localeFromHeaders, localeFromUnknown } from "@/lib/i18n";

export const maxDuration = 60;

type AuditRow = Parameters<typeof answerAuditAgentChat>[0]["audit"] & {
  raw_results: (Parameters<typeof answerAuditAgentChat>[0]["audit"]["raw_results"] & {
    auditTier?: string;
    status?: string;
  }) | null;
};

function normalizeHistory(value: unknown): AuditAgentChatMessage[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): AuditAgentChatMessage | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const role = record.role === "user" || record.role === "assistant" ? record.role : null;
      const content = typeof record.content === "string" ? record.content.trim() : "";

      if (!role || !content) return null;
      return { role, content: content.slice(0, 4_000) };
    })
    .filter((item): item is AuditAgentChatMessage => Boolean(item))
    .slice(-8);
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();
    const payload = await req.json();
    const auditId = typeof payload.audit_id === "string" ? payload.audit_id.trim() : "";
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    const locale = payload && typeof payload === "object" && "locale" in payload ? localeFromUnknown((payload as Record<string, unknown>).locale) : localeFromHeaders(req.headers);

    if (!auditId) return NextResponse.json({ error: "audit_id is required" }, { status: 400 });
    if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });
    if (message.length > 2_000) return NextResponse.json({ error: "message is too long" }, { status: 400 });

    const result = await pool.query<AuditRow>(`SELECT id, brand_name, website_url, score, competitors_found, raw_results FROM audits WHERE id = $1`, [auditId]);
    const audit = result.rows[0];

    if (!audit) return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    if (audit.raw_results?.auditTier !== "agent_19eur" && audit.raw_results?.auditTier !== "agent_49eur") {
      return NextResponse.json({ error: "Agent chat is reserved for Agent 19EUR audits", checkout_url: AGENT_CHECKOUT_URL }, { status: 403 });
    }
    if (audit.score === null || audit.raw_results?.status === "failed") {
      return NextResponse.json({ error: "Audit is not complete" }, { status: 409 });
    }

    const chat = await answerAuditAgentChat({
      audit,
      message,
      history: normalizeHistory(payload.history),
      locale,
    });

    return NextResponse.json({ ok: true, ...chat });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent chat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
