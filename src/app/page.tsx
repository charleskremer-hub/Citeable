"use client";

import { useState } from "react";

const DONE_FOR_YOU_CHECKOUT_URL = "https://checkout.nanocorp.so/c/fzVo0YiuyHM5GStaVrpT";
const MONITOR_CHECKOUT_URL = "https://checkout.nanocorp.so/c/SQdBFx6vxsKgDB0CUVXV";

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
      const redirectUrl = typeof data.redirect_url === "string" ? data.redirect_url : data.audit_id ? `/audit/${data.audit_id}` : "";

      if (!res.ok || !redirectUrl) throw new Error(data.error ?? "Failed");

      window.posthog?.capture("audit_requested", { source: "hero_cta", brand_name: brandName, audit_id: data.audit_id });
      window.location.assign(redirectUrl);
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
                Free Gemini diagnostic
              </div>
              <h1
                className="max-w-3xl text-[clamp(1.9rem,8vw,4.65rem)] leading-[0.98] tracking-[-0.045em] text-[#F0F0EC]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Your customers ask AI now — not just Google. Start with Gemini, then scale to ChatGPT when you want the Agent.
              </h1>
              <p className="mt-2.5 max-w-2xl text-[0.95rem] leading-[1.32] text-[#B8B8C4] sm:mt-5 sm:text-xl sm:leading-[1.55]">
                Citeable checks whether Gemini recommends you, names who it picks instead, and hands you the fixes. Free Gemini diagnostic - no card. llms.txt is a small bonus, not the whole strategy.
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
                  <p className="m-0 text-xs leading-5 text-[#6F6F80]">No card needed. Free = diagnostic only: score, Gemini choice, competitors.</p>
                </form>
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-6 sm:px-6">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-5 text-center text-sm leading-6 text-[#A7A7B4] sm:text-base">
            Engine ladder: Free and Monitor use Gemini. Agent uses ChatGPT/OpenAI today, with Claude, Grok, and Mistral ready to activate when keys are connected.
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-14 sm:px-6 sm:py-20">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">How it works</p>
          <h2 className="max-w-2xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
            See who Gemini chooses. Upgrade when you want actions.
          </h2>

          <div className="mt-8 grid gap-1 overflow-hidden rounded-2xl bg-white/[0.07] sm:grid-cols-3">
            {[
              "1. Tell us your business name and website",
              "2. We ask Gemini like a real customer would",
              "3. Free shows score, Gemini choice, and competitors",
            ].map((step) => (
              <div key={step} className="bg-[#111116] p-6 text-lg font-semibold leading-7 tracking-[-0.02em] text-[#F0F0EC]">
                {step}
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-14 sm:px-6 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">Agent €49 treatment</p>
              <h2 className="max-w-2xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                Use ChatGPT to find what to fix next.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#A7A7B4] sm:text-lg">
                Agent runs deeper ChatGPT/OpenAI recommendation checks, then turns real gaps into 1–3 concrete fixes you can paste into your profiles, FAQ, and website.
              </p>
            </div>

            <div className="relative overflow-hidden rounded-[1.6rem] border border-[#CAFF3C]/25 bg-[#CAFF3C]/[0.055] p-5 shadow-2xl shadow-[#CAFF3C]/5 sm:p-7">
              <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[#CAFF3C]/10 blur-3xl" />
              <div className="relative flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full bg-[#CAFF3C] px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-[#09090B]">
                    Reserved for Agent subscribers
                  </span>
                  <span className="text-sm font-bold text-[#CAFF3C]">€49/month</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    "FAQ paragraph to add this week",
                    "Google Business Profile text",
                    "Website answer ready to publish",
                    "New page brief and first draft",
                  ].map((fix) => (
                    <div key={fix} className="rounded-2xl border border-white/[0.08] bg-[#09090B]/70 p-4">
                      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#CAFF3C]/15 text-sm font-black text-[#CAFF3C]">✓</div>
                      <p className="m-0 text-sm font-bold leading-6 text-[#F0F0EC]">{fix}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-[#111116] p-5">
                  <p className="m-0 text-lg font-bold tracking-[-0.02em] text-[#F0F0EC]">Done to 80%. You validate and paste.</p>
                  <p className="mt-2 text-sm leading-6 text-[#A7A7B4]">
                    Each weekly batch starts with fresh ChatGPT/OpenAI recommendation checks. Claude, Grok, and Mistral are not promised until their keys are activated.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-14 sm:px-6 sm:py-20">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">Pricing</p>
          <h2 className="max-w-2xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
            Start with Gemini. Add actions at €9. Add ChatGPT treatment at €49.
          </h2>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {[
              {
                name: "Free",
                price: "€0",
                note: "A one-time audit. No card needed.",
                badge: "Lead magnet",
                features: [
                  "Diagnostic score from Gemini",
                  "Who Gemini picks instead of you",
                  "Competitors Gemini names",
                ],
                cta: "Run my free audit",
                href: "#audit",
                plan: "free",
                highlight: false,
              },
              {
                name: "Monitor",
                price: "€9",
                suffix: "/month",
                note: "For owners who want Gemini monitoring plus actions.",
                badge: "Start here",
                features: [
                  "Monthly Gemini recommendation re-check",
                  "3 simple actions to do this week",
                  "Email alerts when score or competitors change",
                ],
                cta: "Start Monitor",
                href: MONITOR_CHECKOUT_URL,
                plan: "monitor",
                highlight: true,
              },
              {
                name: "Agent",
                price: "€49",
                suffix: "/month",
                note: "For owners who want weekly copy-paste fixes, not another report.",
                badge: "Treatment",
                features: [
                  "Fresh ChatGPT/OpenAI checks before each batch",
                  "1–3 fixes drafted for you every week",
                  "FAQ, Google Business, website, and page copy",
                  "Third-party mention plan: directory, Reddit/Quora, listicle",
                  "Claude/Grok/Mistral-ready when keys are activated",
                ],
                cta: "Start Agent",
                href: DONE_FOR_YOU_CHECKOUT_URL,
                plan: "geo_agent",
                highlight: false,
              },
            ].map((tier) => (
              <div key={tier.name} className={`relative rounded-2xl border p-6 ${tier.highlight ? "border-[#CAFF3C]/35 bg-[#CAFF3C]/[0.055]" : "border-white/[0.08] bg-[#111116]"}`}>
                <span className={`mb-4 inline-flex rounded-md px-2.5 py-1 text-[0.7rem] font-black uppercase tracking-[0.08em] ${tier.highlight ? "bg-[#CAFF3C] text-[#09090B]" : "bg-white/[0.06] text-[#B8B8C4]"}`}>
                  {tier.badge}
                </span>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-[#CAFF3C]">{tier.name}</p>
                <div className="mb-2 text-4xl tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                  {tier.price}<span className="text-base text-[#9A9AA8]">{tier.suffix}</span>
                </div>
                <p className="mb-5 min-h-10 text-sm text-[#A7A7B4]">{tier.note}</p>
                <ul className="m-0 mb-6 flex list-none flex-col gap-2 p-0 text-sm text-[#B8B8C4]">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex gap-2"><span className="text-[#CAFF3C]">✓</span>{feature}</li>
                  ))}
                </ul>
                <a
                  href={tier.href}
                  onClick={() => window.posthog?.capture(tier.plan === "free" ? "audit_cta_clicked" : "purchase_started", { plan: tier.plan, source: "pricing_card" })}
                  className={`block rounded-xl px-5 py-3 text-center text-sm font-black no-underline transition hover:brightness-110 ${tier.highlight ? "bg-[#CAFF3C] text-[#09090B]" : "bg-white/[0.08] text-[#F0F0EC]"}`}
                >
                  {tier.cta}
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-12 sm:px-6">
          <div className="max-w-2xl rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#777786]">Plain English FAQ</p>
            <h2 className="mb-3 text-xl font-bold tracking-[-0.02em]">Do I need to configure anything?</h2>
            <p className="m-0 text-sm leading-6 text-[#A7A7B4]">
              No. Enter your business name, website, and email. Free and Monitor use Gemini today; Agent uses ChatGPT/OpenAI today. Claude, Grok, and Mistral are activation-ready, not live promises yet.
            </p>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-8 sm:px-6">
        <div>
          <div className="text-lg tracking-[-0.02em]" style={{ fontFamily: "var(--font-display)" }}>Citeable</div>
          <p className="m-0 text-sm text-[#686879]">See whether AI recommends and chooses your business.</p>
        </div>
        <p className="m-0 text-sm text-[#444454]">© {new Date().getFullYear()} Citeable. All rights reserved.</p>
      </footer>
    </div>
  );
}
