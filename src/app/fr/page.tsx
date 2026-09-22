import type { Metadata } from "next";
import HomeClient from "../HomeClient";
import { BEACHHEAD_TRADE } from "@/lib/plan-promises";

/**
 * ATTENTION — CE BLOC ÉCRASE `generateMetadata` DU LAYOUT (22/09/2026).
 *
 * Le pivot a réécrit le titre et la description dans `src/app/layout.tsx`, et
 * `/fr` et `/en` ont continué à servir « L'agent GEO des marques DTC » : une
 * `metadata` de page l'emporte sur celle du layout, et ce sont ces deux URL
 * que les moteurs lisent. Résultat en production : un corps de page vendant un
 * service aux experts-comptables sous un titre vendant un outil aux marques DTC.
 *
 * Dérivé de `BEACHHEAD_TRADE`, comme le layout, pour que les deux ne puissent
 * plus diverger. Verrouillé par `offre-services.test.ts`.
 */
export const metadata: Metadata = {
  title: `GetPick — L'agent qui fait recommander les ${BEACHHEAD_TRADE.fr}s par l'IA`,
  description: `Quand un client cherche un ${BEACHHEAD_TRADE.fr}, ChatGPT répond un nom. GetPick construit et entretient ta présence là où l'IA va chercher qui recommander — hors de ton site, zéro technique. Diagnostic gratuit en 2 minutes.`,
};

export default function FrenchHome() {
  return <HomeClient locale="fr" />;
}
