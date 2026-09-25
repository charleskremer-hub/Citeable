import type { Metadata } from "next";
import Link from "next/link";
import { ensureAuditSchema, pool } from "@/lib/db";
import { descriptionFromAudit, generateGeoAgentAssetsFromAudit } from "@/lib/audit-engine";
import type { AuditRawResults, BuyerIntentPromptResult } from "@/lib/audit-engine";
import { type Locale } from "@/lib/i18n";
import { cityFromPrompts, hostedAnswerPageSlug } from "@/lib/hosted-answer-page";
import { AUDIT_SHARE_TOKEN_PARAM, verifyAuditShareToken } from "@/lib/audit-share-token";
import { buildPresencePack, type OffsitePresenceStatus } from "@/lib/offsite-sources";
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

async function statusByKey(auditId: string): Promise<Record<string, OffsitePresenceStatus>> {
  const result = await pool.query<{ source_key: string; status: OffsitePresenceStatus }>(
    `SELECT source_key, status FROM offsite_presence WHERE audit_id = $1`,
    [auditId],
  );
  const map: Record<string, OffsitePresenceStatus> = {};
  for (const row of result.rows) map[row.source_key] = row.status;
  return map;
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
  won: "#CAFF3C",
  held_you: "#8FD14F",
  lost: "#FF6B6B",
  held_rival: "#C9A227",
  still_absent: "#777786",
  new: "#7AA7FF",
};

const STATUS_TONE: Record<OffsitePresenceStatus, string> = {
  live: "#CAFF3C",
  submitted: "#8FD14F",
  prepared: "#C9A227",
  waiting_client: "#FF9F43",
  not_started: "#777786",
};

function statusLabel(status: OffsitePresenceStatus, locale: Locale): string {
  const fr = locale === "fr";
  const map: Record<OffsitePresenceStatus, [string, string]> = {
    not_started: ["À faire", "Not started"],
    prepared: ["Préparé", "Prepared"],
    submitted: ["Soumis", "Submitted"],
    live: ["En ligne", "Live"],
    waiting_client: ["En attente de toi", "Waiting on you"],
  };
  return map[status][fr ? 0 : 1];
}

