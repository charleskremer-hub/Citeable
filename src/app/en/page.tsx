import type { Metadata } from "next";
import HomeClient from "../HomeClient";
import { BEACHHEAD_TRADE } from "@/lib/plan-promises";

/** Voir la note de `src/app/fr/page.tsx` : cette `metadata` écrase celle du
 *  layout sur l'URL que les moteurs lisent. Dérivée, jamais écrite. */
export const metadata: Metadata = {
  title: `GetPick — The agent that gets ${BEACHHEAD_TRADE.en}s recommended by AI`,
  description: `When a client looks for an ${BEACHHEAD_TRADE.en}, ChatGPT answers with a name. GetPick builds and maintains your presence where AI looks for who to recommend — off-site, zero technical. Free diagnostic in 2 minutes.`,
};

export default function EnglishHome() {
  return <HomeClient locale="en" />;
}
