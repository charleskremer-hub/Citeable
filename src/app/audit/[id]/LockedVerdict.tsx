import type { Locale } from "@/lib/i18n";

/**
 * Les blocs GRATUITS d'un rapport verrouillé — et rien d'autre.
 *
 * Bloc 1 : la phrase, pas le score. « Sur N questions d'achat, {moteur}
 * recommande X, Y et Z. Pas {marque}. » — construite depuis les données réelles
 * par `lockedVerdictHeadline` (voir report-insights.ts). Le score chiffré, le
 * sentiment, la perception de catégorie, la part de voix : tout ça est du
 * détail, donc sous la porte.
 *
 * Bloc 2 : les questions perdues, en clair (3 max). C'est la matière du verdict,
 * pas le détail : le détail, c'est QUI est cité sur chacune et QUOI publier.
 *
 * Le bloc 3 (CTA unique) est la porte elle-même, rendue par la page.
 */
export default function LockedVerdict({
  brandName,
  websiteUrl,
  headline,
  lostQuestions,
  locale,
}: {
  brandName: string;
  websiteUrl: string;
  headline: string;
  lostQuestions: string[];
  locale: Locale;
}) {
  const fr = locale === "fr";

  return (
    <>
      <div className="rounded-[2rem] border border-white/[0.08] bg-[#111116] p-5 shadow-2xl shadow-black/30 sm:p-8" data-testid="locked-verdict">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">
            {fr ? `Audit de visibilité IA · ${brandName}` : `AI visibility audit · ${brandName}`}
          </p>
          <a href={websiteUrl} className="max-w-full truncate text-sm font-bold text-[#8E8E9A] underline decoration-white/10 underline-offset-4">
            {websiteUrl}
          </a>
        </div>
        <h1 className="m-0 text-[clamp(1.75rem,8vw,3rem)] leading-[1.05] tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
          {headline}
        </h1>
      </div>

      {lostQuestions.length ? (
        <section className="rounded-[1.5rem] border border-[#FF8F6B]/25 bg-[#FF8F6B]/[0.05] p-5 sm:p-6" data-testid="locked-lost-questions">
          <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#FF8F6B]">
            {fr ? "Questions d'achat perdues" : "Lost buyer questions"}
          </p>
          <h2 className="m-0 mt-2 text-2xl leading-[1.1] tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>
            {fr ? `Des vraies questions d'acheteurs. ${brandName} n'y est pas.` : `Real buyer questions. ${brandName} isn't in the answers.`}
          </h2>
          <ol className="m-0 mt-4 grid list-none gap-2 p-0">
            {lostQuestions.map((prompt) => (
              <li key={prompt} className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
                <p className="m-0 text-sm font-black leading-6 text-[#F0F0EC]">« {prompt} »</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}
