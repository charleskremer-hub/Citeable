import { loadAiSite } from "@/lib/ai-site-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const host = (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  const site = host === `ai.${decodeURIComponent(domain).toLowerCase()}` ? await loadAiSite(domain) : null;
  if (!site) return new Response("Not found", { status: 404 });
  return new Response(site.llmsTxt, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
