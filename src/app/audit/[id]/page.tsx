import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AGENT_CHECKOUT_URL, MONITOR_CHECKOUT_URL } from "@/lib/checkout-links";
import { ensureAuditSchema, pool } from "@/lib/db";
import { recordFunnelEvent } from "@/lib/funnel";
import { auditCopy, brandSentimentText, localeFromHeaders, localeFromUnknown, localizeCategoryLabel, localizePlainAction, recommendationText, type Locale } from "@/lib/i18n";
import type { BrandSentiment, BuyerIntentPromptResult, IcpSegmentMetadata, PlainAction } from "@/lib/audit-engine";
import AuditPoller from "./AuditPoller";
import AgentAuditChat from "./AgentAuditChat";
import FunnelCheckoutLink from "./FunnelCheckoutLink";

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
    icpSegment?: IcpSegmentMetadata;
    auditTier?: string;
    answerEngine?: { engine?: string; model?: string; realLlmCall?: boolean };
    brandSentiment?: BrandSentiment;
    locale?: string;
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


function localizedUnavailableReason(reason: string | undefined, locale: Locale, engine = "Gemini") {
  if (!reason) return locale === "fr" ? `${engine} est indisponible ; réessaie.` : `${engine} unavailable; try again.`;
  if (reason.includes("Native NanoCorp web_search unavailable")) return locale === "fr" ? "Recherche web native indisponible ; ce rapport utilise uniquement les vérifications terminées." : reason;
  if (reason.includes("Gemini indisponible")) return locale === "fr" ? reason : "Gemini unavailable; try again.";
  if (reason.includes("ChatGPT indisponible")) return locale === "fr" ? reason : "ChatGPT unavailable; try again.";
  return reason;
}

function questionEngineSummary(question: BuyerIntentPromptResult, locale: Locale) {
  const aiSurface = question.surfaces.find((surface) => surface.kind === "ai_engine");

  if (aiSurface) {
    const engine = aiSurface.engine ?? "Gemini";
    const label = recommendationText(engine, aiSurface.brandMentioned, locale);
    const competitors = question.competitors.length
      ? locale === "fr" ? ` · Concurrents cités : ${question.competitors.join(", ")}` : ` · Competitors cited: ${question.competitors.join(", ")}`
      : locale === "fr" ? " · Aucun concurrent clair cité" : " · No clear competitor cited";
    return aiSurface.status === "checked" ? `${label}${competitors}` : localizedUnavailableReason(aiSurface.unavailableReason, locale, engine);
  }

  const checked = question.surfaces.filter((surface) => surface.kind === "supplementary" && surface.status === "checked");
  const unavailable = question.surfaces.filter((surface) => surface.kind === "supplementary" && surface.status !== "checked");

  if (checked.length > 0) {
    return checked.map((surface) => `${surface.surface}: ${surface.brandMentioned ? (locale === "fr" ? "marque/domaine trouvé" : "brand/domain found") : (locale === "fr" ? "marque/domaine non trouvé" : "brand/domain not found")}`).join(" · ");
  }

  return localizedUnavailableReason(unavailable[0]?.unavailableReason, locale);
}

function checkedQuestions(questions: BuyerIntentPromptResult[]) {
  const available = questions.filter((question) => question.available);
  return available.length ? available : questions;
}

