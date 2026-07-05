"use client";

import { useState } from "react";

const inputStyle = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.05)",
  color: "#F0F0EC",
  fontFamily: "var(--font-sans)",
  fontSize: "1rem",
  outline: "none",
  padding: "13px 15px",
} satisfies React.CSSProperties;

export default function Home() {
  const [email, setEmail] = useState("");
  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !brandName || !websiteUrl) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, brand_name: brandName, website_url: websiteUrl }),
      });
      const data = await res.json();
      if (!res.ok || !data.audit_id) throw new Error(data.error ?? "Failed");
      window.posthog?.capture("audit_requested", { source: "hero_cta", brand_name: brandName });
      window.location.href = `/audit/${data.audit_id}`;
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F0F0EC]" style={{ fontFamily: "var(--font-sans)" }}>
      <nav className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3 sm:px-6 sm:py-5">
          <a href="#hero" className="flex items-center gap-2 text-[#F0F0EC] no-underline">
            <span className="font-serif text-xl tracking-[-0.02em]" style={{ fontFamily: "var(--font-display)" }}>
              Citeable
            </span>
            <span className="rounded bg-[#CAFF3C]/15 px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-[#CAFF3C]">
              Beta
            </span>
          </a>
          <a href="#audit" className="text-sm font-semibold text-[#CAFF3C] no-underline">
            Free audit
          </a>
        </div>
      </nav>

      <main>
        <section id="hero" className="relative mx-auto max-w-5xl overflow-hidden px-5 pb-12 pt-3 sm:px-6 sm:pb-20 sm:pt-12">
          <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[#CAFF3C]/[0.055] blur-3xl" />

          <div className="relative grid gap-3 sm:gap-5 lg:grid-cols-[1.02fr_0.78fr] lg:items-center lg:gap-12">
            <div>
              <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-[#CAFF3C]/20 bg-[#CAFF3C]/10 px-3 py-1 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[#CAFF3C] sm:mb-4">
                <span className="h-1.5 w-1.5 rounded-full bg-[#CAFF3C] shadow-[0_0_10px_#CAFF3C]" />
                Free 30-second check
              </div>
              <h1
                className="max-w-3xl text-[clamp(1.9rem,8vw,4.65rem)] leading-[0.98] tracking-[-0.045em] text-[#F0F0EC]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                When your customers ask ChatGPT for a business like yours, do you show up?
              </h1>
              <p className="mt-2.5 max-w-2xl text-[0.95rem] leading-[1.32] text-[#B8B8C4] sm:mt-5 sm:text-xl sm:leading-[1.55]">
                Citeable checks — free — whether AI engines (ChatGPT, Perplexity, Google) mention your business, and shows you exactly how to get recommended. 30-second audit, no card needed.
              </p>
            </div>

            <div id="audit" className="rounded-[1.35rem] border border-white/10 bg-[#111116]/95 p-4 shadow-2xl shadow-black/30 sm:p-6">
              <div className="mb-3 hidden items-center justify-between gap-3 sm:flex">
                <div>
                  <h2 className="text-lg font-bold tracking-[-0.02em] text-[#F0F0EC]">Run your free audit</h2>
                  <p className="mt-1 text-sm text-[#858594]">Brand, website, inbox. That&apos;s it.</p>
                </div>
                <span className="rounded-full bg-[#CAFF3C] px-2.5 py-1 text-xs font-black text-[#09090B]">Free</span>
              </div>

              {status === "success" ? (
                <div className="rounded-xl border border-[#CAFF3C]/30 bg-[#CAFF3C]/10 p-4 text-sm font-semibold text-[#CAFF3C]">
                  You&apos;re on the list — we&apos;ll be in touch with your free audit.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  <label className="sr-only" htmlFor="brand-name">Business name</label>
                  <input
                    id="brand-name"
                    type="text"
                    required
                    placeholder="Business name"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    style={inputStyle}
                  />
                  <label className="sr-only" htmlFor="website-url">Website</label>
                  <input
                    id="website-url"
                    type="text"
                    required
                    placeholder="yourbusiness.com"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    style={inputStyle}
                  />
                  <label className="sr-only" htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    required
                    placeholder="you@yourbusiness.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="rounded-[14px] bg-[#CAFF3C] px-5 py-3.5 text-base font-black tracking-[-0.01em] text-[#09090B] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {status === "loading" ? "Running…" : "Run my free audit"}
                  </button>
                  {errorMsg && <p className="m-0 text-sm text-[#FF6B6B]">{errorMsg}</p>}
                  <p className="m-0 text-xs leading-5 text-[#6F6F80]">No card needed. Your score and 3 fixes arrive by email.</p>
                </form>
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-6 sm:px-6">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-5 text-center text-sm leading-6 text-[#A7A7B4] sm:text-base">
            Find out whether ChatGPT, Perplexity, and Google mention your business when people are ready to choose.
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-14 sm:px-6 sm:py-20">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">How it works</p>
          <h2 className="max-w-2xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
            A simple check for small businesses.
          </h2>

          <div className="mt-8 grid gap-1 overflow-hidden rounded-2xl bg-white/[0.07] sm:grid-cols-3">
            {[
              "1. Enter your brand name and website",
              "2. We ask ChatGPT, Perplexity & Google about you",
              "3. You get a score and 3 fixes in your inbox",
            ].map((step) => (
              <div key={step} className="bg-[#111116] p-6 text-lg font-semibold leading-7 tracking-[-0.02em] text-[#F0F0EC]">
                {step}
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-14 sm:px-6 sm:py-20">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">Pricing</p>
          <h2 className="max-w-2xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
            Get found by AI — €49/month.
          </h2>

          <div className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.08] bg-[#111116] p-6">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-[#777786]">Free audit</p>
              <div className="mb-2 text-4xl tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>€0</div>
              <p className="mb-5 text-sm text-[#858594]">A one-time check of where your business appears today.</p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm text-[#B8B8C4]">
                {[
                  "Your visibility score",
                  "Where your business is mentioned or missed",
                  "3 plain-English fixes to try first",
                ].map((feature) => (
                  <li key={feature} className="flex gap-2"><span className="text-[#CAFF3C]">✓</span>{feature}</li>
                ))}
              </ul>
            </div>

            <div className="relative rounded-2xl border border-[#CAFF3C]/30 bg-[#CAFF3C]/[0.045] p-6">
              <span className="absolute -top-3 left-5 rounded-md bg-[#CAFF3C] px-2.5 py-1 text-[0.7rem] font-black uppercase tracking-[0.08em] text-[#09090B]">
                For growing teams
              </span>
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-[#CAFF3C]">Citeable Pro</p>
              <div className="mb-2 text-4xl tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                €49<span className="text-base text-[#9A9AA8]">/month</span>
              </div>
              <p className="mb-5 text-sm text-[#A7A7B4]">Keep improving how often your business is recommended.</p>
              <ul className="m-0 mb-6 flex list-none flex-col gap-2 p-0 text-sm text-[#B8B8C4]">
                {[
                  "Weekly checks",
                  "Competitor tracking",
                  "Clear next steps",
                  "Email alerts",
                ].map((feature) => (
                  <li key={feature} className="flex gap-2"><span className="text-[#CAFF3C]">✓</span>{feature}</li>
                ))}
              </ul>
              <a
                href="https://checkout.nanocorp.so/c/xkA3ynsSsBvwhaUaVlZG"
                onClick={() => window.posthog?.capture("subscribe_clicked", { plan: "pro", source: "pricing_card" })}
                className="block rounded-xl bg-[#CAFF3C] px-5 py-3 text-center text-sm font-black text-[#09090B] no-underline transition hover:brightness-110"
              >
                Start with Pro
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-12 sm:px-6">
          <div className="max-w-2xl rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#777786]">Small technical FAQ</p>
            <h2 className="mb-3 text-xl font-bold tracking-[-0.02em]">What do GEO and AEO mean?</h2>
            <p className="m-0 text-sm leading-6 text-[#A7A7B4]">
              They are industry terms for improving how businesses appear in AI answers. You do not need to know them to use Citeable — the audit explains the fixes in plain English.
            </p>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-8 sm:px-6">
        <div>
          <div className="text-lg tracking-[-0.02em]" style={{ fontFamily: "var(--font-display)" }}>Citeable</div>
          <p className="m-0 text-sm text-[#686879]">See whether AI recommends your business.</p>
        </div>
        <p className="m-0 text-sm text-[#444454]">© {new Date().getFullYear()} Citeable. All rights reserved.</p>
      </footer>
    </div>
  );
}
