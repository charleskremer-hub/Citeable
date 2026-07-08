import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AGENT_CHECKOUT_URL, MONITOR_CHECKOUT_URL } from "@/lib/checkout-links";
import { ensureAuditSchema, pool } from "@/lib/db";
import { auditCopy, brandSentimentText, localeFromHeaders, localizePlainAction, recommendationText, type Locale } from "@/lib/i18n";
import type { BrandSentiment, BuyerIntentPromptResult, PlainAction } from "@/lib/audit-engine";
import AuditPoller from "./AuditPoller";

export const dynamic = "force-dynamic";

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
    brandSentiment?: BrandSentiment;
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

function questionEngineSummary(question: BuyerIntentPromptResult, locale: Locale) {
  const aiSurface = question.surfaces.find((surface) => surface.kind === "ai_engine");

  if (aiSurface) {
    const engine = aiSurface.engine ?? "Gemini";
    const label = recommendationText(engine, aiSurface.brandMentioned, locale);
    const competitors = question.competitors.length
      ? locale === "fr" ? ` · Concurrents cités : ${question.competitors.join(", ")}` : ` · Competitors cited: ${question.competitors.join(", ")}`
      : locale === "fr" ? " · Aucun concurrent clair cité" : " · No clear competitor cited";
    return aiSurface.status === "checked" ? `${label}${competitors}` : (aiSurface.unavailableReason ?? (locale === "fr" ? `${engine} est indisponible ; réessaie.` : `${engine} unavailable; try again.`));
  }

  const checked = question.surfaces.filter((surface) => surface.kind === "supplementary" && surface.status === "checked");
  const unavailable = question.surfaces.filter((surface) => surface.kind === "supplementary" && surface.status !== "checked");

  if (checked.length > 0) {
    return checked.map((surface) => `${surface.surface}: ${surface.brandMentioned ? (locale === "fr" ? "marque/domaine trouvé" : "brand/domain found") : (locale === "fr" ? "marque/domaine non trouvé" : "brand/domain not found")}`).join(" · ");
  }

  return unavailable[0]?.unavailableReason ?? (locale === "fr" ? "web_search natif indisponible ; ce rapport utilise uniquement les vérifications terminées." : "Native web_search unavailable; this report uses only checks that completed.");
}

function checkedQuestions(questions: BuyerIntentPromptResult[]) {
  const available = questions.filter((question) => question.available);
  return available.length ? available : questions;
}

function fixSentence(category: string | undefined, hasCompetitors: boolean, locale: Locale) {
  const business = category && category !== "your type of business" ? category : locale === "fr" ? "ton activité" : "your business type";

  if (hasCompetitors) {
    return locale === "fr"
      ? `À corriger : ajoute une page claire sur ${business}, avec des preuves, des avis et des réponses directes aux questions d'achat.`
      : `What to fix: add a clear page about ${business}, with proof, reviews, and direct answers to buyer questions.`;
  }

  return locale === "fr"
    ? `À corriger : rends ton site plus clair sur ${business}, tes preuves et les raisons de te choisir.`
    : `What to fix: make your site clearer about ${business}, your proof, and why buyers should choose you.`;
}

