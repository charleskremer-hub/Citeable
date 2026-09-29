import type { Locale } from "@/lib/i18n";
import type { BoardRow } from "./report-insights";

/**
 * APERÇU DU TABLEAU DE BORD — ce que le cabinet verra chaque mois (29/09,
 * Charles : « ajoute un mock-up de l'écran tableau de bord pour illustrer »).
 * Honnête par construction : la colonne « Aujourd'hui » est la mesure réelle de
 * cet audit ; les mois suivants sont VIDES (« à venir »), jamais simulés.
 */
export default function DashboardMockup({
  brandName,
  engineName,
  rows,
  cited,
  total,
  ownRead,
  groundedCount,
  topRival,
  locale,
}: {
  brandName: string;
  engineName: string;
  rows: BoardRow[];
  cited: number;
  total: number;
  ownRead: number;
  groundedCount: number;
  topRival: { name: string; count: number } | null;
  locale: Locale;
}) {
  const fr = locale === "fr";
  const months = fr ? ["Aujourd'hui", "Mois 1", "Mois 2", "Mois 3"] : ["Today", "Month 1", "Month 2", "Month 3"];
  const shorten = (text: string) => (text.length > 58 ? `${text.slice(0, 56).trimEnd()}…` : text);
  // Courbe : un seul point réel (aujourd'hui), puis la ligne d'objectif en pointillés.
  const width = 640;
  const height = 150;
  const x = (i: number) => 70 + (i * (width - 110)) / 3;
  const y = (value: number) => height - 26 - (value / Math.max(1, total)) * (height - 46);
  const tiles = [
    { label: fr ? `Cité par ${engineName}` : `Named by ${engineName}`, value: `${cited}/${total}`, tone: "#17705B" },
    { label: fr ? "Ton site lu par l'IA" : "Your site read by AI", value: `${ownRead}/${groundedCount || total}`, tone: "#123E5C" },
    { label: fr ? "Confrère n°1" : "Top peer", value: topRival ? `${topRival.name} · ${topRival.count}/${total}` : "—", tone: "#B04329" },
  ];

  return (
    <figure className="m-0 mt-5" data-testid="dashboard-mockup">
      <div className="overflow-hidden rounded-2xl border border-[#D5DEE8] bg-white shadow-2xl shadow-[#123E5C]/15">
        <div className="flex items-center gap-2 border-b border-[#E4E9F0] bg-[#EEF2F7] px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF8F6B]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#E0B25A]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#4CC3A3]" />
          <span className="ml-2 truncate rounded-md bg-white px-3 py-0.5 text-[0.6875rem] font-bold text-[#5E6E86]">getpick.ai/tableau-de-bord</span>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-base font-black text-[#132A43]">
              {fr ? `Tableau de bord · ${brandName}` : `Dashboard · ${brandName}`}
            </p>
            <span className="rounded-full bg-[#8A6420]/10 px-2.5 py-0.5 text-[0.6875rem] font-black uppercase tracking-[0.1em] text-[#8A6420]">
              {fr ? "Aperçu" : "Preview"}
            </span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-xl border border-[#E4E9F0] bg-[#FBFCFD] px-3 py-2.5">
                <p className="m-0 text-[0.6875rem] font-black uppercase tracking-[0.08em] text-[#5E6E86]">{tile.label}</p>
                <p className="m-0 mt-1 truncate text-lg font-black tabular-nums" style={{ color: tile.tone }}>
                  {tile.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-[#E4E9F0] bg-[#FBFCFD] p-3">
            <p className="m-0 text-[0.6875rem] font-black uppercase tracking-[0.08em] text-[#5E6E86]">
              {fr ? "Questions où tu es cité, mois après mois" : "Questions where you're named, month after month"}
            </p>
            <svg viewBox={`0 0 ${width} ${height}`} className="mt-1 w-full" role="img" aria-label={fr ? "Évolution mensuelle" : "Monthly trend"}>
              {[0, Math.round(total / 2), total].map((tick) => (
                <g key={tick}>
                  <line x1="40" x2={width - 20} y1={y(tick)} y2={y(tick)} stroke="#E4E9F0" strokeWidth="1" />
                  <text x="30" y={y(tick) + 4} textAnchor="end" fontSize="12" fontWeight="700" fill="#5E6E86">
                    {tick}
                  </text>
                </g>
              ))}
              <line x1="40" x2={width - 20} y1={y(total)} y2={y(total)} stroke="#1F8A70" strokeDasharray="4 5" strokeWidth="1.5" />
              <text x={width - 20} y={y(total) - 7} textAnchor="end" fontSize="12" fontWeight="800" fill="#17705B">
                {fr ? `objectif ${total}/${total}` : `goal ${total}/${total}`}
              </text>
              <line x1={x(0)} x2={x(3)} y1={y(cited)} y2={y(total)} stroke="#123E5C" strokeDasharray="6 6" strokeWidth="2.5" opacity="0.35" />
              {[1, 2, 3].map((i) => (
                <circle key={i} cx={x(i)} cy={y(cited + ((total - cited) * i) / 3)} r="5" fill="#FFFFFF" stroke="#C5D0DC" strokeWidth="2" strokeDasharray="2 2" />
              ))}
              <circle cx={x(0)} cy={y(cited)} r="8" fill="#123E5C" />
              <text x={x(0)} y={y(cited) - 14} textAnchor="middle" fontSize="14" fontWeight="800" fill="#132A43">
                {cited}/{total}
              </text>
              {months.map((label, i) => (
                <text key={label} x={x(i)} y={height - 6} textAnchor="middle" fontSize="12" fontWeight="700" fill={i === 0 ? "#132A43" : "#5E6E86"}>
                  {label}
                </text>
              ))}
            </svg>
          </div>

          <div className="mt-3 overflow-x-auto rounded-xl border border-[#E4E9F0]">
            <table className="w-full min-w-[30rem] border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[#F5F7FA]">
                  <th className="px-3 py-2 font-black text-[#5E6E86]">{fr ? "Question" : "Question"}</th>
                  {months.map((label) => (
                    <th key={label} className="px-2 py-2 text-center font-black text-[#5E6E86]">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.prompt} className="border-t border-[#E4E9F0]">
                    <td className="px-3 py-2 font-bold text-[#132A43]">{shorten(row.prompt)}</td>
                    <td className="px-2 py-2 text-center">
                      <span
                        className="inline-grid h-6 w-6 place-items-center rounded-md text-xs font-black"
                        style={{
                          background: row.state === "recommended" ? "#4CC3A3" : row.state === "missing" ? "#FF8F6B" : "#E4E9F0",
                          color: "#0E1A27",
                        }}
                      >
                        {row.state === "recommended" ? "✓" : row.state === "missing" ? "✗" : "·"}
                      </span>
                    </td>
                    {[1, 2, 3].map((month) => (
                      <td key={month} className="px-2 py-2 text-center">
                        <span className="inline-block h-6 w-6 rounded-md border border-dashed border-[#C5D0DC]" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-xs font-bold leading-5 text-[#5E6E86]">
        {fr
          ? "Aperçu de ton tableau de bord, rempli avec la mesure d'aujourd'hui. Chaque mois ajoute une colonne : tu vois, question par question, qui l'IA cite — toi ou ton confrère."
          : "Preview of your dashboard, filled with today's measurement. Each month adds a column: you see, question by question, who AI names — you or your peer."}
      </figcaption>
    </figure>
  );
}
