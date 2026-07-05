import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import type { EngineResult } from "@/lib/audit-engine";

export const maxDuration = 60;

type AuditCallbackPayload = {
  callback_secret?: string;
  score?: unknown;
  engines?: unknown;
  competitors?: unknown;
  fixes?: unknown;
  formula?: unknown;
  structuredDataFound?: unknown;
  category?: unknown;
  emailSent?: unknown;
  emailError?: unknown;
};

type AuditSecretRow = {
  raw_results: {
    callbackSecret?: string;
  } | null;
};

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asEngines(value: unknown): EngineResult[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is EngineResult => {
    if (!item || typeof item !== "object") return false;
    const engine = item as Partial<EngineResult>;
    return typeof engine.engine === "string" && typeof engine.reachable === "boolean";
  });
}

function normalizeScore(value: unknown) {
  const score = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(score)) {
    throw new Error("Callback score must be a number.");
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function POST(req: NextRequest) {
  try {
    await ensureAuditSchema();

    const auditId = req.nextUrl.searchParams.get("audit_id");
    if (!auditId) {
      return NextResponse.json({ error: "audit_id is required" }, { status: 400 });
    }

    const body = (await req.json()) as AuditCallbackPayload;
    const existing = await pool.query<AuditSecretRow>(`SELECT raw_results FROM audits WHERE id = $1`, [auditId]);
    const row = existing.rows[0];

    if (!row) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    if (!row.raw_results?.callbackSecret || body.callback_secret !== row.raw_results.callbackSecret) {
      return NextResponse.json({ error: "Invalid callback secret" }, { status: 403 });
    }

    const score = normalizeScore(body.score);
    const engines = asEngines(body.engines);
    const competitors = asStringArray(body.competitors);
    const fixes = asStringArray(body.fixes);
    const formula = typeof body.formula === "string" ? body.formula : "Worker supplied no formula.";
    const category = typeof body.category === "string" ? body.category : "unknown";
    const structuredDataFound = Boolean(body.structuredDataFound);
    const emailSent = Boolean(body.emailSent);
    const emailError = typeof body.emailError === "string" && body.emailError ? body.emailError : undefined;

    await pool.query(
      `UPDATE audits
       SET score = $2,
           engines_checked = $3,
           competitors_found = $4,
           fixes = $5,
           raw_results = COALESCE(raw_results, '{}'::jsonb) || $6::jsonb
       WHERE id = $1`,
      [
        auditId,
        score,
        JSON.stringify(engines),
        JSON.stringify(competitors),
        JSON.stringify(fixes),
        {
          status: "complete",
          completedAt: new Date().toISOString(),
          formula,
          category,
          structuredDataFound,
          emailSent,
          emailError,
          workerCallbackReceived: true,
        },
      ]
    );

    return NextResponse.json({ ok: true, audit_id: auditId, score, engines_reached: engines.filter((engine) => engine.reachable).length, emailSent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Callback failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
