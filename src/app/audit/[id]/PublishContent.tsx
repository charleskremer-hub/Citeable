import { auditCopy, type Locale } from "@/lib/i18n";
import CopyBlock from "./CopyBlock";
import { extractPasteable, type ActionImpact, type RankedAction } from "./report-insights";

type ContentBlock = { gap: string; title: string; draft: string; google: string };

type Props = {
  locale: Locale;
  actions: RankedAction[];
  contentBlocks: ContentBlock[];
  proof: ContentBlock | null;
  youtubeTipRelevant: boolean;
  jsonLdSnippet: string;
  llmsTxt: string | null;
  robotsFix: string | null;
  blockedBots: string[];
};

/**
 * L'intérieur DÉVERROUILLÉ du bloc « À publier » (tiers payants uniquement).
 *
 * Ce composant ne décide RIEN : la page ne lui passe du contenu (contenus à
 * coller, fichiers machine) que si le tier y donne droit — le tier gratuit ne
 * le rend jamais (voir page.tsx, bloc `data-testid="publish-block"`).
 */
export default function PublishContent({ locale, actions, contentBlocks, proof, youtubeTipRelevant, jsonLdSnippet, llmsTxt, robotsFix, blockedBots }: Props) {
  const copy = auditCopy[locale];
  const fr = locale === "fr";
  const copyLabel = fr ? "Copier" : "Copy";
  const copiedLabel = fr ? "Copié ✓" : "Copied ✓";
  const actionImpactLabel = (impact: ActionImpact) =>
    impact.measured ? copy.actionImpactMeasured(impact.addressedLostCount, impact.lostCount) : copy.actionImpactUnmeasured;
  const hasFiles = Boolean(llmsTxt);

  return (
    <>
      <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.publishEyebrow}</p>
      <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
        {copy.publishTitle}
      </h2>
      <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">{copy.publishBody}</p>

      {actions.length ? (
        <ol className="m-0 mt-4 grid list-none gap-2 p-0">
          {actions.map(({ action, phase, impact }, index) => (
            <li key={`${action.title}-${index}`} className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black text-[#CAFF3C]">{index + 1}.</span>
                <span className="rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.08em] text-[#BCBCC8]">
                  {copy.actionPhase[phase]}
                </span>
                <span className="rounded-full border border-[#CAFF3C]/25 bg-[#CAFF3C]/10 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.08em] text-[#CAFF3C]">
                  {actionImpactLabel(impact)}
                </span>
              </div>
              <p className="m-0 mt-1.5 text-sm font-black text-[#F0F0EC]">{action.title}</p>
              {action.basedOn?.length ? (
                <p className="m-0 mt-1.5 text-xs font-bold leading-5 text-[#8E8E9A]">
                  <span className="text-[#CAFF3C]">{copy.actionWhyFirst} · </span>
                  {copy.actionWhyBecause(action.basedOn)}
                </p>
              ) : null}
              <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#F0F0EC]">{action.doThis}</p>
              <p className="m-0 mt-2 text-xs font-bold uppercase tracking-[0.08em] text-[#8E8E9A]">{copy.where} {action.where}</p>
            </li>
          ))}
        </ol>
      ) : null}

      {contentBlocks.length ? (
        <div className="mt-4 grid gap-4">
          {contentBlocks.map((block, index) => (
            <div key={`${block.title}-${index}`} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <p className="m-0 text-sm font-black text-[#CAFF3C]">{index + 1}. {block.title}</p>
              <p className="m-0 mt-1 text-xs font-bold leading-5 text-[#8E8E9A]">{block.gap}</p>
              <div className="mt-3 grid gap-2.5">
                <CopyBlock
                  label={fr ? "Réponse FAQ / section de page" : "FAQ answer / page section"}
                  text={extractPasteable(block.draft)}
                  copyLabel={copyLabel}
                  copiedLabel={copiedLabel}
                />
                <CopyBlock
                  label={fr ? "Phrase fiche Google Business" : "Google Business sentence"}
                  text={extractPasteable(block.google)}
                  copyLabel={copyLabel}
                  copiedLabel={copiedLabel}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {proof ? (
        <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
          <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.proofTitle}</p>
          <div className="mt-3 grid gap-3">
            <p className="m-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm font-black leading-6 text-[#F0F0EC]">{proof.gap}</p>
            <p className="m-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm font-black leading-6 text-[#CAFF3C]">{proof.title}</p>
            <p className="m-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm font-bold leading-6 text-[#D6D6DF]">{proof.draft}</p>
            <p className="m-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm font-bold leading-6 text-[#D6D6DF]">{proof.google}</p>
          </div>
        </div>
      ) : null}

      {youtubeTipRelevant ? (
        <div className="mt-3 rounded-2xl border border-[#FF8F6B]/25 bg-[#FF8F6B]/[0.06] p-4" data-testid="youtube-content-tip">
          <span className="rounded-full border border-[#FF8F6B]/30 bg-[#FF8F6B]/10 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.08em] text-[#FF8F6B]">
            {copy.youtubeTipBadge}
          </span>
          <p className="m-0 mt-1.5 text-sm font-black text-[#F0F0EC]">{copy.youtubeTipTitle}</p>
          <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#D6D6DF]">{copy.youtubeTipBody}</p>
        </div>
      ) : null}

      {hasFiles ? (
        <div className="mt-4" data-testid="technical-files-content">
          <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.techEyebrow}</p>
          <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#D6D6DF]">{copy.techBody}</p>

          {robotsFix && blockedBots.length ? (
            <div className="mt-4 rounded-2xl border border-[#FF8F6B]/25 bg-[#FF8F6B]/[0.06] p-4">
              <p className="m-0 mb-3 text-sm font-bold leading-6 text-[#F3C7B7]">{copy.techRobotsIntro(blockedBots.join(", "))}</p>
              <CopyBlock label={copy.techRobotsLabel} text={robotsFix} copyLabel={copyLabel} copiedLabel={copiedLabel} />
            </div>
          ) : null}

          <div className="mt-4 grid gap-4">
            <div>
              <CopyBlock label={copy.techJsonLdLabel} text={jsonLdSnippet} copyLabel={copyLabel} copiedLabel={copiedLabel} />
              <p className="m-0 mt-1.5 text-xs font-bold leading-5 text-[#8E8E9A]">{copy.techJsonLdHint}</p>
            </div>
            <div>
              <CopyBlock label={copy.techLlmsLabel} text={llmsTxt ?? ""} copyLabel={copyLabel} copiedLabel={copiedLabel} />
              <p className="m-0 mt-1.5 text-xs font-bold leading-5 text-[#8E8E9A]">{copy.techLlmsHint}</p>
            </div>
          </div>

          <p className="m-0 mt-4 text-xs font-black uppercase tracking-[0.08em] text-[#8E8E9A]">{copy.techRegenNote}</p>
        </div>
      ) : null}

      {!actions.length && !contentBlocks.length && !proof && !hasFiles ? (
        <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">{copy.monitorEmpty}</p>
      ) : null}
    </>
  );
}
