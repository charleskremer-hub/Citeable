import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { answerPages, getAlternateAnswerPage, getAnswerPage, getRelatedAnswerPages } from "@/lib/answer-pages";

type SeoAnswerPageProps = {
  params: Promise<{ locale: string; slug: string }>;
};

const siteUrl = "https://www.getpick.ai";

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
    <main className="min-h-screen bg-[#F5F7FA] text-[#132A43]" style={{ fontFamily: "var(--font-sans)" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="relative overflow-hidden border-b border-[#E4E9F0]">
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#123E5C]/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-[#FBFCFD] blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-5 py-6 sm:px-6 sm:py-8">
          <nav className="flex items-center justify-between gap-4 text-sm">
            <Link href="/" className="font-serif text-xl tracking-[-0.02em] text-[#132A43] no-underline" style={{ fontFamily: "var(--font-display)" }}>
              GetPick
            </Link>
            <div className="flex items-center gap-3">
              {alternate && (
                <Link href={`/${alternate.locale}/${alternate.slug}`} className="rounded-full border border-[#E4E9F0] px-3 py-1.5 text-[#5B6B82] no-underline transition hover:border-[#123E5C]/40 hover:text-[#123E5C]">
                  {alternate.locale.toUpperCase()}
                </Link>
              )}
              <Link href="/#audit" className="rounded-full bg-[#123E5C] px-4 py-2 font-black text-white no-underline transition hover:brightness-110">
                {page.ctaLabel}
              </Link>
            </div>
          </nav>

          <div className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_0.72fr] lg:items-end">
            <div>
              <p className="mb-4 text-xs font-black uppercase tracking-[0.16em] text-[#123E5C]">{page.eyebrow}</p>
              <h1 className="max-w-4xl text-[clamp(2.6rem,7vw,5.7rem)] leading-[0.92] tracking-[-0.06em]" style={{ fontFamily: "var(--font-display)" }}>
                {page.title}
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-[#5B6B82] sm:text-xl">{page.directAnswer}</p>
            </div>

            <aside className="rounded-[1.5rem] border border-[#123E5C]/25 bg-[#123E5C]/[0.07] p-5 shadow-2xl shadow-[#123E5C]/5">
              <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#123E5C]">Featured snippet</p>
              <p className="mt-4 text-base font-bold leading-7 text-[#132A43]">{page.featuredListIntro}</p>
              <ul className="m-0 mt-4 flex list-none flex-col gap-2 p-0 text-sm leading-6 text-[#D6E2EC]">
                {page.featuredList.map((item) => (
                  <li key={item} className="flex gap-2"><span className="text-[#123E5C]">✓</span>{item}</li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-5 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.88fr_1.12fr]">
        <div className="rounded-[1.5rem] border border-[#E4E9F0] bg-[#FFFFFF] p-6 sm:p-7">
          <h2 className="text-3xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>{page.verificationTitle}</h2>
          <p className="mt-5 text-base leading-7 text-[#5B6B82]">{page.verificationIntro}</p>
        </div>
        <ol className="m-0 grid list-none gap-3 p-0">
          {page.verificationSteps.map((step, index) => (
            <li key={step} className="grid grid-cols-[2.25rem_1fr] gap-4 rounded-2xl border border-[#E4E9F0] bg-[#FBFCFD] p-4 text-[#5B6B82]">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#123E5C] text-sm font-black text-white">{index + 1}</span>
              <span className="pt-1 text-base leading-7">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 border-t border-[#E4E9F0] px-5 py-12 sm:px-6 sm:py-16 lg:grid-cols-2">
        <article className="rounded-[1.5rem] border border-[#123E5C]/25 bg-[#123E5C]/[0.055] p-6 sm:p-7">
          <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#123E5C]">GetPick</p>
          <h2 className="mt-4 text-3xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>{page.getpickTitle}</h2>
          <p className="mt-5 text-base font-bold leading-7 text-[#D6E2EC]">{page.getpickBody}</p>
          <Link href="/#audit" className="mt-6 inline-flex rounded-full bg-[#123E5C] px-5 py-3 font-black text-white no-underline transition hover:brightness-110">
            {page.ctaLabel}
          </Link>
        </article>
        <article className="rounded-[1.5rem] border border-[#E4E9F0] bg-[#FFFFFF] p-6 sm:p-7">
          <h2 className="text-3xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>{page.proofSignalsTitle}</h2>
          <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0 text-base leading-7 text-[#5B6B82]">
            {page.proofSignals.map((signal) => (
              <li key={signal} className="flex gap-3"><span className="text-[#123E5C]">•</span>{signal}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="mx-auto max-w-5xl border-t border-[#E4E9F0] px-5 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="text-3xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>{page.sourceTitle}</h2>
            <p className="mt-5 text-base leading-7 text-[#5B6B82]">{page.sourceIntro}</p>
          </div>
          <div className="grid gap-3">
            {page.sources.map((source) => (
              <a key={source.href} href={source.href} className="block rounded-2xl border border-[#E4E9F0] bg-[#FBFCFD] p-5 text-[#132A43] no-underline transition hover:border-[#123E5C]/35" target="_blank" rel="noreferrer">
                <span className="text-sm font-black text-[#123E5C]">{source.label}</span>
                <span className="mt-2 block text-sm leading-6 text-[#5B6B82]">{source.note}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl border-t border-[#E4E9F0] px-5 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-3">
          {page.faq.map((item) => (
            <details key={item.question} className="rounded-2xl border border-[#E4E9F0] bg-[#FFFFFF] p-5">
              <summary className="cursor-pointer text-lg font-black tracking-[-0.02em] text-[#132A43]">{item.question}</summary>
              <p className="mt-4 text-base leading-7 text-[#5B6B82]">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16 sm:px-6 sm:pb-20">
        <div className="overflow-hidden rounded-[1.8rem] border border-[#123E5C]/25 bg-[#123E5C] p-7 text-white sm:p-9">
          <h2 className="max-w-2xl text-[clamp(2.2rem,5vw,4rem)] leading-[0.95] tracking-[-0.06em]" style={{ fontFamily: "var(--font-display)" }}>{page.ctaTitle}</h2>
          <p className="mt-4 max-w-2xl text-base font-bold leading-7 sm:text-lg">{page.ctaBody}</p>
          <Link href="/#audit" className="mt-6 inline-flex rounded-full bg-[#F5F7FA] px-5 py-3 font-black text-[#123E5C] no-underline transition hover:scale-[1.01]">
            {page.ctaLabel}
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 border-t border-[#E4E9F0] px-5 py-8 sm:px-6">
        <div>
          <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#8FA0B4]">{page.relatedTitle}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {related.map((relatedPage) => (
              <Link key={relatedPage.slug} href={`/${relatedPage.locale}/${relatedPage.slug}`} className="rounded-full border border-[#E4E9F0] px-3 py-1.5 text-sm text-[#5B6B82] no-underline transition hover:border-[#123E5C]/40 hover:text-[#123E5C]">
                {relatedPage.category}
              </Link>
            ))}
          </div>
        </div>
        <a href={canonical} className="text-sm text-[#8FA0B4] no-underline">{canonical.replace("https://", "")}</a>
      </footer>
    </main>
  );
}
