export const dynamic = "force-dynamic";

/** Clé IndexNow (Bing, donc la recherche de ChatGPT) servie sur l'hôte du cabinet. */
export async function GET() {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
