import type { Locale } from "@/lib/i18n";
import { needsSummary, platformCoverage, type BoardRow } from "./report-insights";

/**
 * LES QUESTIONS POSÉES — ouvertes, pour tous les rapports (29/09, Charles :
 * « pas clair, on ne voit pas les questions qui sont posées »). Avant : repliées,
 * et masquées au rapport gratuit. C'est pourtant LA preuve : la question exacte,
 * le verdict, qui l'IA a donné à la place, et les pages qu'elle a lues.
 */
export default function QuestionBoard({
  rows,
  engineName,
  locale,
}: {
  rows: BoardRow[];
  engineName: string;
  locale: Locale;
}) {
  const fr = locale === "fr";
  const needs = needsSummary(rows);
  const platforms = platformCoverage(rows, engineName);
  const multi = platforms.length > 1;
  const askedTo = multi ? platforms.map((item) => item.engine).join(fr ? " et " : " and ") : engineName;

  return (
    <section className="rounded-[1.5rem] border border-[#E4E9F0] bg-white p-5 shadow-xl shadow-black/5 sm:p-7" data-testid="buyer-intent-prompts">
      <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-[#123E5C]">
        {fr ? `Les ${rows.length} questions posées à ${askedTo}` : `The ${rows.length} questions asked to ${askedTo}`}
      </p>
      <h2 className="m-0 mt-2 text-[1.6rem] leading-[1.1] tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>
        {fr ? "Ce que tes futurs clients demandent — et qui l'IA leur donne" : "What your future clients ask — and who AI gives them"}
      </h2>
      <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#5B6B82]">
        {fr
          ? multi
            ? "Posées telles quelles, comme un client, recherche web activée. Ton nom n'est jamais dans la question."
            : "Posées telles quelles, comme un client, avec recherche Google. Ton nom n'est jamais dans la question."
          : multi
            ? "Asked as-is, like a client, with web search on. Your name is never in the question."
            : "Asked as-is, like a client, with Google search. Your name is never in the question."}
      </p>

      {multi ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2" data-testid="platform-coverage">
          {platforms.map((item) => {
            const none = item.cited === 0;
            return (
              <div key={item.engine} className="rounded-2xl border bg-[#F5F7FA] p-4" style={{ borderColor: none ? "#C0492E40" : "#1F8A7040" }}>
                <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#5E6E86]">{item.engine}</p>
                <p className="m-0 mt-1 text-2xl font-black" style={{ color: none ? "#B04329" : "#17705B", fontFamily: "var(--font-display)" }}>
                  {item.cited}/{item.checked}
                </p>
                <p className="m-0 text-sm font-bold text-[#5B6B82]">
                  {none
                    ? fr ? `${item.engine} ne te nomme sur aucune question` : `${item.engine} names you on no question`
                    : fr ? `questions où ${item.engine} te nomme` : `questions where ${item.engine} names you`}
                </p>
                {item.asked > item.checked ? (
                  <p className="m-0 mt-1 text-xs font-bold text-[#5E6E86]" data-testid="platform-unchecked-note">
                    {fr
                      ? `${item.asked - item.checked} question${item.asked - item.checked > 1 ? "s" : ""} non vérifiée${item.asked - item.checked > 1 ? "s" : ""} : ${item.engine} n'a pas répondu à temps.`
                      : `${item.asked - item.checked} question${item.asked - item.checked > 1 ? "s" : ""} not checked: ${item.engine} did not answer in time.`}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {needs.length > 1 ? (
        <div className="mt-5 rounded-2xl bg-[#F5F7FA] p-4" data-testid="needs-summary">
          <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#5E6E86]">
            {fr ? "Par besoin client : tes angles morts d'abord" : "By client need: your blind spots first"}
          </p>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
            {needs.map((item) => {
              const full = item.cited === item.total;
              const none = item.cited === 0;
              return (
                <li
                  key={item.need}
                  className="rounded-xl border px-3 py-2 text-sm font-black"
                  style={
                    none
                      ? { color: "#B04329", background: "#C0492E12", borderColor: "#C0492E40" }
                      : full
                        ? { color: "#17705B", background: "#1F8A7012", borderColor: "#1F8A7040" }
                        : { color: "#8A6420", background: "#B8862F12", borderColor: "#B8862F40" }
                  }
                >
                  {none ? "✗ " : full ? "✓ " : "½ "}
                  {item.need}
                  <span className="ml-1.5 font-bold opacity-80">
                    {item.cited}/{item.total}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <ol className="m-0 mt-5 grid list-none gap-3 p-0">
        {rows.map((row, index) => {
          const cited = row.state === "recommended";
          const missing = row.state === "missing";
          const accent = cited ? "#1F8A70" : missing ? "#C0492E" : "#8FA0B4";
          return (
            <li
              key={row.prompt}
              className="rounded-2xl border bg-[#FBFCFD] p-4 sm:p-5"
              style={{ borderColor: `${accent}40`, borderLeftWidth: 6, borderLeftColor: accent }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-[0.12em] text-[#5E6E86]">
                  {fr ? `Question ${index + 1}` : `Question ${index + 1}`} · <span className="text-[#123E5C]">{row.need}</span>
                </span>
                <span
                  className="rounded-full px-3 py-1 text-xs font-black"
                  style={{ color: cited ? "#17705B" : missing ? "#B04329" : "#5B6B82", background: `${accent}1A` }}
                >
                  {multi ? `${engineName} · ` : ""}
                  {cited
                    ? row.position
                      ? row.position.rank === 1
                        ? fr ? "✓ Cité en 1er" : "✓ Named first"
                        : fr ? `✓ Cité ${row.position.rank}e sur ${row.position.of}` : `✓ Named ${row.position.rank} of ${row.position.of}`
                      : fr ? "✓ Tu es cité" : "✓ You're named"
                    : missing ? (fr ? "✗ Pas cité" : "✗ Not named") : fr ? "— Non vérifié" : "— Not checked"}
                </span>
              </div>
              <p className="m-0 mt-2 text-lg leading-snug text-[#132A43]" style={{ fontFamily: "var(--font-display)" }}>
                « {row.prompt} »
              </p>
              {row.rivals.length ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-[#5B6B82]">
                    {missing ? (fr ? `${engineName} a répondu :` : `${engineName} answered:`) : fr ? "Cité aussi :" : "Also named:"}
                  </span>
                  {row.rivals.map((name) => (
                    <span
                      key={name}
                      className="rounded-full px-2.5 py-0.5 text-xs font-black"
                      style={missing ? { color: "#B04329", background: "#C0492E14", border: "1px solid #C0492E33" } : { color: "#132A43", background: "#EEF2F7", border: "1px solid #E4E9F0" }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              ) : null}
              {row.crossCheck && row.crossCheck.state !== "unchecked" ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="cross-check">
                  <span className="text-xs font-black" style={{ color: row.crossCheck.state === "recommended" ? "#17705B" : "#B04329" }}>
                    {row.crossCheck.state === "recommended"
                      ? row.crossCheck.position?.rank === 1
                        ? fr ? `✓ ${row.crossCheck.engine} te cite en 1er` : `✓ ${row.crossCheck.engine} names you first`
                        : fr ? `✓ ${row.crossCheck.engine} te cite aussi` : `✓ ${row.crossCheck.engine} names you too`
                      : row.crossCheck.rivals.length
                        ? fr ? `✗ ${row.crossCheck.engine} cite :` : `✗ ${row.crossCheck.engine} names:`
                        : fr ? `✗ ${row.crossCheck.engine} ne te cite pas` : `✗ ${row.crossCheck.engine} doesn't name you`}
                  </span>
                  {row.crossCheck.state === "missing"
                    ? row.crossCheck.rivals.map((name) => (
                        <span key={name} className="rounded-full px-2.5 py-0.5 text-xs font-black" style={{ color: "#B04329", background: "#C0492E14", border: "1px solid #C0492E33" }}>
                          {name}
                        </span>
                      ))
                    : null}
                </div>
              ) : null}
              {row.crossCheck && row.crossCheck.state === "unchecked" ? (
                <p className="m-0 mt-2 text-xs font-bold text-[#5E6E86]" data-testid="cross-check-unchecked">
                  {fr ? `${row.crossCheck.engine} : non vérifié sur cette question (pas de réponse à temps).` : `${row.crossCheck.engine}: not checked on this question (no answer in time).`}
                </p>
              ) : null}
              {row.pages.length ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-[#5B6B82]">{fr ? "Pages lues :" : "Pages read:"}</span>
                  {row.pages.map((page) => (
                    <span
                      key={page.domain}
                      className={`rounded-md px-2 py-0.5 text-[0.6875rem] font-black ${page.own ? "text-[#17705B]" : "text-[#5B6B82]"}`}
                      style={{ background: page.own ? "#1F8A701A" : "#EEF2F7" }}
                    >
                      {page.own ? (fr ? `✓ ton site · ${page.domain}` : `✓ your site · ${page.domain}`) : page.domain}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
