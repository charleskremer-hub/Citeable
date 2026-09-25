import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureAuditSchema, pool } from "@/lib/db";
import { descriptionFromAudit, generateGeoAgentAssetsFromAudit } from "@/lib/audit-engine";
import type { AuditRawResults } from "@/lib/audit-engine";
import { type Locale } from "@/lib/i18n";
import { cityFromPrompts, hostedAnswerCopy, hostedAnswerPageSlug, shortIdFromSlug } from "@/lib/hosted-answer-page";

// Page par client, adossée à la base : jamais pré-générée. Voir la note du
// modèle `audit/[id]/page.tsx`.
export const dynamic = "force-dynamic";

const siteUrl = "https://www.getpick.ai";

type HostedAnswerRow = {
  id: string;
  brand_name: string;
  website_url: string;
  score: number | null;
  competitors_found: string[] | null;
  raw_results: AuditRawResults | null;
  answer_page_published_at: string | null;
};

type HostedAnswerPageProps = {
  params: Promise<{ slug: string }>;
};

async function loadRow(slug: string): Promise<HostedAnswerRow | null> {
  const shortId = shortIdFromSlug(slug);
  if (!shortId) return null;

  await ensureAuditSchema();
  const result = await pool.query<HostedAnswerRow>(
    `SELECT id, brand_name, website_url, score, competitors_found, raw_results, answer_page_published_at
     FROM audits
     WHERE id::text LIKE $1 AND score IS NOT NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [`${shortId}%`]
  );
  return result.rows[0] ?? null;
}

function localeOf(row: HostedAnswerRow): Locale {
  return row.raw_results?.locale === "en" ? "en" : "fr";
}

export async function generateMetadata({ params }: HostedAnswerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const row = await loadRow(slug);
  if (!row) return { robots: { index: false, follow: false } };

  const assets = generateGeoAgentAssetsFromAudit(row);
  const locale = localeOf(row);
  const city = cityFromPrompts(assets.prompts);
  const description = descriptionFromAudit(row.raw_results);
  const copy = hostedAnswerCopy(locale, {
    brandName: row.brand_name,
    category: assets.category,
    city,
    description,
    competitors: assets.competitors,
    prompts: assets.prompts,
  });
  const canonical = `${siteUrl}/reponses/${hostedAnswerPageSlug(row.brand_name, row.id)}`;
  const published = Boolean(row.answer_page_published_at);

  return {
    title: `${copy.title} · GetPick`,
    description: copy.directAnswer.slice(0, 300),
    alternates: { canonical },
    robots: published ? undefined : { index: false, follow: false },
    openGraph: {
      title: copy.title,
      description: copy.directAnswer.slice(0, 300),
      url: canonical,
      siteName: "GetPick",
      locale: locale === "fr" ? "fr_FR" : "en_US",
      type: "article",
    },
  };
}

export default async function HostedAnswerPage({ params }: HostedAnswerPageProps) {
  const { slug } = await params;
  const row = await loadRow(slug);
  if (!row) notFound();

  const assets = generateGeoAgentAssetsFromAudit(row);
  const locale = localeOf(row);
  const city = cityFromPrompts(assets.prompts);
  const description = descriptionFromAudit(row.raw_results);
  const copy = hostedAnswerCopy(locale, {
    brandName: row.brand_name,
    category: assets.category,
    city,
    description,
    competitors: assets.competitors,
    prompts: assets.prompts,
  });

  const canonical = `${siteUrl}/reponses/${hostedAnswerPageSlug(row.brand_name, row.id)}`;
  let clientHome = "";
  try {
    const u = new URL(row.website_url);
    clientHome = `${u.protocol}//${u.hostname}/`;
  } catch {
    clientHome = "";
  }

  // JSON-LD reciblé sur l'URL HÉBERGÉE : c'est CETTE page que le moteur doit
  // traiter comme la source citable, tout en nommant l'organisation cliente.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: copy.title,
        inLanguage: locale === "fr" ? "fr-FR" : "en-US",
        about: { "@id": `${canonical}#org` },
        isPartOf: { "@type": "WebSite", name: "GetPick", url: `${siteUrl}/` },
      },
      {
        "@type": "Organization",
        "@id": `${canonical}#org`,
        name: row.brand_name,
        ...(clientHome ? { url: clientHome } : {}),
        ...(description ? { description } : {}),
      },
      ...(copy.faq.length
        ? [
            {
              "@type": "FAQPage",
              "@id": `${canonical}#faq`,
              mainEntity: copy.faq.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: { "@type": "Answer", text: item.answer },
              })),
            },
          ]
        : []),
    ],
  };

  return (
    <main className="min-h-screen bg-[#09090B] text-[#F0F0EC]" style={{ fontFamily: "var(--font-sans)" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#CAFF3C]/10 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-5 py-6 sm:px-6 sm:py-8">
          <nav className="flex items-center justify-between gap-4 text-sm">
            <Link href="/" className="font-serif text-xl tracking-[-0.02em] text-[#F0F0EC] no-underline" style={{ fontFamily: "var(--font-display)" }}>
              GetPick
            </Link>
            <Link href="/#audit" className="rounded-full bg-[#CAFF3C] px-4 py-2 font-black text-[#09090B] no-underline transition hover:brightness-110">
              {copy.ctaLabel}
            </Link>
          </nav>

          <div className="py-14 sm:py-18">
            <p className="mb-4 text-xs font-black uppercase tracking-[0.16em] text-[#CAFF3C]">{copy.eyebrow}</p>
            <h1 className="max-w-3xl text-[clamp(2.2rem,6vw,4.4rem)] leading-[0.95] tracking-[-0.05em]" style={{ fontFamily: "var(--font-display)" }}>
              {copy.title}
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#D7D7CD]">{copy.directAnswer}</p>
          </div>
        </div>
      </section>

      {assets.competitors.length > 0 && (
        <section className="mx-auto max-w-4xl border-b border-white/[0.06] px-5 py-10 sm:px-6 sm:py-12">
          <h2 className="text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>{copy.competitorsTitle}</h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#B8B8C4]">{copy.competitorsIntro}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {assets.competitors.slice(0, 8).map((competitor) => (
              <span key={competitor} className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-[#B8B8C4]">{competitor}</span>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-4xl px-5 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-3">
          {copy.faq.map((item) => (
            <details key={item.question} open className="rounded-2xl border border-white/[0.08] bg-[#111116] p-5">
              <summary className="cursor-pointer text-lg font-black tracking-[-0.02em] text-[#F0F0EC]">{item.question}</summary>
              <p className="mt-4 text-base leading-7 text-[#B8B8C4]">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-16 sm:px-6 sm:pb-20">
        <div className="overflow-hidden rounded-[1.8rem] border border-[#CAFF3C]/25 bg-[#CAFF3C] p-7 text-[#09090B] sm:p-9">
          <h2 className="max-w-2xl text-[clamp(1.9rem,4.5vw,3.4rem)] leading-[0.98] tracking-[-0.05em]" style={{ fontFamily: "var(--font-display)" }}>{copy.ctaTitle}</h2>
          <p className="mt-4 max-w-2xl text-base font-bold leading-7 sm:text-lg">{copy.ctaBody}</p>
          <Link href="/#audit" className="mt-6 inline-flex rounded-full bg-[#09090B] px-5 py-3 font-black text-[#CAFF3C] no-underline transition hover:scale-[1.01]">
            {copy.ctaLabel}
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 border-t border-white/[0.06] px-5 py-8 sm:px-6">
        <p className="m-0 text-xs leading-5 text-[#777786]">{copy.disclaimer}</p>
        <a href={canonical} className="text-sm text-[#555566] no-underline">{canonical.replace("https://", "")}</a>
      </footer>
    </main>
  );
}
