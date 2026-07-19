import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-static";

const PUBLISHED = "2026-07-19";
const URL = "https://getciteable.nanocorp.app/study";

export const metadata: Metadata = {
  title: "We asked AI what to buy in 21 DTC categories — Citeable study",
  description:
    "We audited 21 direct-to-consumer brands with live ChatGPT and Gemini calls. Brand awareness barely predicted AI visibility: Allbirds scored 46, Ridge Wallet 81. In 14 of 21 audits, AI named a competitor instead.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Brand awareness barely predicts whether AI recommends you",
    description:
      "21 DTC brands audited with live AI calls. Scores from 31 to 88. In 14 of 21, AI named a competitor instead.",
    url: URL,
    type: "article",
    publishedTime: PUBLISHED,
  },
};

type Row = { brand: string; score: number; cited?: string; instead?: string; lowRes?: boolean; us?: boolean };

const ROWS: Row[] = [
  { brand: "Hedley & Bennett", score: 31, cited: "3/12", instead: "Tilit" },
  { brand: "Necessaire", score: 35, cited: "3/12", instead: "Aesop" },
  { brand: "Allbirds", score: 46, lowRes: true },
  { brand: "Bubble", score: 47, cited: "5/12", instead: "CeraVe" },
  { brand: "Cuts", score: 50, instead: "Lululemon" },
  { brand: "Topicals", score: 51, instead: "Paula's Choice" },
  { brand: "Spot & Tango", score: 55, cited: "7/12", instead: "Ollie" },
  { brand: "De Soi", score: 57, cited: "8/12", instead: "Ghia" },
  { brand: "Citeable (us)", score: 61, cited: "9/12", instead: "BrightLocal", us: true },
  { brand: "Versed", score: 63, cited: "7/12", instead: "Cocokind" },
  { brand: "Baboon to the Moon", score: 65, lowRes: true },
  { brand: "Cometeer", score: 66, instead: "Jot" },
  { brand: "Tower 28", score: 69, cited: "7/12", instead: "Kosas" },
  { brand: "Arrae", score: 69, cited: "8/12", instead: "Love Wellness" },
  { brand: "Dagne Dover", score: 69, cited: "8/12", instead: "Calpak" },
  { brand: "Ollie", score: 69, instead: "Nom Nom" },
  { brand: "Recess", score: 74 },
  { brand: "Our Place", score: 75 },
  { brand: "Ridge Wallet", score: 81, lowRes: true },
  { brand: "Moon Juice", score: 85 },
  { brand: "Brooklinen", score: 88 },
];

function scoreColor(score: number) {
  if (score < 50) return "#FF5F5F";
  if (score < 70) return "#FFB84D";
  return "#CAFF3C";
}

// Schéma Article : c'est ce qui permet aux moteurs IA d'attribuer l'étude à
// Citeable quand ils reprennent ses chiffres. Sans lui, on produit de la donnée
// citée sans être cité — l'erreur exacte que l'étude décrit.
const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "We asked AI what to buy in 21 DTC categories. Brand awareness had almost nothing to do with the answer.",
  datePublished: PUBLISHED,
  url: URL,
  author: { "@type": "Organization", name: "Citeable", url: "https://getciteable.nanocorp.app" },
  publisher: { "@type": "Organization", name: "Citeable" },
  about: "AI visibility of direct-to-consumer brands in ChatGPT and Gemini answers",
  description:
    "A study of 21 direct-to-consumer brands audited with live ChatGPT and Gemini calls. Scores ranged from 31 to 88 out of 100. In 14 of 21 audits, the assistant named a specific competitor instead of the brand.",
};

const H2 = "m-0 mt-12 text-[1.75rem] leading-[1.15] tracking-[-0.03em] sm:text-[2rem]";
const P = "m-0 mt-4 text-[1.02rem] font-medium leading-[1.75] text-[#C7C7D1]";

