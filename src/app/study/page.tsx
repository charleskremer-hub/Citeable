import type { Metadata } from "next";
import Link from "next/link";

import { STUDY_DATA_STATUS, studyArticleSchema, studyPageCopy } from "@/lib/study-status";

/**
 * ÉTUDE 21 MARQUES — LES CHIFFRES SONT RETIRÉS, LA PAGE RESTE.
 *
 * La page n'écrit aucune phrase en propre : tout vient de `@/lib/study-status`,
 * seule déclaration de l'état du jeu de données. Un chiffre republié ici sans
 * passer par cette constante fait échouer `scripts/study-retraction.test.ts`.
 *
 * ON NE SUPPRIME PAS LA PAGE, ON LA CORRIGE. L'URL est indexée, citée et
 * référencée dans llms.txt ; un 404 effacerait la trace sans rien dire à
 * personne. Elle reste donc en 200, listée dans le sitemap et INDEXABLE :
 * un `noindex` empêcherait les moteurs de remplacer par le démenti le chiffre
 * qu'ils ont déjà en cache — c'est-à-dire exactement l'inverse du but.
 *
 * AUCUN ordre de grandeur de comparaison n'est publié ici, même « corrigé » :
 * les sorties de l'instrument contaminé n'ont pas leur place sur la page qui
 * déclare ces sorties impubliables.
 */

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: studyPageCopy.metaTitle,
  description: studyPageCopy.metaDescription,
  alternates: { canonical: studyPageCopy.url },
  openGraph: {
    title: studyPageCopy.ogTitle,
    description: studyPageCopy.ogDescription,
    url: studyPageCopy.url,
    type: "article",
    publishedTime: studyPageCopy.originallyPublished,
    modifiedTime: STUDY_DATA_STATUS.withdrawnOn,
  },
};

const P = "m-0 mt-4 text-[1.02rem] font-medium leading-[1.75] text-[#C7C7D1]";

export default function StudyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20" style={{ fontFamily: "var(--font-sans)" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(studyArticleSchema) }} />

      <Link href="/" className="text-sm font-black text-[#CAFF3C] no-underline">
        ← GetPick
      </Link>

      <p className="m-0 mt-8 inline-flex rounded-md bg-[#CAFF3C]/[0.12] px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.1em] text-[#CAFF3C]">
        {studyPageCopy.eyebrow.en}
      </p>

      <h1
        className="m-0 mt-5 text-[clamp(2rem,6vw,3rem)] leading-[1.05] tracking-[-0.04em] text-[#F0F0EC]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {studyPageCopy.headline.en}
      </h1>

      {studyPageCopy.body.en.map((paragraph) => (
        <p key={paragraph} className={P}>
          {paragraph}
        </p>
      ))}

      {/* La même note en français : la page est liée depuis /vs ET /fr/vs. */}
      <section className="mt-14 border-t border-white/[0.08] pt-10">
        <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#8E8E9A]">
          {studyPageCopy.frenchHeading}
        </p>

        <p className="m-0 mt-4 inline-flex rounded-md bg-[#CAFF3C]/[0.12] px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-[0.1em] text-[#CAFF3C]">
          {studyPageCopy.eyebrow.fr}
        </p>

        <h2
          className="m-0 mt-5 text-[1.75rem] leading-[1.15] tracking-[-0.03em] text-[#F0F0EC] sm:text-[2rem]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {studyPageCopy.headline.fr}
        </h2>

        {studyPageCopy.body.fr.map((paragraph) => (
          <p key={paragraph} className={P}>
            {paragraph}
          </p>
        ))}
      </section>

      <p className="m-0 mt-10">
        <Link
          href="/"
          className="inline-flex rounded-xl border border-[#CAFF3C]/30 bg-[#CAFF3C]/[0.07] px-5 py-3 text-sm font-black text-[#CAFF3C] no-underline transition hover:bg-[#CAFF3C]/[0.12]"
        >
          {studyPageCopy.cta.en}
        </Link>
      </p>
    </main>
  );
}
