import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadAiSite } from "@/lib/ai-site-store";

export const dynamic = "force-dynamic";

/**
 * `https://ai.<cabinet>/` — la fiche factuelle du cabinet, écrite pour être lue
 * par les assistants IA, lisible par un humain (même contenu pour tous).
 * Servie UNIQUEMENT sous l'hôte `ai.<domaine>` : sur getpick.ai, 404 (pas de
 * contenu dupliqué chez nous).
 */
async function servedOnAiHost(domain: string) {
  const host = ((await headers()).get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  return host === `ai.${decodeURIComponent(domain).toLowerCase()}`;
}

export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }): Promise<Metadata> {
  const { domain } = await params;
  const site = await loadAiSite(domain);
  if (!site) return {};
  return {
    title: site.title,
    description: site.summary,
    alternates: { canonical: `https://ai.${site.domain}/` },
    openGraph: { title: site.title, description: site.summary, url: `https://ai.${site.domain}/`, siteName: site.title },
    robots: { index: true, follow: true },
  };
}

export default async function AiSitePage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  if (!(await servedOnAiHost(domain))) notFound();
  const site = await loadAiSite(domain);
  if (!site) notFound();

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 16px", fontFamily: "system-ui, sans-serif", color: "#132A43", lineHeight: 1.6 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(site.jsonLd) }} />
      <h1 style={{ fontSize: 28, lineHeight: 1.2 }}>{site.title}</h1>
      <p>{site.summary}</p>
      <h2 style={{ fontSize: 20, marginTop: 32 }}>Faits</h2>
      <dl>
        {site.facts.map((fact) => (
          <div key={fact.label} style={{ display: "flex", gap: 12 }}>
            <dt style={{ fontWeight: 700, minWidth: 120 }}>{fact.label}</dt>
            <dd style={{ margin: 0 }}>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {site.faq.length ? (
        <>
          <h2 style={{ fontSize: 20, marginTop: 32 }}>Questions fréquentes</h2>
          {site.faq.map((item) => (
            <section key={item.question} style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 16, margin: 0 }}>{item.question}</h3>
              <p style={{ margin: "4px 0 0" }}>{item.answer}</p>
            </section>
          ))}
        </>
      ) : null}
      <p style={{ marginTop: 40, fontSize: 13, color: "#5B6B82" }}>
        <a href={`https://${site.domain}`} style={{ color: "#123E5C" }}>Site officiel de {site.facts[0]?.value}</a> ·{" "}
        <a href="/llms.txt" style={{ color: "#123E5C" }}>llms.txt</a>
      </p>
    </main>
  );
}
