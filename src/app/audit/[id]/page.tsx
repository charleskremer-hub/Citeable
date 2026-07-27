import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AGENT_CHECKOUT_URL, MONITOR_CHECKOUT_URL } from "@/lib/checkout-links";
import { ensureAuditSchema, pool } from "@/lib/db";
import { recordFunnelEvent } from "@/lib/funnel";
import { auditCopy, brandSentimentView, localeFromHeaders, localeFromUnknown, localizeCategoryLabel, localizePlainAction, type Locale } from "@/lib/i18n";
import { UNKNOWN_CATEGORY } from "@/lib/audit-engine";
import { categoryPerceptionFromPrompts, extractSourceCitationReports, fetchWithHostFallback, generateGeoAgentAssetsFromAudit, isAnonymousEmail, isAuditedBrandName, robotsTxtFixForBlockedCrawlers, youtubeContentTipIsRelevant } from "@/lib/audit-engine";
import type { BrandSentiment, BuyerIntentPromptResult, CategoryPerception, IcpSegmentMetadata, PlainAction, SourceCitationReport } from "@/lib/audit-engine";
import type { ProductShopping } from "@/lib/product-shopping";
import LocaleLang from "@/app/LocaleLang";
import AuditPoller from "./AuditPoller";
import AgentAuditChat from "./AgentAuditChat";
import FunnelCheckoutLink from "./FunnelCheckoutLink";
import { VisibilityMonitorCard } from "./VisibilityMonitorCard";
import CopyBlock from "./CopyBlock";
import ClaimReportGate from "./ClaimReportGate";

export const dynamic = "force-dynamic";

function extractPasteable(text: string) {
  const match = text.match(/[«"“]([\s\S]+?)[»"”]/);
  return (match ? match[1] : text).trim();
}

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
    productShopping?: ProductShopping | null;
    structuredDataFound?: boolean;
    locale?: string;
    buyerIntentPrompts?: BuyerIntentPromptResult[];
    monitoring?: { actions?: PlainAction[]; sources?: SourceCitationReport[]; trend?: { score: number; createdAt: string }[]; scoreDelta?: number | null };
  } | null;
};

function scoreColor(score: number) {
  if (score < 30) return "#FF5F5F";
  if (score < 60) return "#FFB84D";
  return "#CAFF3C";
}

// --- Lisibilité par les crawlers IA -----------------------------------------
// Si les bots des moteurs IA sont bloqués par robots.txt, la marque ne peut pas
// être citée, quel que soit son contenu. C'est le check le plus actionnable qui
// soit : binaire, vérifiable, et corrigeable en une ligne de robots.txt.
// Volontairement isolé dans la page (aucun impact sur le scoring ni sur le
// pipeline d'audit) pour rester additif et sans risque pour le funnel.
const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended"] as const;

type RobotsGroup = { agents: string[]; disallowAll: boolean };

function parseRobotsGroups(robots: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let previousLineWasAgent = false;

  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      // Des User-agent consécutifs partagent le même bloc de règles.
      if (!current || !previousLineWasAgent) {
        current = { agents: [], disallowAll: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      previousLineWasAgent = true;
      continue;
    }

    previousLineWasAgent = false;
    if (current && key === "disallow" && value === "/") current.disallowAll = true;
  }

  return groups;
}

function blockedAiCrawlers(robots: string) {
  const groups = parseRobotsGroups(robots);
  const wildcardBlocked = groups.some((group) => group.agents.includes("*") && group.disallowAll);

  return AI_CRAWLERS.filter((crawler) => {
    const named = groups.filter((group) => group.agents.includes(crawler.toLowerCase()));
    // Une règle nommée l'emporte toujours sur la règle générique "*".
    if (named.length) return named.some((group) => group.disallowAll);
    return wildcardBlocked;
  });
}

// Trois états distincts — c'est le cœur du correctif :
//  - "blocked"     : le site répond ET bloque explicitement un crawler IA (vrai négatif)
//  - "ok"          : le site répond et ne bloque personne
//  - "unreachable" : ni l'apex ni le www ne répondent (DNS/hébergement), PAS un blocage
type AiCrawlState = "ok" | "blocked" | "unreachable";

async function checkAiCrawlability(websiteUrl: string): Promise<{
  state: AiCrawlState;
  blocked: string[];
  llmsFound: boolean;
  resolvedHost: string | null;
}> {
  // fetchWithHostFallback bascule apex ↔ www sur échec réseau uniquement
  // (un 404 sur /llms.txt reste un 404, on ne retente pas l'autre hôte).
  const load = async (path: string) => {
    const target = new URL(path, websiteUrl).toString();
    const result = await fetchWithHostFallback(target);
    if (!result.response) return { text: null, reachable: false, host: null as string | null };
    const text = result.response.ok ? await result.response.text().catch(() => null) : null;
    return { text, reachable: true, host: result.host };
  };

  const [robots, llms] = await Promise.all([load("/robots.txt"), load("/llms.txt")]);

  // Aucune variante d'hôte n'a répondu sur aucun des deux fichiers : injoignable.
  if (!robots.reachable && !llms.reachable) {
    return { state: "unreachable", blocked: [], llmsFound: false, resolvedHost: null };
  }

  // Pas de robots.txt = tout est autorisé par défaut : ce n'est pas un blocage.
  const blocked = robots.text ? blockedAiCrawlers(robots.text) : [];

  return {
    state: blocked.length ? "blocked" : "ok",
    blocked,
    llmsFound: llms.text !== null,
    resolvedHost: robots.host ?? llms.host,
  };
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
  // Ancien libellé « Native NanoCorp web_search unavailable » conservé : les audits déjà en base le contiennent.
  if (reason.includes("Web search unavailable") || reason.includes("Native NanoCorp web_search unavailable")) {
    return locale === "fr" ? "Recherche web indisponible ; ce rapport utilise uniquement les vérifications terminées." : reason;
  }
  if (reason.includes("Gemini indisponible")) return locale === "fr" ? reason : "Gemini unavailable; try again.";
  if (reason.includes("ChatGPT indisponible")) return locale === "fr" ? reason : "ChatGPT unavailable; try again.";
  return reason;
}

