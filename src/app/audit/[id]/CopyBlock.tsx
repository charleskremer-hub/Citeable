"use client";

import { useState } from "react";

type Props = {
  label: string;
  text: string;
  copyLabel: string;
  copiedLabel: string;
};

export default function CopyBlock({ label, text, copyLabel, copiedLabel }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the text stays selectable for manual copy */
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/25 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[11px] font-black uppercase tracking-[0.1em] text-[#8E9A8F]">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded-lg bg-[#CAFF3C] px-3 py-1 text-xs font-black text-[#09090B] transition hover:brightness-110"
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <p className="m-0 select-all whitespace-pre-wrap text-sm font-bold leading-6 text-[#EDEDE7]">{text}</p>
    </div>
  );
}