function treatmentProof(brandName: string, category: string | undefined, questions: BuyerIntentPromptResult[], competitors: string[], engine: string, locale: Locale) {
  const question = questions.find((item) => item.available && !item.brandMentioned)
    ?? questions.find((item) => item.available && item.competitors.length > 0)
    ?? questions.find((item) => item.available)
    ?? questions[0];

  if (!question) return null;

  const business = category && category !== "your type of business" ? category : locale === "fr" ? "ton activité" : "your business type";
  const citedCompetitors = uniqueNames([...question.competitors, ...competitors]).slice(0, 3);

  if (locale === "fr") {
    const competitorText = citedCompetitors.length
      ? `${engine} cite déjà ${citedCompetitors.join(", ")} sur ce sujet. La page doit expliquer pourquoi choisir ${brandName}, sans les attaquer.`
      : `Aucun concurrent clair n'est cité sur ce sujet. La page doit rendre ${brandName} plus facile à recommander.`;

    return {
      gap: question.brandMentioned
        ? citedCompetitors.length
          ? `Écart trouvé : ${engine} cite aussi ${citedCompetitors.join(", ")} pour « ${question.prompt} ».`
          : `Question vérifiée : « ${question.prompt} ».`
        : `Écart trouvé : ${engine} ne cite pas ${brandName} pour « ${question.prompt} ».`,
      title: `FAQ/page à créer : « ${question.prompt} »`,
      draft: `Brouillon FAQ à publier après relecture : « Si tu compares ${business}, commence par ton besoin, les preuves disponibles et la prochaine étape. ${brandName} doit présenter ses cas d'usage, ses avis ou preuves vérifiables, puis répondre directement à cette question. ${competitorText} »`,
      google: `Phrase Google Business à coller : « ${brandName} aide les clients à comparer ${business} avec des informations claires, des preuves vérifiables et une prochaine étape simple. »`,
    };
  }

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
    draft: `FAQ draft to publish after review: “If you are comparing ${business}, start with your use case, available proof, and the next step. ${brandName} should present its use cases, reviews or verifiable proof, and a direct answer to this question. ${competitorText}”`,
    google: `Google Business sentence to paste: “${brandName} helps buyers compare ${business} with clear information, verifiable proof, and a simple next step.”`,
  };
}

function firstRealGapQuestion(questions: BuyerIntentPromptResult[]) {
  return questions.find((question) => question.available && (!question.brandMentioned || question.competitors.length > 0));
}

function gapFixDetailLines(question: BuyerIntentPromptResult, action: PlainAction, locale: Locale) {
  const citedCompetitors = uniqueNames(question.competitors).slice(0, 3);

  if (locale === "fr") {
    const competitorLine = citedCompetitors.length ? `Concurrents vus sur ce gap : ${citedCompetitors.join(", ")}.` : "Objectif : rendre la marque assez claire pour être citée sur ce gap.";

    return [
      `À faire : crée une page ou section qui répond à cette requête exacte : « ${question.prompt} ».`,
      competitorLine,
      `Où le publier : ${action.where}`,
      `Basé sur : ${question.prompt}`,
    ];
  }

  const competitorLine = citedCompetitors.length ? `Competitors seen on this gap: ${citedCompetitors.join(", ")}.` : "Goal: make the brand clear enough to be cited for this gap.";

  return [
    `To do: create a page or section that answers this exact query: “${question.prompt}”.`,
    competitorLine,
    `Where to publish it: ${action.where}`,
    `Based on: ${question.prompt}`,
  ];
}

function gapHook(brandName: string, question: BuyerIntentPromptResult, engine: string, locale: Locale) {
  const citedCompetitors = uniqueNames(question.competitors).slice(0, 3);

  if (!question.brandMentioned) {
    return locale === "fr"
      ? `Gap réel : ${engine} ne cite pas ${brandName} pour « ${question.prompt} ».`
      : `Real gap: ${engine} does not mention ${brandName} for “${question.prompt}”.`;
  }

  if (citedCompetitors.length) {
    return locale === "fr"
      ? `À renforcer : ${engine} cite aussi ${citedCompetitors.join(", ")} pour « ${question.prompt} ».`
      : `Needs reinforcement: ${engine} also cites ${citedCompetitors.join(", ")} for “${question.prompt}”.`;
  }

  return locale === "fr"
    ? `Signal vérifié sur « ${question.prompt} ».`
    : `Verified signal for “${question.prompt}”.`;
}

function priorityFixTeaser(brandName: string, questions: BuyerIntentPromptResult[], actions: PlainAction[], engine: string, locale: Locale) {
  const gapQuestion = firstRealGapQuestion(questions);
  const priorityAction = actions.find((action) => action.basedOn?.includes(gapQuestion?.prompt ?? ""));

  if (!gapQuestion || !priorityAction) return null;

  return {
    title: priorityAction.title,
    hook: gapHook(brandName, gapQuestion, engine, locale),
    detailLines: gapFixDetailLines(gapQuestion, priorityAction, locale),
  };
}

