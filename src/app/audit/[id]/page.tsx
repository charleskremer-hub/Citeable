import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureAuditSchema, pool } from "@/lib/db";
import type { BuyerIntentPromptResult, PlainAction } from "@/lib/audit-engine";
import AuditPoller from "./AuditPoller";

export const dynamic = "force-dynamic";

const DONE_FOR_YOU_CHECKOUT_URL = "https://checkout.nanocorp.so/c/fzVo0YiuyHM5GStaVrpT?utm_source=report";
const MONITOR_CHECKOUT_URL = "https://checkout.nanocorp.so/c/SQdBFx6vxsKgDB0CUVXV?utm_source=report";

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
    monitoring?: { actions?: PlainAction[] };
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
    const engine = aiSurface.engine ?? "Gemini";
    const label = aiSurface.recommendationLabel ?? (aiSurface.brandMentioned ? `${engine} recommends you` : `${engine} does not mention you`);
    const competitors = question.competitors.length ? ` · Competitors cited: ${question.competitors.join(", ")}` : " · No clear competitor cited";
    return aiSurface.status === "checked" ? `${label}${competitors}` : (aiSurface.unavailableReason ?? `${engine} unavailable; try again.`);
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
  const business = category && category !== "your type of business" ? category : "your business type";

  if (hasCompetitors) {
    return `What to fix: add a clear page about ${business}, with proof, reviews, and direct answers to buyer questions.`;
  }

  return `What to fix: make your site clearer about ${business}, your proof, and why buyers should choose you.`;
}

function treatmentProof(brandName: string, category: string | undefined, questions: BuyerIntentPromptResult[], competitors: string[], engine: string) {
  const question = questions.find((item) => item.available && !item.brandMentioned)
    ?? questions.find((item) => item.available && item.competitors.length > 0)
    ?? questions.find((item) => item.available)
    ?? questions[0];

  if (!question) return null;

  const business = category && category !== "your type of business" ? category : "your business type";
  const citedCompetitors = uniqueNames([...question.competitors, ...competitors]).slice(0, 3);
  const competitorText = citedCompetitors.length
    ? `${engine} already cites ${citedCompetitors.join(", ")} for this topic, so the page should explain why buyers should choose ${brandName} without attacking them.`
    : `No clear competitor is cited for this topic, so the page should make ${brandName} easier to recommend.`;

  return {
    gap: question.brandMentioned
      ? citedCompetitors.length
        ? `Gap found: ${engine} also cites ${citedCompetitors.join(", ")} for “${question.prompt}”.`
        : `Question checked: “${question.prompt}”.`
      : `Gap found: ${engine} does not cite ${brandName} for “${question.prompt}”.`,
    title: `FAQ/page to create: “${question.prompt}”`,
    draft: `Draft answer to publish after review: “If you are comparing ${business}, start with your use case, available proof, and the next step. ${brandName} should present its use cases, reviews or verifiable proof, and a direct answer to this question. ${competitorText}”`,
  };
}

