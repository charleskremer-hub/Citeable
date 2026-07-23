import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-static";

const PUBLISHED = "2026-07-19";
// Édition juillet 2026 : les 21 marques ont été re-auditées le 23/07 avec le
// moteur corrigé du 21-22/07 (garde-fous promptMentionsAuditedBrand +
// questionEchoesBrandCopy actifs, 12 questions pour toutes les marques).
// Chaque audit du re-run est en base Neon avec son promptDebug ; les données
// brutes sont versionnées dans artifacts/study-rerun-2026-07/.
const COLLECTED = "2026-07-23";
// CANONIQUE = www tant que l'apex n'est pas déclaré dans le projet Vercel
// (certificat SSL non émis pour l'apex → connexions refusées).
// Voir le commentaire détaillé dans src/app/robots.ts.
const URL = "https://www.getpick.ai/study";

export const metadata: Metadata = {
  title: "We asked AI what to buy in 21 DTC categories — GetPick study (July 2026 edition)",
  description:
    "We audited 21 direct-to-consumer brands with live AI calls — 12 unbranded buyer questions each, collected July 23, 2026. Among fully valid audits, scores ran from 19 to 100: Brooklinen scored 29 and was named twice; Ollie scored 100. In 18 of 21 audits, AI named a competitor instead. 29 answers were discarded as prompt-echo artifacts — disclosed in full.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Brand awareness barely predicts whether AI recommends you",
    description:
      "21 DTC brands, 12 unbranded buyer questions each, live AI calls collected July 23, 2026. Valid scores from 19 to 100. In 18 of 21, AI named a competitor instead.",
    url: URL,
    type: "article",
    publishedTime: PUBLISHED,
    modifiedTime: COLLECTED,
  },
};

type Row = { brand: string; score: number; cited: string; instead?: string; echo?: number; us?: boolean };

// Données du re-run du 23/07/2026 — moteur corrigé, 12 questions non brandées
// par marque, appels ChatGPT live (gpt-4o-mini). Source de vérité : la base
// Neon (audits avec promptDebug) + artifacts/study-rerun-2026-07/results.json
// (criblé anti-écho : voir le bloc echoScreening du fichier).
// `cited` est compté sur les réponses VALIDES (x/valides) : `echo` réponses
// par marque recopiaient l'exemple de format du prompt moteur et ont été
// écartées — divulgué dans « How we ran this ». Les scores des lignes † ont
// compté ces échos « non cité » : ce sont des planchers, pas des chiffres
// définitifs. Allbirds : 12 échos sur 12 → aucune donnée IA exploitable.
const ROWS: Row[] = [
  { brand: "GetPick (us)", score: 13, cited: "0/5", instead: "SEMrush", echo: 7, us: true },
  { brand: "Baboon to the Moon", score: 19, cited: "0/12", instead: "Patagonia" },
  { brand: "Cuts", score: 19, cited: "0/8", instead: "Everlane", echo: 4 },
  { brand: "Dagne Dover", score: 19, cited: "0/11", instead: "Patagonia", echo: 1 },
  { brand: "Bubble", score: 21, cited: "2/12", instead: "CeraVe" },
  { brand: "Allbirds", score: 25, cited: "no valid data", echo: 12 },
  { brand: "Topicals", score: 25, cited: "1/12", instead: "CeraVe" },
  { brand: "Versed", score: 25, cited: "1/12", instead: "CeraVe" },
  { brand: "Brooklinen", score: 29, cited: "2/12", instead: "Parachute" },
  { brand: "Necessaire", score: 32, cited: "2/12", instead: "CeraVe" },
  { brand: "De Soi", score: 38, cited: "3/11", instead: "Seedlip", echo: 1 },
  { brand: "Our Place", score: 38, cited: "3/12", instead: "GreenPan" },
  { brand: "Tower 28", score: 38, cited: "2/12", instead: "Ilia" },
  { brand: "Spot & Tango", score: 40, cited: "4/12", instead: "PetPlate" },
  { brand: "Arrae", score: 43, cited: "5/10", instead: "Gaia Herbs", echo: 2 },
  { brand: "Cometeer", score: 47, cited: "5/10", instead: "Aeropress", echo: 2 },
  { brand: "Ridge Wallet", score: 50, cited: "7/12", instead: "Bellroy" },
  { brand: "Moon Juice", score: 63, cited: "7/12", instead: "Ritual" },
  { brand: "Hedley & Bennett", score: 77, cited: "10/12", instead: "Chef Works" },
  { brand: "Recess", score: 87, cited: "12/12" },
  { brand: "Ollie", score: 100, cited: "12/12" },
];

