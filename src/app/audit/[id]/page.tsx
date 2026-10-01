import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SERVICE_CHECKOUT_URL, SERVICE_TEST_CHECKOUT_URL, isCheckoutConfigured } from "@/lib/checkout-links";
import { requestTrafficClass } from "@/lib/traffic-filter";
import { RECHECK_CADENCE, SERVICE_PLAN_PRICE_EUR } from "@/lib/plan-promises";
import { ensureAuditSchema, pool } from "@/lib/db";
import { recordReportLinkOpened } from "@/lib/funnel";
import { auditCopy, brandSentimentView, localeFromHeaders, localeFromUnknown, localizeCategoryLabel, localizePlainAction, type Locale } from "@/lib/i18n";
import { categoryPerceptionFromPrompts, extractSourceCitationReports, generateGeoAgentAssetsFromAudit, hostnameFromUrl, isAnonymousEmail, isAuditedBrandName, reportUrlForAudit, robotsTxtFixForBlockedCrawlers, youtubeContentTipIsRelevant } from "@/lib/audit-engine";
import type { BrandSentiment, BuyerIntentPromptResult, CategoryPerception, DetectedPlatform, IcpSegmentMetadata, PlainAction, SourceCitationReport } from "@/lib/audit-engine";
import { AUDIT_SHARE_TOKEN_PARAM, auditShareTokenState, verifyAuditShareToken } from "@/lib/audit-share-token";
import { resolveReportAccess } from "@/lib/report-access";
import { hasActiveSubscriptionForAudit } from "@/lib/subscriptions";
import LocaleLang from "@/app/LocaleLang";
import { cityFromPrompts } from "@/lib/hosted-answer-page";
import AuditPoller from "./AuditPoller";
import EmailDeliveryNotice from "./EmailDeliveryNotice";
import ReportViewBeacon from "./ReportViewBeacon";
import AgentAuditChat from "./AgentAuditChat";
import FunnelCheckoutLink from "./FunnelCheckoutLink";
import { VisibilityMonitorCard } from "./VisibilityMonitorCard";
import PublishContent from "./PublishContent";
import ServiceValueBlock from "./ServiceValueBlock";
import AiReadabilityBlock from "./AiReadabilityBlock";
import { aiReadabilityItems } from "./ai-readability";
import { twoEngineHeadline, twoEngineView } from "./two-engines";
import QuestionBoard from "./QuestionBoard";
import ScoreHero from "./ScoreHero";
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
  serviceValuePlan,
  sourcesSummary,
  questionBoardRows,
  citationLeaderboard,
  citationRanking,
  rankLabel,
  rankActionsByImpact,
  scoreColor,
  treatmentProof,
  treatmentProofForQuestion,
  uniqueNames,
  verdictCompetitors,
  verdictRival,
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
    emailSent?: boolean;
    emailError?: string;
    structuredDataFound?: boolean;
    locale?: string; platform?: DetectedPlatform;
    buyerIntentPrompts?: BuyerIntentPromptResult[];
    monitoring?: { actions?: PlainAction[]; sources?: SourceCitationReport[]; trend?: { score: number; createdAt: string }[]; scoreDelta?: number | null };
  } | null;
};

