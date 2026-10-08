import type { AiReadabilityItem } from "./ai-readability";
import { aiReadabilityScore } from "./ai-readability";

/** « Ton site, lisible par les IA » — état mesuré en direct + ce que GetPick pose. */
export default function AiReadabilityBlock({ items, brandName, locale, vous = false }: { items: AiReadabilityItem[]; brandName: string; locale: "fr" | "en"; vous?: boolean }) {
  const fr = locale === "fr";
  const { ok, measured } = aiReadabilityScore(items);
  if (measured === 0) return null;
  return (
    <div className="mt-4 rounded-2xl border border-[#E4E9F0] bg-white p-4" data-testid="ai-readability">
      <p className="m-0 text-xs font-black uppercase tracking-[0.1em] text-[#123E5C]">
        {fr ? (vous ? "Votre site, lisible par les IA" : "Ton site, lisible par les IA") : "Your site, readable by AI"}
      </p>
      <p className="m-0 mt-1 text-sm font-bold leading-6 text-[#5B6B82]">
        {fr
          ? `Mesuré à l'instant sur le site de ${brandName} : ${ok}/${measured} en place.`
          : `Measured just now on ${brandName}'s site: ${ok}/${measured} in place.`}
      </p>
      <ul className="m-0 mt-3 grid list-none gap-2 p-0">
        {items.map((item) => {
          const color = item.measured === true ? "#17705B" : item.measured === false ? "#B04329" : "#5E6E86";
          const mark = item.measured === true ? "✓" : item.measured === false ? "✗" : "–";
          const status =
            item.measured === true ? (fr ? "en place" : "in place") : item.measured === false ? (fr ? "absent" : "missing") : fr ? "non mesuré" : "not measured";
          return (
            <li key={item.key} className="rounded-xl bg-[#F5F7FA] p-3" data-testid={`ai-readability-${item.key}`}>
              <p className="m-0 text-sm font-black" style={{ color }}>
                {mark} {item.label} <span className="font-bold text-[#5E6E86]">· {status}</span>
              </p>
              <p className="m-0 mt-1 text-xs font-bold leading-5 text-[#5B6B82]">{item.why}</p>
              {item.measured !== true ? <p className="m-0 mt-1 text-xs font-black leading-5 text-[#123E5C]">→ {item.getpick}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
