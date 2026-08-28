import { auditCopy, type Locale } from "@/lib/i18n";
import type { BuyerIntentPromptResult } from "@/lib/audit-engine";
import { localizedUnavailableReason, promptAnalysis, promptStatusPill } from "./report-insights";

type Row = { question: BuyerIntentPromptResult; analysis: ReturnType<typeof promptAnalysis> };

type Props = {
  locale: Locale;
  engineName: string;
  isAnswerEngineReport: boolean;
  rows: Row[];
  gapCount: number;
};

/** Le corps du bloc « LES QUESTIONS » : la preuve, jamais l'argument. */
export default function QuestionList({ locale, engineName, isAnswerEngineReport, rows, gapCount }: Props) {
  const copy = auditCopy[locale];
  const fr = locale === "fr";

  return (
    <div className="mt-4">
      {rows.length ? (
        <div className="mb-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4" data-testid="prompt-methodology">
          <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{copy.methodEyebrow}</p>
          <p className="m-0 mt-1.5 text-base font-black leading-6 text-[#F0F0EC]">{copy.methodTitle}</p>
          <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#A7A7B4]">
            {copy.methodBody(isAnswerEngineReport ? engineName : copy.nativeWebSearch)}
          </p>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
            {[copy.methodChipUnbranded, copy.methodChipIntent, copy.methodChipLive].map((chip) => (
              <li key={chip} className="rounded-full border border-white/[0.09] bg-white/[0.05] px-2.5 py-1 text-[0.6875rem] font-black uppercase tracking-[0.1em] text-[#BCBCC8]">
                {chip}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {gapCount > 0 ? (
        <p className="m-0 mb-4 rounded-xl border border-[#FF8F6B]/20 bg-[#FF8F6B]/[0.06] px-4 py-3 text-sm font-bold leading-6 text-[#F3C7B7]">
          {fr
            ? `${gapCount} question${gapCount > 1 ? "s" : ""} d'achat où l'IA cite un concurrent à ta place (en orange ci-dessous). Ce sont exactement celles que ton bloc « À publier » corrige.`
            : `${gapCount} buyer question${gapCount > 1 ? "s" : ""} where AI cites a competitor instead of you (in orange below). These are exactly what your "to publish" block fixes.`}
        </p>
      ) : null}

      {rows.length ? (
        <ol className="m-0 grid list-none gap-2 p-0">
          {rows.map(({ question, analysis }) => {
            const pill = promptStatusPill(analysis.state, locale);
            const isGap = analysis.state === "missing";
            return (
              <li key={question.prompt} className={`rounded-2xl border p-4 ${isGap ? "border-[#FF8F6B]/25 bg-[#FF8F6B]/[0.05]" : "border-white/[0.07] bg-black/20"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="m-0 max-w-[80%] text-sm font-black text-[#F0F0EC]">{question.prompt}</p>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-black" style={{ color: pill.color, background: pill.bg }}>
                    {pill.label}
                  </span>
                </div>
                {analysis.state === "unchecked" ? (
                  <p className="m-0 mt-2 text-xs font-bold text-[#8E8E9A]">{localizedUnavailableReason(analysis.reason, locale, engineName)}</p>
                ) : analysis.competitors.length ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#8E9A8F]">{fr ? "Cité à ta place :" : "Cited instead of you:"}</span>
                    {analysis.competitors.slice(0, 5).map((competitor) => (
                      <span key={competitor} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs font-black text-[#DFE7DB]">{competitor}</span>
                    ))}
                  </div>
                ) : null}
                {isGap ? (
                  <p className="m-0 mt-2.5 text-xs font-black text-[#CAFF3C]">
                    {fr ? "→ Ton bloc « À publier » répond mot pour mot à cette question." : "→ Your \"to publish\" block answers this exact question."}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="rounded-2xl border border-[#FF8A8A]/20 bg-[#FF5F5F]/10 p-4 text-sm font-bold text-[#FFB1B1]">
          {isAnswerEngineReport ? copy.engineUnavailable(engineName) : copy.webUnavailable}
        </div>
      )}
    </div>
  );
}