function fixSentence(category: string | undefined, hasCompetitors: boolean, locale: Locale, segment?: IcpSegmentMetadata) {
  const business = category && category !== "your type of business" ? category : locale === "fr" ? "ton activité" : "your business type";

  if (segment?.key === "local_independent") {
    return locale === "fr"
      ? `À corriger : aligne ta fiche Google Business, tes annuaires métier, ta page “pourquoi me choisir” et tes avis locaux autour de ${business}.`
      : `What to fix: align your Google Business Profile, professional directories, “why choose me” page, and local reviews around ${business}.`;
  }

  if (segment?.key === "creator_influencer") {
    return locale === "fr"
      ? `À corriger : aligne tes bios/profils sociaux, tes mentions “top créateurs”, ta presse et tes preuves d'entité autour de ${business}.`
      : `What to fix: align social bios/profiles, top-creator listicle mentions, press, and entity proof around ${business}.`;
  }

  if (hasCompetitors) {
    return locale === "fr"
      ? `À corriger : ajoute une page claire sur ${business}, avec FAQ, pages produit, avis et réponses directes aux questions d'achat.`
      : `What to fix: add clear ${business} FAQ/product pages with reviews and direct answers to buyer questions.`;
  }

  return locale === "fr"
    ? `À corriger : rends ton site plus clair sur ${business}, tes preuves produit, tes avis et les raisons de choisir ta marque.`
    : `What to fix: make your site clearer about ${business}, product proof, reviews, and why buyers should choose your brand.`;
}

function treatmentProofForQuestion(brandName: string, category: string | undefined, question: BuyerIntentPromptResult, competitors: string[], engine: string, locale: Locale, segment?: IcpSegmentMetadata) {
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
      title: segment?.key === "local_independent" ? `Fiche Google Business / page locale à corriger : « ${question.prompt} »` : segment?.key === "creator_influencer" ? `Bio sociale / listicle à corriger : « ${question.prompt} »` : `FAQ/page produit à créer : « ${question.prompt} »`,
      draft: segment?.key === "local_independent"
        ? `Brouillon local à publier après relecture : « ${brandName} accompagne les clients qui cherchent ${business} près de chez eux. Explique la ville servie, les cas traités, les qualifications, les avis vérifiables et la prochaine étape pour réserver. ${competitorText} »`
        : segment?.key === "creator_influencer"
          ? `Brouillon profil/listicle à publier après relecture : « ${brandName} est un profil ${business} à suivre pour son angle, ses contenus utiles et ses preuves publiques. Ajoute la niche, les plateformes actives, les meilleures preuves et les liens presse/profils. ${competitorText} »`
          : `Brouillon FAQ à publier après relecture : « Si tu compares ${business}, commence par ton besoin, les preuves disponibles et la prochaine étape. ${brandName} doit présenter ses cas d'usage, ses avis ou preuves vérifiables, puis répondre directement à cette question. ${competitorText} »`,
      google: segment?.key === "local_independent"
        ? `Phrase Google Business à coller : « ${brandName} aide les clients à choisir ${business} avec une prise de rendez-vous claire, des avis vérifiables et des informations locales à jour. »`
        : segment?.key === "creator_influencer"
          ? `Phrase bio/profil à coller : « ${brandName} crée du contenu ${business} à suivre pour des conseils clairs, des preuves publiques et des liens vers les meilleurs contenus et interviews. »`
          : `Phrase page produit à coller : « ${brandName} aide les clients à comparer ${business} avec des informations claires, des avis vérifiables et une prochaine étape simple. »`,
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
    title: segment?.key === "local_independent" ? `Google Business / local page fix: “${question.prompt}”` : segment?.key === "creator_influencer" ? `Social bio / listicle fix: “${question.prompt}”` : `FAQ/product page to create: “${question.prompt}”`,
    draft: segment?.key === "local_independent"
      ? `Local draft to publish after review: “${brandName} helps clients looking for ${business} nearby. State the city served, cases handled, qualifications, verifiable reviews, and the next booking step. ${competitorText}”`
      : segment?.key === "creator_influencer"
        ? `Profile/listicle draft to publish after review: “${brandName} is a ${business} creator worth following for a clear angle, useful content, and public proof. Add the niche, active platforms, best proof, and press/profile links. ${competitorText}”`
        : `FAQ draft to publish after review: “If you are comparing ${business}, start with your use case, available proof, and the next step. ${brandName} should present its use cases, reviews or verifiable proof, and a direct answer to this question. ${competitorText}”`,
    google: segment?.key === "local_independent"
      ? `Google Business sentence to paste: “${brandName} helps clients choose ${business} with clear booking steps, verifiable reviews, and up-to-date local information.”`
      : segment?.key === "creator_influencer"
        ? `Social/profile sentence to paste: “${brandName} creates ${business} content worth following for clear advice, public proof, and links to the best content and interviews.”`
        : `Product-page sentence to paste: “${brandName} helps buyers compare ${business} with clear information, verifiable reviews, and a simple next step.”`,
  };
}


