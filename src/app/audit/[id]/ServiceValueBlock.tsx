import type { Locale } from "@/lib/i18n";
import type { ServiceValuePlan } from "./report-insights";

/**
 * « Ce que GetPick obtient pour toi » — le résultat avant la méthode :
 * l'objectif sur SA question, la valeur en euros (cabinets comptables,
 * sourcée), puis le calendrier de ce qui est livré. Voir `serviceValuePlan`.
 */
export default function ServiceValueBlock({ plan, locale }: { plan: ServiceValuePlan; locale: Locale }) {
  const fr = locale === "fr";
  return (
    <>
      <p className="m-0 mt-4 text-lg font-black leading-7 text-[#132A43]" data-testid="value-objective">
        {plan.objective}
      </p>
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
    </>
  );
}
