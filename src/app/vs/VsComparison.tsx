import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import {
  buildVsFaqJsonLd,
  buildVsItemListJsonLd,
  formatVsPrice,
  vsCopy,
  VS_TOOLS,
} from "@/lib/vs-comparison";

// Tokens visuels repris de src/app/study/page.tsx pour rester cohérent avec la
// page la plus citée du site (même palette #CAFF3C / #09090B, mêmes classes H2/P).
const H2 = "m-0 mt-12 text-[1.75rem] leading-[1.15] tracking-[-0.03em] sm:text-[2rem]";
const P = "m-0 mt-4 text-[1.02rem] font-medium leading-[1.75] text-[#C7C7D1]";

// Composant serveur partagé par les routes /vs (EN) et /fr/vs (FR). Toute la
// donnée vient de src/lib/vs-comparison.ts ; aucun score de l'étude n'est
// recopié ici (AC5) — la preuve reste sur /study, atteinte par un lien.
export default function VsComparison({ locale }: { locale: Locale }) {
  const copy = vsCopy[locale];

  return (
    <main
      className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {/* Bloc 1 : Organization + FAQPage (faqJsonLdForBrand réutilisé). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: buildVsFaqJsonLd(locale) }}
      />
      {/* Bloc 2 : ItemList additif de la comparaison de prix. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: buildVsItemListJsonLd(locale) }}
      />

      <Link href={locale === "fr" ? "/fr" : "/"} className="text-sm font-black text-[#CAFF3C] no-underline">
        {copy.backHome}
      </Link>

      <p className="m-0 mt-8 text-xs font-black uppercase tracking-[0.14em] text-[#CAFF3C]">
        {copy.eyebrow}
      </p>
      <h1
        className="m-0 mt-3 text-[clamp(2rem,7vw,3.4rem)] leading-[1.03] tracking-[-0.045em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {copy.title}
      </h1>

      <p className={P}>{copy.intro}</p>

      {/* Ancrage prix repris mot pour mot de homeCopy[locale].pricingTitle. */}
      <p className="m-0 mt-8 rounded-2xl border border-[#CAFF3C]/25 bg-[#CAFF3C]/[0.07] px-5 py-4 text-[1.05rem] font-black leading-[1.4] text-[#CAFF3C]">
        {copy.agencyAnchor}
      </p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
        {copy.title}
      </h2>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/[0.08]">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-white/[0.04] text-xs font-black uppercase tracking-[0.1em] text-[#8E8E9A]">
              <th className="px-4 py-3">{copy.th.tool}</th>
              <th className="px-4 py-3 whitespace-nowrap">{copy.th.price}</th>
              <th className="px-4 py-3">{copy.th.does}</th>
              <th className="px-4 py-3">{copy.th.source}</th>
            </tr>
          </thead>
          <tbody>
            {VS_TOOLS.map((tool) => (
              <tr key={tool.name} className="border-t border-white/[0.06] align-top">
                <td className={`px-4 py-3 font-bold ${tool.isUs ? "text-[#CAFF3C]" : "text-[#F0F0EC]"}`}>
                  {tool.name}
                  <span className="block text-xs font-medium text-[#777787]">
                    {tool.entryPlan[locale]}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-black text-[#F0F0EC]">
                  {formatVsPrice(tool, locale)}
                  <span className="block text-[0.7rem] font-medium text-[#777787]">
                    {locale === "fr" ? "/mois" : "/mo"}
                    {tool.billing ? ` · ${tool.billing[locale]}` : ""}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-[#A7A7B4]">{tool.does[locale]}</td>
                <td className="px-4 py-3 font-medium">
                  <a
                    href={tool.sourceUrl}
                    className="text-[#A7A7B4] underline decoration-white/20 underline-offset-2 hover:text-[#CAFF3C]"
                    rel="nofollow noopener"
                  >
                    {tool.sourceLabel}
                  </a>
                  <span className="block text-[0.7rem] font-medium text-[#777787]">
                    {locale === "fr" ? "relevé 2026-07" : "recorded 2026-07"}
                  </span>
                  {tool.sourceNote ? (
                    <span className="mt-1 block text-[0.7rem] font-medium italic text-[#777787]">
                      {tool.sourceNote[locale]}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-3 text-xs font-bold text-[#777787]">{copy.priceNote}</p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
        {locale === "fr" ? "La preuve" : "The proof"}
      </h2>
      <p className={P}>{copy.studyIntro}</p>
      <Link
        href="/study"
        className="mt-6 inline-flex rounded-xl border border-[#CAFF3C]/30 bg-[#CAFF3C]/[0.07] px-5 py-3 text-sm font-black text-[#CAFF3C] no-underline transition hover:bg-[#CAFF3C]/[0.12]"
      >
        {copy.studyCta}
      </Link>
    </main>
  );
}
