import type { Locale } from "@/lib/i18n";
import type { BoardRow, ServiceValuePlan, SourcesSummary } from "./report-insights";
import DashboardMockup from "./DashboardMockup";

/**
 * « Ce que GetPick obtient pour toi » — le résultat avant la méthode :
 * l'objectif sur SA question, la valeur en euros (cabinets comptables,
 * sourcée), puis le calendrier de ce qui est livré. Voir `serviceValuePlan`.
 */
export default function ServiceValueBlock({
  plan,
  sources,
  engineName,
  brandName,
  locale,
  rows,
  cited,
  total,
  topRival,
}: {
  plan: ServiceValuePlan;
  sources: SourcesSummary;
  engineName: string;
  brandName: string;
  locale: Locale;
  rows: BoardRow[];
  cited: number;
  total: number;
  topRival: { name: string; count: number } | null;
}) {
  const fr = locale === "fr";
  return (
    <>
      <p className="m-0 mt-4 text-lg font-black leading-7 text-[#132A43]" data-testid="value-objective">
        {plan.objective}
      </p>
      {sources.groundedCount > 0 && sources.top.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#E4E9F0] bg-white p-4" data-testid="value-sources">
          <p className="m-0 text-xs font-black uppercase tracking-[0.1em] text-[#123E5C]">
            {fr ? `Les pages que ${engineName} a lues pour répondre` : `The pages ${engineName} read to answer`}
          </p>
          <ul className="m-0 mt-3 grid list-none gap-2 p-0">
            {sources.top.map((source) => (
              <li key={source.domain} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3">
                <span className="truncate text-xs font-black text-[#132A43]">{source.domain}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-[#E4E9F0]">
                  <span className="block h-full rounded-full bg-[#123E5C]" style={{ width: `${Math.max(6, (source.count / Math.max(1, sources.groundedCount)) * 100)}%` }} />
                </span>
                <span className="text-xs font-black tabular-nums text-[#132A43]">
                  {source.count}/{sources.groundedCount}
                </span>
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#5B6B82]">
            {fr
              ? `Le site de ${brandName} a été lu sur ${sources.ownDomainReadCount} question${sources.ownDomainReadCount > 1 ? "s" : ""} sur ${sources.groundedCount}.`
              : `${brandName}'s site was read on ${sources.ownDomainReadCount} of ${sources.groundedCount} questions.`}
          </p>
        </div>
      ) : null}
      {plan.value ? (
        <div className="mt-4 rounded-2xl border border-[#1F8A70]/30 bg-[#1F8A70]/[0.07] p-4" data-testid="value-euros">
          <p className="m-0 text-sm font-black leading-6 text-[#132A43]">{plan.value.text}</p>
          <p className="m-0 mt-2 text-xs font-bold text-[#5E6E86]">
            {fr ? "Source : " : "Source: "}
            {plan.value.source}
          </p>
        </div>
      ) : null}
      <ol className="m-0 mt-4 grid list-none gap-2 p-0" data-testid="value-steps">
        {plan.steps.map((step) => (
          <li key={step.when} className="grid gap-1 rounded-2xl border border-[#E4E9F0] bg-white p-4 sm:grid-cols-[8rem_1fr] sm:gap-4">
            <p className="m-0 text-xs font-black uppercase tracking-[0.1em] text-[#123E5C]">{step.when}</p>
            <p className="m-0 text-sm font-bold leading-6 text-[#132A43]">{step.what}</p>
          </li>
        ))}
      </ol>
      {rows.length ? (
        <DashboardMockup
          brandName={brandName}
          engineName={engineName}
          rows={rows}
          cited={cited}
          total={total}
          ownRead={sources.ownDomainReadCount}
          groundedCount={sources.groundedCount}
          topRival={topRival}
          locale={locale}
        />
      ) : null}
    </>
  );
}
