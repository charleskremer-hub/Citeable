import type { NextRequest } from "next/server";
import { probe } from "@/lib/fetch-probe";

export const dynamic = "force-dynamic";
// Paris : la même sonde, exécutée en Europe.
export const preferredRegion = "cdg1";

export async function GET(req: NextRequest) {
  return probe(req, "cdg1");
}