function priorityQuestions(questions: BuyerIntentPromptResult[]) {
  return [
    ...questions.filter((item) => item.available && !item.brandMentioned),
    ...questions.filter((item) => item.available && item.brandMentioned && item.competitors.length > 0),
    ...questions.filter((item) => item.available && item.brandMentioned && item.competitors.length === 0),
  ];
}

function priorityGapQuestions(questions: BuyerIntentPromptResult[]) {
  return priorityQuestions(questions).filter((question) => question.available && (!question.brandMentioned || question.competitors.length > 0));
}

function treatmentProof(brandName: string, category: string | undefined, questions: BuyerIntentPromptResult[], competitors: string[], engine: string, locale: Locale, segment?: IcpSegmentMetadata) {
  const question = priorityQuestions(questions)[0];

  return question ? treatmentProofForQuestion(brandName, category, question, competitors, engine, locale, segment) : null;
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
  const isAgentReport = audit.raw_results?.auditTier === "agent_19eur" || audit.raw_results?.auditTier === "agent_49eur";
  const isMonitorReport = audit.raw_results?.auditTier === "monitor_9eur";
  const isFreeReport = !isAgentReport && !isMonitorReport;

  await recordFunnelEvent({
    eventName: "report_viewed",
    auditId: audit.id,
    source: "audit_page",
    metadata: { brandName: audit.brand_name, websiteUrl: audit.website_url, auditTier: audit.raw_results?.auditTier ?? "free", complete, failed },
  });

  const topCompetitor = rankedCompetitors[0]?.name ?? competitors[0];
  const displayCategory = localizeCategoryLabel(audit.raw_results?.category, locale);
  const score = audit.score ?? 0;
  const color = scoreColor(score);
  const freeGapQuestion = complete && !failed && isFreeReport ? priorityGapQuestions(questions)[0] ?? null : null;
  const freeSampleProof = freeGapQuestion ? treatmentProofForQuestion(audit.brand_name, displayCategory, freeGapQuestion, competitors, answerEngineName, locale, icpSegment) : null;
  const honestNoGapTeaser = complete && !failed && isFreeReport && !freeSampleProof;
  const proof = complete && !failed && !isFreeReport ? treatmentProof(audit.brand_name, displayCategory, questions, competitors, answerEngineName, locale, icpSegment) : null;
  const monitorActions = (audit.raw_results?.monitoring?.actions?.slice(0, 3) ?? []).map((action) => localizePlainAction(action, locale));
  const sentimentLine = brandSentimentText(audit.raw_results?.brandSentiment ?? { label: "not_enough_signal", justification: "not enough signal" }, locale);
  const scoreExplanation = complete
    ? locale === "fr"
      ? `Score expliqué : ${score}/100 combine ${brandMentionCount}/${questionCount || 0} recommandations, le sentiment IA, les concurrents cités et les bases techniques vérifiées.`
      : `Score explained: ${score}/100 combines ${brandMentionCount}/${questionCount || 0} recommendations, AI sentiment, cited competitors, and verified technical basics.`
    : "";
  const categoryLine = complete && displayCategory
    ? locale === "fr" ? `Catégorie détectée : ${displayCategory}.` : `Detected category: ${displayCategory}.`
    : "";
  const phrases = [
    categoryLine,
    scoreExplanation,
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
      ? fixSentence(displayCategory, competitors.length > 0, locale, icpSegment)
      : isMonitorReport
        ? locale === "fr" ? "Monitor ajoute 3 actions prioritaires pour cette semaine." : "Monitor adds 3 priority actions for this week."
        : locale === "fr" ? "Diagnostic gratuit : score, sentiment IA, statut de recommandation Gemini et concurrents cités." : "Free diagnostic: score, AI sentiment, Gemini recommendation status, and cited competitors.",
  ].filter(Boolean);

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
          <a href={AGENT_CHECKOUT_URL} className="text-sm font-black text-[#CAFF3C] no-underline" data-ph-capture-attribute-plan="agent_19eur" data-ph-capture-attribute-source="audit_report_nav">
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

            {freeSampleProof ? (
              <section className="mt-6 overflow-hidden rounded-[1.5rem] border border-[#CAFF3C]/35 bg-[radial-gradient(circle_at_top_left,rgba(202,255,60,0.16),rgba(10,10,12,0.96)_46%)] p-4 shadow-2xl shadow-[#CAFF3C]/5 sm:p-5" data-testid="agent-fix-teaser">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#CAFF3C]">{copy.freeFixEyebrow}</p>
                    <h2 className="m-0 mt-2 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                      {copy.freeFixTitle(audit.brand_name)}
                    </h2>
                  </div>
                  <span className="rounded-full border border-[#CAFF3C]/25 bg-[#CAFF3C]/10 px-3 py-1 text-xs font-black text-[#CAFF3C]">{copy.freeFixBadge}</span>
                </div>

                <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/25 p-4">
                  <p className="m-0 text-sm font-black leading-6 text-[#F0F0EC]">1. {freeSampleProof.gap}</p>
                  <p className="m-0 mt-2 text-sm font-black leading-6 text-[#CAFF3C]">2. {freeSampleProof.title}</p>

                  <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#09090B]/80">
                    <div className="grid gap-3 p-4 blur-[6px] select-none" aria-hidden="true">
                      <p className="m-0 text-sm font-bold leading-6 text-[#D6D6DF]">{freeSampleProof.draft}</p>
                      <p className="m-0 text-sm font-bold leading-6 text-[#D6D6DF]">{freeSampleProof.google}</p>
                    </div>
                    <div className="absolute inset-0 grid place-items-center bg-[#09090B]/62 p-4 text-center backdrop-blur-[2px]">
                      <FunnelCheckoutLink
                        auditId={audit.id}
                        href={AGENT_CHECKOUT_URL}
                        source="report_teaser"
                        className="inline-flex rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] no-underline shadow-2xl shadow-[#CAFF3C]/20 transition hover:brightness-110"
                      >
                        {copy.unlockFixesCta}
                      </FunnelCheckoutLink>
                    </div>
                  </div>
                </div>
              </section>
            ) : honestNoGapTeaser ? (
              <section className="mt-6 rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-4 sm:p-5" data-testid="agent-fix-teaser">
                <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#8E8E9A]">{copy.noFakeFixes}</p>
                <h2 className="m-0 mt-2 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                  {copy.noVerifiedGapTitle}
                </h2>
                <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">
                  {copy.noVerifiedGapBody}
                </p>
              </section>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href={AGENT_CHECKOUT_URL} className="inline-flex justify-center rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] no-underline transition hover:brightness-110" data-ph-capture-attribute-plan="agent_19eur" data-ph-capture-attribute-source="audit_report_primary">
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

          {complete && !failed && isAgentReport ? (
            <AgentAuditChat
              auditId={audit.id}
              brandName={audit.brand_name}
              category={audit.raw_results?.category}
              locale={locale}
            />
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
              <a href={AGENT_CHECKOUT_URL} className="mt-5 inline-flex rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] no-underline transition hover:brightness-110" data-ph-capture-attribute-plan="agent_19eur" data-ph-capture-attribute-source="audit_report_proof">
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
