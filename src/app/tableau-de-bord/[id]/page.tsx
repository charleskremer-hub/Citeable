import type { Metadata } from "next";
import Link from "next/link";
import { ensureAuditSchema, pool } from "@/lib/db";
import { generateGeoAgentAssetsFromAudit } from "@/lib/audit-engine";
import type { AuditRawResults, BuyerIntentPromptResult } from "@/lib/audit-engine";
import { type Locale } from "@/lib/i18n";
import { cityFromPrompts, hostedAnswerPageSlug } from "@/lib/hosted-answer-page";
import { AUDIT_SHARE_TOKEN_PARAM, verifyAuditShareToken } from "@/lib/audit-share-token";
import { computeGeoVisibility, type VisibilityPlayer } from "@/lib/geo-visibility";
import { computeShiftProof, movementLabel, type ShiftMovement } from "@/lib/shift-proof";

export const dynamic = "force-dynamic";

// Tableau de bord CLIENT (livrable privé) : jamais indexé.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const siteUrl = "https://www.getpick.ai";

type DashboardRow = {
  id: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  competitors_found: string[] | null;
  raw_results: AuditRawResults | null;
  previous_audit_id: string | null;
  answer_page_published_at: string | null;
};

type DashboardPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function loadAudit(id: string): Promise<DashboardRow | null> {
  const result = await pool.query<DashboardRow>(
    `SELECT id, brand_name, website_url, score, competitors_found, raw_results, previous_audit_id, answer_page_published_at
     FROM audits WHERE id = $1 AND score IS NOT NULL`,
    [id],
  );
  return result.rows[0] ?? null;
}

async function previousPrompts(previousId: string | null): Promise<BuyerIntentPromptResult[] | null> {
  if (!previousId) return null;
  const prev = await loadAudit(previousId);
  return prev?.raw_results?.buyerIntentPrompts ?? null;
}

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const MOVEMENT_TONE: Record<ShiftMovement, string> = {
  won: "#123E5C",
  held_you: "#1F8A70",
  lost: "#C0492E",
  held_rival: "#B8862F",
  still_absent: "#8FA0B4",
  new: "#123E5C",
};

