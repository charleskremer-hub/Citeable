import FunnelCheckoutLink from "./FunnelCheckoutLink";
import type { Locale } from "@/lib/i18n";

type CompetitorMention = { name: string; count: number };
type TrendPoint = { score: number; createdAt: string };

type Props = {
  auditId: string;
  websiteUrl: string;
  engine: string;
  score: number;
  scoreColor: string;
  recommended: boolean;
  brandMentionCount: number;
  questionCount: number;
  shareOfVoicePct: number;
  sentimentLabel: string;
  competitors: CompetitorMention[];
  monitorUrl: string;
  locale: Locale;
  variant?: "teaser" | "dashboard";
  trend?: TrendPoint[];
  scoreDelta?: number | null;
};

function sentimentWord(label: string, locale: Locale) {
  const map: Record<string, [string, string]> = {
    positive: ["Positif", "Positive"],
    neutral: ["Neutre", "Neutral"],
    negative: ["Négatif", "Negative"],
    not_enough_signal: ["Signal faible", "Low signal"],
  };
  const pair = map[label] ?? map.not_enough_signal;
  return locale === "fr" ? pair[0] : pair[1];
}

function trendPolyline(points: TrendPoint[]) {
  const n = points.length;
  return points
    .map((point, index) => {
      const x = n <= 1 ? 0 : (index / (n - 1)) * 640;
      const clamped = Math.max(0, Math.min(100, point.score));
      const y = 60 - (clamped / 100) * 52;
      return `${x.toFixed(0)},${y.toFixed(0)}`;
    })
    .join(" ");
}

export function VisibilityMonitorCard({
  auditId,
  websiteUrl,
  engine,
  score,
  scoreColor,
  recommended,
  brandMentionCount,
  questionCount,
  shareOfVoicePct,
  sentimentLabel,
  competitors,
  monitorUrl,
  locale,
  variant = "teaser",
  trend = [],
  scoreDelta = null,
}: Props) {
  const fr = locale === "fr";
  const isDashboard = variant === "dashboard";
  const host = websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const recommendedColor = recommended ? "#CAFF3C" : "#FF8F6B";
  const topCompetitors = competitors.slice(0, 3);

  const trendPoints = (trend ?? []).filter((point) => typeof point?.score === "number");
  const hasRealTrend = trendPoints.length >= 2;
  const deltaText =
    typeof scoreDelta === "number" && scoreDelta !== 0
      ? `${scoreDelta > 0 ? "+" : ""}${scoreDelta} ${fr ? "pts vs dernier re-check" : "pts vs last re-check"}`
      : null;
  const deltaColor = typeof scoreDelta === "number" && scoreDelta < 0 ? "#FF8F6B" : "#CAFF3C";

  const tiles: { label: string; value: string; color?: string }[] = [
    {
      label: fr ? "Recommandé par l'IA" : "Recommended by AI",
      value: `${recommended ? (fr ? "Oui" : "Yes") : "Non"} · ${brandMentionCount}/${questionCount || 0}`,
      color: recommendedColor,
    },
    { label: fr ? "Part de voix" : "Share of voice", value: `${shareOfVoicePct}%` },
    { label: fr ? "Sentiment IA" : "AI sentiment", value: sentimentWord(sentimentLabel, locale) },
    {
      label: fr ? "Score de visibilité" : "Visibility score",
      value: `${score}/100`,
      color: scoreColor,
    },
  ];

  return (
    <section className="mt-6 overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-[#0E1210] p-4 sm:p-5" data-testid={isDashboard ? "visibility-dashboard-card" : "visibility-monitor-card"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#8E9A8F]">
            {isDashboard
              ? fr ? "Ton dashboard visibilité IA" : "Your AI visibility dashboard"
              : fr ? "Ta visibilité IA · suivi" : "Your AI visibility · tracking"}
          </p>
          <p className="m-0 mt-1 text-lg font-black text-[#F0F0EC]">{host}</p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-[#8E9A8F]">
          {engine} · {fr ? "aujourd'hui" : "today"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-white/[0.07] bg-black/25 p-3">
            <div className="text-[11px] font-bold text-[#8E9A8F]">{tile.label}</div>
            <div className="mt-1 text-base font-black" style={tile.color ? { color: tile.color } : undefined}>
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      {topCompetitors.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.07] bg-black/25 p-3">
          <span className="text-[11px] font-bold text-[#8E9A8F]">{fr ? "Cité à ta place :" : "Cited instead of you:"}</span>
          {topCompetitors.map((competitor) => (
            <span key={competitor.name} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-black text-[#DFE7DB]">
              {competitor.name}
              {competitor.count > 1 ? <span className="ml-1 text-[#8E9A8F]">×{competitor.count}</span> : null}
            </span>
          ))}
        </div>
      ) : null}

      {isDashboard ? (
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-black/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-[#8E9A8F]">
              {fr ? "Évolution de ton score — re-check hebdo" : "Your score over time — weekly re-check"}
            </div>
            {deltaText ? (
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-black" style={{ color: deltaColor }}>
                {deltaText}
              </span>
            ) : null}
          </div>

          {hasRealTrend ? (
            <svg width="100%" height="64" viewBox="0 0 640 64" preserveAspectRatio="none" className="mt-2" aria-hidden="true">
              <polyline points={trendPolyline(trendPoints)} fill="none" stroke="#CAFF3C" strokeWidth="3" />
            </svg>
          ) : (
            <div className="mt-3 grid gap-1 rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-center">
              <div className="text-sm font-black text-[#F0F0EC]">
                {fr ? "Premier point enregistré ✓" : "First data point recorded ✓"}
              </div>
              <div className="text-xs font-bold text-[#A9B6A3]">
                {fr ? "Ta courbe de tendance apparaît dès le prochain re-check hebdo." : "Your trend line appears at the next weekly re-check."}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-black/25 p-4">
          <div className="text-xs font-bold text-[#8E9A8F]">
            {fr ? "Évolution de ton score — 8 dernières semaines" : "Your score over time — last 8 weeks"}
          </div>
          <svg
            width="100%"
            height="64"
            viewBox="0 0 640 64"
            preserveAspectRatio="none"
            className="mt-2 blur-[3px] opacity-50"
            aria-hidden="true"
          >
            <polyline points="0,48 90,44 180,46 270,37 360,39 450,28 540,31 640,20" fill="none" stroke="#CAFF3C" strokeWidth="3" />
            <polyline points="0,56 90,54 180,55 270,51 360,52 450,48 540,49 640,46" fill="none" stroke="#5A6B58" strokeWidth="2" />
          </svg>
          <div className="absolute inset-0 grid place-items-center gap-1.5 p-4 text-center">
            <div className="text-xl">🔒</div>
            <div className="text-sm font-black text-[#F0F0EC]">
              {fr ? "Suis ta progression chaque semaine" : "Track your progress every week"}
            </div>
            <div className="text-xs font-bold text-[#A9B6A3]">
              {fr ? "Le gratuit montre aujourd'hui. Monitor montre la tendance." : "Free shows today. Monitor shows the trend."}
            </div>
          </div>
        </div>
      )}

      {isDashboard ? null : (
        <div className="mt-4">
          <FunnelCheckoutLink
            auditId={auditId}
            href={monitorUrl}
            source="report_monitor_card"
            className="inline-flex w-full justify-center rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] no-underline transition hover:brightness-110 sm:w-auto"
          >
            {fr ? "Suivre chaque mois — 9 € →" : "Track every month — €9 →"}
          </FunnelCheckoutLink>
        </div>
      )}
    </section>
  );
}
