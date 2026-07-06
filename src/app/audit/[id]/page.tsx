import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureAuditSchema, pool } from "@/lib/db";
import { buildPlainActions, getAuditMonitoringSnapshot } from "@/lib/audit-engine";
import type { BuyerIntentPromptResult, MonitoringSnapshot } from "@/lib/audit-engine";
import AuditPoller from "./AuditPoller";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  email: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  engines_checked: unknown[] | null;
  competitors_found: string[] | null;
  fixes: string[] | null;
  raw_results: {
    status?: string;
    error?: string;
    formula?: string;
    structuredDataFound?: boolean;
    category?: string;
    emailSent?: boolean;
    emailError?: string;
    buyerIntentPrompts?: BuyerIntentPromptResult[];
    monitoring?: MonitoringSnapshot;
    weeklyEmailSent?: boolean;
    weeklyEmailError?: string;
  } | null;
  created_at: Date;
};

function scoreColor(score: number) {
  if (score < 30) return "#FF5F5F";
  if (score < 60) return "#FFB84D";
  return "#CAFF3C";
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function deltaLabel(delta: number | null) {
  if (delta === null) return "No previous run yet";
  if (delta === 0) return "No score change vs last run";
  return `${delta > 0 ? "+" : ""}${delta} points vs last run`;
}

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "green" | "red" | "orange" | "muted" }) {
  const colors = {
    green: ["rgba(202,255,60,0.12)", "#CAFF3C"],
    red: ["rgba(255,95,95,0.12)", "#FF8A8A"],
    orange: ["rgba(255,184,77,0.12)", "#FFB84D"],
    muted: ["rgba(255,255,255,0.06)", "#BCBCC8"],
  }[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        padding: "4px 9px",
        background: colors[0],
        color: colors[1],
        fontSize: "0.75rem",
        fontWeight: 700,
      }}
    >
      {children}
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
  const competitors = audit.competitors_found ?? [];
  const buyerIntentPrompts = audit.raw_results?.buyerIntentPrompts ?? [];
  const aiEngineConnected = buyerIntentPrompts.some((prompt) =>
    prompt.surfaces.some((surface) => surface.kind === "ai_engine" && surface.status === "checked" && surface.reachable)
  );
  const buyerQuestionCount = aiEngineConnected ? buyerIntentPrompts.length : 0;
  const buyerBrandMentionCount = aiEngineConnected ? buyerIntentPrompts.filter((prompt) => prompt.brandMentioned).length : 0;
  const buyerCompetitorHeadline = aiEngineConnected && competitors.length ? competitors.join(", ") : "None found";
  const score = audit.score ?? 0;
  const color = scoreColor(score);
  const monitoring = complete ? await getAuditMonitoringSnapshot(audit.id) : audit.raw_results?.monitoring;
  const scoreTrend = monitoring?.trend ?? [];
  const scoreDelta = monitoring?.scoreDelta ?? null;
  const competitorMovements = monitoring?.competitorMovements ?? [];
  const actions = monitoring?.actions?.length
    ? monitoring.actions
    : buildPlainActions(buyerIntentPrompts, audit.raw_results?.category ?? "your type of business", competitors);

  return (
    <main style={{ minHeight: "100vh", background: "#09090B", color: "#F0F0EC", fontFamily: "var(--font-sans)" }}>
      <AuditPoller
        auditId={audit.id}
        email={audit.email}
        brandName={audit.brand_name}
        websiteUrl={audit.website_url}
        complete={complete || failed}
      />

      <section style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>
        <nav style={{ marginBottom: "2.5rem", display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
          <Link href="/" style={{ color: "#F0F0EC", textDecoration: "none", fontFamily: "var(--font-display)", fontSize: "1.25rem" }}>
            Citeable
          </Link>
          <a href="https://checkout.nanocorp.so/c/fzVo0YiuyHM5GStaVrpT" style={{ color: "#CAFF3C", fontWeight: 700, textDecoration: "none" }}>
            Get it done for me →
          </a>
        </nav>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 220px", gap: "2rem", alignItems: "center", marginBottom: "2rem" }}>
          <div>
            <Pill tone={failed ? "red" : complete ? "green" : "orange"}>{failed ? "Audit failed" : complete ? "Audit complete" : "Audit running — refreshing every 3s"}</Pill>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.4rem, 6vw, 4.5rem)", lineHeight: 1, margin: "1rem 0", letterSpacing: "-0.03em" }}>
              Recommendation Report for {audit.brand_name}
            </h1>
            <p style={{ color: "#9999A8", fontSize: "1rem", lineHeight: 1.7, maxWidth: "720px" }}>
              Live audit for <a href={audit.website_url} style={{ color: "#CAFF3C" }}>{audit.website_url}</a>. We check whether buyers can find and choose you, using live data only.
            </p>
            {failed && (
              <p style={{ marginTop: "1rem", color: "#FF8A8A", fontWeight: 700, lineHeight: 1.6, maxWidth: "720px" }}>
                The audit could not run: {audit.raw_results?.error ?? "Unknown error"}
              </p>
            )}
          </div>

          <div
            style={{
              width: "200px",
              height: "200px",
              borderRadius: "50%",
              border: `10px solid ${color}`,
              display: "grid",
              placeItems: "center",
              justifySelf: "end",
              background: "rgba(255,255,255,0.03)",
              boxShadow: `0 0 40px ${color}33`,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ color, fontSize: "4rem", fontWeight: 900, lineHeight: 1 }}>{complete ? score : "…"}</div>
              <div style={{ color: "#777787", fontWeight: 700 }}>/100</div>
            </div>
          </div>
        </div>

        {!complete ? (
          <div style={{ border: "1px solid rgba(202,255,60,0.25)", background: "rgba(202,255,60,0.06)", borderRadius: "18px", padding: "1.5rem", color: "#CAFF3C" }}>
            Running the live check now. This can take 20–60 seconds because every result is checked fresh and nothing is invented.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "1.25rem" }}>
            <section style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", background: "#111116", padding: "1.5rem" }}>
              <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>How your score is calculated</h2>
              <p style={{ color: "#BCBCC8", lineHeight: 1.7, marginBottom: 0 }}>{audit.raw_results?.formula ?? "Formula unavailable."}</p>
            </section>

            <section style={{ border: "1px solid rgba(202,255,60,0.18)", borderRadius: "18px", background: "rgba(202,255,60,0.045)", padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Monthly monitoring</h2>
                  <p style={{ color: "#BCBCC8", lineHeight: 1.7, marginBottom: 0 }}>Every saved run is kept so Monitor can answer: are you named this month, who is named instead, and what changed?</p>
                </div>
                <Pill tone={scoreDelta !== null && scoreDelta < 0 ? "red" : scoreDelta !== null && scoreDelta > 0 ? "green" : "muted"}>{deltaLabel(scoreDelta)}</Pill>
              </div>

              <div style={{ marginTop: "1.25rem", display: "flex", alignItems: "end", gap: "0.75rem", minHeight: "118px", overflowX: "auto", paddingBottom: "0.25rem" }}>
                {scoreTrend.length ? scoreTrend.map((point) => (
                  <div key={point.auditId} style={{ minWidth: "78px", display: "grid", gap: "0.4rem", alignItems: "end" }}>
                    <div style={{ height: `${Math.max(10, point.score)}px`, borderRadius: "10px 10px 4px 4px", background: scoreColor(point.score), boxShadow: `0 0 18px ${scoreColor(point.score)}33` }} />
                    <div style={{ color: "#F0F0EC", fontWeight: 900 }}>{point.score}/100</div>
                    <div style={{ color: "#777787", fontSize: "0.75rem" }}>{formatShortDate(point.createdAt)}</div>
                  </div>
                )) : (
                  <p style={{ color: "#777787", lineHeight: 1.7, margin: 0 }}>No completed saved run exists yet.</p>
                )}
              </div>
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.25rem" }}>
              <div style={{ border: "1px solid rgba(202,255,60,0.22)", borderRadius: "18px", background: "linear-gradient(135deg, rgba(202,255,60,0.08), #111116 45%)", padding: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start", flexWrap: "wrap", marginBottom: "1rem" }}>
                  <div>
                    <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Who gets recommended instead of you</h2>
                    <p style={{ color: "#BCBCC8", lineHeight: 1.7, margin: "0.6rem 0 0" }}>
                    {aiEngineConnected
                      ? <>In {buyerQuestionCount} buyer questions, you were named {buyerBrandMentionCount} times. Brands named instead: {buyerCompetitorHeadline}.</>
                      : "The recommendation check is not connected yet, so no result is available."}
                    </p>
                  </div>
                  <Pill tone={buyerBrandMentionCount > 0 ? "green" : buyerQuestionCount > 0 ? "orange" : "red"}>{buyerQuestionCount > 0 ? `${buyerBrandMentionCount}/${buyerQuestionCount} questions` : "Not connected yet"}</Pill>
                </div>
                {aiEngineConnected && competitors.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                    {competitors.slice(0, 10).map((competitor) => <Pill key={competitor}>{competitor}</Pill>)}
                  </div>
                ) : (
                  <p style={{ color: "#777787", lineHeight: 1.7, marginBottom: 0 }}>No other brands were found in the reachable results.</p>
                )}
              </div>

              <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", background: "#111116", padding: "1.5rem" }}>
                <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>3 things to do this week</h2>
                <div style={{ display: "grid", gap: "0.8rem" }}>
                  {actions.slice(0, 3).map((action, index) => (
                    <div key={action.title} style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "0.9rem", background: "rgba(255,255,255,0.025)" }}>
                      <Pill tone={index === 0 ? "orange" : "muted"}>Step {index + 1}</Pill>
                      <div style={{ color: "#F0F0EC", fontWeight: 900, marginTop: "0.6rem" }}>{action.title}</div>
                      <p style={{ color: "#BCBCC8", lineHeight: 1.6, margin: "0.5rem 0 0" }}>{action.doThis}</p>
                      <p style={{ color: "#8E8E9A", lineHeight: 1.6, margin: "0.45rem 0 0" }}><strong style={{ color: "#F0F0EC" }}>Where:</strong> {action.where}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", background: "#111116", padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start", flexWrap: "wrap", marginBottom: "1rem" }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Buying questions checked automatically</h2>
                  <p style={{ color: "#BCBCC8", lineHeight: 1.7, margin: "0.6rem 0 0" }}>
                    Citeable creates these from your brand and website only. We do not invent results.
                  </p>
                </div>
                <Pill tone={buyerQuestionCount > 0 ? "muted" : "red"}>{buyerQuestionCount > 0 ? `${buyerQuestionCount} questions` : "Not connected yet"}</Pill>
              </div>


              {aiEngineConnected && buyerIntentPrompts.length ? (
                <div style={{ display: "grid", gap: "0.9rem" }}>
                  {buyerIntentPrompts.map((prompt) => (
                    <article key={prompt.prompt} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", background: "rgba(0,0,0,0.18)", padding: "1rem" }}>
                      <div style={{ fontWeight: 800, lineHeight: 1.5 }}>“{prompt.prompt}”</div>
                      <div style={{ color: "#BCBCC8", lineHeight: 1.6, marginTop: "0.75rem" }}>
                        <strong style={{ color: "#F0F0EC" }}>You:</strong> {prompt.brandMentioned ? "named" : "not named"} <span style={{ color: "#777787" }}>·</span> <strong style={{ color: "#F0F0EC" }}>Named instead:</strong> {prompt.competitors.length ? prompt.competitors.join(", ") : "None found"}
                      </div>
                    </article>
                  ))}
                  <div style={{ border: "1px dashed rgba(202,255,60,0.3)", borderRadius: "14px", padding: "1rem", background: "rgba(202,255,60,0.045)", color: "#CAFF3C", fontWeight: 900 }}>
                    More recommendation sources — included in Done-for-you
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ color: "#777787", lineHeight: 1.7, marginBottom: "0.9rem" }}>The recommendation check is not connected yet, so no buyer-question result is available.</p>
                  <div style={{ border: "1px dashed rgba(202,255,60,0.3)", borderRadius: "14px", padding: "1rem", background: "rgba(202,255,60,0.045)", color: "#CAFF3C", fontWeight: 900 }}>
                    More recommendation sources — included in Done-for-you
                  </div>
                </>
              )}
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
              <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", background: "#111116", padding: "1.5rem" }}>
                <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Other brands found</h2>
                {aiEngineConnected && competitors.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                    {competitors.map((competitor) => <Pill key={competitor}>{competitor}</Pill>)}
                  </div>
                ) : (
                  <p style={{ color: "#777787" }}>No other brand names were found in the reachable results.</p>
                )}
              </div>

              <div style={{ border: "1px solid rgba(202,255,60,0.2)", borderRadius: "18px", background: "rgba(202,255,60,0.05)", padding: "1.5rem" }}>
                <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Keep watching your score</h2>
                <p style={{ color: "#BCBCC8", lineHeight: 1.7 }}>Monitor re-checks your score monthly and emails you when the score or named competitors change.</p>
                <a href="https://checkout.nanocorp.so/c/SQdBFx6vxsKgDB0CUVXV" style={{ display: "inline-block", marginTop: "0.5rem", background: "#CAFF3C", color: "#09090B", padding: "0.85rem 1rem", borderRadius: "10px", fontWeight: 900, textDecoration: "none" }}>
                  Start Monitor →
                </a>
              </div>
            </section>

            {competitorMovements.length ? (
              <section style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", background: "#111116", padding: "1.5rem" }}>
                <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>What changed since the last check</h2>
                <div style={{ display: "grid", gap: "0.8rem" }}>
                  {competitorMovements.map((movement) => (
                    <div key={`${movement.prompt}-${movement.competitor}-${movement.type}`} style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: "14px", padding: "0.9rem", background: "rgba(255,255,255,0.025)" }}>
                      <Pill tone={movement.type === "overtook_brand" ? "red" : "orange"}>{movement.type === "overtook_brand" ? "You disappeared" : "New brand found"}</Pill>
                      <div style={{ color: "#F0F0EC", fontWeight: 900, marginTop: "0.6rem" }}>{movement.competitor}</div>
                      <div style={{ color: "#BCBCC8", lineHeight: 1.6, marginTop: "0.25rem" }}>{movement.detail}</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