export default async function ClientDashboard({ params, searchParams }: DashboardPageProps) {
  await ensureAuditSchema();
  const { id } = await params;
  const token = firstParam((await searchParams)[AUDIT_SHARE_TOKEN_PARAM]);

  const gate = (title: string, body: string) => (
    <main className="min-h-screen bg-[#F5F7FA] text-[#132A43] grid place-items-center px-6" style={{ fontFamily: "var(--font-sans)" }}>
      <div className="max-w-md text-center">
        <h1 className="text-3xl tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>{title}</h1>
        <p className="mt-4 text-[#5B6B82]">{body}</p>
        <Link href="/#audit" className="mt-6 inline-flex rounded-full bg-[#123E5C] px-5 py-3 font-black text-white no-underline">Diagnostic gratuit</Link>
      </div>
    </main>
  );

  if (!verifyAuditShareToken(id, token)) {
    return gate("Lien invalide ou expiré", "Ce tableau de bord s'ouvre depuis le lien personnel qu'on t'a envoyé. Demande-nous un lien à jour si celui-ci a expiré.");
  }

  const audit = await loadAudit(id);
  if (!audit) return gate("Espace introuvable", "On ne trouve pas de diagnostic terminé pour ce lien.");

  const locale: Locale = audit.raw_results?.locale === "en" ? "en" : "fr";
  const fr = locale === "fr";
  const assets = generateGeoAgentAssetsFromAudit(audit);
  const city = cityFromPrompts(assets.prompts);
  const prompts = audit.raw_results?.buyerIntentPrompts ?? [];

  const vis = computeGeoVisibility(prompts, audit.brand_name, locale);
  const proof = computeShiftProof(prompts, await previousPrompts(audit.previous_audit_id), locale);

  const hostedUrl = `${siteUrl}/reponses/${hostedAnswerPageSlug(audit.brand_name, audit.id)}`;
  const published = Boolean(audit.answer_page_published_at);

  const maxCited = Math.max(1, ...vis.players.map((p) => p.citedCount));
  const barRows: VisibilityPlayer[] = [vis.brand, ...vis.competitors.filter((c) => !c.isBrand)].slice(0, 8);

  return (
    <main className="min-h-screen bg-[#F5F7FA] text-[#132A43]" style={{ fontFamily: "var(--font-sans)" }}>
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6">
        <nav className="flex items-center justify-between">
          <Link href="/" className="text-xl tracking-[-0.02em] no-underline text-[#132A43]" style={{ fontFamily: "var(--font-display)" }}>GetPick</Link>
          <span className="text-xs uppercase tracking-[0.16em] text-[#8FA0B4]">{fr ? "Ton espace" : "Your space"}</span>
        </nav>

        <header className="mt-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#123E5C]">{fr ? "Visibilité IA" : "AI visibility"}</p>
          <h1 className="mt-3 text-[clamp(2rem,5vw,3.4rem)] leading-[0.98] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
            {audit.brand_name}{city ? ` · ${city}` : ""}
          </h1>
          <p className="mt-4 max-w-2xl text-[#5B6B82]">{vis.headline}</p>
        </header>

        {/* Section 1 — Visibilité GEO vs concurrents (le cœur) */}
        <section className="mt-10 rounded-[1.4rem] border border-[#E4E9F0] bg-[#FFFFFF] p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-2xl tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>{fr ? "Part de voix dans l'IA" : "AI share of voice"}</h2>
            <span className="text-sm text-[#5B6B82]">{fr ? `Rang ${vis.brandRank}/${vis.playerCount} · ${vis.totalPrompts} questions` : `Rank ${vis.brandRank}/${vis.playerCount} · ${vis.totalPrompts} questions`}</span>
          </div>
          <ul className="m-0 mt-5 flex list-none flex-col gap-2.5 p-0">
            {barRows.map((player) => {
              const tone = player.isBrand ? "#123E5C" : "#9FB1C6";
              const width = Math.round((player.citedCount / maxCited) * 100);
              return (
                <li key={`${player.isBrand ? "brand" : "c"}-${player.name}`} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3">
                  <span className={`truncate text-sm ${player.isBrand ? "font-black text-[#123E5C]" : "text-[#5B6B82]"}`}>
                    {player.isBrand ? `${player.name} ${fr ? "(toi)" : "(you)"}` : player.name}
                  </span>
                  <span className="h-3 rounded-full bg-[#FBFCFD]">
                    <span className="block h-3 rounded-full" style={{ width: `${width}%`, backgroundColor: tone }} />
                  </span>
                  <span className="text-right text-sm tabular-nums text-[#5B6B82]">{player.citedCount}/{vis.totalPrompts}</span>
                </li>
              );
            })}
          </ul>
          {vis.brand.citedCount === 0 && (
            <p className="mt-4 text-sm leading-6 text-[#5B6B82]">
              {fr
                ? "L'IA ne te cite pas encore sur ces questions — c'est exactement ce que GetPick fait bouger."
                : "AI doesn't cite you on these questions yet — that's exactly what GetPick moves."}
            </p>
          )}
        </section>

        {/* Section 2 — Le détail par question d'achat */}
        <section className="mt-6 rounded-[1.4rem] border border-[#E4E9F0] bg-[#FFFFFF] p-6">
          <h2 className="text-2xl tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>{fr ? "Par question d'achat" : "By buyer question"}</h2>
          <p className="mt-2 text-sm text-[#5B6B82]">{fr ? "Qui l'IA cite, question par question." : "Who AI cites, question by question."}</p>
          <ul className="m-0 mt-5 flex list-none flex-col gap-2 p-0">
            {vis.byPrompt.map((row) => (
              <li key={row.prompt} className="rounded-xl border border-[#E4E9F0] bg-[#FBFCFD] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm leading-6 text-[#5B6B82]">{row.prompt}</span>
                  <span className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: row.brandCited ? "#123E5C22" : "#8FA0B422", color: row.brandCited ? "#123E5C" : "#8FA0B4" }}>
                    {row.brandCited ? (fr ? "L'IA te cite" : "AI cites you") : (fr ? "Pas cité" : "Not cited")}
                  </span>
                </div>
                {row.competitorsCited.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.competitorsCited.slice(0, 5).map((name) => (
                      <span key={name} className="rounded-full border border-[#E4E9F0] px-2.5 py-0.5 text-xs text-[#5B6B82]">{name}</span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        {/* Section 3 — Le basculement dans le temps */}
        <section className="mt-6 rounded-[1.4rem] border border-[#E4E9F0] bg-[#FFFFFF] p-6">
          <h2 className="text-2xl tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>{fr ? "Le basculement" : "The shift"}</h2>
          <p className="mt-2 text-sm text-[#5B6B82]">{proof.headline}</p>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Tile label={fr ? "L'IA te cite" : "AI cites you"} value={`${proof.summary.youCitedNow}/${proof.summary.totalQuestions}`} tone="#123E5C" />
            <Tile label={fr ? "Basculé vers toi" : "Moved to you"} value={`${proof.summary.wonCount}`} tone="#1F8A70" />
            <Tile label={fr ? "Reperdu" : "Lost"} value={`${proof.summary.lostCount}`} tone={proof.summary.lostCount ? "#C0492E" : "#8FA0B4"} />
          </div>
          {proof.hasPrevious && (
            <ul className="m-0 mt-5 flex list-none flex-col gap-2 p-0">
              {proof.rows.filter((row) => row.movement === "won" || row.movement === "lost").map((row) => (
                <li key={row.question} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-[#E4E9F0] bg-[#FBFCFD] px-4 py-3">
                  <span className="text-sm leading-6 text-[#5B6B82]">{row.question}</span>
                  <span className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: `${MOVEMENT_TONE[row.movement]}22`, color: MOVEMENT_TONE[row.movement] }}>
                    {movementLabel(row.movement, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Section 4 — Ta page-réponse hébergée */}
        <section className="mt-6 rounded-[1.4rem] border border-[#E4E9F0] bg-[#FFFFFF] p-6">
          <h2 className="text-2xl tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>{fr ? "Ta page-réponse" : "Your answer page"}</h2>
          <p className="mt-3 text-sm leading-6 text-[#5B6B82]">
            {fr
              ? "La page que GetPick héberge et entretient pour toi, hors de ton site, pour être citée par l'IA."
              : "The page GetPick hosts and maintains for you, off your site, to get cited by AI."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: published ? "#123E5C22" : "#8FA0B422", color: published ? "#123E5C" : "#8FA0B4" }}>
              {published ? (fr ? "En ligne" : "Live") : (fr ? "En préparation" : "In preparation")}
            </span>
            <a href={hostedUrl} target="_blank" rel="noreferrer" className="text-sm text-[#123E5C] no-underline">{hostedUrl.replace("https://", "")}</a>
          </div>
        </section>

        <footer className="mt-8 border-t border-[#E4E9F0] pt-6 text-xs text-[#8FA0B4]">
          {fr ? "Espace privé — le lien t'est personnel. GetPick, l'agent qui te fait recommander par l'IA." : "Private space — this link is personal to you. GetPick, the agent that gets you recommended by AI."}
        </footer>
      </div>
    </main>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-[#E4E9F0] bg-[#FBFCFD] p-4">
      <div className="text-2xl font-black" style={{ color: tone }}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.1em] text-[#8FA0B4]">{label}</div>
    </div>
  );
}
