import type { Metadata } from "next";
import HomeClient from "../HomeClient";

export const metadata: Metadata = {
  title: "GetPick — L'agent GEO des marques DTC",
  description: "Il fait recommander ta marque par ChatGPT et Gemini — diagnostic, contenu, suivi. Sans agence. Audit gratuit en 2 minutes.",
};

export default function FrenchHome() {
  return <HomeClient locale="fr" />;
}
