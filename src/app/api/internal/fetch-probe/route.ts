import type { NextRequest } from "next/server";
import { probe } from "@/lib/fetch-probe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return probe(req, "default");
}
