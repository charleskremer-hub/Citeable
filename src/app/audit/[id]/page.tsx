import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureAuditSchema, pool } from "@/lib/db";
import type { BuyerIntentPromptResult } from "@/lib/audit-engine";
import AuditPoller from "./AuditPoller";

export const dynamic = "force-dynamic";

const DONE_FOR_YOU_CHECKOUT_URL = "https://checkout.nanocorp.so/c/fzVo0YiuyHM5GStaVrpT";

type AuditRow = {
  id: string;
  email: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  competitors_found: string[] | null;
  raw_results: {
    status?: string;
    error?: string;
    category?: string;
    auditTier?: string;
    answerEngine?: { engine?: string; model?: string; realLlmCall?: boolean };
    buyerIntentPrompts?: BuyerIntentPromptResult[];
  } | null;
};

function scoreColor(score: number) {
  if (score < 30) return "#FF5F5F";
  if (score < 60) return "#FFB84D";
  return "#CAFF3C";
}

function uniqueNames(names: string[]) {
  const seen = new Set<string>();

  return names.filter((name) => {
    const cleaned = name.trim();
    const key = cleaned.toLowerCase();

    if (!cleaned || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function competitorCounts(names: string[]) {
  const counts = new Map<string, { name: string; count: number; firstIndex: number }>();

  names.forEach((name, index) => {
    const cleaned = name.trim().replace(/\s+/g, " ");
    const key = cleaned.toLowerCase();

    if (!cleaned) return;

    const current = counts.get(key);
    if (current) {
      current.count += 1;
    } else {
      counts.set(key, { name: cleaned, count: 1, firstIndex: index });
    }
  });

  return Array.from(counts.values())
    .sort((left, right) => right.count - left.count || left.firstIndex - right.firstIndex || left.name.localeCompare(right.name))
    .slice(0, 12);
}

function questionEngineSummary(question: BuyerIntentPromptResult) {
  const aiSurface = question.surfaces.find((surface) => surface.kind === "ai_engine");

  if (aiSurface) {
    const label = aiSurface.recommendationLabel ?? (aiSurface.brandMentioned ? "Gemini te recommande" : "Gemini ne te cite pas");
    const competitors = question.competitors.length ? ` · Concurrents cités: ${question.competitors.join(", ")}` : " · Aucun concurrent cité clairement";
    return aiSurface.status === "checked" ? `${label}${competitors}` : (aiSurface.unavailableReason ?? "Gemini indisponible, réessaie.");
  }

  const checked = question.surfaces.filter((surface) => surface.kind === "supplementary" && surface.status === "checked");
  const unavailable = question.surfaces.filter((surface) => surface.kind === "supplementary" && surface.status !== "checked");

  if (checked.length > 0) {
    return checked.map((surface) => `${surface.surface}: ${surface.brandMentioned ? "brand/domain found" : "brand/domain not found"}`).join(" · ");
  }

  return unavailable[0]?.unavailableReason ?? "Native web_search unavailable; this report uses only checks that completed.";
}

function checkedQuestions(questions: BuyerIntentPromptResult[]) {
  const available = questions.filter((question) => question.available);
  return available.length ? available : questions;
}

function fixSentence(category: string | undefined, hasCompetitors: boolean) {
  const business = category && category !== "your type of business" ? category : "ton activité";

  if (hasCompetitors) {
    return `Voici quoi corriger : ajoute une page claire sur ${business}, avec tes preuves, tes avis et les réponses aux questions clients.`;
  }

  return `Voici quoi corriger : rends ton site plus clair sur ${business}, tes preuves et les raisons de te choisir.`;
}

function StatusPill({ failed, complete }: { failed: boolean; complete: boolean }) {
  const label = failed ? "Échec" : complete ? "Terminé" : "En cours";
  const className = failed
    ? "border-[#FF8A8A]/25 bg-[#FF5F5F]/10 text-[#FF8A8A]"
    : complete
      ? "border-[#CAFF3C]/25 bg-[#CAFF3C]/10 text-[#CAFF3C]"
      : "border-[#FFB84D]/25 bg-[#FFB84D]/10 text-[#FFB84D]";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${className}`}>
      {label}
    </span>
  );
}

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureAuditSchema();

  const result = await pool.query<AuditRow>(`SELECT * FROM audits WHERE id = $1`, [id]);
  const audit = result.rows[0];

  if (!audit) notFound();

  const failed = audit.raw_results?.status === "failed";
  const complete = audit.score !== null;
  const questions = checkedQuestions(audit.raw_results?.buyerIntentPrompts ?? []);
  const questionCount = complete ? questions.length : 0;
  const brandMentionCount = complete ? questions.filter((question) => question.brandMentioned).length : 0;
  const competitors = uniqueNames([
    ...(audit.competitors_found ?? []),
    ...questions.flatMap((question) => question.competitors),
  ]).slice(0, 12);
  const rankedCompetitors = competitorCounts(questions.flatMap((question) => question.competitors));
  const isGeminiReport = audit.raw_results?.auditTier === "agent_49eur" || questions.some((question) => question.surfaces.some((surface) => surface.kind === "ai_engine"));
  const answerEngine = audit.raw_results?.answerEngine;
  const topCompetitor = rankedCompetitors[0]?.name ?? competitors[0];
  const score = audit.score ?? 0;
  const color = scoreColor(score);
  const phrases = [
    questionCount > 0
      ? isGeminiReport
        ? `${brandMentionCount > 0 ? "Gemini te recommande" : "Gemini ne te cite pas"} (${brandMentionCount}/${questionCount} questions).`
        : `Tu es cité ${brandMentionCount} fois sur ${questionCount} questions.`
      : "Aucune question client n'a pu être vérifiée pour l'instant.",
    topCompetitor
      ? `Le concurrent ${topCompetitor} sort à ta place.`
      : "Aucun concurrent ne sort clairement à ta place.",
    fixSentence(audit.raw_results?.category, competitors.length > 0),
  ];

  return (
    <main className="min-h-screen bg-[#09090B] text-[#F0F0EC]" style={{ fontFamily: "var(--font-sans)" }}>
      <AuditPoller
        auditId={audit.id}
        email={audit.email}
        brandName={audit.brand_name}
        websiteUrl={audit.website_url}
        complete={complete || failed}
      />

      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <nav className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="text-xl text-[#F0F0EC] no-underline" style={{ fontFamily: "var(--font-display)" }}>
            Citeable
          </Link>
          <a href={DONE_FOR_YOU_CHECKOUT_URL} className="text-sm font-black text-[#CAFF3C] no-underline">
            Corriger pour moi →
          </a>
        </nav>

        <div className="flex flex-1 flex-col justify-center gap-4 pb-8 sm:gap-5">
          <div className="rounded-[2rem] border border-white/[0.08] bg-[#111116] p-5 shadow-2xl shadow-black/30 sm:p-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <StatusPill failed={failed} complete={complete} />
              <a href={audit.website_url} className="max-w-full truncate text-sm font-bold text-[#8E8E9A] underline decoration-white/10 underline-offset-4">
                {audit.website_url}
              </a>
            </div>

            <h1 className="text-[clamp(2rem,12vw,4.25rem)] leading-[0.95] tracking-[-0.05em]" style={{ fontFamily: "var(--font-display)" }}>
              Rapport simple pour {audit.brand_name}
            </h1>

            <div className="mt-6 grid gap-4 sm:grid-cols-[190px_1fr] sm:items-center">
              <div
                className="grid aspect-square w-40 place-items-center rounded-[2rem] border-[10px] bg-white/[0.03] sm:w-48"
                style={{ borderColor: color, boxShadow: `0 0 42px ${color}2E` }}
                aria-label={complete ? `Score ${score} sur 100` : "Score en cours"}
              >
                <div className="text-center">
                  <div className="text-6xl font-black leading-none tracking-[-0.06em]" style={{ color }}>
                    {complete ? score : "…"}
                  </div>
                  <div className="mt-1 text-sm font-black text-[#777787]">/100</div>
                </div>
              </div>

              {failed ? (
                <div className="rounded-2xl border border-[#FF8A8A]/20 bg-[#FF5F5F]/10 p-4 text-sm font-bold leading-6 text-[#FFB1B1]">
                  Impossible de lancer le rapport : {audit.raw_results?.error ?? "erreur inconnue"}
                </div>
              ) : !complete ? (
                <div className="rounded-2xl border border-[#FFB84D]/20 bg-[#FFB84D]/10 p-4 text-sm font-bold leading-6 text-[#FFD18A]">
                  Patiente 20–60 secondes : on vérifie les résultats réels, sans rien inventer.
                </div>
              ) : (
                <ol className="m-0 grid list-none gap-3 p-0">
                  {phrases.map((phrase, index) => (
                    <li key={phrase} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-base font-black leading-6 text-[#F0F0EC]">
                      <span className="mr-2 text-[#CAFF3C]">{index + 1}.</span>
                      {phrase}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {complete && !failed ? (
            <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
              <div className="mb-4 flex items-end justify-between gap-4">
                <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                  {isGeminiReport ? "Concurrents cités par Gemini" : "Brands found in web_search results"}
                </h2>
                <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-black text-[#BCBCC8]">{rankedCompetitors.length || competitors.length}</span>
              </div>

              {rankedCompetitors.length ? (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {rankedCompetitors.map((competitor) => (
                    <li key={competitor.name} className="rounded-full border border-[#CAFF3C]/20 bg-[#CAFF3C]/10 px-3 py-2 text-sm font-black text-[#CAFF3C]">
                      {competitor.name} <span className="text-[#F0F0EC]/70">({competitor.count}x)</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm font-bold text-[#8E8E9A]">
                  Aucun nom trouvé dans les réponses disponibles.
                </div>
              )}
            </section>
          ) : null}

          {complete && !failed ? (
            <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
              <div className="mb-4 flex items-end justify-between gap-4">
                <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                  {isGeminiReport ? "Questions posées à Gemini" : "Buyer web searches checked"}
                </h2>
                <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-black text-[#BCBCC8]">
                  {isGeminiReport ? `${answerEngine?.engine ?? "Gemini"} · ${answerEngine?.model ?? "gemini-2.0-flash"}` : "Native web_search"}
                </span>
              </div>

              {questions.length ? (
                <ol className="m-0 grid list-none gap-2 p-0">
                  {questions.map((question) => (
                    <li key={question.prompt} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                      <p className="m-0 text-sm font-black text-[#F0F0EC]">{question.prompt}</p>
                      <p className="m-0 mt-2 text-sm font-bold text-[#BCBCC8]">{questionEngineSummary(question)}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="rounded-2xl border border-[#FF8A8A]/20 bg-[#FF5F5F]/10 p-4 text-sm font-bold text-[#FFB1B1]">
                  {isGeminiReport ? "Gemini indisponible, réessaie." : "Native web_search unavailable; this report uses only checks that completed."}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
