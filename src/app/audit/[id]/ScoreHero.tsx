import type { Locale } from "@/lib/i18n";
import { rankLabel, type PromptState } from "./report-insights";

type Entry = { name: string; count: number; self: boolean };

/**
 * LE CLASSEMENT QUI FRAPPE — en tête du rapport.
 * 29/09 : « c'est triste, plus visuel et percutant ». 30/09 : « mieux vaut le
 * classement par rapport aux concurrents que simplement savoir si le cabinet
 * remonte ». Donc : le RANG du cabinet parmi les cabinets que l'IA cite, le
 * podium, puis — en second — une case par question. Que des comptes réels.
 */
export default function ScoreHero({
  brandName,
  engineName,
  city,
  rank,
  tied,
  cabinets,
  podium,
  cited,
  total,
  states,
  locale,
}: {
  brandName: string;
  engineName: string;
  city: string | null;
  rank: number | null;
  tied: boolean;
  cabinets: number;
  podium: Entry[];
  cited: number;
  total: number;
  states: PromptState[];
  locale: Locale;
}) {
  const fr = locale === "fr";
  const where = city ? (fr ? `À ${city}, ` : `In ${city}, `) : "";
  const medal = rank === 1 ? "#E0B25A" : rank === 2 ? "#C9D3DE" : rank === 3 ? "#D29A6A" : rank ? "#4CC3A3" : "#FF8F6B";
  const headline = rank
    ? fr
      ? `${where}${engineName} classe ${brandName} ${rankLabel(rank, locale)}${tied ? " ex æquo" : ""} sur ${cabinets} cabinet${cabinets > 1 ? "s" : ""}.`
      : `${where}${engineName} ranks ${brandName} ${rankLabel(rank, locale)}${tied ? " (tied)" : ""} out of ${cabinets} firm${cabinets > 1 ? "s" : ""}.`
    : fr
      ? `${where}${engineName} cite ${cabinets} cabinet${cabinets > 1 ? "s" : ""} — pas ${brandName}.`
      : `${where}${engineName} names ${cabinets} firm${cabinets > 1 ? "s" : ""} — not ${brandName}.`;
  const max = Math.max(1, total);

  return (
    <div className="mt-5 grid gap-5 rounded-3xl bg-[#123E5C] p-5 text-white sm:grid-cols-[auto_1fr] sm:gap-7 sm:p-7" data-testid="score-hero">
      <div className="mx-auto grid h-36 w-36 place-items-center rounded-full border-[6px] text-center" style={{ borderColor: medal, background: "rgba(255,255,255,0.06)" }}>
        <div>
          <p className="m-0 text-[3.2rem] leading-none text-white" style={{ fontFamily: "var(--font-display)" }}>
            {rank ? rankLabel(rank, locale) : "—"}
          </p>
          <p className="m-0 mt-1 text-[0.625rem] font-black uppercase tracking-[0.14em] text-white/75">
            {rank ? (fr ? `sur ${cabinets} cabinets` : `of ${cabinets} firms`) : fr ? "hors classement" : "not ranked"}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <p className="m-0 text-[0.6875rem] font-black uppercase tracking-[0.14em] text-white/70">
          {fr ? `Le classement de ${engineName}, interrogé comme un client` : `${engineName}'s ranking, asked like a client`}
        </p>
        <p className="m-0 mt-2 text-[1.5rem] leading-[1.12] tracking-[-0.02em] text-white" style={{ fontFamily: "var(--font-display)" }}>
          {headline}
        </p>

        <ol className="m-0 mt-4 grid list-none gap-1.5 p-0" data-testid="hero-podium">
          {podium.map((entry) => (
            <li key={entry.name} className="grid grid-cols-[1.5rem_minmax(0,8.5rem)_1fr_auto] items-center gap-2 sm:grid-cols-[1.5rem_minmax(0,11rem)_1fr_auto]">
              <span className="text-xs font-black text-white/70">
                {entry.self && rank ? rank : entry.self ? "—" : 1 + podium.filter((other) => other.count > entry.count).length}
              </span>
              <span className={`truncate text-sm ${entry.self ? "font-black text-white" : "font-bold text-white/85"}`}>
                {entry.self ? (fr ? `${entry.name} (toi)` : `${entry.name} (you)`) : entry.name}
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-white/15">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (entry.count / max) * 100)}%`, background: entry.self ? "#4CC3A3" : "rgba(255,255,255,0.55)" }} />
              </span>
              <span className="text-xs font-black tabular-nums text-white">
                {entry.count}/{total}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-white/75">
            {fr ? `Cité sur ${cited} question${cited > 1 ? "s" : ""} sur ${total} :` : `Named on ${cited} of ${total} questions:`}
          </span>
          <ul className="m-0 flex list-none gap-1 p-0">
            {states.map((state, index) => (
              <li
                key={index}
                className="grid h-6 w-6 place-items-center rounded-md text-xs font-black"
                style={{ background: state === "recommended" ? "#4CC3A3" : state === "missing" ? "#FF8F6B" : "rgba(255,255,255,0.18)", color: "#0E1A27" }}
              >
                {state === "recommended" ? "✓" : state === "missing" ? "✗" : "·"}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
