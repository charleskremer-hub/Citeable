import type { Metadata } from "next";
import HomeClient from "../HomeClient";

/**
 * Test avocats (01/10/2026) — même parcours que /fr, textes du métier.
 * Voir src/lib/landing-avocats.ts.
 */
export const metadata: Metadata = {
  title: "GetPick — L'agent qui fait recommander les avocats par l'IA",
  description:
    "Quand un client cherche un avocat dans sa ville, l'IA répond un nom. GetPick vous montre ce que Gemini et ChatGPT répondent, puis rédige les réponses que l'IA lit — vous les relisez et les publiez. Diagnostic gratuit en 2 minutes.",
  alternates: { canonical: "https://www.getpick.ai/avocats" },
};

export default function AvocatsPage() {
  return <HomeClient locale="fr" variant="avocats" />;
}
