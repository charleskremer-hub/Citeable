"use client";

import { useEffect, useState } from "react";

type ClaimReportGateProps = {
  auditId: string;
  locale: "fr" | "en";
};

/**
 * Capteur `gate_shown`, jumeau de `ReportViewBeacon` : une ligne par session et
 * par audit, envoyée seulement quand le gate est réellement monté à l'écran (le
 * composant n'est rendu que si `reportLocked`, donc pas de garde supplémentaire
 * ici). Sert à lire la chaîne complète `report_viewed → gate_shown →
 * email_captured → teaser_cta_click → checkout_opened` dans `/api/funnel`.
 */
const GATE_SESSION_KEY = "gp_sid";
const gateShownSent = new Set<string>();

function gateSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(GATE_SESSION_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(GATE_SESSION_KEY, generated);
    return generated;
  } catch {
    return `nosession-${new Date().toISOString().slice(0, 10)}`;
  }
}

function sendGateShown(auditId: string) {
  const dedupeKey = `gate_shown:${auditId}:${gateSessionId()}`;
  if (gateShownSent.has(dedupeKey)) return;
  gateShownSent.add(dedupeKey);

  const body = JSON.stringify({
    events: [{ event_name: "gate_shown", audit_id: auditId, source: "report_gate", dedupe_key: dedupeKey }],
  });

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const delivered = navigator.sendBeacon("/api/funnel", new Blob([body], { type: "application/json" }));
      if (delivered) return;
    }
    void fetch("/api/funnel", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => undefined);
  } catch {
    // La mesure ne casse jamais la page.
  }
}

/**
 * Porte de capture d'email sur un audit lancé anonymement.
 *
 * Le verdict, le rival nommé et la part de voix sont déjà visibles au-dessus :
 * on n'échange pas l'email contre "un résultat", on l'échange contre ce qui
 * RÉSOUT le problème (fixes prêts à coller, fichiers machine, détail question
 * par question). C'est la contrepartie honnête et ça retire le frein d'entrée.
 *
 * Formulation orientée réclamation ("Débloquer mes fixes"), pas inscription :
 * aucun compte, aucun mot de passe. Mention RGPD au point de collecte —
 * finalité, base légale, désinscription — parce que c'est la seule ligne du
 * funnel où on demande explicitement une donnée personnelle.
 */
export default function ClaimReportGate({ auditId, locale }: ClaimReportGateProps) {
  const fr = locale === "fr";
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    sendGateShown(auditId);
  }, [auditId]);

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
    <section className="rounded-[1.5rem] border border-[#CAFF3C]/30 bg-[#CAFF3C]/[0.06] p-5 sm:p-6">
      <p className="m-0 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">
        {fr ? "Fixes prêts à coller" : "Fixes ready to paste"}
      </p>
      <h2 className="m-0 mt-2 text-2xl leading-[1.1] tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>
        {fr ? "Vois exactement quoi publier pour être cité à la place." : "See exactly what to publish to get cited instead."}
      </h2>
      <p className="m-0 mt-2 text-sm font-bold leading-6 text-[#A7A7B4]">
        {fr
          ? "Ton score, ton concurrent et ta part de voix sont déjà visibles au-dessus. Entre ton email pour débloquer le détail question par question, le texte prêt à coller, et les fichiers techniques (FAQ, llms.txt, robots.txt) qui corrigent le problème."
          : "Your score, your named competitor and your share of voice are already visible above. Enter your email to unlock the question-by-question detail, ready-to-paste copy, and the technical files (FAQ, llms.txt, robots.txt) that fix the problem."}
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
          {status === "loading" ? "…" : fr ? "Débloquer mes fixes →" : "Unlock my fixes →"}
        </button>
      </form>

      {status === "error" ? (
        <p className="m-0 mt-2 text-xs font-bold text-[#FF8F6B]">
          {fr ? "Ça n'a pas marché. Réessaie." : "That did not work. Try again."}
        </p>
      ) : null}

      {/*
        RGPD au point de collecte (30/07) : finalité, base légale, désinscription
        — les trois mentions attendues à l'endroit où une donnée personnelle est
        explicitement demandée. Pas de création de compte, pas de mot de passe :
        seul l'email est collecté, et seulement pour ce rapport et son suivi.
      */}
      <p className="m-0 mt-3 text-xs font-bold leading-5 text-[#8E8E9A]">
        {fr
          ? "Utilisé uniquement pour t'envoyer ce rapport détaillé et son suivi (intérêt légitime à répondre à ta demande d'audit). Aucun compte créé, aucun mot de passe. Désinscription en un clic sur chaque email."
          : "Used only to send you this detailed report and its follow-up (legitimate interest in fulfilling your audit request). No account created, no password. One-click unsubscribe on every email."}
      </p>
    </section>
  );
}