function scoreColor(score: number) {
  if (score < 50) return "#FF5F5F";
  if (score < 70) return "#FFB84D";
  return "#CAFF3C";
}

// Schéma Article : c'est ce qui permet aux moteurs IA d'attribuer l'étude à
// GetPick quand ils reprennent ses chiffres. Sans lui, on produit de la donnée
// citée sans être cité — l'erreur exacte que l'étude décrit.
const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "We asked AI what to buy in 21 DTC categories. Brand awareness had almost nothing to do with the answer.",
  datePublished: PUBLISHED,
  dateModified: COLLECTED,
  url: URL,
  author: { "@type": "Organization", name: "GetPick", url: "https://www.getpick.ai" },
  publisher: { "@type": "Organization", name: "GetPick" },
  // Moteur de CETTE édition uniquement — ChatGPT (gpt-4o-mini). Ne pas citer
  // d'autres moteurs ici : le schéma est consommé tel quel par les crawlers.
  about: "AI visibility of direct-to-consumer brands in ChatGPT (gpt-4o-mini) answers",
  description:
    "July 2026 edition. A study of 21 direct-to-consumer brands audited with 12 unbranded buyer questions each, sent to live AI assistants on July 23, 2026. Among the 14 audits with fully valid answers, scores ranged from 19 to 100 out of 100 (median 38). In 18 of 21 audits, the assistant named a specific competitor instead of the brand. 29 of the 252 collected answers were discarded as echoes of the audit prompt's format example; every affected brand is flagged in the published table.",
};

const H2 = "m-0 mt-12 text-[1.75rem] leading-[1.15] tracking-[-0.03em] sm:text-[2rem]";
const P = "m-0 mt-4 text-[1.02rem] font-medium leading-[1.75] text-[#C7C7D1]";