function StatusPill({ failed, complete, locale }: { failed: boolean; complete: boolean; locale: Locale }) {
  const copy = auditCopy[locale];
  const label = failed ? copy.status.failed : complete ? copy.status.complete : copy.status.running;
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
  const locale = localeFromHeaders(await headers());
  const copy = auditCopy[locale];
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
  const proof = complete && !failed ? treatmentProof(audit.brand_name, audit.raw_results?.category, questions, competitors, answerEngineName, locale) : null;
  const monitorActions = (audit.raw_results?.monitoring?.actions?.slice(0, 3) ?? []).map((action) => localizePlainAction(action, locale));
  const freeFixTeaser = complete && !failed && isFreeReport ? priorityFixTeaser(audit.brand_name, questions, monitorActions, answerEngineName, locale) : null;
  const sentimentLine = brandSentimentText(audit.raw_results?.brandSentiment ?? { label: "not_enough_signal", justification: "not enough signal" }, locale);
  const phrases = [
    questionCount > 0
      ? isAnswerEngineReport
        ? `${recommendationText(answerEngineName, brandMentionCount > 0, locale)} (${brandMentionCount}/${questionCount} ${locale === "fr" ? "questions" : "questions"}).`
        : locale === "fr" ? `Tu es cité ${brandMentionCount} fois sur ${questionCount} questions.` : `You are cited ${brandMentionCount} times across ${questionCount} questions.`
      : locale === "fr" ? "Aucune question d'achat n'a encore pu être vérifiée." : "No buyer question could be checked yet.",
    sentimentLine,
    topCompetitor
      ? locale === "fr" ? `${topCompetitor} apparaît là où tu devrais apparaître.` : `${topCompetitor} is showing up where you should be.`
      : locale === "fr" ? "Aucun concurrent clair n'apparaît à ta place." : "No competitor clearly appears in your place.",
    isAgentReport
      ? fixSentence(audit.raw_results?.category, competitors.length > 0, locale)
      : isMonitorReport
        ? locale === "fr" ? "Monitor ajoute 3 actions prioritaires pour cette semaine." : "Monitor adds 3 priority actions for this week."
        : locale === "fr" ? "Diagnostic gratuit : score, sentiment IA, statut de recommandation Gemini et concurrents cités." : "Free diagnostic: score, AI sentiment, Gemini recommendation status, and cited competitors.",
  ];

  return (
    <main className="min-h-screen bg-[#09090B] text-[#F0F0EC]" style={{ fontFamily: "var(--font-sans)" }}>
      <AuditPoller
        auditId={audit.id}
        email={audit.email}
        brandName={audit.brand_name}
        websiteUrl={audit.website_url}
        complete={complete || failed}
        locale={locale}
      />

      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <nav className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="text-xl text-[#F0F0EC] no-underline" style={{ fontFamily: "var(--font-display)" }}>
            Citeable
          </Link>
          <a href={AGENT_CHECKOUT_URL} className="text-sm font-black text-[#CAFF3C] no-underline" data-ph-capture-attribute-plan="agent_49eur" data-ph-capture-attribute-source="audit_report_nav">
            {copy.navCta}
          </a>
        </nav>

        <div className="flex flex-1 flex-col justify-center gap-4 pb-8 sm:gap-5">
          <div className="rounded-[2rem] border border-white/[0.08] bg-[#111116] p-5 shadow-2xl shadow-black/30 sm:p-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <StatusPill failed={failed} complete={complete} locale={locale} />
              <a href={audit.website_url} className="max-w-full truncate text-sm font-bold text-[#8E8E9A] underline decoration-white/10 underline-offset-4">
                {audit.website_url}
              </a>
            </div>

            <h1 className="text-[clamp(2rem,12vw,4.25rem)] leading-[0.95] tracking-[-0.05em]" style={{ fontFamily: "var(--font-display)" }}>
              {copy.title(audit.brand_name)}
            </h1>

            <div className="mt-6 grid gap-4 sm:grid-cols-[190px_1fr] sm:items-center">
              <div
                className="grid aspect-square w-40 place-items-center rounded-[2rem] border-[10px] bg-white/[0.03] sm:w-48"
                style={{ borderColor: color, boxShadow: `0 0 42px ${color}2E` }}
                aria-label={complete ? copy.scoreAria(score) : copy.scoreRunningAria}
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
                  {copy.failedPrefix} {audit.raw_results?.error ?? copy.unknownError}
                </div>
              ) : !complete ? (
                <div className="rounded-2xl border border-[#FFB84D]/20 bg-[#FFB84D]/10 p-4 text-sm font-bold leading-6 text-[#FFD18A]">
                  {copy.runningText}
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
              <a href={AGENT_CHECKOUT_URL} className="inline-flex justify-center rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] no-underline transition hover:brightness-110" data-ph-capture-attribute-plan="agent_49eur" data-ph-capture-attribute-source="audit_report_primary">
                {copy.primaryCta}
              </a>
              {complete && !failed && isFreeReport ? (
                <a href={MONITOR_CHECKOUT_URL} className="inline-flex justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-black text-[#D6D6DF] no-underline transition hover:border-[#CAFF3C]/40 hover:text-[#CAFF3C]" data-ph-capture-attribute-plan="monitor_9eur" data-ph-capture-attribute-source="audit_report_secondary">
                  {copy.monitorCta}
                </a>
              ) : null}
            </div>
            <p className="m-0 mt-3 text-xs font-bold leading-5 text-[#8E8E9A]">{copy.reportReassurance}</p>
          </div>

          {complete && !failed ? (
            <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
              <div className="mb-4 flex items-end justify-between gap-4">
                <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                  {isAnswerEngineReport ? copy.competitorsTitle(answerEngineName) : copy.webSearchTitle}
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
                  {copy.noBrands}
                </div>
              )}
            </section>
          ) : null}

          {freeFixTeaser ? (
            <section className="relative overflow-hidden rounded-[1.5rem] border border-[#CAFF3C]/30 bg-[radial-gradient(circle_at_top_left,rgba(202,255,60,0.14),rgba(17,17,22,0.96)_42%)] p-5 shadow-2xl shadow-[#CAFF3C]/5 sm:p-6" data-testid="agent-fix-teaser">
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[#CAFF3C]/30 bg-[#CAFF3C]/10 text-xl" aria-hidden="true">
                  🔒
                </div>
                <div>
                  <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">
                    {locale === "fr" ? "Teaser Agent · correctif réel" : "Agent teaser · real fix"}
                  </p>
                  <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                    {freeFixTeaser.title}
                  </h2>
                  <p className="m-0 mt-3 text-sm font-black leading-6 text-[#F0F0EC]">{freeFixTeaser.hook}</p>
                </div>
              </div>

              <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30">
                <div className="grid gap-3 p-4 text-sm font-bold leading-6 text-[#D6D6DF] blur-[5px] select-none" aria-hidden="true">
                  {freeFixTeaser.detailLines.map((line) => (
                    <p key={line} className="m-0 rounded-xl border border-white/[0.06] bg-white/[0.04] p-3">
                      {line}
                    </p>
                  ))}
                </div>
                <div className="absolute inset-0 grid place-items-center bg-[#09090B]/42 px-4 text-center backdrop-blur-[2px]">
                  <div className="rounded-2xl border border-[#CAFF3C]/25 bg-[#09090B]/85 px-4 py-3 shadow-2xl shadow-black/35">
                    <p className="m-0 text-2xl" aria-hidden="true">🔒</p>
                    <p className="m-0 mt-1 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">
                      {locale === "fr" ? "Détail du correctif verrouillé" : "Fix details locked"}
                    </p>
                  </div>
                </div>
              </div>

              <a href={AGENT_CHECKOUT_URL} className="mt-5 inline-flex w-full justify-center rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] no-underline transition hover:brightness-110 sm:w-auto" data-ph-capture-attribute-plan="agent_49eur" data-ph-capture-attribute-source="report_teaser">
                {copy.reportTeaserCta}
              </a>
              <p className="m-0 mt-3 text-xs font-bold leading-5 text-[#8E8E9A]">{copy.reportReassurance}</p>
            </section>
          ) : null}

          {complete && !failed && isFreeReport ? (
            <section className="rounded-[1.5rem] border border-[#CAFF3C]/20 bg-[#CAFF3C]/[0.055] p-5 sm:p-6">
              <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.secondaryEyebrow}</p>
              <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                {copy.secondaryTitle}
              </h2>
              <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">
                {copy.secondaryBody}
              </p>
              <a href={MONITOR_CHECKOUT_URL} className="mt-5 inline-flex rounded-xl border border-white/15 px-5 py-3 text-sm font-black text-[#D6D6DF] no-underline transition hover:border-[#CAFF3C]/40 hover:text-[#CAFF3C]" data-ph-capture-attribute-plan="monitor_9eur" data-ph-capture-attribute-source="free_audit_report_secondary">
                {copy.secondaryCta}
              </a>
              <p className="m-0 mt-3 text-xs font-bold leading-5 text-[#8E8E9A]">{copy.reportReassurance}</p>
            </section>
          ) : null}

          {complete && !failed && isMonitorReport ? (
            <section className="rounded-[1.5rem] border border-[#CAFF3C]/20 bg-[#CAFF3C]/[0.055] p-5 sm:p-6">
              <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.monitorEyebrow}</p>
              <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                {copy.monitorTitle}
              </h2>
              {monitorActions.length ? (
                <ol className="m-0 mt-4 grid list-none gap-3 p-0">
                  {monitorActions.map((action, index) => (
                    <li key={`${action.title}-${index}`} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                      <p className="m-0 text-sm font-black text-[#CAFF3C]">{index + 1}. {action.title}</p>
                      <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#F0F0EC]">{action.doThis}</p>
                      <p className="m-0 mt-2 text-xs font-bold uppercase tracking-[0.08em] text-[#8E8E9A]">{copy.where} {action.where}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">{copy.monitorEmpty}</p>
              )}
            </section>
          ) : null}

          {complete && !failed && !isFreeReport ? (
            <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
              <div className="mb-4 flex items-end justify-between gap-4">
                <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                  {isAnswerEngineReport ? copy.questionsTitle(answerEngineName) : copy.webQuestionsTitle}
                </h2>
                <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-black text-[#BCBCC8]">
                  {isAnswerEngineReport ? answerEngineName : copy.nativeWebSearch}
                </span>
              </div>

              {questions.length ? (
                <ol className="m-0 grid list-none gap-2 p-0">
                  {questions.map((question) => (
                    <li key={question.prompt} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                      <p className="m-0 text-sm font-black text-[#F0F0EC]">{question.prompt}</p>
                      <p className="m-0 mt-2 text-sm font-bold text-[#BCBCC8]">{questionEngineSummary(question, locale)}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="rounded-2xl border border-[#FF8A8A]/20 bg-[#FF5F5F]/10 p-4 text-sm font-bold text-[#FFB1B1]">
                  {isAnswerEngineReport ? copy.engineUnavailable(answerEngineName) : copy.webUnavailable}
                </div>
              )}
            </section>
          ) : null}

          {proof ? (
            <section className="rounded-[1.5rem] border border-[#CAFF3C]/20 bg-[#CAFF3C]/[0.055] p-5 sm:p-6">
              <p className="m-0 mb-3 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.proofEyebrow}</p>
              <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                {copy.proofTitle}
              </h2>
              <div className="mt-4 grid gap-3">
                <p className="m-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm font-black leading-6 text-[#F0F0EC]">{proof.gap}</p>
                <p className="m-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm font-black leading-6 text-[#CAFF3C]">{proof.title}</p>
                <p className="m-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm font-bold leading-6 text-[#D6D6DF]">{proof.draft}</p>
                <p className="m-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm font-bold leading-6 text-[#D6D6DF]">{proof.google}</p>
              </div>
              <a href={AGENT_CHECKOUT_URL} className="mt-5 inline-flex rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] no-underline transition hover:brightness-110" data-ph-capture-attribute-plan="agent_49eur" data-ph-capture-attribute-source="audit_report_proof">
                {copy.primaryCta}
              </a>
              <p className="m-0 mt-3 text-xs font-bold leading-5 text-[#8E8E9A]">{copy.reportReassurance}</p>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
