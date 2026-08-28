import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { MONITOR_CHECKOUT_URL } from "@/lib/checkout-links";
import { ensureAuditSchema, pool } from "@/lib/db";
import { recordReportLinkOpened } from "@/lib/funnel";
import { auditCopy, brandSentimentView, localeFromHeaders, localeFromUnknown, localizeCategoryLabel, localizePlainAction, type Locale } from "@/lib/i18n";
import { categoryPerceptionFromPrompts, extractSourceCitationReports, generateGeoAgentAssetsFromAudit, isAnonymousEmail, isAuditedBrandName, robotsTxtFixForBlockedCrawlers, youtubeContentTipIsRelevant } from "@/lib/audit-engine";
import type { BrandSentiment, BuyerIntentPromptResult, CategoryPerception, IcpSegmentMetadata, PlainAction, SourceCitationReport } from "@/lib/audit-engine";
import { AUDIT_SHARE_TOKEN_PARAM, verifyAuditShareToken } from "@/lib/audit-share-token";
import { resolveReportAccess } from "@/lib/report-access";
import { entitlementForEmail } from "@/lib/subscriptions";
import LocaleLang from "@/app/LocaleLang";
import AuditPoller from "./AuditPoller";
import ReportViewBeacon from "./ReportViewBeacon";
import AgentAuditChat from "./AgentAuditChat";
import FunnelCheckoutLink from "./FunnelCheckoutLink";
import { VisibilityMonitorCard } from "./VisibilityMonitorCard";
import PublishContent from "./PublishContent";
import QuestionList from "./QuestionList";
import ClaimReportGate from "./ClaimReportGate";
import LockedVerdict from "./LockedVerdict";
import PaidReportGate from "./PaidReportGate";
import { checkAiCrawlability } from "./ai-crawlability";
import {
  checkedQuestions,
  competitorCounts,
  lockedVerdictHeadline,
  lostBuyerQuestions,
  priorityGapQuestions,
  promptAnalysis,
  publishTeaserItems,
  rankActionsByImpact,
  scoreColor,
  treatmentProof,
  treatmentProofForQuestion,
  uniqueNames,
  verdictCompetitors,
  verdictRival,
  type PromptState,
} from "./report-insights";

export const dynamic = "force-dynamic";

/**
 * LA PAGE DIT UNE CHOSE ET PROPOSE UN GESTE (lot 1, commande du 28/08).
 *
 * Rapport VERROUILLÉ : le verdict en trois blocs, puis LA porte (Claim/Paid).
 * Rapport OUVERT — quatre blocs, UN bouton : 1. LE VERDICT (rival nommé
 * uniquement via le plancher `verdictCompetitors`, score et catégorie en ligne
 * secondaire) · 2. « À PUBLIER », un seul bloc, verrouillé derrière Monitor
 * (le tier gratuit voit ce qu'il obtiendra, nommé et compté, jamais le
 * contenu) · 3. UN SEUL bouton Monitor 9 € — Agent 19 € a quitté la page ·
 * 4. LES QUESTIONS, la preuve, repliées dans un <details>.
 * La règle d'accès vit dans src/lib/report-access.ts et ne bouge pas.
 */

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
    icpSegment?: IcpSegmentMetadata;
    auditTier?: string;
    anonymous?: boolean;
    answerEngine?: { engine?: string; model?: string; realLlmCall?: boolean };
    brandSentiment?: BrandSentiment;
    categoryPerception?: CategoryPerception;
    structuredDataFound?: boolean;
    locale?: string;
    buyerIntentPrompts?: BuyerIntentPromptResult[];
    monitoring?: { actions?: PlainAction[]; sources?: SourceCitationReport[]; trend?: { score: number; createdAt: string }[]; scoreDelta?: number | null };
  } | null;
};

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

/**
 * Un abonnement actif est-il rattaché à cet audit ? Le rattachement passe par
 * l'EMAIL (seul identifiant partagé avec Stripe, voir src/lib/subscriptions.ts).
 * FAIL-SAFE : toute panne de base rend `false` — ne pas pouvoir prouver le
 * droit n'est pas une raison de l'accorder.
 */
