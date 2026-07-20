import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { answerPages, getAlternateAnswerPage, getAnswerPage, getRelatedAnswerPages } from "@/lib/answer-pages";

type SeoAnswerPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

const siteUrl = "https://getpick.ai";

export function generateStaticParams() {
  return answerPages.map((page) => ({ locale: page.locale, slug: page.slug }));
}

export async function generateMetadata({ params }: SeoAnswerPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = getAnswerPage(locale, slug);

  if (!page) return {};

  const alternate = getAlternateAnswerPage(page);
  const canonical = `${siteUrl}/${page.locale}/${page.slug}`;

  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: {
      canonical,
      languages: alternate ? { [alternate.locale]: `${siteUrl}/${alternate.locale}/${alternate.slug}` } : undefined,
    },
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      url: canonical,
      siteName: "GetPick",
      locale: page.locale === "fr" ? "fr_FR" : "en_US",
      type: "article",
    },
  };
}

export default async function SeoAnswerPage({ params }: SeoAnswerPageProps) {
  const { locale, slug } = await params;
  const page = getAnswerPage(locale, slug);

  if (!page) notFound();

  const related = getRelatedAnswerPages(page);
  const alternate = getAlternateAnswerPage(page);
  const canonical = `${siteUrl}/${page.locale}/${page.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <main className="min-h-screen bg-[#09090B] text-[#F0F0EC]" style={{ fontFamily: "var(--font-sans)" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#CAFF3C]/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-white/[0.04] blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-5 py-6 sm:px-6 sm:py-8">
          <nav className="flex items-center justify-between gap-4 text-sm">
            <Link href="/" className="font-serif text-xl tracking-[-0.02em] text-[#F0F0EC] no-underline" style={{ fontFamily: "var(--font-display)" }}>
              GetPick
            </Link>
            <div className="flex items-center gap-3">
              {alternate && (
                <Link href={`/${alternate.locale}/${alternate.slug}`} className="rounded-full border border-white/10 px-3 py-1.5 text-[#B8B8C4] no-underline transition hover:border-[#CAFF3C]/40 hover:text-[#CAFF3C]">
                  {alternate.locale.toUpperCase()}
                </Link>
              )}
              <Link href="/#audit" className="rounded-full bg-[#CAFF3C] px-4 py-2 font-black text-[#09090B] no-underline transition hover:brightness-110">
                {page.ctaLabel}
              </Link>
            </div>
          </nav>

          <div className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_0.72fr] lg:items-end">
            <div>
              <p className="mb-4 text-xs font-black uppercase tracking-[0.16em] text-[#CAFF3C]">{page.eyebrow}</p>
              <h1 className="max-w-4xl text-[clamp(2.6rem,7vw,5.7rem)] leading-[0.92] tracking-[-0.06em]" style={{ fontFamily: "var(--font-display)" }}>
                {page.title}
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-[#D7D7CD] sm:text-xl">{page.directAnswer}</p>
            </div>

            <aside className="rounded-[1.5rem] border border-[#CAFF3C]/25 bg-[#CAFF3C]/[0.07] p-5 shadow-2xl shadow-[#CAFF3C]/5">
              <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#CAFF3C]">Featured snippet</p>
              <p className="mt-4 text-base font-bold leading-7 text-[#F0F0EC]">{page.featuredListIntro}</p>
              <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0 text-sm leading-6 text-[#DDEFC0]">
                {page.featuredList.map((item) => (
                  <li key={item} className="flex gap-2"><span className="text-[#CAFF3C]">✓</span>{item}</li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-5 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="rounded-[1.5rem] border border-white/[0.08] bg-[#111116] p-6 sm:p-7">
          <h2 className="text-3xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>{page.verificationTitle}</h2>
          <p className="mt-5 text-base leading-7 text-[#B8B8C4]">{page.verificationIntro}</p>
        </div>
        <ol className="m-0 grid list-none gap-3 p-0">
          {page.verificationSteps.map((step, index) => (
            <li key={step} className="grid grid-cols-[2.25rem_1fr] gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 text-[#D7D7CD]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#CAFF3C] text-sm font-black text-[#09090B]">{index + 1}</span>
              <span className="pt-1 text-base leading-7">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 border-t border-white/[0.06] px-5 py-12 sm:px-6 sm:py-16 lg:grid-cols-2">
        <article className="rounded-[1.5rem] border border-[#CAFF3C]/25 bg-[#CAFF3C]/[0.055] p-6 sm:p-7">
          <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#CAFF3C]">GetPick</p>
          <h2 className="mt-4 text-3xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>{page.getpickTitle}</h2>
          <p className="mt-5 text-base font-bold leading-7 text-[#EFFFE0]">{page.getpickBody}</p>
          <Link href="/#audit" className="mt-6 inline-flex rounded-full bg-[#CAFF3C] px-5 py-3 font-black text-[#09090B] no-underline transition hover:brightness-110">
            {page.ctaLabel}
          </Link>
        </article>
        <article className="rounded-[1.5rem] border border-white/[0.08] bg-[#111116] p-6 sm:p-7">
          <h2 className="text-3xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>{page.proofSignalsTitle}</h2>
          <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0 text-base leading-7 text-[#D7D7CD]">
            {page.proofSignals.map((signal) => (
              <li key={signal} className="flex gap-3"><span className="text-[#CAFF3C]">•</span>{signal}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-3xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>{page.sourceTitle}</h2>
            <p className="mt-5 text-base leading-7 text-[#B8B8C4]">{page.sourceIntro}</p>
          </div>
          <div className="grid gap-3">
            {page.sources.map((source) => (
              <a key={source.href} href={source.href} className="block rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 text-[#F0F0EC] no-underline transition hover:border-[#CAFF3C]/35" target="_blank" rel="noreferrer">
                <span className="text-sm font-black text-[#CAFF3C]">{source.label}</span>
                <span className="mt-2 block text-sm leading-6 text-[#B8B8C4]">{source.note}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl border-t border-white/[0.06] px-5 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-3">
          {page.faq.map((item) => (
            <details key={item.question} className="rounded-2xl border border-white/[0.08] bg-[#111116] p-5">
              <summary className="cursor-pointer text-lg font-black tracking-[-0.02em] text-[#F0F0EC]">{item.question}</summary>
              <p className="mt-4 text-base leading-7 text-[#B8B8C4]">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-6 sm:pb-20">
        <div className="overflow-hidden rounded-[1.8rem] border border-[#CAFF3C]/25 bg-[#CAFF3C] p-7 text-[#09090B] sm:p-9">
          <h2 className="max-w-2xl text-[clamp(2.2rem,5vw,4rem)] leading-[0.95] tracking-[-0.06em]" style={{ fontFamily: "var(--font-display)" }}>{page.ctaTitle}</h2>
          <p className="mt-4 max-w-2xl text-base font-bold leading-7 sm:text-lg">{page.ctaBody}</p>
          <Link href="/#audit" className="mt-6 inline-flex rounded-full bg-[#09090B] px-5 py-3 font-black text-[#CAFF3C] no-underline transition hover:scale-[1.01]">
            {page.ctaLabel}
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] px-5 py-8 sm:px-6">
        <div>
          <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#777786]">{page.relatedTitle}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {related.map((relatedPage) => (
              <Link key={relatedPage.slug} href={`/${relatedPage.locale}/${relatedPage.slug}`} className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-[#B8B8C4] no-underline transition hover:border-[#CAFF3C]/40 hover:text-[#CAFF3C]">
                {relatedPage.category}
              </Link>
            ))}
          </div>
        </div>
        <a href={canonical} className="text-sm text-[#555566] no-underline">{canonical.replace("https://", "")}</a>
      </footer>
    </main>
  );
}
