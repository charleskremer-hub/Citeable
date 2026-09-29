import type { Locale } from "@/lib/i18n";
import type { PromptState } from "./report-insights";

/**
 * LE CHIFFRE QUI FRAPPE — en tête du rapport (29/09, Charles : « c'est triste,
 * il faut que ce soit plus visuel et percutant »). Un anneau « 5/6 », une case
 * par question posée (verte = cité, rouge = pas cité), et le confrère le plus
 * cité. Rien d'estimé : que des comptes réels de l'audit.
 */
export default function ScoreHero({
  brandName,
  engineName,
  cited,
  total,
  states,
  topRival,
  locale,
}: {
  brandName: string;
  engineName: string;
  cited: number;
  total: number;
  states: PromptState[];
  topRival: { name: string; count: number } | null;
  locale: Locale;
}) {
  const fr = locale === "fr";
  const ratio = total > 0 ? cited / total : 0;
  const arc = ratio >= 0.67 ? "#4CC3A3" : ratio >= 0.34 ? "#E0B25A" : "#FF8F6B";
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const headline =
    cited === 0
      ? fr ? `${engineName} ne cite jamais ${brandName}.` : `${engineName} never names ${brandName}.`
      : cited === total
        ? fr ? `${engineName} cite ${brandName} à chaque fois.` : `${engineName} names ${brandName} every time.`
        : fr ? `${engineName} cite ${brandName} ${cited} fois sur ${total}.` : `${engineName} names ${brandName} ${cited} times out of ${total}.`;

  return (
    <div className="mt-5 grid items-center gap-5 rounded-3xl bg-[#123E5C] p-5 text-white sm:grid-cols-[auto_1fr] sm:gap-7 sm:p-7" data-testid="score-hero">
      <svg viewBox="0 0 128 128" className="mx-auto h-32 w-32 sm:h-36 sm:w-36" role="img" aria-label={`${cited}/${total}`}>
        <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="12" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={arc}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform="rotate(-90 64 64)"
        />
        <text x="64" y="66" textAnchor="middle" fill="#FFFFFF" fontSize="34" fontWeight="800" style={{ fontFamily: "var(--font-display)" }}>
          {cited}/{total}
        </text>
        <text x="64" y="86" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="10" fontWeight="700" letterSpacing="1.2">
          {fr ? "QUESTIONS" : "QUESTIONS"}
        </text>
      </svg>

      <div className="min-w-0">
        <p className="m-0 text-[0.6875rem] font-black uppercase tracking-[0.14em] text-white/70">
          {fr ? `${engineName}, interrogé comme un client, en direct` : `${engineName}, asked like a client, live`}
        </p>
        <p className="m-0 mt-2 text-[1.6rem] leading-[1.1] tracking-[-0.02em] text-white" style={{ fontFamily: "var(--font-display)" }}>
          {headline}
        </p>
        <ul className="m-0 mt-4 flex list-none flex-wrap gap-1.5 p-0" aria-label={fr ? "Une case par question" : "One square per question"}>
          {states.map((state, index) => (
            <li
              key={index}
              className="grid h-9 w-9 place-items-center rounded-lg text-base font-black"
              style={{
                background: state === "recommended" ? "#4CC3A3" : state === "missing" ? "#FF8F6B" : "rgba(255,255,255,0.18)",
                color: "#0E1A27",
              }}
              title={state === "recommended" ? (fr ? "Cité" : "Named") : state === "missing" ? (fr ? "Pas cité" : "Not named") : "—"}
            >
              {state === "recommended" ? "✓" : state === "missing" ? "✗" : "·"}
            </li>
          ))}
        </ul>
        {topRival ? (
          <p className="m-0 mt-4 text-sm font-bold leading-6 text-white/85">
            {fr ? "Le confrère que l'IA cite le plus : " : "The peer AI names most: "}
            <span className="rounded-md bg-white/15 px-2 py-0.5 font-black text-white">{topRival.name}</span>{" "}
            {fr ? `— ${topRival.count} question${topRival.count > 1 ? "s" : ""} sur ${total}` : `— ${topRival.count} of ${total} questions`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