async function hasActiveSubscriptionForAudit(email: string): Promise<boolean> {
  if (!email || isAnonymousEmail(email)) return false;
  try {
    return (await entitlementForEmail(email)) !== null;
  } catch {
    return false;
  }
}

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const headerLocale = localeFromHeaders(await headers());
  await ensureAuditSchema();

  const result = await pool.query<AuditRow>(`SELECT * FROM audits WHERE id = $1`, [id]);
  const audit = result.rows[0];

  if (!audit) notFound();

  const locale = audit.raw_results?.locale ? localeFromUnknown(audit.raw_results.locale) : headerLocale;
  const copy = auditCopy[locale];
  const fr = locale === "fr";

  const failed = audit.raw_results?.status === "failed";
  const icpSegment = audit.raw_results?.icpSegment;
  const complete = audit.score !== null;
  // Filet : d'anciens audits contiennent la marque elle-même dans ses
  // concurrents (« Pick » pour « GetPick ») — on ne l'affiche plus.
  const auditDomain = (() => {
    try {
      return new URL(audit.website_url).hostname;
    } catch {
      return audit.website_url.replace(/^https?:\/\//i, "").split("/")[0] ?? "";
    }
  })();
  const isSelf = (name: string) => isAuditedBrandName(name, audit.brand_name, auditDomain);
  const questions = checkedQuestions(audit.raw_results?.buyerIntentPrompts ?? []).map((question) => ({
    ...question,
    competitors: question.competitors.filter((name) => !isSelf(name)),
  }));
  const questionCount = complete ? questions.length : 0;
  const brandMentionCount = complete ? questions.filter((question) => question.brandMentioned).length : 0;
  const answerEngine = audit.raw_results?.answerEngine;
  const answerEngineName = answerEngine?.engine ?? questions.flatMap((question) => question.surfaces).find((surface) => surface.kind === "ai_engine")?.engine ?? "Gemini";
  const isAnswerEngineReport = questions.some((question) => question.surfaces.some((surface) => surface.kind === "ai_engine"));
  const isAgentReport = audit.raw_results?.auditTier === "agent_19eur" || audit.raw_results?.auditTier === "agent_49eur";
  const isMonitorReport = audit.raw_results?.auditTier === "monitor_9eur";
  const isFreeReport = !isAgentReport && !isMonitorReport;

  // `report_viewed` N'EST PLUS ENREGISTRÉ ICI : ce rendu serveur se répète (F5,
  // poller, crawlers). L'événement part du navigateur, une fois par session,
  // filtré : voir ReportViewBeacon et src/lib/traffic-filter.ts.
  const shareTokenParam = query?.[AUDIT_SHARE_TOKEN_PARAM];
  const shareToken = Array.isArray(shareTokenParam) ? shareTokenParam[0] : shareTokenParam;
  // UN SEUL appel à `verifyAuditShareToken` par requête : deux vérifications,
  // c'est un HMAC inutile et deux vérités possibles pour la même requête.
  const shareTokenValid = verifyAuditShareToken(audit.id, shareToken);
  const reportAccess = resolveReportAccess({
    auditTier: audit.raw_results?.auditTier,
    emailIsAnonymous: isAnonymousEmail(audit.email),
    complete,
    failed,
    hasActiveSubscription: await hasActiveSubscriptionForAudit(audit.email),
    shareTokenValid,
  });

  // Le lien de PROSPECTION a été ouvert : écrit AVANT le rendu, côté serveur.
  // Dédup par audit/classe/jour dans `recordReportLinkOpened` (src/lib/funnel.ts).
  await recordReportLinkOpened({
    auditId: audit.id,
    shareTokenValid,
    requestHeaders: await headers(),
  });

  // --- RAPPORT VERROUILLÉ : le verdict tient en trois blocs, puis la porte. ---
  if (reportAccess.locked) {
    const lostQuestions = lostBuyerQuestions(questions);
    const headline = lockedVerdictHeadline({
      brandName: audit.brand_name,
      engineName: answerEngineName,
      questionCount,
      brandMentionCount,
      lostCount: lostQuestions.length,
      competitors: verdictCompetitors(questions),
      locale,
    });

    return (
      <main className="min-h-screen bg-[#09090B] text-[#F0F0EC]" style={{ fontFamily: "var(--font-sans)" }}>
        <LocaleLang locale={locale} />
        <ReportViewBeacon
          auditId={audit.id}
          brandName={audit.brand_name}
          websiteUrl={audit.website_url}
          auditTier={audit.raw_results?.auditTier ?? "free"}
          complete={complete}
          failed={failed}
        />

        <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
          <nav className="mb-6 flex items-center justify-between gap-4">
            <Link href="/" className="text-xl text-[#F0F0EC] no-underline" style={{ fontFamily: "var(--font-display)" }}>
              GetPick
            </Link>
          </nav>

          <div className="flex flex-1 flex-col justify-center gap-4 pb-8 sm:gap-5">
            <LockedVerdict
              brandName={audit.brand_name}
              websiteUrl={audit.website_url}
              headline={headline}
              lostQuestions={lostQuestions.slice(0, 3).map((question) => question.prompt)}
              locale={locale}
            />

            {reportAccess.reason === "claim" ? (
              <ClaimReportGate auditId={audit.id} locale={locale} />
            ) : (
              <PaidReportGate auditId={audit.id} isAgentReport={isAgentReport} locale={locale} />
            )}
          </div>
        </section>
      </main>
    );
  }

  // --- RAPPORT OUVERT (ou en cours, ou échoué) : quatre blocs, un bouton. ---

  const competitors = uniqueNames([
    ...(audit.competitors_found ?? []),
    ...questions.flatMap((question) => question.competitors),
  ])
    .filter((name) => !isSelf(name))
    .slice(0, 12);
  const rankedCompetitors = competitorCounts(
    questions.flatMap((question) => question.competitors).filter((name) => !isSelf(name))
  );
  const totalCompetitorMentions = rankedCompetitors.reduce((sum, item) => sum + item.count, 0);
  const shareOfVoicePct =
    brandMentionCount + totalCompetitorMentions > 0
      ? Math.round((brandMentionCount / (brandMentionCount + totalCompetitorMentions)) * 100)
      : 0;

  const displayCategory = localizeCategoryLabel(audit.raw_results?.category, locale);
  const score = audit.score ?? 0;
  const color = scoreColor(score);
  const lostQuestions = complete && !failed ? lostBuyerQuestions(questions) : [];
  // LE VERDICT : même phrase, même plancher que le rapport verrouillé.
  const verdictHeadline = complete && !failed
    ? lockedVerdictHeadline({
        brandName: audit.brand_name,
        engineName: answerEngineName,
        questionCount,
        brandMentionCount,
        lostCount: lostQuestions.length,
        competitors: verdictCompetitors(questions),
        locale,
      })
    : "";
  const rival = complete && !failed ? verdictRival(questions) : null;
  const proof = complete && !failed && isAgentReport ? treatmentProof(audit.brand_name, displayCategory, questions, competitors, answerEngineName, locale, icpSegment) : null;
  const monitorContentBlocks = complete && !failed && isMonitorReport
    ? priorityGapQuestions(questions).slice(0, 3).map((question) => treatmentProofForQuestion(audit.brand_name, displayCategory, question, competitors, answerEngineName, locale, icpSegment))
    : [];
  // Impact CALCULÉ : le nombre de questions perdues que chaque action adresse.
  const monitorActions = rankActionsByImpact(audit.raw_results?.monitoring?.actions ?? [], questions).map((ranked) => ({
    ...ranked,
    action: localizePlainAction(ranked.action, locale),
  }));
  const youtubeTipSources =
    audit.raw_results?.monitoring?.sources ?? extractSourceCitationReports(audit.raw_results?.buyerIntentPrompts ?? []);
  const youtubeTipRelevant = complete && !failed && isMonitorReport && youtubeContentTipIsRelevant(youtubeTipSources);
  const monitoringTrend = (audit.raw_results?.monitoring?.trend ?? [])
    .filter((point) => point && typeof point.score === "number")
    .map((point) => ({ score: point.score, createdAt: point.createdAt }));
  const monitoringScoreDelta = audit.raw_results?.monitoring?.scoreDelta ?? null;
  const promptRows = questions.map((question) => ({ question, analysis: promptAnalysis(question) }));
  const recommendedPromptCount = promptRows.filter((row) => row.analysis.state === "recommended").length;
  const gapPromptCount = promptRows.filter((row) => row.analysis.state === "missing").length;
  const checkedPromptCount = promptRows.filter((row) => row.analysis.state !== "unchecked").length;
  const promptRank = (state: PromptState) => (state === "missing" ? 0 : state === "recommended" ? 1 : 2);
  const sortedPromptRows = [...promptRows].sort((a, b) => promptRank(a.analysis.state) - promptRank(b.analysis.state));
  const sentiment = brandSentimentView(audit.raw_results?.brandSentiment ?? { label: "not_enough_signal", justification: "not enough signal" }, locale);
  // Sans categoryPerception stocké (anciens audits), on recalcule — le repli
  // rend "not_enough_signal", jamais un verdict inventé.
  const categoryPerception: CategoryPerception =
    audit.raw_results?.categoryPerception ?? categoryPerceptionFromPrompts(questions, audit.raw_results?.category ?? "");

  const aiCrawl = complete && !failed ? await checkAiCrawlability(audit.website_url) : null;

  // Fichiers machine : TIERS PAYANTS SEULEMENT. Le tier gratuit ne les calcule
  // même pas — aucun contenu de fichier machine n'existe dans son HTML.
  const technicalAssets = complete && !failed && !isFreeReport
    ? generateGeoAgentAssetsFromAudit({
        id: audit.id,
        brand_name: audit.brand_name,
        website_url: audit.website_url,
        score: audit.score,
        competitors_found: audit.competitors_found,
        raw_results: audit.raw_results
          ? {
              category: audit.raw_results.category,
              buyerIntentPrompts: audit.raw_results.buyerIntentPrompts,
              icpSegment: audit.raw_results.icpSegment,
            }
          : null,
      })
    : null;
  const robotsFix = technicalAssets && aiCrawl?.state === "blocked"
    ? robotsTxtFixForBlockedCrawlers(aiCrawl.blocked, locale)
    : null;
  const jsonLdSnippet = technicalAssets
    ? `<script type="application/ld+json">\n${technicalAssets.faqJsonLd}\n</script>`
    : "";
  const teaserItems = complete && !failed && isFreeReport
    ? publishTeaserItems({
        lostQuestions: lostQuestions.map((question) => question.prompt),
        questionCount,
        blockedBots: aiCrawl?.state === "blocked" ? aiCrawl.blocked : [],
        locale,
      })
    : [];

  return (
    <main className="min-h-screen bg-[#09090B] text-[#F0F0EC]" style={{ fontFamily: "var(--font-sans)" }}>
      <LocaleLang locale={locale} />
      <AuditPoller
        auditId={audit.id}
        email={audit.email}
        brandName={audit.brand_name}
        websiteUrl={audit.website_url}
        complete={complete || failed}
        locale={locale}
      />
      <ReportViewBeacon
        auditId={audit.id}
        brandName={audit.brand_name}
        websiteUrl={audit.website_url}
        auditTier={audit.raw_results?.auditTier ?? "free"}
        complete={complete}
        failed={failed}
      />

      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <nav className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="text-xl text-[#F0F0EC] no-underline" style={{ fontFamily: "var(--font-display)" }}>
            GetPick
          </Link>
        </nav>

        <div className="flex flex-1 flex-col justify-center gap-4 pb-8 sm:gap-5">
          {/* --- BLOC 1 : LE VERDICT ------------------------------------------ */}
          <div className="rounded-[2rem] border border-white/[0.08] bg-[#111116] p-5 shadow-2xl shadow-black/30 sm:p-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <StatusPill failed={failed} complete={complete} locale={locale} />
              <a href={audit.website_url} className="max-w-full truncate text-sm font-bold text-[#8E8E9A] underline decoration-white/10 underline-offset-4">
                {audit.website_url}
              </a>
            </div>

            <h1 className="text-[clamp(1.6rem,8vw,2.6rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
              {copy.title(audit.brand_name)}
            </h1>

            {failed ? (
              <div className="mt-5 rounded-2xl border border-[#FF8A8A]/20 bg-[#FF5F5F]/10 p-4 text-sm font-bold leading-6 text-[#FFB1B1]">
                {copy.failedPrefix} {audit.raw_results?.error ?? copy.unknownError}
              </div>
            ) : !complete ? (
              <div className="mt-5 rounded-2xl border border-[#FFB84D]/20 bg-[#FFB84D]/10 p-4 text-sm font-bold leading-6 text-[#FFD18A]">
                {copy.runningText}
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-3">
                <h2 className="m-0 text-[1.55rem] leading-[1.12] tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>
                  {verdictHeadline}
                </h2>
                {rival ? (
                  <p className="m-0 text-base font-bold leading-6 text-[#C7C7D1]">
                    {rival.replacement
                      ? copy.verdictRivalReplacement(answerEngineName, rival.name, rival.prompt)
                      : copy.verdictRivalAlso(answerEngineName, rival.name, rival.prompt)}
                  </p>
                ) : null}
                {/* Score et catégorie : des chiffres, pas le fait — ligne secondaire. */}
                <p className="m-0 text-sm font-bold text-[#8E8E9A]">
                  {copy.scoreCategoryLine(score, displayCategory)}
                  <span className="ml-2" style={{ color }}>
                    {brandMentionCount}/{questionCount}
                  </span>
                </p>
                {isAnswerEngineReport && answerEngine?.realLlmCall ? (
                  <p
                    className="m-0 flex w-fit items-center gap-1.5 text-xs font-black text-[#8FBF6B]"
                    title={copy.liveCheckDetail(answerEngineName)}
                  >
                    <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#8FBF6B]" />
                    {copy.liveCheckLabel}
                  </p>
                ) : null}
              </div>
            )}

            {/* « L'IA ne sait pas ce que tu vends » — rendu uniquement s'il y a un
                vrai signal : sans catégorie perçue, on n'affiche rien. */}
            {complete && !failed && categoryPerception.status !== "not_enough_signal" ? (
              (() => {
                const mismatch = categoryPerception.status === "mismatch";
                const tone = mismatch ? "#FFB84D" : "#CAFF3C";

                return (
                  <section
                    className="mt-5 rounded-2xl border p-4"
                    style={{ borderColor: `${tone}33`, background: `${tone}0F` }}
                    data-testid="category-perception"
                  >
                    <p className="m-0 text-xs font-black uppercase tracking-[0.12em]" style={{ color: tone }}>
                      {copy.categoryPerceptionEyebrow}
                    </p>
                    <p className="m-0 mt-2 text-base font-black leading-6 text-[#F0F0EC]">
                      {mismatch ? copy.categoryPerceptionMismatchTitle : copy.categoryPerceptionMatchTitle}
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2">
                        <p className="m-0 text-[0.6875rem] font-black uppercase tracking-[0.1em] text-[#8E8E9A]">
                          {copy.categoryPerceptionYouSell}
                        </p>
                        <p className="m-0 mt-1 text-sm font-bold text-[#F0F0EC]">{categoryPerception.actual}</p>
                      </div>
                      <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2">
                        <p className="m-0 text-[0.6875rem] font-black uppercase tracking-[0.1em] text-[#8E8E9A]">
                          {copy.categoryPerceptionAiThinks}
                        </p>
                        <p className="m-0 mt-1 text-sm font-bold" style={{ color: tone }}>
                          {categoryPerception.perceived}
                        </p>
                      </div>
                    </div>
                    <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#C7C7D1]">
                      {mismatch
                        ? copy.categoryPerceptionMismatchBody(answerEngineName)
                        : copy.categoryPerceptionMatchBody(answerEngineName)}
                    </p>
                    {mismatch ? (
                      <p className="m-0 mt-2 text-sm font-black leading-6 text-[#F0F0EC]">
                        {copy.categoryPerceptionMismatchAction}
                      </p>
                    ) : null}
                  </section>
                );
              })()
            ) : null}

            {complete && !failed ? (
              <section
                className="mt-5 rounded-2xl border p-4"
                style={{
                  borderColor: `${sentiment.color}33`,
                  background: `${sentiment.color}0F`,
                }}
                data-testid="brand-sentiment"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="m-0 text-xs font-black uppercase tracking-[0.12em]" style={{ color: sentiment.color }}>
                    {copy.sentimentEyebrow}
                  </p>
                  <span
                    className="rounded-full px-2.5 py-1 text-[0.6875rem] font-black uppercase tracking-[0.1em]"
                    style={{
                      color: sentiment.color,
                      background: `${sentiment.color}22`,
                      border: `1px solid ${sentiment.color}44`,
                    }}
                  >
                    {sentiment.shortLabel}
                  </span>
                </div>
                {sentiment.justification ? (
                  <p className="m-0 mt-2 text-sm font-black leading-6 text-[#F0F0EC]">{sentiment.justification}</p>
                ) : null}
                <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#C7C7D1]">{sentiment.guidance}</p>
              </section>
            ) : null}
          </div>

          {complete && !failed && isMonitorReport ? (
            <VisibilityMonitorCard
              websiteUrl={audit.website_url}
              engine={answerEngineName}
              score={score}
              scoreColor={color}
              recommended={brandMentionCount > 0}
              brandMentionCount={brandMentionCount}
              questionCount={questionCount}
              shareOfVoicePct={shareOfVoicePct}
              sentimentLabel={audit.raw_results?.brandSentiment?.label ?? "not_enough_signal"}
              competitors={rankedCompetitors.map((item) => ({ name: item.name, count: item.count }))}
              locale={locale}
              variant="dashboard"
              trend={monitoringTrend}
              scoreDelta={monitoringScoreDelta}
            />
          ) : null}

          {complete && !failed && isAgentReport ? (
            <AgentAuditChat
              auditId={audit.id}
              brandName={audit.brand_name}
              category={audit.raw_results?.category}
              locale={locale}
            />
          ) : null}

          {/* --- BLOC 2 : « À PUBLIER » — un seul bloc, un seul bouton. -------- */}
          {complete && !failed ? (
            <section className="rounded-[1.5rem] border border-[#CAFF3C]/20 bg-[#CAFF3C]/[0.055] p-5 sm:p-6" data-testid="publish-block">
              {isFreeReport ? (
                <>
                  <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.publishLockedEyebrow}</p>
                  <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                    {copy.publishLockedTitle}
                  </h2>
                  <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">{copy.publishLockedBody}</p>
                  <ul className="m-0 mt-4 grid list-none gap-2 p-0">
                    {teaserItems.map((item) => (
                      <li key={item.name} className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
                        <p className="m-0 flex items-start gap-2 text-sm font-black text-[#F0F0EC]">
                          <span aria-hidden="true" className="text-[#CAFF3C]">🔒</span>
                          {item.name}
                        </p>
                        <p className="m-0 mt-1 text-xs font-bold leading-5 text-[#8E8E9A]">{item.detail}</p>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5">
                    <FunnelCheckoutLink
                      auditId={audit.id}
                      href={MONITOR_CHECKOUT_URL}
                      source="report_monitor_actions"
                      className="inline-flex rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] no-underline shadow-2xl shadow-[#CAFF3C]/20 transition hover:brightness-110"
                    >
                      {copy.publishLockedCta}
                    </FunnelCheckoutLink>
                  </div>
                  <p className="m-0 mt-3 text-xs font-bold leading-5 text-[#8E8E9A]">{copy.reportReassurance}</p>
                </>
              ) : (
                <PublishContent
                  locale={locale}
                  actions={monitorActions}
                  contentBlocks={monitorContentBlocks}
                  proof={proof}
                  youtubeTipRelevant={youtubeTipRelevant}
                  jsonLdSnippet={jsonLdSnippet}
                  llmsTxt={technicalAssets?.llmsTxt ?? null}
                  robotsFix={robotsFix}
                  blockedBots={aiCrawl?.state === "blocked" ? aiCrawl.blocked : []}
                />
              )}
            </section>
          ) : null}

          {/* --- BLOC 4 : LES QUESTIONS — la preuve, repliée. ------------------ */}
          {complete && !failed && !isFreeReport ? (
            <details className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6" data-testid="buyer-intent-prompts">
              <summary className="cursor-pointer list-item text-xl leading-tight tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>
                {isAnswerEngineReport ? copy.questionsTitle(answerEngineName) : copy.webQuestionsTitle}
                {checkedPromptCount > 0 ? (
                  <span className="ml-3 rounded-full border border-[#CAFF3C]/25 bg-[#CAFF3C]/10 px-3 py-1 align-middle text-xs font-black text-[#CAFF3C]">
                    {fr ? `Recommandé sur ${recommendedPromptCount}/${checkedPromptCount}` : `Recommended on ${recommendedPromptCount}/${checkedPromptCount}`}
                  </span>
                ) : null}
              </summary>

              <QuestionList
                locale={locale}
                engineName={answerEngineName}
                isAnswerEngineReport={isAnswerEngineReport}
                rows={sortedPromptRows}
                gapCount={gapPromptCount}
              />
            </details>
          ) : null}
        </div>
      </section>
    </main>
  );
}