type PromptState = "recommended" | "missing" | "unchecked";

function promptAnalysis(question: BuyerIntentPromptResult): { state: PromptState; competitors: string[]; reason?: string } {
  const aiSurface = question.surfaces.find((surface) => surface.kind === "ai_engine");

  if (aiSurface) {
    if (aiSurface.status !== "checked") {
      return { state: "unchecked", competitors: [], reason: aiSurface.unavailableReason };
    }
    return { state: aiSurface.brandMentioned ? "recommended" : "missing", competitors: question.competitors };
  }

  const checked = question.surfaces.find((surface) => surface.kind === "supplementary" && surface.status === "checked");
  if (checked) {
    return { state: checked.brandMentioned ? "recommended" : "missing", competitors: question.competitors };
  }

  return { state: "unchecked", competitors: [], reason: question.surfaces.find((surface) => surface.unavailableReason)?.unavailableReason };
}

function promptStatusPill(state: PromptState, locale: Locale): { label: string; color: string; bg: string } {
  if (state === "recommended") return { label: locale === "fr" ? "✓ Recommandé" : "✓ Recommended", color: "#CAFF3C", bg: "rgba(202,255,60,0.12)" };
  if (state === "missing") return { label: locale === "fr" ? "✗ Pas cité" : "✗ Not cited", color: "#FF8F6B", bg: "rgba(255,143,107,0.12)" };
  return { label: locale === "fr" ? "— Non vérifié" : "— Not checked", color: "#9A9AA8", bg: "rgba(255,255,255,0.05)" };
}

function checkedQuestions(questions: BuyerIntentPromptResult[]) {
  const available = questions.filter((question) => question.available);
  return available.length ? available : questions;
}

/**
 * Noun phrase used in every customer-facing fix sentence.
 * When category detection fails we fall back to a segment-appropriate phrase —
 * never a placeholder like "your business type", which reads as a broken template
 * in the exact sample that is supposed to sell the Agent plan.
 * Every call site below must keep it in a prepositional slot (about/around/in ${business}).
 */
function businessPhrase(category: string | undefined, locale: Locale, segment?: IcpSegmentMetadata) {
  const trimmed = (category ?? "").trim();
  if (trimmed && trimmed !== UNKNOWN_CATEGORY) return trimmed;
  if (segment?.key === "local_independent") return locale === "fr" ? "ce service" : "this service";
  if (segment?.key === "creator_influencer") return locale === "fr" ? "cette niche" : "this niche";
  return locale === "fr" ? "cette catégorie" : "this category";
}

function fixSentence(category: string | undefined, hasCompetitors: boolean, locale: Locale, segment?: IcpSegmentMetadata) {
  const business = businessPhrase(category, locale, segment);

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
      : `What to fix: add a clear FAQ/product page about ${business}, with reviews and direct answers to buyer questions.`;
  }

  return locale === "fr"
    ? `À corriger : rends ton site plus clair sur ${business}, tes preuves produit, tes avis et les raisons de choisir ta marque.`
    : `What to fix: make your site clearer about ${business}, product proof, reviews, and why buyers should choose your brand.`;
}

