"use client";

import { useState } from "react";

const LABELS: Record<string, string> = {
  dns_missing: "Pas encore visible. Le DNS met de 5 minutes à 1 heure à se propager : réessaie un peu plus tard, on te préviendra aussi par email.",
  certificate_pending: "Le DNS est bon. Le certificat de sécurité se crée (quelques minutes) — réessaie bientôt.",
  live: "C'est en ligne. Ta fiche IA est publiée, et nous avons prévenu les moteurs de recherche.",
};

export default function CheckButton({ domain, token }: { domain: string; token: string }) {
  const [state, setState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    try {
      const response = await fetch(`/api/ai-site/check?domain=${encodeURIComponent(domain)}&k=${encodeURIComponent(token)}`, { cache: "no-store" });
      const body = (await response.json()) as { state?: string };
      setState(body.state ?? "dns_missing");
    } catch {
      setState("dns_missing");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={check}
        disabled={busy}
        className="rounded-xl bg-[#123E5C] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
      >
        {busy ? "Vérification…" : "C'est fait — vérifier"}
      </button>
      {state ? <p className="mt-3 text-sm font-bold text-[#132A43]">{LABELS[state] ?? LABELS.dns_missing}</p> : null}
    </div>
  );
}
