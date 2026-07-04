"use client";

import { useState } from "react";

export default function Home() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("success");
      setEmail("");
      window.posthog?.capture("audit_requested", { source: "hero_cta" });
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#09090B", color: "#F0F0EC", fontFamily: "var(--font-sans)" }}>

      {/* Nav */}
      <nav style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.25rem",
              letterSpacing: "-0.02em",
              color: "#F0F0EC",
            }}>
              Citeable
            </span>
            <span style={{
              background: "rgba(202,255,60,0.12)",
              color: "#CAFF3C",
              fontSize: "0.65rem",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "2px 6px",
              borderRadius: "4px",
            }}>
              Beta
            </span>
          </div>
          <a
            href="#audit"
            style={{
              color: "#CAFF3C",
              fontWeight: 500,
              fontSize: "0.875rem",
              textDecoration: "none",
            }}
          >
            Get free audit →
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section
        id="hero"
        className="animate-fade-up"
        style={{
          maxWidth: "64rem",
          margin: "0 auto",
          padding: "7rem 1.5rem 5rem",
          position: "relative",
        }}
      >
        {/* Background glow */}
        <div style={{
          position: "absolute",
          top: "10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "300px",
          background: "radial-gradient(ellipse at center, rgba(202,255,60,0.06) 0%, transparent 70%)",
          pointerEvents: "none",
          zIndex: 0,
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Eyebrow */}
          <div className="animate-fade-up" style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "2rem",
          }}>
            <span style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "#CAFF3C",
              display: "block",
              boxShadow: "0 0 8px #CAFF3C",
            }} />
            <span style={{
              fontSize: "0.8rem",
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#CAFF3C",
            }}>
              AI Visibility · GEO/AEO
            </span>
          </div>

          {/* Headline */}
          <h1
            className="animate-fade-up-1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.8rem, 7vw, 5.5rem)",
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
              color: "#F0F0EC",
              maxWidth: "820px",
              marginBottom: "1.75rem",
            }}
          >
            Make your brand<br />
            <em style={{ fontStyle: "italic", color: "#CAFF3C" }}>the answer</em> AI gives.
          </h1>

          {/* Subheadline */}
          <p
            className="animate-fade-up-2"
            style={{
              fontSize: "1.15rem",
              lineHeight: 1.7,
              color: "#9999A8",
              maxWidth: "520px",
              marginBottom: "3rem",
            }}
          >
            We audit and optimize how your brand appears across{" "}
            <span style={{ color: "#BCBCC8" }}>ChatGPT, Perplexity, Google AI Overviews, Gemini,</span>{" "}
            and Copilot — so when customers ask, you&apos;re the answer.
          </p>

          {/* CTA Form */}
          <div
            id="audit"
            className="animate-fade-up-3"
          >
            {status === "success" ? (
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                background: "rgba(202,255,60,0.1)",
                border: "1px solid rgba(202,255,60,0.3)",
                borderRadius: "12px",
                padding: "16px 24px",
                color: "#CAFF3C",
                fontWeight: 500,
                fontSize: "0.95rem",
              }}>
                <span>✓</span>
                <span>You&apos;re on the list — we&apos;ll be in touch with your free audit.</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "480px" }}>
                <div style={{ display: "flex", gap: "0", borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
                  <input
                    type="email"
                    required
                    placeholder="your@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "14px 18px",
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "#F0F0EC",
                      fontSize: "0.95rem",
                      fontFamily: "var(--font-sans)",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    style={{
                      padding: "14px 22px",
                      background: "#CAFF3C",
                      color: "#09090B",
                      fontWeight: 700,
                      fontSize: "0.9rem",
                      border: "none",
                      cursor: status === "loading" ? "not-allowed" : "pointer",
                      opacity: status === "loading" ? 0.6 : 1,
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.01em",
                      fontFamily: "var(--font-sans)",
                      transition: "opacity 0.15s ease",
                    }}
                  >
                    {status === "loading" ? "Sending…" : "Get free audit →"}
                  </button>
                </div>
                {errorMsg && (
                  <p style={{ color: "#FF5F5F", fontSize: "0.85rem", margin: 0 }}>{errorMsg}</p>
                )}
                <p style={{ color: "#555566", fontSize: "0.8rem", margin: 0 }}>
                  No credit card required · Results in 48h
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="glow-line" style={{ maxWidth: "64rem", margin: "0 auto", padding: "0 1.5rem" }}>
        <div className="glow-line" />
      </div>

      {/* Social proof strip */}
      <section style={{ maxWidth: "64rem", margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        <p style={{ color: "#444454", fontSize: "0.8rem", textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500 }}>
          Your brand is being mentioned (or missed) right now across
          &nbsp;·&nbsp; ChatGPT &nbsp;·&nbsp; Perplexity &nbsp;·&nbsp; Google AI Overviews &nbsp;·&nbsp; Gemini &nbsp;·&nbsp; Copilot
        </p>
      </section>

      {/* How it works */}
      <section style={{
        maxWidth: "64rem",
        margin: "2rem auto 0",
        padding: "5rem 1.5rem",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ marginBottom: "3.5rem" }}>
          <p style={{
            color: "#CAFF3C",
            fontSize: "0.8rem",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: "1rem",
          }}>
            How it works
          </p>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(2rem, 4vw, 2.75rem)",
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            color: "#F0F0EC",
          }}>
            From invisible to undeniable.
          </h2>
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1.5px",
          background: "rgba(255,255,255,0.06)",
          borderRadius: "16px",
          overflow: "hidden",
        }}>
          {[
            {
              num: "01",
              title: "Enter your brand & competitors",
              desc: "Tell us who you are and who you're up against. We scan your digital footprint across the web.",
            },
            {
              num: "02",
              title: "We run prompts across AI engines",
              desc: "Our system fires hundreds of real-world queries across ChatGPT, Perplexity, Gemini, and more to see who AI recommends.",
            },
            {
              num: "03",
              title: "You get a prioritized action plan",
              desc: "A clear report showing where you stand, where competitors beat you, and exactly what to fix first.",
            },
          ].map((step) => (
            <div
              key={step.num}
              style={{
                background: "#111116",
                padding: "2.5rem",
                position: "relative",
              }}
            >
              <div style={{
                fontFamily: "var(--font-display)",
                fontSize: "4rem",
                lineHeight: 1,
                color: "#CAFF3C",
                opacity: 0.15,
                marginBottom: "1.5rem",
                letterSpacing: "-0.04em",
              }}>
                {step.num}
              </div>
              <h3 style={{
                fontSize: "1rem",
                fontWeight: 600,
                color: "#F0F0EC",
                marginBottom: "0.75rem",
                letterSpacing: "-0.01em",
                lineHeight: 1.3,
              }}>
                {step.title}
              </h3>
              <p style={{
                fontSize: "0.875rem",
                color: "#666676",
                lineHeight: 1.7,
                margin: 0,
              }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{
        maxWidth: "64rem",
        margin: "0 auto",
        padding: "5rem 1.5rem 6rem",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <p style={{
          color: "#CAFF3C",
          fontSize: "0.8rem",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: "1rem",
        }}>
          Pricing
        </p>
        <h2 style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(2rem, 4vw, 2.75rem)",
          letterSpacing: "-0.025em",
          lineHeight: 1.1,
          color: "#F0F0EC",
          marginBottom: "3rem",
        }}>
          Start free. Scale when it matters.
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1rem",
          maxWidth: "720px",
        }}>
          {/* Free tier */}
          <div style={{
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
            padding: "2rem",
            background: "#111116",
          }}>
            <div style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#666676",
              marginBottom: "1rem",
            }}>
              Free Audit
            </div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: "2.5rem",
              letterSpacing: "-0.04em",
              color: "#F0F0EC",
              marginBottom: "0.25rem",
            }}>
              €0
            </div>
            <p style={{ color: "#555566", fontSize: "0.85rem", marginBottom: "1.5rem" }}>One-time, no card needed</p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                "Full AI visibility audit",
                "Competitive gap analysis",
                "Top 10 priority fixes",
              ].map((feat) => (
                <li key={feat} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.875rem", color: "#9999A8" }}>
                  <span style={{ color: "#CAFF3C", fontSize: "0.75rem" }}>✓</span>
                  {feat}
                </li>
              ))}
            </ul>
            <a
              href="#audit"
              style={{
                display: "block",
                textAlign: "center",
                padding: "11px 20px",
                borderRadius: "8px",
                border: "1px solid rgba(202,255,60,0.3)",
                color: "#CAFF3C",
                fontWeight: 600,
                fontSize: "0.875rem",
                textDecoration: "none",
                transition: "background 0.15s ease",
              }}
            >
              Get your free audit
            </a>
          </div>

          {/* Pro tier */}
          <div style={{
            border: "1px solid rgba(202,255,60,0.25)",
            borderRadius: "16px",
            padding: "2rem",
            background: "rgba(202,255,60,0.04)",
            position: "relative",
          }}>
            <div style={{
              position: "absolute",
              top: "-12px",
              left: "1.5rem",
              background: "#CAFF3C",
              color: "#09090B",
              fontSize: "0.7rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              padding: "4px 10px",
              borderRadius: "6px",
            }}>
              Popular
            </div>
            <div style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#CAFF3C",
              marginBottom: "1rem",
            }}>
              Ongoing Monitoring
            </div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: "2.5rem",
              letterSpacing: "-0.04em",
              color: "#F0F0EC",
              marginBottom: "0.25rem",
            }}>
              €49<span style={{ fontSize: "1.1rem", opacity: 0.6 }}>/mo</span>
            </div>
            <p style={{ color: "#555566", fontSize: "0.85rem", marginBottom: "1.5rem" }}>Cancel anytime</p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                "Everything in Free",
                "Weekly AI monitoring",
                "Competitor tracking",
                "Fix recommendations",
                "Slack / email alerts",
              ].map((feat) => (
                <li key={feat} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.875rem", color: "#9999A8" }}>
                  <span style={{ color: "#CAFF3C", fontSize: "0.75rem" }}>✓</span>
                  {feat}
                </li>
              ))}
            </ul>
            <a
              href="#audit"
              style={{
                display: "block",
                textAlign: "center",
                padding: "11px 20px",
                borderRadius: "8px",
                background: "#CAFF3C",
                color: "#09090B",
                fontWeight: 700,
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              Start with free audit →
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid rgba(255,255,255,0.06)",
        maxWidth: "64rem",
        margin: "0 auto",
        padding: "3rem 1.5rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "1rem",
      }}>
        <div>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.1rem",
            letterSpacing: "-0.02em",
            color: "#F0F0EC",
            marginBottom: "4px",
          }}>
            Citeable
          </div>
          <p style={{ color: "#444454", fontSize: "0.8rem", margin: 0 }}>
            Be the brand AI recommends.
          </p>
        </div>
        <p style={{ color: "#333340", fontSize: "0.8rem", margin: 0 }}>
          © {new Date().getFullYear()} Citeable. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
