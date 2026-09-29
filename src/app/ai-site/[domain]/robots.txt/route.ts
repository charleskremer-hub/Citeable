export const dynamic = "force-dynamic";

/** Tout est ouvert, en particulier aux robots des assistants IA. */
export async function GET(request: Request) {
  const host = (request.headers.get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  const body = ["User-agent: *", "Allow: /", "", `Sitemap: https://${host}/sitemap.xml`, ""].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
