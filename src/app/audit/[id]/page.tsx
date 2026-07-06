import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureAuditSchema, pool } from "@/lib/db";
import type { BuyerIntentPromptResult, EngineResult } from "@/lib/audit-engine";
import AuditPoller from "./AuditPoller";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  email: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  engines_checked: EngineResult[] | null;
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
  } | null;
  created_at: Date;
};

function scoreColor(score: number) {
  if (score < 30) return "#FF5F5F";
  if (score < 60) return "#FFB84D";
  return "#CAFF3C";
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
  const engines = audit.engines_checked ?? [];
  const competitors = audit.competitors_found ?? [];
  const buyerIntentPrompts = audit.raw_results?.buyerIntentPrompts ?? [];
  const buyerQuestionCount = buyerIntentPrompts.length;
  const buyerBrandMentionCount = buyerIntentPrompts.filter((prompt) => prompt.brandMentioned).length;
  const buyerCompetitorHeadline = competitors.length ? competitors.join(", ") : "None found";
  const fixes = audit.fixes ?? [];
  const score = audit.score ?? 0;
  const color = scoreColor(score);

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
          <a href="https://checkout.nanocorp.so/c/xkA3ynsSsBvwhaUaVlZG" style={{ color: "#CAFF3C", fontWeight: 700, textDecoration: "none" }}>
            Subscribe to Pro →
          </a>
        </nav>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 220px", gap: "2rem", alignItems: "center", marginBottom: "2rem" }}>
          <div>
            <Pill tone={failed ? "red" : complete ? "green" : "orange"}>{failed ? "Audit failed" : complete ? "Audit complete" : "Audit running — refreshing every 3s"}</Pill>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(2.4rem, 6vw, 4.5rem)", lineHeight: 1, margin: "1rem 0", letterSpacing: "-0.03em" }}>
              AI Visibility Report for {audit.brand_name}
            </h1>
            <p style={{ color: "#9999A8", fontSize: "1rem", lineHeight: 1.7, maxWidth: "720px" }}>
              Live audit for <a href={audit.website_url} style={{ color: "#CAFF3C" }}>{audit.website_url}</a>. Results use direct HTTP checks for search visibility, metadata, entity presence, and technical SEO.
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
            Running live HTTP checks now. This can take 20–60 seconds because each source is queried live and no results are fabricated.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "1.25rem" }}>
            <section style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", background: "#111116", padding: "1.5rem" }}>
              <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Transparent formula</h2>
              <p style={{ color: "#BCBCC8", lineHeight: 1.7, marginBottom: 0 }}>{audit.raw_results?.formula ?? "Formula unavailable."}</p>
            </section>

            <section style={{ border: "1px solid rgba(202,255,60,0.22)", borderRadius: "18px", background: "linear-gradient(135deg, rgba(202,255,60,0.08), #111116 45%)", padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "start", flexWrap: "wrap", marginBottom: "1rem" }}>
                <div>
                  <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Who AI recommends instead of you</h2>
                  <p style={{ color: "#BCBCC8", lineHeight: 1.7, margin: "0.6rem 0 0" }}>
                    In {buyerQuestionCount} buyer questions, you were named {buyerBrandMentionCount} times. Brands named instead: {buyerCompetitorHeadline}.
                  </p>
                </div>
                <Pill tone={buyerBrandMentionCount > 0 ? "green" : buyerQuestionCount > 0 ? "orange" : "red"}>{buyerQuestionCount > 0 ? `${buyerBrandMentionCount}/${buyerQuestionCount} prompts` : "Unavailable"}</Pill>
              </div>

              {buyerIntentPrompts.length ? (
                <div style={{ display: "grid", gap: "0.9rem" }}>
                  {buyerIntentPrompts.map((prompt) => (
                    <article key={prompt.prompt} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "14px", background: "rgba(0,0,0,0.18)", padding: "1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "start", flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 800, lineHeight: 1.5, maxWidth: "780px" }}>“{prompt.prompt}”</div>
                        <Pill tone={!prompt.available ? "red" : prompt.brandMentioned ? "green" : "muted"}>{!prompt.available ? "Unavailable" : prompt.brandMentioned ? "Brand named" : "Brand not named"}</Pill>
                      </div>
                      <div style={{ color: "#BCBCC8", lineHeight: 1.6, marginTop: "0.75rem" }}>
                        <strong style={{ color: "#F0F0EC" }}>Competitors named instead:</strong> {prompt.competitors.length ? prompt.competitors.join(", ") : prompt.available ? "None found" : "Unavailable"}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "0.8rem" }}>
                        {prompt.surfaces.map((surface) => (
                          <Pill key={`${prompt.prompt}-${surface.surface}`} tone={!surface.reachable ? "red" : surface.brandMentioned ? "green" : "muted"}>
                            {surface.surface}: {!surface.reachable ? "Unavailable" : surface.brandMentioned ? "named" : "not named"}
                          </Pill>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#777787", lineHeight: 1.7, marginBottom: 0 }}>Buyer-intent prompt analysis is unavailable for this report.</p>
              )}
            </section>

            <section style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", background: "#111116", padding: "1.5rem", overflowX: "auto" }}>
              <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Engine breakdown</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
                <thead>
                  <tr style={{ color: "#777787", textAlign: "left", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    <th style={{ padding: "0.75rem", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Engine</th>
                    <th style={{ padding: "0.75rem", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Reachable</th>
                    <th style={{ padding: "0.75rem", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Brand mentioned</th>
                    <th style={{ padding: "0.75rem", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>Competitors seen</th>
                  </tr>
                </thead>
                <tbody>
                  {engines.map((engine) => (
                    <tr key={engine.engine}>
                      <td style={{ padding: "0.85rem", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: 700 }}>{engine.engine}</td>
                      <td style={{ padding: "0.85rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <Pill tone={engine.reachable ? "green" : "red"}>{engine.reachable ? "Reachable" : "Unavailable"}</Pill>
                        {engine.unavailableReason && <div style={{ color: "#777787", marginTop: "0.4rem", fontSize: "0.8rem" }}>{engine.unavailableReason}</div>}
                      </td>
                      <td style={{ padding: "0.85rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <Pill tone={engine.brandMentioned ? "green" : "muted"}>{engine.brandMentioned ? "Mentioned" : "Not mentioned"}</Pill>
                      </td>
                      <td style={{ padding: "0.85rem", borderBottom: "1px solid rgba(255,255,255,0.06)", color: "#BCBCC8" }}>
                        {engine.competitors.length ? engine.competitors.join(", ") : "None found"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
              <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", background: "#111116", padding: "1.5rem" }}>
                <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Competitors cited</h2>
                {competitors.length ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                    {competitors.map((competitor) => <Pill key={competitor}>{competitor}</Pill>)}
                  </div>
                ) : (
                  <p style={{ color: "#777787" }}>No competitor-like brand names were extracted from reachable snippets.</p>
                )}
              </div>

              <div style={{ border: "1px solid rgba(202,255,60,0.2)", borderRadius: "18px", background: "rgba(202,255,60,0.05)", padding: "1.5rem" }}>
                <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Ongoing monitoring</h2>
                <p style={{ color: "#BCBCC8", lineHeight: 1.7 }}>Track weekly prompt changes, competitor movement, and new citation opportunities with Citeable Pro.</p>
                <a href="https://checkout.nanocorp.so/c/xkA3ynsSsBvwhaUaVlZG" style={{ display: "inline-block", marginTop: "0.5rem", background: "#CAFF3C", color: "#09090B", padding: "0.85rem 1rem", borderRadius: "10px", fontWeight: 900, textDecoration: "none" }}>
                  Want ongoing monitoring? Subscribe to Citeable Pro →
                </a>
              </div>
            </section>

            <section style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "18px", background: "#111116", padding: "1.5rem" }}>
              <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Prioritized fixes</h2>
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.9rem" }}>
                {fixes.map((fix, index) => (
                  <li key={fix} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.85rem", alignItems: "start", color: "#BCBCC8", lineHeight: 1.6 }}>
                    <Pill tone={index < 2 ? "orange" : "muted"}>P{index + 1}</Pill>
                    <span>{fix}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
