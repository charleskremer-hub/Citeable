/**
 * SONDE INTERNE (01/10) — pourquoi la prod ne lit pas certains sites de cabinets
 * que nous lisons très bien ailleurs (Fiaud-Laporte, VENCEA, Mon Espace Compta) ?
 * Hypothèse : des hébergeurs français filtrent le trafic hors Europe ; nos
 * fonctions tournent à Washington (iad1). La même sonde existe en deux régions
 * (défaut et Paris) pour trancher par la mesure. Réservée aux visiteurs internes,
 * limitée à https://<domaine>/ et https://www.<domaine>/ : pas un proxy ouvert.
 */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requestTrafficClass } from "@/lib/traffic-filter";

const UA = "Mozilla/5.0 (compatible; CiteeableBot/1.0)";

export async function probe(req: NextRequest, region: string) {
  if (requestTrafficClass(req.headers).trafficClass !== "internal") return NextResponse.json({ error: "not found" }, { status: 404 });
  const domain = (req.nextUrl.searchParams.get("d") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return NextResponse.json({ error: "domain" }, { status: 400 });
  const results = [];
  for (const url of [`https://${domain}/`, `https://www.${domain}/`]) {
    const started = Date.now();
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(8000), cache: "no-store" });
      const body = await response.text();
      results.push({ url, status: response.status, bytes: body.length, ms: Date.now() - started });
    } catch (error) {
      results.push({ url, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error), ms: Date.now() - started });
    }
  }
  const dbStarted = Date.now();
  let dbMs: number | null = null;
  try {
    await pool.query("SELECT 1");
    dbMs = Date.now() - dbStarted;
  } catch {
    dbMs = null;
  }
  return NextResponse.json({ region, vercelRegion: process.env.VERCEL_REGION ?? null, results, dbMs });
}
