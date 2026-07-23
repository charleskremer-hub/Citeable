"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import LocaleLang from "./LocaleLang";
import { answerPages } from "@/lib/answer-pages";
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
  const resourcePages = answerPages.filter((page) => page.locale === locale).slice(0, 5);
  const [email, setEmail] = useState("");
  const [brandName, setBrandName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const formStartedRef = useRef(false);

  function trackFormStarted(field: "brand_name" | "website_url" | "email") {
    if (formStartedRef.current) return;
    formStartedRef.current = true;
    window.posthog?.capture("audit_form_started", { source: "hero_cta", field, locale });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // L'email n'est plus requis pour lancer l'audit : c'était le frein d'entrée
    // du funnel. Il est demandé sur le rapport, une fois le verdict montré.
    if (!brandName.trim() || !websiteUrl.trim()) {
      window.posthog?.capture("audit_validation_blocked", {
        source: "hero_cta",
        missing_brand: !brandName.trim(),
        missing_website: !websiteUrl.trim(),
        locale,
      });
      return;
    }

    window.posthog?.capture("audit_submit_clicked", {
      source: "hero_cta",
      has_email: Boolean(email.trim()),
      locale,
    });

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
      window.posthog?.capture("audit_submit_failed", { source: "hero_cta", locale });
      setStatus("error");
      setErrorMsg(copy.error);
    }
  }

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F0F0EC]" style={{ fontFamily: "var(--font-sans)" }}>
      <LocaleLang locale={locale} />
      <nav className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3 sm:px-6 sm:py-5">
          <a href="#hero" className="flex items-center gap-2 text-[#F0F0EC] no-underline">
            <span className="font-serif text-xl tracking-[-0.02em]" style={{ fontFamily: "var(--font-display)" }}>
              GetPick
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
        {/* 1. HERO — douleur + transformation, formulaire d'audit inchangé */}
        <section id="hero" className="relative mx-auto max-w-5xl overflow-hidden px-5 pb-12 pt-3 sm:px-6 sm:pb-20 sm:pt-12">
          <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[#CAFF3C]/[0.055] blur-3xl" />

          <div className="relative grid gap-3 sm:gap-5 lg:grid-cols-[1.02fr_0.78fr] lg:items-center lg:gap-12">
            <div>
              <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-[#CAFF3C]/20 bg-[#CAFF3C]/10 px-3 py-1 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[#CAFF3C] sm:mb-4">
                <span className="h-1.5 w-1.5 rounded-full bg-[#CAFF3C] shadow-[0_0_10px_#CAFF3C]" />
                {copy.heroEyebrow}
              </div>
              <h1
                className="max-w-3xl text-[clamp(1.75rem,6.5vw,3.6rem)] leading-[1.02] tracking-[-0.045em] text-[#F0F0EC]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <span className="text-[#B8B8C4]">{copy.heroTitle}</span>{" "}
                <span className="text-[#CAFF3C]">{copy.heroTitleAccent}</span>
              </h1>
              <p className="mt-2.5 max-w-2xl text-[0.95rem] leading-[1.32] text-[#B8B8C4] sm:mt-5 sm:text-xl sm:leading-[1.55]">
                {copy.heroSubtitle}
              </p>
            </div>

            <div id="audit" className="rounded-[1.35rem] border border-white/10 bg-[#111116]/95 p-4 shadow-2xl shadow-black/30 sm:p-6">
              {/* Visible on mobile too — trust signal above the fold (funnel diagnostic 2026-07-16) */}
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold tracking-[-0.02em] text-[#F0F0EC] sm:text-lg">{copy.formTitle}</h2>
                  <p className="mt-0.5 text-xs text-[#858594] sm:mt-1 sm:text-sm">{copy.formSubtitle}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#CAFF3C] px-2.5 py-1 text-xs font-black text-[#09090B]">{copy.freeBadge}</span>
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
                    onFocus={() => trackFormStarted("brand_name")}
                    onChange={(e) => setBrandName(e.target.value)}
                    style={inputStyle}
                    data-ph-capture-attribute-form-field="brand_name"
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
                    onFocus={() => trackFormStarted("website_url")}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    style={inputStyle}
                    data-ph-capture-attribute-form-field="website_url"
                  />
                  {/* Email volontairement OPTIONNEL : exiger une adresse avant
                      d'avoir rien montré était le frein d'entrée du funnel. On
                      la demande sur le rapport, une fois le verdict affiché. */}
                  <label className="sr-only" htmlFor="email">{copy.emailLabel}</label>
                  <input
                    id="email"
                    type="email"
                    placeholder={copy.emailOptionalPlaceholder}
                    value={email}
                    onFocus={() => trackFormStarted("email")}
                    onChange={(e) => setEmail(e.target.value)}
                    style={inputStyle}
                    data-ph-capture-attribute-form-field="email"
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="rounded-[14px] bg-[#CAFF3C] px-5 py-3.5 text-base font-black tracking-[-0.01em] text-[#09090B] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    data-ph-capture-attribute-form-field="submit"
                  >
                    {status === "loading" ? copy.loadingCta : copy.submitCta}
                  </button>
                  {errorMsg && <p className="m-0 text-sm text-[#FF6B6B]">{errorMsg}</p>}
                  <p className="m-0 text-xs leading-5 text-[#6F6F80]">{copy.formFootnote}</p>
                  <p className="m-0 text-xs font-bold leading-5 text-[#8E8E9A]">{copy.formBuyerIntentNote}</p>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* 2. DÉMO CONVERSATION IA — la douleur rendue visible */}
        <section className="mx-auto max-w-5xl px-5 pb-2 pt-2 sm:px-6">
          <div className="relative overflow-hidden rounded-[1.6rem] border border-[#FF8F6B]/25 bg-[#FF8F6B]/[0.04] p-6 sm:p-8">
            <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-[#FF8F6B]/10 blur-3xl" />
            <div className="relative grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#FF8F6B]">{copy.demoEyebrow}</p>
                <h2 className="text-[clamp(1.6rem,4vw,2.5rem)] leading-[1.05] tracking-[-0.03em] text-[#F0F0EC]" style={{ fontFamily: "var(--font-display)" }}>
                  {copy.demoTitle}
                </h2>
                <p className="mt-4 text-base leading-7 text-[#B8B8C4] sm:text-lg">{copy.demoCaption}</p>
              </div>

              <div className="rounded-[1.35rem] border border-white/[0.08] bg-[#111116] p-4 shadow-2xl shadow-black/30 sm:p-6">
                <div className="flex flex-col gap-3">
                  <div className="self-end rounded-2xl rounded-br-md bg-white/[0.08] px-4 py-3 text-sm font-semibold leading-6 text-[#F0F0EC]">
                    {copy.demoQuestion}
                  </div>
                  <div className="max-w-[92%] self-start rounded-2xl rounded-bl-md border border-white/[0.07] bg-black/30 px-4 py-3 text-sm leading-6 text-[#B8B8C4]">
                    <span className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.1em] text-[#6F6F80]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#6F6F80]" />
                      AI
                    </span>
                    {copy.demoAnswerBefore}
                    <strong className="font-black text-[#FF8F6B]">{copy.demoAnswerRival}</strong>
                    {copy.demoAnswerAfter}
                  </div>
                </div>
                <p className="m-0 mt-4 border-t border-white/[0.06] pt-3 text-xs font-bold text-[#6F6F80]">{copy.demoEyebrow}</p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. TROIS ÉTAPES CHIFFRÉES */}
        <section className="mx-auto max-w-5xl px-5 py-14 sm:px-6 sm:py-20">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.stepsEyebrow}</p>
          <h2 className="max-w-2xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
            {copy.stepsTitle}
          </h2>

          <div className="mt-8 grid gap-1 overflow-hidden rounded-2xl bg-white/[0.07] sm:grid-cols-3">
            {copy.steps.map((step) => (
              <div key={step.num} className="bg-[#111116] p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#CAFF3C] text-sm font-black text-[#09090B]">{step.num}</span>
                  <span className="rounded-full border border-white/[0.1] px-2.5 py-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-[#8E8E9A]">{step.time}</span>
                </div>
                <p className="m-0 text-lg font-bold leading-6 tracking-[-0.02em] text-[#F0F0EC]">{step.title}</p>
                <p className="mt-2 text-sm leading-6 text-[#A7A7B4]">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 4. PREUVE — L'ÉTUDE */}
        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-14 sm:px-6 sm:py-20">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.studyEyebrow}</p>
          <h2 className="max-w-2xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
            {copy.studyTitle}
          </h2>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {copy.studyStats.map((stat) => (
              <div key={stat.value} className="rounded-2xl border border-white/[0.08] bg-[#111116] p-5">
                <p className="m-0 text-4xl tracking-[-0.04em] text-[#CAFF3C]" style={{ fontFamily: "var(--font-display)" }}>{stat.value}</p>
                <p className="mt-2 text-sm leading-6 text-[#A7A7B4]">{stat.label}</p>
              </div>
            ))}
          </div>

          <Link href="/study" className="mt-6 inline-flex rounded-xl border border-[#CAFF3C]/30 bg-[#CAFF3C]/[0.07] px-5 py-3 text-sm font-black text-[#CAFF3C] no-underline transition hover:bg-[#CAFF3C]/[0.12]">
            {copy.studyCta}
          </Link>
        </section>

        {/* 5. LE LIVRABLE — extrait de rapport stylisé */}
        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-14 sm:px-6 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.deliverableEyebrow}</p>
              <h2 className="max-w-xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                {copy.deliverableTitle}
              </h2>
              <p className="mt-5 text-sm font-bold leading-6 text-[#6F6F80]">{copy.reportCaption}</p>
            </div>

            <div className="relative overflow-hidden rounded-[1.6rem] border border-white/[0.08] bg-[#111116] p-5 shadow-2xl shadow-black/30 sm:p-7">
              <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-[#CAFF3C]/10 blur-3xl" />
              <div className="relative flex flex-col gap-4">
                <div className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
                  <p className="m-0 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#8E8E9A]">{copy.reportVerdictLabel}</p>
                  <p className="mt-2 text-base font-bold leading-6 text-[#F0F0EC]">{copy.reportVerdict}</p>
                </div>
                <div className="rounded-2xl border border-[#FF8F6B]/25 bg-[#FF8F6B]/[0.06] p-4">
                  <p className="m-0 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#FF8F6B]">{copy.reportRivalLabel}</p>
                  <p className="mt-2 text-xl font-black tracking-[-0.02em] text-[#FF8F6B]">{copy.reportRival}</p>
                </div>
                <div className="rounded-2xl border border-[#CAFF3C]/25 bg-[#CAFF3C]/[0.06] p-4">
                  <p className="m-0 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.reportFixLabel}</p>
                  <p className="mt-2 text-sm font-bold text-[#F0F0EC]">{copy.reportFixTitle}</p>
                  <p className="mt-2 rounded-xl border border-white/[0.07] bg-black/30 p-3 font-mono text-[0.8rem] leading-6 text-[#DDEFC0]">
                    {copy.reportFixBody}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. PRIX ANCRÉ — agence 2 000–20 000 €/mois vs 9 € */}
        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-14 sm:px-6 sm:py-20">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.pricingEyebrow}</p>
          <h2 className="max-w-3xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
            {copy.pricingTitle}
          </h2>
          <p className="mt-4 inline-flex rounded-full border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-sm font-bold text-[#B8B8C4]">
            {copy.pricingSubtitle}
          </p>

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

          {/* Garantie 30 jours — lève l'objection « et si ça ne marche pas ? » sans dépendre de NanoCorp */}
          <p
            data-testid="pricing-guarantee"
            className="m-0 mt-6 inline-flex items-center gap-2 rounded-xl border border-[#CAFF3C]/25 bg-[#CAFF3C]/[0.05] px-4 py-3 text-sm font-bold text-[#D6D6DF]"
          >
            <span className="text-[#CAFF3C]">✓</span>
            {copy.pricingGuarantee}
          </p>
        </section>

        {/* 7. EN BREF — paragraphe dense, lisible par les IA */}
        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-12 sm:px-6">
          <div className="rounded-[1.6rem] border border-white/[0.08] bg-[#111116] p-6 sm:p-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.tldrEyebrow}</p>
            <p className="m-0 max-w-4xl text-base leading-7 text-[#B8B8C4] sm:text-lg sm:leading-8">{copy.tldrBody}</p>
          </div>
        </section>

        {/* 8. FONDATEUR */}
        <section className="mx-auto max-w-5xl px-5 py-12 sm:px-6">
          <div className="rounded-[1.6rem] border border-[#CAFF3C]/20 bg-[#CAFF3C]/[0.04] p-6 sm:p-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.founderEyebrow}</p>
            <p className="m-0 max-w-2xl text-base leading-7 text-[#D6D6DF] sm:text-lg">{copy.founderBody}</p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <p className="m-0 text-lg font-bold tracking-[-0.02em] text-[#F0F0EC]" style={{ fontFamily: "var(--font-display)" }}>
                {copy.founderSignature}
              </p>
              <a href={`mailto:${copy.founderEmail}`} className="text-sm font-black text-[#CAFF3C] no-underline">
                {copy.founderEmail}
              </a>
            </div>
          </div>
        </section>

        {/* 9. FAQ — les vraies objections */}
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

        {/* Guides IA — pages answer-ready (SEO/GEO interne) */}
        <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-14 sm:px-6 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.12em] text-[#CAFF3C]">
                {locale === "fr" ? "Guides IA" : "AI guides"}
              </p>
              <h2 className="max-w-xl text-[clamp(2rem,5vw,3rem)] leading-[1.02] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
                {locale === "fr" ? "Est-ce que l'IA recommande ta catégorie ?" : "Does AI recommend your category?"}
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#A7A7B4] sm:text-lg">
                {locale === "fr"
                  ? "Des pages answer-ready pour comprendre les signaux que ChatGPT, Gemini et les AI Overviews peuvent citer avant de recommander une marque."
                  : "Answer-ready pages explaining the signals ChatGPT, Gemini and AI Overviews can cite before recommending a brand."}
              </p>
            </div>
            <div className="grid gap-3">
              {resourcePages.map((page) => (
                <a key={page.slug} href={`/${page.locale}/${page.slug}`} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 text-[#F0F0EC] no-underline transition hover:border-[#CAFF3C]/35 hover:bg-[#CAFF3C]/[0.04]">
                  <span className="block text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{page.category}</span>
                  <span className="mt-2 block text-lg font-black tracking-[-0.02em]">{page.title}</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* 10. CLÔTURE — aversion à la perte + CTA vers le formulaire */}
        <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-6 sm:pb-20">
          <div className="relative overflow-hidden rounded-[1.8rem] border border-[#CAFF3C]/30 bg-[#CAFF3C]/[0.07] p-7 sm:p-10">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#CAFF3C]/15 blur-3xl" />
            <div className="relative">
              <h2 className="max-w-2xl text-[clamp(2rem,5.5vw,3.4rem)] leading-[1.0] tracking-[-0.045em] text-[#F0F0EC]" style={{ fontFamily: "var(--font-display)" }}>
                {copy.closingTitle}
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#B8B8C4] sm:text-lg">{copy.closingBody}</p>
              <a
                href="#audit"
                onClick={() => window.posthog?.capture("audit_cta_clicked", { plan: "free", source: "closing_cta", locale })}
                className="mt-6 inline-flex rounded-xl bg-[#CAFF3C] px-6 py-3.5 text-base font-black text-[#09090B] no-underline transition hover:brightness-110"
              >
                {copy.closingCta}
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-8 sm:px-6">
        <div>
          <div className="text-lg tracking-[-0.02em]" style={{ fontFamily: "var(--font-display)" }}>GetPick</div>
          <p className="m-0 text-sm text-[#686879]">{copy.footerTagline}</p>
        </div>
        <p className="m-0 text-sm text-[#444454]">© {new Date().getFullYear()} GetPick. {copy.rights}</p>
      </footer>
    </div>
  );
}
