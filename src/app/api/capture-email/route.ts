import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const normalised = email.trim().toLowerCase();

  await pool.query(
    "INSERT INTO email_captures (email) VALUES ($1) ON CONFLICT DO NOTHING",
    [normalised]
  );

  console.log(`[citeable] email captured: ${normalised}`);

  return NextResponse.json({ ok: true });
}
