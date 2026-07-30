import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Au-dela de ce delai, un audit encore en `running` est mort, pas lent.
 *
 * `completeQueuedAudit()` ecrit `status: "running"` + `startedAt` avant d'appeler
 * `runAudit()`, puis ecrit `completed` ou `failed` au retour. Les deux sorties
 * terminales sont dans la MEME invocation serverless, plafonnee a
 * `maxDuration = 60` sur `/api/run-audit` et `/api/capture-email`. Donc si
 * l'invocation est tuee (depassement du plafond, OOM, crash du runtime), plus
 * personne ne reecrit la ligne : elle reste `running` pour toujours, le client
 * sonde indefiniment, et le prospect ne voit jamais ni resultat ni erreur.
 *
 * 3 minutes = 3x le plafond d'execution. On ne peut pas tuer un audit
 * legitimement vivant avec cette marge.
 */
const STALE_AUDIT_MS = 3 * 60 * 1000;

const STALE_ERROR = "L'audit s'est interrompu avant de rendre un resultat. Relancez-le.";

type RawResults = {
  status?: string;
  startedAt?: string;
  error?: string;
  checks?: unknown;
  emailSent?: boolean;
  emailError?: string;
  category?: string;
  icpSegment?: unknown;
  buyerIntentPrompts?: unknown;
  promptDebug?: string;
  auditTier?: string;
  answerEngine?: unknown;
  brandSentiment?: unknown;
  locale?: string;
};

type AuditRow = {
  id: string;
  email: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  engines_checked: unknown;
  competitors_found: unknown;
  fixes: unknown;
  raw_results: RawResults | null;
};

/**
 * Vrai quand la ligne est en `running` depuis plus longtemps qu'une invocation
 * ne peut vivre. Sans `startedAt` exploitable on ne conclut PAS : on prefere un
 * audit qui traine a un audit tue a tort.
 */
export function isStaleRunningAudit(
  raw: { status?: string; startedAt?: string } | null | undefined,
  now: number = Date.now()
): boolean {
  if (raw?.status !== "running") return false;

  const startedAt = Date.parse(raw.startedAt ?? "");
  if (!Number.isFinite(startedAt)) return false;

  return now - startedAt > STALE_AUDIT_MS;
}

export async function GET(req: NextRequest) {
  await ensureAuditSchema();
  const auditId = req.nextUrl.searchParams.get("audit_id");

  if (!auditId) {
    return NextResponse.json({ error: "audit_id is required" }, { status: 400 });
  }

  const result = await pool.query<AuditRow>(`SELECT * FROM audits WHERE id = $1`, [auditId]);
  const audit = result.rows[0];

  if (!audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const completed = audit.score !== null && audit.score !== undefined;

  // Le seul chemin qui repasse sur une ligne abandonnee est celui du client qui
  // l'attend : on la solde ici plutot que d'ajouter un cron. Garde-fou dans le
  // WHERE : on n'ecrit que si la ligne est TOUJOURS `running` et sans score, pour
  // ne jamais ecraser un audit qui aurait fini entre le SELECT et l'UPDATE.
  let staleError: string | undefined;
  if (!completed && isStaleRunningAudit(audit.raw_results)) {
    await pool.query(
      `UPDATE audits
       SET raw_results = COALESCE(raw_results, '{}'::jsonb) || $2::jsonb
       WHERE id = $1
         AND score IS NULL
         AND raw_results->>'status' = 'running'`,
      [auditId, { status: "failed", error: STALE_ERROR, staleReapedAt: new Date().toISOString() }]
    );
    staleError = STALE_ERROR;
  }

  return NextResponse.json({
    audit_id: audit.id,
    status: completed ? "completed" : staleError ? "failed" : audit.raw_results?.status ?? "queued",
    brand_name: audit.brand_name,
    website_url: audit.website_url,
    score: audit.score,
    checks: audit.raw_results?.checks ?? [],
    engines: audit.engines_checked ?? [],
    competitors: audit.competitors_found ?? [],
    buyer_intent_prompts: audit.raw_results?.buyerIntentPrompts ?? [],
    prompt_debug: audit.raw_results?.promptDebug,
    category: audit.raw_results?.category,
    icp_segment: audit.raw_results?.icpSegment,
    audit_tier: audit.raw_results?.auditTier ?? "free",
    answer_engine: audit.raw_results?.answerEngine,
    brand_sentiment: audit.raw_results?.brandSentiment,
    fixes: audit.fixes ?? [],
    email_sent: Boolean(audit.raw_results?.emailSent),
    email_error: audit.raw_results?.emailError,
    locale: audit.raw_results?.locale ?? "en",
    error: staleError ?? audit.raw_results?.error,
  });
}
