"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  engines?: Array<{ engine: string; model: string; ok: boolean; error?: string }>;
};

type AgentAuditChatProps = {
  auditId: string;
  brandName: string;
  category?: string;
  locale: Locale;
};

const copy = {
  en: {
    eyebrow: "Agent €19 · interactive",
    title: "Ask your audit anything",
    body: "Answers use your stored audit, Gemini, and ChatGPT. If the audit does not contain a fact, the agent says so instead of guessing.",
    placeholder: "Ask why an AI cites a competitor, or request a copy-paste fix…",
    send: "Ask Agent",
    thinking: "Checking your audit with Gemini + ChatGPT…",
    sources: "Audit sources",
    engines: "Engines",
    error: "The Agent could not answer right now.",
    starter: (brandName: string, category?: string) => [
      `Why does AI cite competitors instead of ${brandName}?`,
      `Generate a FAQ paragraph I can paste for ${category || "my category"}.`,
      "What should I add to my Google Business profile first?",
    ],
  },
  fr: {
    eyebrow: "Agent 19 € · interactif",
    title: "Pose tes questions à l'audit",
    body: "Les réponses utilisent ton audit stocké, Gemini et ChatGPT. Si l'audit ne contient pas une info, l'agent le dit au lieu d'inventer.",
    placeholder: "Demande pourquoi l'IA cite un concurrent, ou un correctif prêt à coller…",
    send: "Demander à l'Agent",
    thinking: "Vérification de ton audit avec Gemini + ChatGPT…",
    sources: "Sources audit",
    engines: "Moteurs",
    error: "L'Agent ne peut pas répondre pour l'instant.",
    starter: (brandName: string, category?: string) => [
      `Pourquoi l'IA cite des concurrents au lieu de ${brandName} ?`,
      `Génère un paragraphe FAQ à coller pour ${category || "ma catégorie"}.`,
      "Quoi ajouter en premier à ma fiche Google Business ?",
    ],
  },
} as const;

export default function AgentAuditChat({ auditId, brandName, category, locale }: AgentAuditChatProps) {
  const t = copy[locale];
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const starters = useMemo(() => t.starter(brandName, category), [brandName, category, t]);

  async function askAgent(nextQuestion: string) {
    const question = nextQuestion.trim();

    if (!question || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/audit-agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audit_id: auditId, message: question, history: messages.slice(-8), locale }),
      });
      const payload = await response.json();

      if (!response.ok) throw new Error(payload.error || t.error);

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: payload.answer,
          sources: Array.isArray(payload.sources) ? payload.sources : [],
          engines: Array.isArray(payload.engines) ? payload.engines : [],
        },
      ]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t.error);
      setMessages(nextMessages);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askAgent(input);
  }

  return (
    <section className="rounded-[1.5rem] border border-[#CAFF3C]/30 bg-[radial-gradient(circle_at_top_left,rgba(202,255,60,0.16),rgba(17,17,22,0.96)_44%)] p-5 shadow-2xl shadow-[#CAFF3C]/5 sm:p-6" data-testid="agent-audit-chat">
      <p className="m-0 mb-2 text-xs font-black uppercase tracking-[0.12em] text-[#CAFF3C]">{t.eyebrow}</p>
      <h2 className="m-0 text-2xl leading-none tracking-[-0.04em]" style={{ fontFamily: "var(--font-display)" }}>
        {t.title}
      </h2>
      <p className="m-0 mt-3 text-sm font-bold leading-6 text-[#D6D6DF]">{t.body}</p>

      <div className="mt-5 grid gap-3">
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {starters.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => void askAgent(starter)}
                className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-left text-xs font-black text-[#D6D6DF] transition hover:border-[#CAFF3C]/35 hover:text-[#CAFF3C]"
              >
                {starter}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-6 rounded-2xl bg-[#CAFF3C] p-4 text-sm font-black leading-6 text-[#09090B]" : "mr-6 rounded-2xl border border-white/[0.08] bg-black/25 p-4 text-sm font-bold leading-6 text-[#F0F0EC]"}>
            <p className="m-0 whitespace-pre-wrap">{message.content}</p>
            {message.role === "assistant" && message.sources?.length ? (
              <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.04] p-3">
                <p className="m-0 text-xs font-black uppercase tracking-[0.1em] text-[#CAFF3C]">{t.sources}</p>
                <ul className="m-0 mt-2 grid list-none gap-1 p-0 text-xs font-bold leading-5 text-[#BCBCC8]">
                  {message.sources.map((source) => <li key={source}>{source}</li>)}
                </ul>
              </div>
            ) : null}
            {message.role === "assistant" && message.engines?.length ? (
              <p className="m-0 mt-3 text-xs font-bold text-[#8E8E9A]">
                {t.engines}: {message.engines.map((engine) => `${engine.engine} ${engine.ok ? "✓" : "—"}`).join(" · ")}
              </p>
            ) : null}
          </div>
        ))}

        {loading ? <p className="m-0 rounded-2xl border border-white/[0.08] bg-black/20 p-4 text-sm font-black text-[#CAFF3C]">{t.thinking}</p> : null}
        {error ? <p className="m-0 rounded-2xl border border-[#FF5F5F]/25 bg-[#FF5F5F]/10 p-4 text-sm font-black text-[#FFB1B1]">{error}</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t.placeholder}
          rows={2}
          className="min-h-20 flex-1 resize-y rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-bold leading-6 text-[#F0F0EC] outline-none placeholder:text-[#8E8E9A] focus:border-[#CAFF3C]/50"
        />
        <button type="submit" disabled={loading || !input.trim()} className="rounded-2xl bg-[#CAFF3C] px-5 py-3 text-sm font-black text-[#09090B] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
          {t.send}
        </button>
      </form>
    </section>
  );
}