export default function StudyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20" style={{ fontFamily: "var(--font-sans)" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_SCHEMA) }} />

      <Link href="/" className="text-sm font-black text-[#CAFF3C] no-underline">
        ← GetPick
      </Link>

      <p className="m-0 mt-8 text-xs font-black uppercase tracking-[0.14em] text-[#CAFF3C]">
        Study · July 2026 edition — data collected July 23, 2026
      </p>
      <h1
        className="m-0 mt-3 text-[clamp(2rem,7vw,3.4rem)] leading-[1.03] tracking-[-0.045em]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        We asked AI what to buy in 21 DTC categories. Brand awareness had almost nothing to do with the answer.
      </h1>

      <p className={P}>
        Brooklinen has spent a decade becoming one of the most written-about direct-to-consumer brands there is. It has
        raised serious money, papered city subways with ads, and made sure an entire generation of shoppers knows its
        name.
      </p>
      <p className={P}>
        We asked a live AI assistant twelve questions a real buyer would type in its category. Brooklinen was named{" "}
        <strong className="text-[#F0F0EC]">twice out of twelve</strong> and scored{" "}
        <strong className="text-[#F0F0EC]">29 out of 100</strong>. On the questions where it went unnamed, the name the
        assistant reached for most often was Parachute.
      </p>
      <p className={P}>
        Ollie — a dog-food subscription most people could not pick out of a lineup — was named on all twelve questions
        and scored <strong className="text-[#F0F0EC]">100</strong>.
      </p>
      <p className={P}>
        That gap is the finding. Across 21 direct-to-consumer brands we audited, how famous a brand is turned out to be a
        poor predictor of whether AI recommends it. And since a growing share of shoppers now ask an assistant before
        they buy, that gap is a revenue problem hiding inside a marketing win.
      </p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>How we ran this</h2>
      <p className={P}>
        We make GetPick, a GEO agent for DTC brands. This study uses our own engine, and you should know exactly what it does
        before you trust the numbers.
      </p>
      <p className={P}>
        For each brand we generated the questions a real buyer would type before purchasing in that category — not
        brand-name searches, but demand-side questions like <em>&ldquo;best machine washable sneakers for everyday
        wear&rdquo;</em>. Twelve questions per brand, for all 21 brands. We sent those questions to a live AI assistant
        at audit time — no simulated prompts, no cached guesses, no modelled estimates — and recorded whether the
        assistant named the brand, or named someone else. Two guardrails are enforced in code on every question: it must
        not contain the audited brand&apos;s name or domain, and it must not echo the brand&apos;s own homepage copy.
        Every audit in this edition is stored with a debug trace proving where its questions came from.
      </p>
      <p className={P}>
        <strong className="text-[#F0F0EC]">This edition corrects our own methodology — openly.</strong> The study was
        first published on July 19, 2026. On July 21–22 we found and fixed a flaw in our engine: a share of the
        AI-generated buyer questions could mention the audited brand or paraphrase its homepage copy, which inflates
        mention rates — and four brands had been audited on only 3 questions instead of 12. So on July 23 we re-ran all
        21 audits from scratch with the corrected engine. Every score on this page comes from that re-run; no pre-fix
        score remains anywhere on this page. The correction was not cosmetic: the median score fell from 65 to 38 once
        the questions were guaranteed unbranded — 38 whether you compute it over all 21 audits or only the fully valid
        ones. We are publishing the corrected numbers instead of quietly editing the old ones, because a study about
        trust in AI answers should not need a footnote about trust in its author.
      </p>
      <p className={P}>
        <strong className="text-[#F0F0EC]">And this edition caught its own engine echoing itself.</strong> When we
        reviewed the raw answers before publishing, 29 of the 252 collected answers were verbatim copies of the JSON
        format example embedded in our own audit prompt: the assistant returned the example&apos;s three sneaker brands,
        with the example&apos;s wording, even for software, coffee and supplement questions — which no model would
        genuinely recommend. Those answers are artifacts of our prompt, not recommendations, so we discarded all 29 and
        we count them per brand in the table below. Seven brands are affected; their cited counts are computed over the
        remaining valid answers, and their scores — which had counted each echo as &ldquo;not named&rdquo; — are floors,
        not final numbers. For one brand, Allbirds, all twelve answers were echoes, which leaves no valid AI data at
        all: we make no claim about Allbirds&apos; AI visibility in this edition. We fixed the engine (the format
        example now uses unmistakable placeholder names and a guard rejects any answer that copies it), and the seven
        affected brands are queued for re-collection with the fixed prompt. Every headline number on this page is
        computed from the valid answers only.
      </p>
      <p className={P}>
        <strong className="text-[#F0F0EC]">Limitations, stated plainly.</strong> The sample is 21 brands — enough to show
        a pattern, not enough to publish a law. This edition&apos;s answer engine is ChatGPT (gpt-4o-mini), asked live on
        July 23, 2026; answers from AI assistants vary between runs and change over time, so this is a snapshot, not a
        permanent ranking. And we are not a neutral party: we sell a product that fixes exactly the problem this study
        describes. Read accordingly — and note that we published our own score too, which is now the worst score in the
        table.
      </p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
        Finding 1: awareness and AI visibility are close to unrelated
      </h2>
      <p className={P}>
        Every number in this section is computed over the <strong className="text-[#F0F0EC]">14 brands whose twelve
        answers all survived the echo screening</strong> described above. The spread was wide:{" "}
        <strong className="text-[#F0F0EC]">19 to 100 out of 100</strong>, with a median of 38.
      </p>
      <p className={P}>
        What it did not track was brand size. Brooklinen — one of the most written-about DTC brands of the last decade —
        scored 29 and was named on 2 of 12 buyer questions. Baboon to the Moon, a bag brand with a genuine cult
        following, scored 19 and was never named at all. Meanwhile Hedley &amp; Bennett, an apron maker, scored 77 and
        was named on 10 of 12 questions, and Ollie was named on all twelve.
      </p>
      <p className={P}>
        Nine of the 14 brands scored below 50. Five scored below 30 — effectively invisible in their own category. Once
        every question is guaranteed not to contain your brand name, most brands discover that the assistant simply
        answers with someone else.
      </p>
      <p className={P}>
        The reason is mechanical rather than mysterious. Traditional brand building buys recall in a human&apos;s memory.
        An AI assistant does not have your memory. It assembles an answer from what it can read. If your category
        expertise lives in a beautifully art-directed campaign and a paid-media budget, there may be very little for the
        model to work with.
      </p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
        Finding 2: someone else is being named — and the winner is often a category default
      </h2>
      <p className={P}>
        In <strong className="text-[#F0F0EC]">18 of the 21 audits, the assistant named a specific competitor</strong> on
        valid questions where the audited brand was absent. (The three exceptions: Ollie and Recess, which were named on
        every question, and Allbirds, for which no valid AI data survived the echo screening.) This is the part founders
        tend to find genuinely unpleasant, and it is the most useful signal in the data.
      </p>
      <p className={P}>
        The same names keep winning. CeraVe was named in place of four different indie skincare brands — Bubble,
        Topicals, Versed and Necessaire. Patagonia took the answers from two bag brands, Baboon to the Moon and Dagne
        Dover. Brooklinen lost to Parachute, Ridge Wallet to Bellroy, Our Place to GreenPan, Moon Juice to Ritual.
      </p>
      <p className={P}>
        When a model is not sure, it reaches for the brand with the deepest written footprint in the category — reviews,
        comparisons, ingredient pages, buying guides. That is why a drugstore staple beats venture-backed challengers,
        and why a B2B kitchenware supplier (Chef Works) is what the assistant offers instead of Hedley &amp; Bennett.
      </p>
      <p className={P}>
        That is bad news and good news in the same sentence. Bad, because ad spend does not defend this position. Good,
        because the thing that does win here — plain, crawlable category content — is cheap to produce.
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
      <p className={P}>
        All 21 brands, 12 unbranded buyer questions each, live ChatGPT calls collected on July 23, 2026. Cited counts
        are over valid answers; rows marked † had prompt-echo answers discarded (see &ldquo;How we ran this&rdquo;).
      </p>
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
                  {row.echo ? <span className="text-[#777787]"> †</span> : null}
                </td>
                <td className="px-4 py-3 text-right font-black" style={{ color: scoreColor(row.score) }}>
                  {row.score}
                </td>
                <td className="px-4 py-3 font-medium text-[#A7A7B4]">{row.cited}</td>
                <td className="px-4 py-3 font-medium text-[#A7A7B4]">{row.instead ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-3 text-xs font-bold leading-5 text-[#777787]">
        † some of this brand&apos;s twelve answers (GetPick 7, Cuts 4, Arrae 2, Cometeer 2, Dagne Dover 1, De Soi 1,
        Allbirds 12) were verbatim echoes of our audit prompt&apos;s format example and were discarded — see &ldquo;How
        we ran this&rdquo;. Cited counts are over the remaining valid answers. Scores of these rows counted each echo as
        &ldquo;not named&rdquo;, so they are floors pending re-collection. Allbirds has no valid AI answers left; we
        make no visibility claim for it in this edition. Where several rivals tied for most mentions, we show one
        representative name (SEMrush/Ahrefs/Moz tied at three for GetPick; Gaia Herbs and others at one each for Arrae;
        Patagonia/Osprey for the two bag brands; Bellroy/Secrid for Ridge Wallet; Aeropress/Nespresso/Trade Coffee for
        Cometeer; CeraVe/Neutrogena for Bubble and Versed; Ilia/RMS Beauty for Tower 28; Chef Works and others at one
        each for Hedley &amp; Bennett). The full raw answers are preserved in the audit records.
      </p>

      <h2 className={H2} style={{ fontFamily: "var(--font-display)" }}>
        We audited ourselves, and we now hold the worst score in the table
      </h2>
      <p className={P}>
        In the July 19 edition we scored 61, and we reported that the assistant had us filed in the wrong category —
        <em>&ldquo;an intuitive no-code solution for local businesses&rdquo;</em> — even though our visibility number
        looked respectable. We said we would fix our machine-readable signals, re-audit, and report whether it moved.
      </p>
      <p className={P}>
        Here is the report. The category fix worked: the assistant now files GetPick under{" "}
        <em>generative engine optimization software</em>, which is what we are. The visibility did not survive the
        methodology correction: we scored <strong className="text-[#F0F0EC]">13 out of 100</strong> and were named zero
        times on the five of our twelve questions that produced valid answers. The tools named instead were SEMrush,
        Ahrefs and Moz.
      </p>
      <p className={P}>
        Our own raw answers are also where this edition&apos;s echo problem surfaced. On seven of our twelve software
        questions, the assistant returned the same three sneaker brands — On, Hoka, Veja — with identical wording. That
        was not a model hallucinating about a young category, which is what we almost published. It was our own audit
        prompt&apos;s format example, copied back at us verbatim. We found the same artifact in 22 more answers across
        six other brands, discarded all 29, flagged every affected row in the table above, and fixed the engine so its
        format example can no longer be mistaken for an answer. An audit tool that publishes its own prompt echo as a
        market insight would deserve zero trust. Catching it before you did is the job.
      </p>
      <p className={P}>
        This confirms the more important lesson in the whole study.{" "}
        <strong className="text-[#F0F0EC]">Being cited is not the goal. Being cited in the category where your buyers
        are asking is the goal.</strong> We fixed the category label; now we have to earn the citations, with exactly
        the plain, question-answering content this study keeps pointing at. We will re-audit and report whether it
        moved. If it does not, we will say so — again.
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
        First published July 19, 2026. Current edition: scores recalculated with the corrected methodology, all data
        collected July 23, 2026. Method, per-brand results and raw answers — including the 29 discarded prompt-echo
        answers — available on request. If you are one of the brands in this table and want your full audit, ask and we
        will send it.
      </p>
    </main>
  );
}