function StatusPill({ failed, complete, locale }: { failed: boolean; complete: boolean; locale: Locale }) {
  const copy = auditCopy[locale];
  const label = failed ? copy.status.failed : complete ? copy.status.complete : copy.status.running;
  const className = failed
    ? "border-[#B04329]/25 bg-[#C0492E]/10 text-[#B04329]"
    : complete
      ? "border-[#123E5C]/25 bg-[#123E5C]/10 text-[#123E5C]"
      : "border-[#8A6420]/25 bg-[#8A6420]/10 text-[#8A6420]";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${className}`}>
      {label}
    </span>
  );
}

export { generateMetadata } from "./report-metadata";

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

  const failed = audit.raw_results?.status === "failed";
  const icpSegment = audit.raw_results?.icpSegment;
  const complete = audit.score !== null;
  // Filet : d'anciens audits contiennent la marque elle-même dans ses
  // concurrents (« Pick » pour « GetPick ») — on ne l'affiche plus.
  const auditDomain = hostnameFromUrl(audit.website_url);
  const isSelf = (name: string) => isAuditedBrandName(name, audit.brand_name, auditDomain);
  const questions = checkedQuestions(audit.raw_results?.buyerIntentPrompts ?? []).map((question) => ({
    ...question,
    competitors: question.competitors.filter((name) => !isSelf(name)),
  }));
  const questionCount = complete ? questions.length : 0;
  const brandMentionCount = complete ? questions.filter((question) => question.brandMentioned).length : 0;
  const answerEngine = audit.raw_results?.answerEngine;
  const answerEngineName = answerEngine?.engine ?? questions.flatMap((question) => question.surfaces).find((surface) => surface.kind === "ai_engine")?.engine ?? "Gemini";
  // Deux moteurs (01/10) : quand ChatGPT a répondu, le haut du rapport parle des DEUX (voir two-engines.ts).
  const engines2 = twoEngineView(questions, { primaryEngine: answerEngineName, isSelf, locale: locale === "fr" ? "fr" : "en" });
  const isAnswerEngineReport = questions.some((question) => question.surfaces.some((surface) => surface.kind === "ai_engine"));
  const isAgentReport = audit.raw_results?.auditTier === "agent_19eur" || audit.raw_results?.auditTier === "agent_49eur";
  const isMonitorReport = audit.raw_results?.auditTier === "monitor_9eur";
  const isFreeReport = !isAgentReport && !isMonitorReport;

  // `report_viewed` N'EST PLUS ENREGISTRÉ ICI : ce rendu serveur se répète (F5,
  // poller, crawlers). L'événement part du navigateur, une fois par session,
  // filtré : voir ReportViewBeacon et src/lib/traffic-filter.ts.
  const shareTokenParam = query?.[AUDIT_SHARE_TOKEN_PARAM];
  const shareToken = Array.isArray(shareTokenParam) ? shareTokenParam[0] : shareTokenParam;
  // UN SEUL appel à `verifyAuditShareToken` par requête ; le second HMAC ne part que sur le chemin DÉJÀ fermé, pour distinguer un lien que NOUS avons signé et qui a vécu trop longtemps d'un jeton bricolé (voir `auditShareTokenState`).
  const shareTokenValid = verifyAuditShareToken(audit.id, shareToken);
  const reportAccess = resolveReportAccess({
    auditTier: audit.raw_results?.auditTier,
    emailIsAnonymous: isAnonymousEmail(audit.email),
    complete,
    failed,
    hasActiveSubscription: await hasActiveSubscriptionForAudit(audit.email),
    shareTokenExpired: !shareTokenValid && auditShareTokenState(audit.id, shareToken) === "expired",
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
    const headline = engines2 ? twoEngineHeadline(engines2, { brandName: audit.brand_name, questionCount, locale: locale === "fr" ? "fr" : "en" }) : lockedVerdictHeadline({
      brandName: audit.brand_name,
      engineName: answerEngineName,
      questionCount,
      brandMentionCount,
      lostCount: lostQuestions.length,
      competitors: verdictCompetitors(questions),
      locale,
    });

    return (
      <main className="min-h-screen bg-[#F5F7FA] text-[#132A43]" style={{ fontFamily: "var(--font-sans)" }}>
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
            <Link href="/" className="text-xl text-[#132A43] no-underline" style={{ fontFamily: "var(--font-display)" }}>
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
  const verdictHeadline = complete && !failed && engines2
    ? twoEngineHeadline(engines2, { brandName: audit.brand_name, questionCount, locale: locale === "fr" ? "fr" : "en" })
    : complete && !failed
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
  const boardRows = questionBoardRows(questions, auditDomain, audit.brand_name);
  const topRival = rankedCompetitors[0] ? { name: rankedCompetitors[0].name, count: rankedCompetitors[0].count } : null;
  const ranking = engines2
    ? citationRanking({ brandName: audit.brand_name, brandCount: engines2.brandCount, rivals: engines2.rivals })
    : citationRanking({ brandName: audit.brand_name, brandCount: brandMentionCount, rivals: rankedCompetitors });
  // Visiteur interne (cookie gp_internal) : la caisse de TEST Stripe si elle est configurée — E2E sans vraie carte.
  const checkoutUrl = requestTrafficClass(await headers()).trafficClass === "internal" && isCheckoutConfigured(SERVICE_TEST_CHECKOUT_URL) ? SERVICE_TEST_CHECKOUT_URL : SERVICE_CHECKOUT_URL;
  const rankText = ranking.rank ? `${rankLabel(ranking.rank, locale)} / ${ranking.cabinets}` : locale === "fr" ? "hors classement" : "not ranked";
  const sentiment = brandSentimentView(audit.raw_results?.brandSentiment ?? { label: "not_enough_signal", justification: "not enough signal" }, locale);
  // Sans categoryPerception stocké (anciens audits), on recalcule — le repli
  // rend "not_enough_signal", jamais un verdict inventé.
  const categoryPerception: CategoryPerception =
    audit.raw_results?.categoryPerception ?? categoryPerceptionFromPrompts(questions, audit.raw_results?.category ?? "");

  const aiCrawl = complete && !failed ? await checkAiCrawlability(audit.website_url) : null;
  const aiReadability = aiCrawl ? aiReadabilityItems({ llmsFound: aiCrawl.llmsFound, structuredDataFound: audit.raw_results?.structuredDataFound ?? null, crawlState: aiCrawl.state, blocked: aiCrawl.blocked }, locale === "fr" ? "fr" : "en") : [];

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
  const valuePlan = complete && !failed && isFreeReport
    ? serviceValuePlan({
        brandName: audit.brand_name,
        engineName: answerEngineName,
        lostQuestions: lostQuestions.map((question) => question.prompt),
        questionCount,
        rival,
        topRivals: rankedCompetitors.map((item) => item.name),
        category: audit.raw_results?.category,
        monthlyPriceEur: SERVICE_PLAN_PRICE_EUR,
        recheckEvery: RECHECK_CADENCE[locale === "fr" ? "fr" : "en"].every,
        locale,
        brandDomain: auditDomain.replace(/^www\./, ""),
      })
    : null;

  return (
    <main className="min-h-screen bg-[#F5F7FA] text-[#132A43]" style={{ fontFamily: "var(--font-sans)" }}>
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
          <Link href="/" className="text-xl text-[#132A43] no-underline" style={{ fontFamily: "var(--font-display)" }}>
            GetPick
          </Link>
        </nav>

        <div className="flex flex-1 flex-col justify-center gap-4 pb-8 sm:gap-5">
          {/* --- BLOC 1 : LE VERDICT ------------------------------------------ */}
          <div className="rounded-[2rem] border border-[#E4E9F0] bg-[#FFFFFF] p-5 shadow-2xl shadow-black/5 sm:p-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <StatusPill failed={failed} complete={complete} locale={locale} />
              <a href={audit.website_url} className="max-w-full truncate text-sm font-bold text-[#5E6E86] underline decoration-white/10 underline-offset-4">
                {audit.website_url}
              </a>
            </div>

            <h1 className="text-[clamp(1.6rem,8vw,2.6rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
              {copy.title(audit.brand_name)}
            </h1>

            {failed ? (
              <div className="mt-5 rounded-2xl border border-[#B04329]/20 bg-[#C0492E]/10 p-4 text-sm font-bold leading-6 text-[#B04329]">
                {copy.failedPrefix} {audit.raw_results?.error ?? copy.unknownError}
              </div>
            ) : !complete ? (
              <div className="mt-5 rounded-2xl border border-[#8A6420]/20 bg-[#8A6420]/10 p-4 text-sm font-bold leading-6 text-[#8A6420]">
                {copy.runningText}
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-3">
                <h2 className="m-0 text-[1.55rem] leading-[1.12] tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>
                  {verdictHeadline}
                </h2>
                {rival ? (
                  <p className="m-0 text-base font-bold leading-6 text-[#5B6B82]">
                    {rival.replacement
                      ? copy.verdictRivalReplacement(answerEngineName, rival.name, rival.prompt)
                      : copy.verdictRivalAlso(answerEngineName, rival.name, rival.prompt)}
                  </p>
                ) : null}
                <ScoreHero brandName={audit.brand_name} engineName={engines2?.label ?? answerEngineName} plural={Boolean(engines2)} city={cityFromPrompts(questions.map((question) => question.prompt))} rank={ranking.rank} tied={ranking.tied} cabinets={ranking.cabinets} podium={engines2 ? citationLeaderboard({ brandName: audit.brand_name, brandCount: engines2.brandCount, rivals: engines2.rivals, limit: 4 }) : citationLeaderboard({ brandName: audit.brand_name, brandCount: brandMentionCount, rivals: rankedCompetitors, limit: 4 })} cited={brandMentionCount} total={engines2?.totalAnswers ?? questionCount} states={questions.map((question) => promptAnalysis(question).state)} engineRows={engines2?.engines} locale={locale} />
                <p className="m-0 text-xs font-bold text-[#5E6E86]">{copy.scoreCategoryLine(score, displayCategory)}</p>
                {isAnswerEngineReport && answerEngine?.realLlmCall ? (
                  <p
                    className="m-0 flex w-fit items-center gap-1.5 text-xs font-black text-[#17705B]"
                    title={copy.liveCheckDetail(answerEngineName)}
                  >
                    <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#17705B]" />
                    {copy.liveCheckLabel}
                  </p>
                ) : null}
              </div>
            )}

            <EmailDeliveryNotice
              locale={locale}
              complete={complete}
              failed={failed}
              emailIsAnonymous={isAnonymousEmail(audit.email)}
              emailSent={audit.raw_results?.emailSent}
              reportUrl={reportUrlForAudit(audit.id)}
            />

            {/* « L'IA ne sait pas ce que tu vends » — rendu uniquement s'il y a un
                vrai signal : sans catégorie perçue, on n'affiche rien. */}
            {complete && !failed && categoryPerception.status !== "not_enough_signal" ? (
              (() => {
                const mismatch = categoryPerception.status === "mismatch";
                const tone = mismatch ? "#8A6420" : "#123E5C";

                return (
                  <section
                    className="mt-5 rounded-2xl border p-4"
                    style={{ borderColor: `${tone}33`, background: `${tone}0F` }}
                    data-testid="category-perception"
                  >
                    <p className="m-0 text-xs font-black uppercase tracking-[0.12em]" style={{ color: tone }}>
                      {copy.categoryPerceptionEyebrow}
                    </p>
                    <p className="m-0 mt-2 text-base font-black leading-6 text-[#132A43]">
                      {mismatch ? copy.categoryPerceptionMismatchTitle : copy.categoryPerceptionMatchTitle}
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-[#E4E9F0] bg-[#EEF2F7] px-3 py-2">
                        <p className="m-0 text-[0.6875rem] font-black uppercase tracking-[0.1em] text-[#5E6E86]">
                          {copy.categoryPerceptionYouSell}
                        </p>
                        <p className="m-0 mt-1 text-sm font-bold text-[#132A43]">{categoryPerception.actual}</p>
                      </div>
                      <div className="rounded-xl border border-[#E4E9F0] bg-[#EEF2F7] px-3 py-2">
                        <p className="m-0 text-[0.6875rem] font-black uppercase tracking-[0.1em] text-[#5E6E86]">
                          {copy.categoryPerceptionAiThinks}
                        </p>
                        <p className="m-0 mt-1 text-sm font-bold" style={{ color: tone }}>
                          {categoryPerception.perceived}
                        </p>
                      </div>
                    </div>
                    <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#5B6B82]">
                      {mismatch
                        ? copy.categoryPerceptionMismatchBody(answerEngineName)
                        : copy.categoryPerceptionMatchBody(answerEngineName)}
                    </p>
                    {mismatch ? (
                      <p className="m-0 mt-2 text-sm font-black leading-6 text-[#132A43]">
                        {copy.categoryPerceptionMismatchAction}
                      </p>
                    ) : null}
                  </section>
                );
              })()
            ) : null}

            {complete && !failed && (audit.raw_results?.brandSentiment?.label ?? "not_enough_signal") !== "not_enough_signal" ? (
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
                  <p className="m-0 mt-2 text-sm font-black leading-6 text-[#132A43]">{sentiment.justification}</p>
                ) : null}
                <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#5B6B82]">{sentiment.guidance}</p>
              </section>
            ) : null}
          </div>

          {complete && !failed && boardRows.length ? (
            <QuestionBoard rows={boardRows} engineName={answerEngineName} locale={locale} />
          ) : null}

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
            <section className="rounded-[1.5rem] border border-[#123E5C]/20 bg-[#123E5C]/[0.055] p-5 sm:p-6" data-testid="publish-block">
              {isFreeReport ? (
                <>
                  <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#123E5C]">{copy.publishLockedEyebrow}</p>
                  <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                    {copy.publishLockedTitle}
                  </h2>
                  {aiReadability.length ? <AiReadabilityBlock items={aiReadability} brandName={audit.brand_name} locale={locale === "fr" ? "fr" : "en"} /> : null}
                  {valuePlan ? <ServiceValueBlock plan={valuePlan} sources={sourcesSummary(questions, auditDomain)} engineName={answerEngineName} brandName={audit.brand_name} locale={locale} rows={boardRows} cited={brandMentionCount} total={questionCount} topRival={topRival} rankText={rankText} rankEngineName={engines2?.label} /> : (
                    <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#5B6B82]">{copy.publishLockedBody}</p>
                  )}
                  <div className="mt-5">
                    <FunnelCheckoutLink
                      auditId={audit.id} checkoutConfigured={isCheckoutConfigured(checkoutUrl)}
                      href={isCheckoutConfigured(checkoutUrl) ? checkoutUrl : `${locale === "fr" ? "/fr" : "/en"}#pricing`}
                      source="report_service_offer" prefillEmail={isAnonymousEmail(audit.email) ? null : audit.email}
                      className="inline-flex rounded-xl bg-[#123E5C] px-5 py-3 text-sm font-black text-white no-underline shadow-2xl shadow-[#123E5C]/20 transition hover:brightness-110"
                    >
                      {copy.publishLockedCta}
                    </FunnelCheckoutLink>
                  </div>
                  <p className="m-0 mt-3 text-xs font-bold leading-5 text-[#5E6E86]">{copy.reportReassurance}</p>
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
                  blockedBots={aiCrawl?.state === "blocked" ? aiCrawl.blocked : []} platform={audit.raw_results?.platform ?? "inconnu"}
                />
              )}
            </section>
          ) : null}

        </div>
      </section>
    </main>
  );
}