export default async function ClientDashboard({ params, searchParams }: DashboardPageProps) {
  await ensureAuditSchema();
  const { id } = await params;
  const token = firstParam((await searchParams)[AUDIT_SHARE_TOKEN_PARAM]);

  const gate = (title: string, body: string) => (
    <main className="min-h-screen bg-[#09090B] text-[#F0F0EC] grid place-items-center px-6" style={{ fontFamily: "var(--font-sans)" }}>
      <div className="max-w-md text-center">
        <h1 className="text-3xl tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>{title}</h1>
        <p className="mt-4 text-[#B8B8C4]">{body}</p>
        <Link href="/#audit" className="mt-6 inline-flex rounded-full bg-[#CAFF3C] px-5 py-3 font-black text-[#09090B] no-underline">Diagnostic gratuit</Link>
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
  const description = descriptionFromAudit(audit.raw_results);

  const pack = buildPresencePack(
    locale,
    { brandName: audit.brand_name, category: assets.category, city, websiteUrl: audit.website_url, description, competitors: assets.competitors, prompts: assets.prompts },
    await statusByKey(id),
  );
  const proof = computeShiftProof(assets.prompts.length ? (audit.raw_results?.buyerIntentPrompts ?? []) : [], await previousPrompts(audit.previous_audit_id), locale);

  const hostedSlug = hostedAnswerPageSlug(audit.brand_name, audit.id);
  const hostedUrl = `${siteUrl}/reponses/${hostedSlug}`;
  const published = Boolean(audit.answer_page_published_at);

  return (
    <main className="min-h-screen bg-[#09090B] text-[#F0F0EC]" style={{ fontFamily: "var(--font-sans)" }}>
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-6">
        <nav className="flex items-center justify-between">
          <Link href="/" className="text-xl tracking-[-0.02em] no-underline text-[#F0F0EC]" style={{ fontFamily: "var(--font-display)" }}>GetPick</Link>
          <span className="text-xs uppercase tracking-[0.16em] text-[#777786]">{fr ? "Ton espace" : "Your space"}</span>
        </nav>

        <header className="mt-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#CAFF3C]">{fr ? "Fait pour toi" : "Done for you"}</p>
          <h1 className="mt-3 text-[clamp(2rem,5vw,3.4rem)] leading-[0.98] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
            {audit.brand_name}{city ? (fr ? ` · ${city}` : ` · ${city}`) : ""}
          </h1>
          <p className="mt-4 max-w-2xl text-[#D7D7CD]">{proof.headline}</p>
        </header>

        {/* Section 1 — Basculement */}
        <section className="mt-10 rounded-[1.4rem] border border-white/[0.08] bg-[#111116] p-6">
          <h2 className="text-2xl tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>{fr ? "Le basculement" : "The shift"}</h2>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <Tile label={fr ? "L'IA te cite" : "AI cites you"} value={`${proof.summary.youCitedNow}/${proof.summary.totalQuestions}`} tone="#CAFF3C" />
            <Tile label={fr ? "Basculé vers toi" : "Moved to you"} value={`${proof.summary.wonCount}`} tone="#8FD14F" />
            <Tile label={fr ? "Reperdu" : "Lost"} value={`${proof.summary.lostCount}`} tone={proof.summary.lostCount ? "#FF6B6B" : "#777786"} />
          </div>
          <ul className="m-0 mt-5 flex list-none flex-col gap-2 p-0">
            {proof.rows.map((row) => (
              <li key={row.question} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <span className="text-sm leading-6 text-[#D7D7CD]">{row.question}</span>
                <span className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: `${MOVEMENT_TONE[row.movement]}22`, color: MOVEMENT_TONE[row.movement] }}>
                  {movementLabel(row.movement, locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Section 2 — Page-réponse hébergée */}
        <section className="mt-6 rounded-[1.4rem] border border-white/[0.08] bg-[#111116] p-6">
          <h2 className="text-2xl tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>{fr ? "Ta page-réponse" : "Your answer page"}</h2>
          <p className="mt-3 text-sm leading-6 text-[#B8B8C4]">
            {fr
              ? "La page que GetPick héberge et entretient pour toi, hors de ton site, pour être citée par l'IA."
              : "The page GetPick hosts and maintains for you, off your site, to get cited by AI."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: published ? "#CAFF3C22" : "#77778622", color: published ? "#CAFF3C" : "#777786" }}>
              {published ? (fr ? "En ligne" : "Live") : (fr ? "En préparation" : "In preparation")}
            </span>
            <a href={hostedUrl} target="_blank" rel="noreferrer" className="text-sm text-[#CAFF3C] no-underline">{hostedUrl.replace("https://", "")}</a>
          </div>
        </section>

        {/* Section 3 — Présence off-site */}
        <section className="mt-6 rounded-[1.4rem] border border-white/[0.08] bg-[#111116] p-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-2xl tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>{fr ? "Ta présence off-site" : "Your off-site presence"}</h2>
            <span className="text-sm text-[#B8B8C4]">{fr ? `${pack.autonomousCount} posées par GetPick · ${pack.clientActionCount} avec toi` : `${pack.autonomousCount} by GetPick · ${pack.clientActionCount} with you`}</span>
          </div>
          <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0">
            {pack.entries.map((entry) => (
              <li key={entry.key} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <a href={entry.homepage} target="_blank" rel="noreferrer" className="font-black text-[#F0F0EC] no-underline">{entry.label}</a>
                  <span className="rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: `${STATUS_TONE[entry.status]}22`, color: STATUS_TONE[entry.status] }}>
                    {statusLabel(entry.status, locale)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#B8B8C4]">{entry.why}</p>
                <p className="mt-1 text-xs font-black uppercase tracking-[0.1em]" style={{ color: entry.autonomous ? "#8FD14F" : "#FF9F43" }}>{entry.actionLabel}</p>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-8 border-t border-white/[0.06] pt-6 text-xs text-[#555566]">
          {fr ? "Espace privé — le lien t'est personnel. GetPick, l'agent qui te fait recommander par l'IA." : "Private space — this link is personal to you. GetPick, the agent that gets you recommended by AI."}
        </footer>
      </div>
    </main>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="text-2xl font-black" style={{ color: tone }}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.1em] text-[#777786]">{label}</div>
    </div>
  );
}
