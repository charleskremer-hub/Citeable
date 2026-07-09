"use client";

import { useState } from "react";
import { AGENT_CHECKOUT_URL, MONITOR_CHECKOUT_URL } from "@/lib/checkout-links";
import { homeCopy, type Locale } from "@/lib/i18n";

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

type HomeClientProps = {
  locale: Locale;
};

export default function HomeClient({ locale }: HomeClientProps) {
  const copy = homeCopy[locale];
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
        body: JSON.stringify({ email, brand_name: brandName, website_url: websiteUrl, locale }),
      });
      const data = await res.json();
      const redirectUrl = typeof data.redirect_url === "string" ? data.redirect_url : data.audit_id ? `/audit/${data.audit_id}` : "";

      if (!res.ok || !redirectUrl) throw new Error(data.error ?? "Failed");

      window.posthog?.capture("audit_requested", { source: "hero_cta", brand_name: brandName, audit_id: data.audit_id, locale });
      window.location.assign(redirectUrl);
    } catch {
      setStatus("error");
      setErrorMsg(copy.error);
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
            {copy.navAudit}
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
                {copy.heroEyebrow}
              </div>
              <h1
                className="max-w-3xl text-[clamp(1.9rem,8vw,4.65rem)] leading-[0.98] tracking-[-0.045em] text-[#F0F0EC]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {copy.heroTitle}
              </h1>
              <p className="mt-2.5 max-w-2xl text-[0.95rem] leading-[1.32] text-[#B8B8C4] sm:mt-5 sm:text-xl sm:leading-[1.55]">
                {copy.heroSubtitle}
              </p>
            </div>

            <div id="audit" className="rounded-[1.35rem] border border-white/10 bg-[#111116]/95 p-4 shadow-2xl shadow-black/30 sm:p-6">
              <div className="mb-3 hidden items-center justify-between gap-3 sm:flex">
                <div>
                  <h2 className="text-lg font-bold tracking-[-0.02em] text-[#F0F0EC]">{copy.formTitle}</h2>
                  <p className="mt-1 text-sm text-[#858594]">{copy.formSubtitle}</p>
                </div>
                <span className="rounded-full bg-[#CAFF3C] px-2.5 py-1 text-xs font-black text-[#09090B]">{copy.freeBadge}</span>
              </div>

              {status === "success" ? (
                <div className="rounded-xl border border-[#CAFF3C]/30 bg-[#CAFF3C]/10 p-4 text-sm font-semibold text-[#CAFF3C]">
                  {copy.success}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  <label className="sr-only" htmlFor="brand-name">{copy.businessLabel}</label>
                  <input
                    id="brand-name"
                    type="text"
                    required
                    placeholder={copy.businessPlaceholder}
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    style={inputStyle}
                  />
                  <label className="sr-only" htmlFor="website-url">{copy.websiteLabel}</label>
                  <input
                    id="website-url"
                    type="text"
                    required
                    placeholder={copy.websitePlaceholder}
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    style={inputStyle}
                  />
                  <label className="sr-only" htmlFor="email">{copy.emailLabel}</label>
                  <input
                    id="email"
                    type="email"
                    required
                    placeholder={copy.emailPlaceholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="rounded-[14px] bg-[#CAFF3C] px-5 py-3.5 text-base font-black tracking-[-0.01em] text-[#09090B] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {status === "loading" ? copy.loadingCta : copy.submitCta}
                  </button>
                  {errorMsg && <p className="m-0 text-sm text-[#FF6B6B]">{errorMsg}</p>}
                  <p className="m-0 text-xs leading-5 text-[#6F6F80]">{copy.formFootnote}</p>
                </form>
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
          <div className="relative overflow-hidden rounded-[1.6rem] border border-white/[0.08] bg-[#111116] p-6 shadow-2xl shadow-black/20 sm:p-8">
            <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[#CAFF3C]/10 blur-3xl" />
            <div className="relative max-w-4xl">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.positioningEyebrow}</p>
              <h2 className="text-[clamp(2rem,5vw,3.15rem)] leading-[1.02] tracking-[-0.04em] text-[#F0F0EC]" style={{ fontFamily: "var(--font-display)" }}>
                {copy.positioningTitle}
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#B8B8C4] sm:text-lg">
                {copy.positioningBody}
              </p>
              <div className="mt-7 grid gap-3 md:grid-cols-[0.92fr_1.08fr]">
                <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
                  <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#777786]">{copy.dashboardCardTitle}</p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[#A7A7B4]">{copy.dashboardCardBody}</p>
                  <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0 text-sm text-[#858594]">
                    {copy.dashboardCardItems.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="text-[#5A5A66]">×</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-[#CAFF3C]/25 bg-[#CAFF3C]/[0.07] p-5 shadow-2xl shadow-[#CAFF3C]/5">
                  <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.citeableCardTitle}</p>
                  <p className="mt-3 text-sm font-black leading-6 text-[#F0F0EC]">{copy.citeableCardBody}</p>
                  <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0 text-sm font-bold text-[#DDEFC0]">
                    {copy.citeableCardItems.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="text-[#CAFF3C]">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-5 inline-flex rounded-full border border-[#CAFF3C]/25 bg-[#CAFF3C]/10 px-4 py-2 text-sm font-bold leading-6 text-[#CAFF3C]">
                {copy.positioningPrice}
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-14 sm:px-6 sm:py-20">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.howEyebrow}</p>
          <h2 className="max-w-2xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
            {copy.howTitle}
          </h2>

          <div className="mt-8 grid gap-1 overflow-hidden rounded-2xl bg-white/[0.07] sm:grid-cols-3">
            {copy.howSteps.map((step) => (
              <div key={step} className="bg-[#111116] p-6 text-lg font-semibold leading-7 tracking-[-0.02em] text-[#F0F0EC]">
                {step}
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-14 sm:px-6 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.agentEyebrow}</p>
              <h2 className="max-w-2xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                {copy.agentTitle}
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#A7A7B4] sm:text-lg">
                {copy.agentBody}
              </p>
            </div>

            <div className="relative overflow-hidden rounded-[1.6rem] border border-[#CAFF3C]/25 bg-[#CAFF3C]/[0.055] p-5 shadow-2xl shadow-[#CAFF3C]/5 sm:p-7">
              <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[#CAFF3C]/10 blur-3xl" />
              <div className="relative flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="rounded-full bg-[#CAFF3C] px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-[#09090B]">
                    {copy.agentBadge}
                  </span>
                  <span className="text-sm font-bold text-[#CAFF3C]">{copy.agentPrice}</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {copy.agentFixes.map((fix) => (
                    <div key={fix} className="rounded-2xl border border-white/[0.08] bg-[#09090B]/70 p-4">
                      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#CAFF3C]/15 text-sm font-black text-[#CAFF3C]">✓</div>
                      <p className="m-0 text-sm font-bold leading-6 text-[#F0F0EC]">{fix}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-[#111116] p-5">
                  <p className="m-0 text-lg font-bold tracking-[-0.02em] text-[#F0F0EC]">{copy.agentCardTitle}</p>
                  <p className="mt-2 text-sm leading-6 text-[#A7A7B4]">
                    {copy.agentCardBody}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-14 sm:px-6 sm:py-20">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.pricingEyebrow}</p>
          <h2 className="max-w-2xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
            {copy.pricingTitle}
          </h2>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {copy.pricingTiers.map((tier) => {
              const href = tier.href === "monitor" ? MONITOR_CHECKOUT_URL : tier.href === "agent" ? AGENT_CHECKOUT_URL : tier.href;

              return (
                <div key={tier.name} className={`relative rounded-2xl border p-6 ${tier.highlight ? "border-[#CAFF3C]/35 bg-[#CAFF3C]/[0.055]" : "border-white/[0.08] bg-[#111116]"}`}>
                  <span className={`mb-4 inline-flex rounded-md px-2.5 py-1 text-[0.7rem] font-black uppercase tracking-[0.08em] ${tier.highlight ? "bg-[#CAFF3C] text-[#09090B]" : "bg-white/[0.06] text-[#B8B8C4]"}`}>
                    {tier.badge}
                  </span>
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.1em] text-[#CAFF3C]">{tier.name}</p>
                  <div className="mb-2 text-4xl tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                    {tier.price}<span className="text-base text-[#9A9AA8]">{"suffix" in tier ? tier.suffix : ""}</span>
                  </div>
                  <p className="mb-3 min-h-10 text-sm text-[#A7A7B4]">{tier.note}</p>
                  {tier.plan !== "free" ? (
                    <p className="m-0 mb-5 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2 text-xs font-bold leading-5 text-[#8E8E9A]">
                      {copy.pricingReassurance}
                    </p>
                  ) : null}
                  <ul className="m-0 mb-6 flex list-none flex-col gap-2 p-0 text-sm text-[#B8B8C4]">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex gap-2"><span className="text-[#CAFF3C]">✓</span>{feature}</li>
                    ))}
                  </ul>
                  {tier.plan === "agent_19eur" ? (
                    <div className="mb-6 rounded-2xl border border-[#CAFF3C]/20 bg-[#CAFF3C]/[0.055] p-4 text-sm leading-6">
                      <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.1em] text-[#CAFF3C]">{copy.agentExampleLabel}</p>
                      <p className="m-0 font-bold text-[#F0F0EC]">{copy.agentExampleFaq}</p>
                      <p className="m-0 mt-3 font-bold text-[#D6D6DF]">{copy.agentExampleGoogle}</p>
                    </div>
                  ) : null}
                  <a
                    href={href}
                    onClick={() => window.posthog?.capture(tier.plan === "free" ? "audit_cta_clicked" : "purchase_started", { plan: tier.plan, source: "pricing_card", locale })}
                    className={`block rounded-xl px-5 py-3 text-center text-sm font-black no-underline transition hover:brightness-110 ${tier.highlight ? "bg-[#CAFF3C] text-[#09090B]" : "bg-white/[0.08] text-[#F0F0EC]"}`}
                  >
                    {tier.cta}
                  </a>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-12 sm:px-6">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#777786]">{copy.faqEyebrow}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {copy.faqItems.map((item) => (
              <div key={item.question} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-6">
                <h2 className="mb-3 text-xl font-bold tracking-[-0.02em]">{item.question}</h2>
                <p className="m-0 text-sm leading-6 text-[#A7A7B4]">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-8 sm:px-6">
        <div>
          <div className="text-lg tracking-[-0.02em]" style={{ fontFamily: "var(--font-display)" }}>Citeable</div>
          <p className="m-0 text-sm text-[#686879]">{copy.footerTagline}</p>
        </div>
        <p className="m-0 text-sm text-[#444454]">© {new Date().getFullYear()} Citeable. {copy.rights}</p>
      </footer>
    </div>
  );
}