export default function StudyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20" style={{ fontFamily: "var(--font-sans)" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_SCHEMA) }} />

      <Link href="/" className="text-sm font-black text-[#CAFF3C] no-underline">
        ← Citeable
      </Link>

      <p className="m-0 mt-8 text-xs font-black uppercase tracking-[0.14em] text-[#CAFF3C]">Study · July 2026</p>
      <h1
        className="m-0 mt-3 text-[clamp(2rem,7vw,3.4rem)] leading-[1.03] tracking-[-0.045em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        We asked AI what to buy in 21 DTC categories. Brand awareness had almost nothing to do with the answer.
      </h1>

      <p className={P}>
        Allbirds has been on the cover of Time. It went public. It has spent close to a decade, and a very large amount
        of money, making sure you know its name.
      </p>
      <p className={P}>
        We asked ChatGPT and Gemini what to buy in its category. Allbirds scored <strong className="text-[#F0F0EC]">46 out of 100</strong>.
      </p>
      <p className={P}>
        Ridge Wallet — a company you may well have never heard of — scored <strong className="text-[#F0F0EC]">81</strong>.
      </p>
      <p className={P}>
        That gap is the finding. Across 21 direct-to-consumer brands we audited, how famous a brand is turned out to be a
        poor predictor of whether AI recommends it. And since a growing share of shoppers now ask an assistant before
        they buy, that gap is a revenue problem hiding inside a marketing win.
      </p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>How we ran this</h2>
      <p className={P}>
        We make Citeable, an AI visibility tool. This study uses our own engine, and you should know exactly what it does
        before you trust the numbers.
      </p>
      <p className={P}>
        For each brand we generated the questions a real buyer would type before purchasing in that category — not
        brand-name searches, but demand-side questions like <em>&ldquo;best machine washable sneakers for everyday
        wear&rdquo;</em>. We sent those questions to live AI assistants at audit time. No simulated prompts, no cached
        guesses, no modelled estimates. Then we recorded whether the assistant named the brand, or named someone else.
      </p>
      <p className={P}>
        <strong className="text-[#F0F0EC]">Limitations, stated plainly.</strong> The sample is 21 brands — enough to show
        a pattern, not enough to publish a law. Seventeen brands were audited across 12 buyer questions; four across 3,
        so their scores are lower-resolution and are marked below. Answers from AI assistants vary between runs and
        change over time; this is a snapshot, not a permanent ranking. And we are not a neutral party: we sell a product
        that fixes exactly the problem this study describes. Read accordingly — and note that we published our own score
        too, including the part that embarrassed us.
      </p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
        Finding 1: awareness and AI visibility are close to unrelated
      </h2>
      <p className={P}>
        The spread was wide: <strong className="text-[#F0F0EC]">31 to 88 out of 100</strong>, with a median of 65.
      </p>
      <p className={P}>
        What it did not track was brand size. Necessaire — well funded, stocked in Sephora, the kind of brand that gets
        written about — scored 35. Brooklinen scored 88. Hedley &amp; Bennett, whose aprons are on television, scored 31
        and was named by AI on only 3 of the 12 buyer questions we tested.
      </p>
      <p className={P}>
        Four of the 21 brands scored below 50. More than half landed between 50 and 69 — recommended sometimes,
        invisible often, which is arguably the most dangerous place to be, because nothing looks broken.
      </p>
      <p className={P}>
        The reason is mechanical rather than mysterious. Traditional brand building buys recall in a human&apos;s memory.
        An AI assistant does not have your memory. It assembles an answer from what it can read. If your category
        expertise lives in a beautifully art-directed campaign and a paid-media budget, there may be very little for the
        model to work with.
      </p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
        Finding 2: someone else is being named, and it is often smaller than you
      </h2>
      <p className={P}>
        In <strong className="text-[#F0F0EC]">14 of the 21 audits, the assistant named a specific competitor</strong> in
        the brand&apos;s place. This is the part founders tend to find genuinely unpleasant, and it is the most useful
        signal in the data.
      </p>
      <p className={P}>
        Hedley &amp; Bennett lost to Tilit. Necessaire lost to Aesop. Versed lost to Cocokind. De Soi lost to Ghia. Spot
        &amp; Tango lost to Ollie. Dagne Dover lost to Calpak. Tower 28 lost to Kosas.
      </p>
      <p className={P}>
        Several of those winners are smaller companies with a fraction of the marketing budget. They are not winning on
        brand. They are winning because when a model assembles an answer about the category, their content is what is
        available to assemble.
      </p>
      <p className={P}>
        That is bad news and good news in the same sentence. Bad, because ad spend does not defend this position. Good,
        because the thing that does win here is cheap to produce.
      </p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>Finding 3: the losses are unusually fixable</h2>
      <p className={P}>
        Two things separated the top of the table from the bottom, and neither required a rebrand.
      </p>
      <p className={P}>
        <strong className="text-[#F0F0EC]">Machine readability.</strong> Some sites block or fail to serve the crawlers
        that feed AI answers. If the assistant cannot read you, no amount of content strategy matters — you have been
        eliminated before the question is asked. This is a robots.txt line and, increasingly, an{" "}
        <code className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[0.9em]">llms.txt</code> file. It is a
        fifteen-minute fix that is either done or not done.
      </p>
      <p className={P}>
        <strong className="text-[#F0F0EC]">Answering the actual question.</strong> The brands that scored well tended to
        have plain, crawlable pages that answer category questions in the buyer&apos;s words — comparisons,
        &ldquo;best X for Y&rdquo; framing, specifics about materials, use cases and trade-offs. The brands that scored
        poorly often had gorgeous sites that described the brand rather than the decision.
      </p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>The table</h2>
      <div className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08]">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-white/[0.04] text-xs font-black uppercase tracking-[0.1em] text-[#8E8E9A]">
              <th className="px-4 py-3">Brand</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3">Cited</th>
              <th className="px-4 py-3">Named instead</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.brand} className="border-t border-white/[0.06]">
                <td className={`px-4 py-3 font-bold ${row.us ? "text-[#CAFF3C]" : "text-[#F0F0EC]"}`}>
                  {row.brand}
                  {row.lowRes ? <span className="text-[#777787]"> *</span> : null}
                </td>
                <td className="px-4 py-3 text-right font-black" style={{ color: scoreColor(row.score) }}>
                  {row.score}
                </td>
                <td className="px-4 py-3 font-medium text-[#A7A7B4]">{row.cited ?? "—"}</td>
                <td className="px-4 py-3 font-medium text-[#A7A7B4]">{row.instead ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-3 text-xs font-bold text-[#777787]">* audited across 3 buyer questions rather than 12.</p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
        We audited ourselves, and it went badly in an interesting way
      </h2>
      <p className={P}>
        We scored 61, and AI recommends us on 9 of 12 buyer questions — respectable.
      </p>
      <p className={P}>
        The problem was what it said about us. Asked to describe Citeable, the assistant called us{" "}
        <em>&ldquo;an intuitive no-code solution for local businesses.&rdquo;</em> The buyer questions it generated for
        us were about local restaurants and food brands.
      </p>
      <p className={P}>
        We do not sell to local businesses. We sell to DTC and e-commerce brands. The AI had us filed in the wrong
        category entirely — confidently, and in a way no dashboard metric would have flagged, because our visibility
        number looked fine.
      </p>
      <p className={P}>
        This turns out to be the more important lesson in the whole study.{" "}
        <strong className="text-[#F0F0EC]">Being cited is not the goal. Being cited in the category where your buyers
        are asking is the goal.</strong> A brand can score well and still be invisible to the people who would actually
        buy from it.
      </p>
      <p className={P}>
        We have since published an llms.txt, declared our category and audience in structured data, and explicitly
        allowed the AI crawlers. We will re-audit and report whether it moved. If it does not, we will say so.
      </p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>What to do with this</h2>
      <p className={P}>
        <strong className="text-[#F0F0EC]">Find out whether AI can read you at all.</strong> Check that your robots.txt
        does not block GPTBot, ClaudeBot, PerplexityBot or Google-Extended. This is binary and takes minutes.
      </p>
      <p className={P}>
        <strong className="text-[#F0F0EC]">Find out who is being named instead of you.</strong> Not whether you are
        &ldquo;visible&rdquo; in the abstract — the specific competitor the assistant recommends when someone asks what
        to buy in your category. That name tells you what to write.
      </p>
      <p className={P}>
        <strong className="text-[#F0F0EC]">Publish the page that answers the question.</strong> Not a brand story. The
        comparison, the trade-offs, the &ldquo;best X for Y&rdquo; in the words your buyer actually uses.
      </p>

      <div className="mt-12 rounded-[1.5rem] border border-[#CAFF3C]/30 bg-[#CAFF3C]/[0.06] p-6">
        <h2 className="m-0 text-2xl leading-[1.1] tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>
          Run this check on your own brand
        </h2>
        <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#A7A7B4]">
          Real questions sent to live AI assistants. No signup required to see your verdict.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] no-underline transition hover:brightness-110"
        >
          Check my brand →
        </Link>
      </div>

      <p className="m-0 mt-10 text-xs font-bold leading-5 text-[#777787]">
        Method, dates and per-brand results available on request. If you are one of the brands in this table and want
        your full audit, ask and we will send it.
      </p>
    </main>
  );
}
