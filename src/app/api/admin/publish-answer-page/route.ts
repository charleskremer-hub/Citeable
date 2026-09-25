import { NextRequest, NextResponse } from "next/server";
import { ensureAuditSchema, pool } from "@/lib/db";
import { hostedAnswerPageSlug } from "@/lib/hosted-answer-page";

export const dynamic = "force-dynamic";

const siteUrl = "https://www.getpick.ai";
const ADMIN_KEY = process.env.FUNNEL_ADMIN_KEY;

/** Comparaison à temps constant (même logique que /admin/emails et /api/funnel). */
function secretMatches(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Geste de PUBLICATION de la page-réponse hébergée (interne, derrière la clé
 * admin). Poser `answer_page_published_at` = rendre la page indexable et
 * présente au sitemap ; le mettre à NULL = la retirer. Aucune donnée client
 * n'est modifiée, seulement l'état de publication.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { audit_id?: unknown; key?: unknown; published?: unknown };
    const key = typeof body.key === "string" ? body.key : req.headers.get("x-admin-key");
    if (!secretMatches(key, ADMIN_KEY)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const auditId = typeof body.audit_id === "string" ? body.audit_id.trim() : "";
    if (!auditId) return NextResponse.json({ ok: false, error: "audit_id is required" }, { status: 400 });
    const publish = body.published === undefined ? true : Boolean(body.published);

    await ensureAuditSchema();
    const result = await pool.query<{ id: string; brand_name: string; answer_page_published_at: string | null }>(
      `UPDATE audits
       SET answer_page_published_at = ${publish ? "now()" : "NULL"}
       WHERE id = $1 AND score IS NOT NULL
       RETURNING id, brand_name, answer_page_published_at`,
      [auditId],
    );
    const row = result.rows[0];
    if (!row) return NextResponse.json({ ok: false, error: "audit not found or not completed" }, { status: 404 });

    return NextResponse.json({
      ok: true,
      audit_id: row.id,
      published: Boolean(row.answer_page_published_at),
      published_at: row.answer_page_published_at,
      url: `${siteUrl}/reponses/${hostedAnswerPageSlug(row.brand_name, row.id)}`,
    });
  } catch (error) {
    console.error(`[getpick] publish-answer-page failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
