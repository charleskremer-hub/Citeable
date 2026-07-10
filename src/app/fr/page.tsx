import type { Metadata } from "next";
import HomeClient from "../HomeClient";

export const metadata: Metadata = {
  title: "Citeable — Audit gratuit de visibilité IA",
  description: "Lance l'audit gratuit, vois ton score, puis reçois les correctifs rédigés pour toi.",
};

export default function FrenchHome() {
  return <HomeClient locale="fr" />;
}