function StatusPill({ failed, complete }: { failed: boolean; complete: boolean }) {
  const label = failed ? "Failed" : complete ? "Complete" : "Running";
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
  const answerEngine = audit.raw_results?.answerEngine;
  const answerEngineName = answerEngine?.engine ?? questions.flatMap((question) => question.surfaces).find((surface) => surface.kind === "ai_engine")?.engine ?? "Gemini";
  const isAnswerEngineReport = questions.some((question) => question.surfaces.some((surface) => surface.kind === "ai_engine"));
  const isAgentReport = audit.raw_results?.auditTier === "agent_49eur";
  const isMonitorReport = audit.raw_results?.auditTier === "monitor_9eur";
  const isFreeReport = !isAgentReport && !isMonitorReport;
  const topCompetitor = rankedCompetitors[0]?.name ?? competitors[0];
  const score = audit.score ?? 0;
  const color = scoreColor(score);
  const proof = complete && !failed && isAgentReport ? treatmentProof(audit.brand_name, audit.raw_results?.category, questions, competitors, answerEngineName) : null;
  const monitorActions = audit.raw_results?.monitoring?.actions?.slice(0, 3) ?? [];
  const phrases = [
    questionCount > 0
      ? isAnswerEngineReport
        ? `${brandMentionCount > 0 ? `${answerEngineName} recommends you` : `${answerEngineName} does not mention you`} (${brandMentionCount}/${questionCount} questions).`
        : `You are cited ${brandMentionCount} times across ${questionCount} questions.`
      : "No buyer question could be checked yet.",
    topCompetitor
      ? `${topCompetitor} is showing up where you should be.`
      : "No competitor clearly appears in your place.",
    isAgentReport
      ? fixSentence(audit.raw_results?.category, competitors.length > 0)
      : isMonitorReport
        ? "Monitor adds 3 priority actions to tackle this week."
        : "Free diagnostic: score, Gemini recommendation status, and cited competitors.",
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
          <a href={DONE_FOR_YOU_CHECKOUT_URL} className="text-sm font-black text-[#CAFF3C] no-underline" data-ph-capture-attribute-plan="agent_49eur" data-ph-capture-attribute-source="audit_report_nav">
            Fix it for me — €49 →
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
              Simple report for {audit.brand_name}
            </h1>

            <div className="mt-6 grid gap-4 sm:grid-cols-[190px_1fr] sm:items-center">
              <div
                className="grid aspect-square w-40 place-items-center rounded-[2rem] border-[10px] bg-white/[0.03] sm:w-48"
                style={{ borderColor: color, boxShadow: `0 0 42px ${color}2E` }}
                aria-label={complete ? `Score ${score} out of 100` : "Score running"}
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
                  Could not run the report: {audit.raw_results?.error ?? "unknown error"}
                </div>
              ) : !complete ? (
                <div className="rounded-2xl border border-[#FFB84D]/20 bg-[#FFB84D]/10 p-4 text-sm font-bold leading-6 text-[#FFD18A]">
                  Wait 20–60 seconds: checking real results without inventing anything.
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

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href={DONE_FOR_YOU_CHECKOUT_URL} className="inline-flex justify-center rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] no-underline transition hover:brightness-110" data-ph-capture-attribute-plan="agent_49eur" data-ph-capture-attribute-source="audit_report_primary">
                Fix it for me — €49 →
              </a>
              {complete && !failed && isFreeReport ? (
                <a href={MONITOR_CHECKOUT_URL} className="inline-flex justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-black text-[#D6D6DF] no-underline transition hover:border-[#CAFF3C]/40 hover:text-[#CAFF3C]" data-ph-capture-attribute-plan="monitor_9eur" data-ph-capture-attribute-source="audit_report_secondary">
                  Or monitor monthly — €9 →
                </a>
              ) : null}
            </div>
          </div>

          {complete && !failed ? (
            <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
              <div className="mb-4 flex items-end justify-between gap-4">
                <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                  {isAnswerEngineReport ? `Competitors cited by ${answerEngineName}` : "Brands found in web_search results"}
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
                  No brand names found in the available answers.
                </div>
              )}
            </section>
          ) : null}

          {complete && !failed && isFreeReport ? (
            <section className="rounded-[1.5rem] border border-[#CAFF3C]/20 bg-[#CAFF3C]/[0.055] p-5 sm:p-6">
              <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">Secondary option · Monitor €9</p>
              <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                Want monthly tracking instead?
              </h2>
              <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">
                The free report stops at your score, Gemini recommendation status, and cited competitors. Monitor adds 3 concrete priorities and monthly Gemini tracking. The €49 fix remains the fastest path if you want it handled for you.
              </p>
              <a href={MONITOR_CHECKOUT_URL} className="mt-5 inline-flex rounded-xl border border-white/15 px-5 py-3 text-sm font-black text-[#D6D6DF] no-underline transition hover:border-[#CAFF3C]/40 hover:text-[#CAFF3C]" data-ph-capture-attribute-plan="monitor_9eur" data-ph-capture-attribute-source="free_audit_report_secondary">
                Monitor monthly — €9 →
              </a>
            </section>
          ) : null}

          {complete && !failed && isMonitorReport ? (
            <section className="rounded-[1.5rem] border border-[#CAFF3C]/20 bg-[#CAFF3C]/[0.055] p-5 sm:p-6">
              <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">Monitor €9</p>
              <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                3 priority actions to tackle this week
              </h2>
              {monitorActions.length ? (
                <ol className="m-0 mt-4 grid list-none gap-3 p-0">
                  {monitorActions.map((action, index) => (
                    <li key={`${action.title}-${index}`} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                      <p className="m-0 text-sm font-black text-[#CAFF3C]">{index + 1}. {action.title}</p>
                      <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#F0F0EC]">{action.doThis}</p>
                      <p className="m-0 mt-2 text-xs font-bold uppercase tracking-[0.08em] text-[#8E8E9A]">Where: {action.where}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">Actions will appear as soon as the Monitor report finishes.</p>
              )}
            </section>
          ) : null}

          {complete && !failed && !isFreeReport ? (
            <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
              <div className="mb-4 flex items-end justify-between gap-4">
                <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                  {isAnswerEngineReport ? `Questions asked to ${answerEngineName}` : "Buyer web searches checked"}
                </h2>
                <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-black text-[#BCBCC8]">
                  {isAnswerEngineReport ? `${answerEngineName} · ${answerEngine?.model ?? questions.flatMap((question) => question.surfaces).find((surface) => surface.kind === "ai_engine")?.model ?? "model unknown"}` : "Native web_search"}
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
                  {isAnswerEngineReport ? `${answerEngineName} unavailable; try again.` : "Native web_search unavailable; this report uses only checks that completed."}
                </div>
              )}
            </section>
          ) : null}

          {proof ? (
            <section className="rounded-[1.5rem] border border-[#CAFF3C]/20 bg-[#CAFF3C]/[0.055] p-5 sm:p-6">
              <p className="m-0 mb-3 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">€49 fix — concrete example</p>
              <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                A fix generated from a real signal
              </h2>
              <div className="mt-4 grid gap-3">
                <p className="m-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm font-black leading-6 text-[#F0F0EC]">{proof.gap}</p>
                <p className="m-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm font-black leading-6 text-[#CAFF3C]">{proof.title}</p>
                <p className="m-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm font-bold leading-6 text-[#D6D6DF]">{proof.draft}</p>
              </div>
              <a href={DONE_FOR_YOU_CHECKOUT_URL} className="mt-5 inline-flex rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] no-underline transition hover:brightness-110" data-ph-capture-attribute-plan="agent_49eur" data-ph-capture-attribute-source="audit_report_proof">
                Fix it for me — €49 →
              </a>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