function treatmentProofForQuestion(brandName: string, category: string | undefined, question: BuyerIntentPromptResult, competitors: string[], engine: string, locale: Locale, segment?: IcpSegmentMetadata) {
  const business = businessPhrase(category, locale, segment);
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
          ? `Brouillon profil/listicle à publier après relecture : « ${brandName} est un profil à suivre dans ${business} pour son angle, ses contenus utiles et ses preuves publiques. Ajoute la niche, les plateformes actives, les meilleures preuves et les liens presse/profils. ${competitorText} »`
          : `Brouillon FAQ à publier après relecture : « Si tu compares les options dans ${business}, commence par ton besoin, les preuves disponibles et la prochaine étape. ${brandName} doit présenter ses cas d'usage, ses avis ou preuves vérifiables, puis répondre directement à cette question. ${competitorText} »`,
      google: segment?.key === "local_independent"
        ? `Phrase Google Business à coller : « ${brandName} aide les clients à choisir ${business} avec une prise de rendez-vous claire, des avis vérifiables et des informations locales à jour. »`
        : segment?.key === "creator_influencer"
          ? `Phrase bio/profil à coller : « ${brandName} crée du contenu sur ${business} à suivre pour des conseils clairs, des preuves publiques et des liens vers les meilleurs contenus et interviews. »`
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
        ? `Profile/listicle draft to publish after review: “${brandName} is a creator worth following in ${business} for a clear angle, useful content, and public proof. Add the niche, active platforms, best proof, and press/profile links. ${competitorText}”`
        : `FAQ draft to publish after review: “If you are comparing options in ${business}, start with your use case, available proof, and the next step. ${brandName} should present its use cases, reviews or verifiable proof, and a direct answer to this question. ${competitorText}”`,
    google: segment?.key === "local_independent"
      ? `Google Business sentence to paste: “${brandName} helps clients choose ${business} with clear booking steps, verifiable reviews, and up-to-date local information.”`
      : segment?.key === "creator_influencer"
        ? `Social/profile sentence to paste: “${brandName} creates content about ${business} worth following for clear advice, public proof, and links to the best content and interviews.”`
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
  // Filet de sécurité à l'affichage : les audits déjà en base ont été calculés avant le
  // correctif du 21/07 et peuvent contenir la marque elle-même dans ses concurrents
  // (« Pick » pour « GetPick »). On ne réécrit pas la base, on ne l'affiche plus.
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
  const monitorContentBlocks = complete && !failed && isMonitorReport
    ? priorityGapQuestions(questions).slice(0, 3).map((question) => treatmentProofForQuestion(audit.brand_name, displayCategory, question, competitors, answerEngineName, locale, icpSegment))
    : [];
  const copyLabel = locale === "fr" ? "Copier" : "Copy";
  const copiedLabel = locale === "fr" ? "Copié ✓" : "Copied ✓";
  const monitorActions = (audit.raw_results?.monitoring?.actions?.slice(0, 3) ?? []).map((action) => localizePlainAction(action, locale));
  // Tip contenu "YouTube = signal #1" (étude Ahrefs 75k marques) : ponctuel, affiché
  // uniquement quand des sources ont été citées par les moteurs IA et qu'aucune
  // n'est une vidéo YouTube. Page-only, zéro appel réseau : `monitoring.sources`
  // si présent, sinon recalcul depuis les questions stockées (audits antérieurs
  // à la feature — sans ce repli, ils passeraient un tableau vide et le tip
  // s'afficherait sans donnée).
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
  const agentSentimentLabel = audit.raw_results?.brandSentiment?.label ?? "not_enough_signal";
  // Les audits antérieurs à la feature n'ont pas de categoryPerception stocké ; on le
  // recalcule depuis leurs surfaces, qui ne portent pas de catégorie perçue et rendent
  // donc "not_enough_signal". Un ancien rapport n'affiche jamais de verdict inventé.
  const categoryPerception: CategoryPerception =
    audit.raw_results?.categoryPerception ?? categoryPerceptionFromPrompts(questions, audit.raw_results?.category ?? "");
  // Audit lancé sans email : le verdict reste visible, le détail est échangé
  // contre l'email (voir ClaimReportGate). Une fois réclamé, le rapport s'ouvre.
  //
  // On se base sur l'EMAIL de l'audit, pas sur un drapeau `raw_results.anonymous` :
  // la réclamation met à jour l'email, et un drapeau maintenu en parallèle serait
  // resté à true, laissant le rapport verrouillé pour toujours. L'email est la
  // seule source de vérité.
  const reportLocked = isAnonymousEmail(audit.email) && complete && !failed;

  const aiCrawl = complete && !failed ? await checkAiCrawlability(audit.website_url) : null;

  // Fichiers techniques (Monitor + Agent) : générés depuis les VRAIES questions
  // d'achat auditées — le chaînon « l'agent agit » (vs les conseils seuls).
  // Génération pure côté serveur, zéro appel réseau supplémentaire.
  const technicalAssets = complete && !failed && !isFreeReport && !reportLocked
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
  // Diagnostic produit shopping IA : page-only, muet sans signal (bloc absent si
  // `productShopping` est null). Non gaté par tier → visible sur les 3 offres.
  const productShopping = complete && !failed ? audit.raw_results?.productShopping ?? null : null;
  const productFixSnippet = productShopping?.fixJsonLd
    ? `<script type="application/ld+json">\n${productShopping.fixJsonLd}\n</script>`
    : null;
  const aiCrawlOk = aiCrawl?.state === "ok";
  const aiCrawlUnreachable = aiCrawl?.state === "unreachable";
  // « injoignable » n'est PAS « bloqué » : libellé et couleur distincts, sinon on
  // annonce à une marque bien configurée qu'elle bloque les IA alors que c'est son DNS.
  const aiCrawlLabel = aiCrawlUnreachable
    ? locale === "fr" ? "Site injoignable" : "Site unreachable"
    : locale === "fr" ? "Lisible par les IA" : "Readable by AI";
  const aiCrawlHint = !aiCrawl
    ? ""
    : aiCrawl.state === "unreachable"
      ? locale === "fr"
        ? "Site injoignable — vérifie ton DNS (ni l'apex ni le www ne répondent)"
        : "Site unreachable — check your DNS (neither apex nor www responds)"
      : aiCrawl.blocked.length
        ? locale === "fr"
          ? `Bloqués : ${aiCrawl.blocked.join(", ")}`
          : `Blocked: ${aiCrawl.blocked.join(", ")}`
        : aiCrawl.llmsFound
          ? locale === "fr"
            ? "Aucun bot bloqué · llms.txt présent"
            : "No bot blocked · llms.txt present"
          : locale === "fr"
            ? "Aucun bot IA bloqué"
            : "No AI bot blocked";

  type PillarStatus = "ok" | "fail" | "unknown";
  const agentReadyPillars: { status: PillarStatus; label: string; hint: string }[] = complete && !failed
    ? [
        {
          status: aiCrawlUnreachable ? "unknown" : aiCrawlOk ? "ok" : "fail",
          label: aiCrawlLabel,
          hint: aiCrawlHint,
        },
        {
          status: audit.raw_results?.structuredDataFound ? "ok" : "fail",
          label: locale === "fr" ? "Comprise par l'IA" : "Understood by AI",
          hint: locale === "fr" ? "Données structurées lisibles" : "Structured data readable",
        },
        {
          status: brandMentionCount > 0 ? "ok" : "fail",
          label: locale === "fr" ? "Recommandée par l'IA" : "Recommended by AI",
          hint: `${brandMentionCount}/${questionCount || 0}`,
        },
        {
          status: agentSentimentLabel === "positive" || agentSentimentLabel === "neutral" ? "ok" : "fail",
          label: locale === "fr" ? "Décrite positivement" : "Positively described",
          hint: locale === "fr" ? "Sentiment IA" : "AI sentiment",
        },
      ]
    : [];
  const agentReadyScore = agentReadyPillars.filter((pillar) => pillar.status === "ok").length;
  // Un pilier « injoignable » n'est ni acquis ni raté : il sort du dénominateur
  // plutôt que de compter comme un échec qu'on ne peut pas prouver.
  const agentReadyTotal = agentReadyPillars.filter((pillar) => pillar.status !== "unknown").length;
  const pillarColor = (status: PillarStatus) => (status === "ok" ? "#CAFF3C" : status === "unknown" ? "#FFB84D" : "#FF8F6B");
  const pillarIcon = (status: PillarStatus) => (status === "ok" ? "✓" : status === "unknown" ? "!" : "✗");

  // Share of voice ranking: the brand ranked against every competitor the engine named,
  // using the exact same mention counts already computed above (no new data source).
  const sovTotalMentions = brandMentionCount + totalCompetitorMentions;
  const sovRows =
    complete && !failed && sovTotalMentions > 0
      ? [
          { name: audit.brand_name, count: brandMentionCount, isBrand: true },
          ...rankedCompetitors.slice(0, 5).map((item) => ({ name: item.name, count: item.count, isBrand: false })),
        ]
          .filter((row) => row.count > 0 || row.isBrand)
          .map((row) => ({ ...row, pct: Math.round((row.count / sovTotalMentions) * 100) }))
          .sort((a, b) => b.count - a.count)
      : [];
  const sovLeader = sovRows.find((row) => !row.isBrand) ?? null;
  const sovBrandLeads = sovRows.length > 0 && sovRows[0].isBrand && brandMentionCount > 0;
  const sovMaxPct = sovRows.reduce((max, row) => Math.max(max, row.pct), 0) || 100;

  // Fair-share benchmark: with N brands named on these questions, an even split gives each 100/N.
  // Deliberately relative to the actual competitive set instead of a fixed "<15% is bad" threshold —
  // a 12% share against 8 brands is fine, against 2 brands it is a hole.
  const sovBrandCount = sovRows.length;
  const sovFairSharePct = sovBrandCount > 0 ? Math.round(100 / sovBrandCount) : 0;
  const sovBandLabel =
    sovBrandCount === 0
      ? null
      : brandMentionCount === 0
        ? copy.sovBandInvisible
        : shareOfVoicePct < sovFairSharePct * 0.5
          ? copy.sovBandFarBelow
          : shareOfVoicePct < sovFairSharePct * 0.9
            ? copy.sovBandBelow
            : shareOfVoicePct < sovFairSharePct * 1.25
              ? copy.sovBandFair
              : copy.sovBandAbove;
  const sovBandColor =
    brandMentionCount === 0 || shareOfVoicePct < sovFairSharePct * 0.5
      ? "#FF8F6B"
      : shareOfVoicePct < sovFairSharePct * 0.9
        ? "#FFD166"
        : "#CAFF3C";

  const actionImpactLabel = (index: number) =>
    index === 0 ? copy.actionImpactHigh : index === 1 ? copy.actionImpactMedium : copy.actionImpactSupport;

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

      <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-6 sm:py-8">
        <nav className="mb-6 flex items-center justify-between gap-4">
          <Link href="/" className="text-xl text-[#F0F0EC] no-underline" style={{ fontFamily: "var(--font-display)" }}>
            GetPick
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
                <div className="flex flex-col justify-center gap-3">
                  <span
                    className="inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.12em]"
                    style={{
                      color: brandMentionCount > 0 ? "#CAFF3C" : "#FF8F6B",
                      background: brandMentionCount > 0 ? "rgba(202,255,60,0.1)" : "rgba(255,143,107,0.1)",
                    }}
                  >
                    {brandMentionCount > 0
                      ? locale === "fr" ? "Recommandé par l'IA" : "Recommended by AI"
                      : locale === "fr" ? "Pas encore recommandé" : "Not recommended yet"}
                  </span>
                  <h2 className="m-0 text-[1.7rem] leading-[1.08] tracking-[-0.03em] sm:text-[2rem]" style={{ fontFamily: "var(--font-display)" }}>
                    {brandMentionCount > 0
                      ? locale === "fr" ? "Bonne nouvelle : l'IA te recommande." : "Good news — AI recommends you."
                      : locale === "fr" ? "L'IA ne te recommande pas encore." : "AI doesn't recommend you yet."}
                  </h2>
                  <p className="m-0 text-base font-bold leading-6 text-[#C7C7D1]">
                    {questionCount > 0
                      ? locale === "fr"
                        ? `Gemini te cite sur ${brandMentionCount} des ${questionCount} questions d'achat qu'on a testées${topCompetitor ? `, et cite ${topCompetitor} à ta place` : ""}.`
                        : `Gemini cites you on ${brandMentionCount} of ${questionCount} buyer questions we tested${topCompetitor ? `, and cites ${topCompetitor} in your place` : ""}.`
                      : locale === "fr" ? "Aucune question d'achat n'a encore pu être vérifiée." : "No buyer question could be checked yet."}
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
            </div>

            {/* « L'IA ne sait pas ce que tu vends » — verdict en amont du score.
                Rendu uniquement s'il y a un vrai signal : sans catégorie perçue,
                on n'affiche rien plutôt que d'inventer un diagnostic. */}
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

            {complete && !failed && (isFreeReport || isMonitorReport) ? (
              <VisibilityMonitorCard
                auditId={audit.id}
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
                monitorUrl={MONITOR_CHECKOUT_URL}
                locale={locale}
                variant={isMonitorReport ? "dashboard" : "teaser"}
                trend={isMonitorReport ? monitoringTrend : undefined}
                scoreDelta={isMonitorReport ? monitoringScoreDelta : undefined}
              />
            ) : null}

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

          {agentReadyPillars.length ? (
            <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">
                    {locale === "fr" ? "Prêt pour les agents acheteurs" : "Ready for AI shopping agents"}
                  </p>
                  <p className="m-0 mt-1 text-sm font-bold leading-6 text-[#A7A7B4]">
                    {locale === "fr"
                      ? "Bientôt, des agents IA achèteront pour tes clients. Voici où tu en es."
                      : "Soon, AI agents will buy for your customers. Here's where you stand."}
                  </p>
                </div>
                <div
                  className="text-3xl font-black"
                  style={{ color: agentReadyScore >= agentReadyTotal - 1 ? "#CAFF3C" : "#FF8F6B", fontFamily: "var(--font-display)" }}
                >
                  {agentReadyScore}/{agentReadyTotal}
                </div>
              </div>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {agentReadyPillars.map((pillar) => (
                  <div key={pillar.label} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black" style={{ color: pillarColor(pillar.status) }}>{pillarIcon(pillar.status)}</span>
                      <span className="text-sm font-black text-[#F0F0EC]">{pillar.label}</span>
                    </div>
                    <p className="m-0 mt-1 text-xs font-bold text-[#8E8E9A]">{pillar.hint}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {reportLocked ? <ClaimReportGate auditId={audit.id} locale={locale} /> : null}

          {complete && !failed && !reportLocked ? (
            <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
              <div className="mb-4 flex items-end justify-between gap-4">
                <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                  {isAnswerEngineReport ? copy.competitorsTitle(answerEngineName) : copy.webSearchTitle}
                </h2>
                <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-black text-[#BCBCC8]">{rankedCompetitors.length || competitors.length}</span>
              </div>

              {sovRows.length ? (
                <div className="mb-5 rounded-2xl border border-white/[0.07] bg-black/20 p-4" data-testid="share-of-voice">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.sovEyebrow}</p>
                    <p className="m-0 text-3xl font-black leading-none tracking-[-0.05em]" style={{ color: shareOfVoicePct > 0 ? "#CAFF3C" : "#FF8F6B", fontFamily: "var(--font-display)" }}>
                      {shareOfVoicePct}%
                    </p>
                  </div>

                  {sovBandLabel ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="share-of-voice-benchmark">
                      <span
                        className="rounded-full px-2.5 py-1 text-[0.6875rem] font-black uppercase tracking-[0.1em]"
                        style={{ color: sovBandColor, background: `${sovBandColor}1F`, border: `1px solid ${sovBandColor}33` }}
                      >
                        {sovBandLabel}
                      </span>
                      <span className="text-xs font-bold leading-5 text-[#8E8E9A]">
                        {copy.sovFairShareLine(sovFairSharePct, sovBrandCount)}
                      </span>
                    </div>
                  ) : null}

                  <ul className="m-0 mt-4 grid list-none gap-2.5 p-0">
                    {sovRows.map((row) => (
                      <li key={`${row.isBrand ? "brand" : "competitor"}-${row.name}`} className="grid gap-1.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className={`truncate text-sm font-black ${row.isBrand ? "text-[#CAFF3C]" : "text-[#D6D6DF]"}`}>
                            {row.name}
                            {row.isBrand ? <span className="ml-2 text-xs font-black uppercase tracking-[0.12em] text-[#8E8E9A]">{copy.sovYouLabel}</span> : null}
                          </span>
                          <span className={`shrink-0 text-sm font-black ${row.isBrand ? "text-[#CAFF3C]" : "text-[#8E8E9A]"}`}>
                            {row.pct}% <span className="text-[#777787]">({row.count}x)</span>
                          </span>
                        </div>
                        <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(row.pct === 0 ? 0 : 4, Math.round((row.pct / sovMaxPct) * 100))}%`,
                              background: row.isBrand ? "#CAFF3C" : "rgba(240,240,236,0.28)",
                            }}
                          />
                          {row.isBrand && sovFairSharePct > 0 && sovFairSharePct <= sovMaxPct ? (
                            <span
                              aria-hidden
                              className="absolute top-0 h-full w-px bg-[#F0F0EC]/55"
                              style={{ left: `${Math.min(100, Math.round((sovFairSharePct / sovMaxPct) * 100))}%` }}
                            />
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>

                  <p className="m-0 mt-4 text-sm font-bold leading-6 text-[#C7C7D1]">
                    {brandMentionCount === 0
                      ? copy.sovInvisibleLine(answerEngineName)
                      : `${copy.sovLead(shareOfVoicePct, answerEngineName)} ${
                          sovBrandLeads || !sovLeader ? copy.sovWinningLine : copy.sovLeaderLine(sovLeader.name, sovLeader.pct)
                        }`}
                  </p>
                </div>
              ) : null}

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
            <section className="rounded-[1.5rem] border border-[#CAFF3C]/20 bg-[#CAFF3C]/[0.055] p-5 sm:p-6" data-testid="monitor-actions-gate">
              <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">
                {locale === "fr" ? "Monitor · 9 € / mois" : "Monitor · €9 / month"}
              </p>
              <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                {locale === "fr" ? "Tes 3 actions prioritaires cette semaine" : "Your 3 priority actions this week"}
              </h2>
              <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">
                {locale === "fr"
                  ? "Le gratuit te montre le diagnostic. Monitor te donne la liste d'actions concrètes à faire — reclassée chaque semaine selon ce que l'IA voit."
                  : "Free shows you the diagnosis. Monitor gives you the concrete action list to run — re-ranked every week from what AI sees."}
              </p>

              {monitorActions.length ? (
                <>
                  <ol className="m-0 mt-4 grid list-none gap-2 p-0">
                    {monitorActions.map((action, index) => (
                      <li key={`${action.title}-${index}`} className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-[#CAFF3C]">{index + 1}.</span>
                          <span className="rounded-full border border-[#CAFF3C]/25 bg-[#CAFF3C]/10 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.08em] text-[#CAFF3C]">
                            {actionImpactLabel(index)}
                          </span>
                        </div>
                        <p className="m-0 mt-1.5 text-sm font-black text-[#F0F0EC]">{action.title}</p>
                        {action.basedOn?.length ? (
                          <p className="m-0 mt-1.5 text-xs font-bold leading-5 text-[#8E8E9A]">
                            <span className="text-[#CAFF3C]">{copy.actionWhyFirst} · </span>
                            {copy.actionWhyBecause(action.basedOn)}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>

                  <div className="relative mt-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#09090B]/80">
                    <div className="grid gap-2 p-4 blur-[6px] select-none" aria-hidden="true">
                      <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">
                        {locale === "fr" ? "Action 1 · comment faire" : "Action 1 · how to do it"}
                      </p>
                      <p className="m-0 text-sm font-bold leading-6 text-[#D6D6DF]">{monitorActions[0].doThis}</p>
                      <p className="m-0 text-sm font-bold leading-6 text-[#D6D6DF]">{copy.where} {monitorActions[0].where}</p>
                    </div>
                    <div className="absolute inset-0 grid place-items-center gap-2 bg-[#09090B]/55 p-4 text-center backdrop-blur-[1px]">
                      <div className="text-xl">🔒</div>
                      <FunnelCheckoutLink
                        auditId={audit.id}
                        href={MONITOR_CHECKOUT_URL}
                        source="report_monitor_actions"
                        className="inline-flex rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] no-underline shadow-2xl shadow-[#CAFF3C]/20 transition hover:brightness-110"
                      >
                        {locale === "fr" ? "Débloquer mes 3 actions — 9 € →" : "Unlock my 3 actions — €9 →"}
                      </FunnelCheckoutLink>
                    </div>
                  </div>
                </>
              ) : (
                <a href={MONITOR_CHECKOUT_URL} className="mt-5 inline-flex rounded-xl border border-white/15 px-5 py-3 text-sm font-black text-[#D6D6DF] no-underline transition hover:border-[#CAFF3C]/40 hover:text-[#CAFF3C]" data-ph-capture-attribute-plan="monitor_9eur" data-ph-capture-attribute-source="free_audit_report_secondary">
                  {copy.secondaryCta}
                </a>
              )}
              <p className="m-0 mt-3 text-xs font-bold leading-5 text-[#8E8E9A]">{copy.reportReassurance}</p>
            </section>
          ) : null}

          {complete && !failed && isMonitorReport ? (
            <section className="rounded-[1.5rem] border border-[#CAFF3C]/20 bg-[#CAFF3C]/[0.055] p-5 sm:p-6">
              <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">
                {locale === "fr" ? "Monitor · contenu à coller" : "Monitor · content to paste"}
              </p>
              <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                {locale === "fr" ? "Ton contenu prêt à coller cette semaine" : "Your ready-to-paste content this week"}
              </h2>
              <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">
                {locale === "fr"
                  ? "Colle ces textes sur ton site et ta fiche Google Business. Ils répondent aux questions d'achat où l'IA ne te cite pas encore. Relis-les avant publication."
                  : "Paste these onto your site and Google Business Profile. They answer the buyer questions where AI doesn't cite you yet. Review before publishing."}
              </p>

              {monitorContentBlocks.length ? (
                <div className="mt-4 grid gap-4">
                  {monitorContentBlocks.map((block, index) => (
                    <div key={`${block.title}-${index}`} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                      <p className="m-0 text-sm font-black text-[#CAFF3C]">{index + 1}. {block.title}</p>
                      <p className="m-0 mt-1 text-xs font-bold leading-5 text-[#8E8E9A]">{block.gap}</p>
                      <div className="mt-3 grid gap-2.5">
                        <CopyBlock
                          label={locale === "fr" ? "Réponse FAQ / section de page" : "FAQ answer / page section"}
                          text={extractPasteable(block.draft)}
                          copyLabel={copyLabel}
                          copiedLabel={copiedLabel}
                        />
                        <CopyBlock
                          label={locale === "fr" ? "Phrase fiche Google Business" : "Google Business sentence"}
                          text={extractPasteable(block.google)}
                          copyLabel={copyLabel}
                          copiedLabel={copiedLabel}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : monitorActions.length ? (
                <ol className="m-0 mt-4 grid list-none gap-3 p-0">
                  {monitorActions.map((action, index) => (
                    <li key={`${action.title}-${index}`} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-black text-[#CAFF3C]">{index + 1}.</span>
                        <span className="rounded-full border border-[#CAFF3C]/25 bg-[#CAFF3C]/10 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.08em] text-[#CAFF3C]">
                          {actionImpactLabel(index)}
                        </span>
                      </div>
                      <p className="m-0 mt-1.5 text-sm font-black text-[#F0F0EC]">{action.title}</p>
                      {action.basedOn?.length ? (
                        <p className="m-0 mt-1.5 text-xs font-bold leading-5 text-[#A7A7B4]">
                          <span className="text-[#CAFF3C]">{copy.actionWhyFirst} · </span>
                          {copy.actionWhyBecause(action.basedOn)}
                        </p>
                      ) : null}
                      <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#F0F0EC]">{action.doThis}</p>
                      <p className="m-0 mt-2 text-xs font-bold uppercase tracking-[0.08em] text-[#8E8E9A]">{copy.where} {action.where}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">{copy.monitorEmpty}</p>
              )}

              {youtubeTipRelevant ? (
                <div
                  className="mt-3 rounded-2xl border border-[#FF8F6B]/25 bg-[#FF8F6B]/[0.06] p-4"
                  data-testid="youtube-content-tip"
                >
                  <span className="rounded-full border border-[#FF8F6B]/30 bg-[#FF8F6B]/10 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.08em] text-[#FF8F6B]">
                    {copy.youtubeTipBadge}
                  </span>
                  <p className="m-0 mt-1.5 text-sm font-black text-[#F0F0EC]">{copy.youtubeTipTitle}</p>
                  <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#D6D6DF]">{copy.youtubeTipBody}</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {technicalAssets ? (
            <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6" data-testid="technical-files">
              <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.techEyebrow}</p>
              <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                {copy.techTitle}
              </h2>
              <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">{copy.techBody}</p>

              {robotsFix && aiCrawl?.blocked.length ? (
                <div className="mt-4 rounded-2xl border border-[#FF8F6B]/25 bg-[#FF8F6B]/[0.06] p-4" data-testid="technical-files-robots">
                  <p className="m-0 mb-3 text-sm font-bold leading-6 text-[#F3C7B7]">{copy.techRobotsIntro(aiCrawl.blocked.join(", "))}</p>
                  <CopyBlock label={copy.techRobotsLabel} text={robotsFix} copyLabel={copyLabel} copiedLabel={copiedLabel} />
                </div>
              ) : null}

              <div className="mt-4 grid gap-4">
                <div>
                  <CopyBlock label={copy.techJsonLdLabel} text={jsonLdSnippet} copyLabel={copyLabel} copiedLabel={copiedLabel} />
                  <p className="m-0 mt-1.5 text-xs font-bold leading-5 text-[#8E8E9A]">{copy.techJsonLdHint}</p>
                </div>
                <div>
                  <CopyBlock label={copy.techLlmsLabel} text={technicalAssets.llmsTxt} copyLabel={copyLabel} copiedLabel={copiedLabel} />
                  <p className="m-0 mt-1.5 text-xs font-bold leading-5 text-[#8E8E9A]">{copy.techLlmsHint}</p>
                </div>
              </div>

              <p className="m-0 mt-4 text-xs font-black uppercase tracking-[0.08em] text-[#8E8E9A]">{copy.techRegenNote}</p>
            </section>
          ) : null}

          {/* Diagnostic produit shopping IA (SKU phare + balisage Product).
              Rendu uniquement s'il y a un vrai signal produit détecté depuis le
              site — sinon rien (discipline « muet sans signal »). Non gaté par
              tier : visible sur les 3 offres. */}
          {productShopping ? (
            (() => {
              const absent = productShopping.markup === "absent";
              const tone = absent ? "#FFB84D" : "#CAFF3C";

              return (
                <section
                  className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6"
                  data-testid="product-shopping"
                >
                  <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em]" style={{ color: tone }}>
                    {copy.productEyebrow}
                  </p>
                  <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                    {copy.productTitle}
                  </h2>

                  <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3">
                    <p className="m-0 text-[0.6875rem] font-black uppercase tracking-[0.1em] text-[#8E8E9A]">
                      {copy.productSkuLabel}
                    </p>
                    <p className="m-0 mt-1 text-sm font-bold text-[#F0F0EC]">{productShopping.sku.name}</p>
                    <a
                      href={productShopping.sku.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="m-0 mt-1 block break-all text-xs font-bold text-[#8E9A8F] underline"
                    >
                      {productShopping.sku.url}
                    </a>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-1 text-[0.6875rem] font-black uppercase tracking-[0.1em]"
                      style={{ color: tone, background: `${tone}22`, border: `1px solid ${tone}44` }}
                    >
                      {absent ? copy.productMarkupAbsent : copy.productMarkupPresent}
                    </span>
                  </div>

                  {productFixSnippet ? (
                    <div className="mt-4">
                      <CopyBlock label={copy.productFixLabel} text={productFixSnippet} copyLabel={copyLabel} copiedLabel={copiedLabel} />
                      <p className="m-0 mt-1.5 text-xs font-bold leading-5 text-[#8E8E9A]">{copy.productFixHint}</p>
                    </div>
                  ) : null}
                </section>
              );
            })()
          ) : null}

          {complete && !failed && !isFreeReport ? (
            <section className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.035] p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                  {isAnswerEngineReport ? copy.questionsTitle(answerEngineName) : copy.webQuestionsTitle}
                </h2>
                {checkedPromptCount > 0 ? (
                  <span className="rounded-full border border-[#CAFF3C]/25 bg-[#CAFF3C]/10 px-3 py-1 text-xs font-black text-[#CAFF3C]">
                    {locale === "fr" ? `Recommandé sur ${recommendedPromptCount}/${checkedPromptCount}` : `Recommended on ${recommendedPromptCount}/${checkedPromptCount}`}
                  </span>
                ) : (
                  <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs font-black text-[#BCBCC8]">
                    {isAnswerEngineReport ? answerEngineName : copy.nativeWebSearch}
                  </span>
                )}
              </div>

              {sortedPromptRows.length ? (
                <div className="mb-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4" data-testid="prompt-methodology">
                  <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.methodEyebrow}</p>
                  <p className="m-0 mt-1.5 text-base font-black leading-6 text-[#F0F0EC]">{copy.methodTitle}</p>
                  <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#A7A7B4]">
                    {copy.methodBody(isAnswerEngineReport ? answerEngineName : copy.nativeWebSearch)}
                  </p>
                  <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
                    {[copy.methodChipUnbranded, copy.methodChipIntent, copy.methodChipLive].map((chip) => (
                      <li key={chip} className="rounded-full border border-white/[0.09] bg-white/[0.05] px-2.5 py-1 text-[0.6875rem] font-black uppercase tracking-[0.1em] text-[#BCBCC8]">
                        {chip}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {gapPromptCount > 0 ? (
                <p className="m-0 mb-4 rounded-xl border border-[#FF8F6B]/20 bg-[#FF8F6B]/[0.06] px-4 py-3 text-sm font-bold leading-6 text-[#F3C7B7]">
                  {locale === "fr"
                    ? `${gapPromptCount} question${gapPromptCount > 1 ? "s" : ""} d'achat où l'IA cite un concurrent à ta place (en orange ci-dessous). Ce sont exactement celles que tes actions prioritaires corrigent.`
                    : `${gapPromptCount} buyer question${gapPromptCount > 1 ? "s" : ""} where AI cites a competitor instead of you (in orange below). These are exactly what your priority actions fix.`}
                </p>
              ) : null}

              {sortedPromptRows.length ? (
                <ol className="m-0 grid list-none gap-2 p-0">
                  {sortedPromptRows.map(({ question, analysis }) => {
                    const pill = promptStatusPill(analysis.state, locale);
                    const isGap = analysis.state === "missing";
                    return (
                      <li key={question.prompt} className={`rounded-2xl border p-4 ${isGap ? "border-[#FF8F6B]/25 bg-[#FF8F6B]/[0.05]" : "border-white/[0.07] bg-black/20"}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="m-0 max-w-[80%] text-sm font-black text-[#F0F0EC]">{question.prompt}</p>
                          <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-black" style={{ color: pill.color, background: pill.bg }}>
                            {pill.label}
                          </span>
                        </div>
                        {analysis.state === "unchecked" ? (
                          <p className="m-0 mt-2 text-xs font-bold text-[#8E8E9A]">{localizedUnavailableReason(analysis.reason, locale, answerEngineName)}</p>
                        ) : analysis.competitors.length ? (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-bold text-[#8E9A8F]">{locale === "fr" ? "Cité à ta place :" : "Cited instead of you:"}</span>
                            {analysis.competitors.slice(0, 5).map((competitor) => (
                              <span key={competitor} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs font-black text-[#DFE7DB]">{competitor}</span>
                            ))}
                          </div>
                        ) : null}
                        {isGap ? (
                          <p className="m-0 mt-2.5 text-xs font-black text-[#CAFF3C]">
                            {locale === "fr" ? "→ Ta 1re action prioritaire (FAQ) répond mot pour mot à cette question." : "→ Your #1 priority action (FAQ) answers this exact question."}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="rounded-2xl border border-[#FF8A8A]/20 bg-[#FF5F5F]/10 p-4 text-sm font-bold text-[#FFB1B1]">
                  {isAnswerEngineReport ? copy.engineUnavailable(answerEngineName) : copy.webUnavailable}
                </div>
              )}
            </section>
          ) : null}

          {isAgentReport && proof ? (
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
