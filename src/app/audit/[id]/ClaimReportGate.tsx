"use client";

import { useState } from "react";

type ClaimReportGateProps = {
  auditId: string;
  locale: "fr" | "en";
};

/**
 * Porte de capture d'email sur un audit lancé anonymement.
 *
 * Le verdict est déjà visible au-dessus : on n'échange pas l'email contre
 * "un résultat", on l'échange contre le détail (questions testées, concurrents,
 * actions). C'est la contrepartie honnête et ça retire le frein d'entrée.
 */
export default function ClaimReportGate({ auditId, locale }: ClaimReportGateProps) {
  const fr = locale === "fr";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.includes("@")) return;
    setStatus("loading");

    try {
      const response = await fetch("/api/claim-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_id: auditId, email }),
      });
      if (!response.ok) throw new Error("failed");
      window.location.reload();
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="rounded-[1.5rem] border border-[#CAFF3C]/30 bg-[#CAFF3C]/[0.06] p-5 sm:p-6" data-testid="claim-report-gate">
      <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">
        {fr ? "Rapport complet" : "Full report"}
      </p>
      <h2 className="m-0 mt-2 text-2xl leading-[1.1] tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>
        {fr ? "Vois les questions testées et qui est cité à ta place." : "See the questions tested and who is cited instead of you."}
      </h2>
      <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#A7A7B4]">
        {fr
          ? "Ton score est déjà calculé. Entre ton email pour débloquer le détail : chaque question posée à l'IA, les concurrents nommés, et ce qu'il faut publier pour être cité."
          : "Your score is already calculated. Enter your email to unlock the detail: every question asked to the AI, the competitors named, and what to publish to get cited."}
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={fr ? "ton@email.com" : "you@email.com"}
          className="w-full rounded-xl border border-white/[0.12] bg-white/[0.05] px-4 py-3 text-base text-[#F0F0EC] outline-none"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="whitespace-nowrap rounded-xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] transition hover:brightness-110 disabled:opacity-60"
        >
          {status === "loading" ? (fr ? "…" : "…") : fr ? "Voir le rapport" : "See the report"}
        </button>
      </form>

      {status === "error" ? (
        <p className="m-0 mt-2 text-xs font-bold text-[#FF8F6B]">
          {fr ? "Ça n'a pas marché. Réessaie." : "That did not work. Try again."}
        </p>
      ) : null}

      <p className="m-0 mt-3 text-xs font-bold text-[#8E8E9A]">
        {fr ? "Pas de spam. Ton rapport, et c'est tout." : "No spam. Your report, nothing else."}
      </p>
    </section>
  );
}
