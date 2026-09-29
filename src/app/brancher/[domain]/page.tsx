import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AI_CNAME_TARGET, AI_SUBDOMAIN, dnsProviderFromNameservers, dohLookup, normalizeRootDomain, providerSteps, verifyAiSiteToken, webmasterMessage } from "@/lib/ai-site";
import CheckButton from "./CheckButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Brancher ta fiche IA — GetPick", robots: { index: false, follow: false } };

/**
 * Onboarding du sous-domaine `ai.` : UN seul geste pour le cabinet. On détecte
 * son fournisseur DNS et on lui donne les clics exacts ; s'il a un webmaster,
 * un message prêt à transmettre. Lien signé : pas de compte à créer.
 */
export default async function BrancherPage({ params, searchParams }: { params: Promise<{ domain: string }>; searchParams: Promise<{ k?: string }> }) {
  const { domain: raw } = await params;
  const { k = "" } = await searchParams;
  const domain = normalizeRootDomain(decodeURIComponent(raw));
  if (!domain || !verifyAiSiteToken(domain, k)) notFound();

  const provider = dnsProviderFromNameservers(await dohLookup(domain, "NS"));
  const steps = providerSteps(provider, domain);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-[#132A43]">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#123E5C]">Une seule étape · 2 minutes</p>
      <h1 className="mt-2 text-3xl font-black leading-tight">Branche {AI_SUBDOMAIN}.{domain}</h1>
      <p className="mt-3 text-base leading-7 text-[#5B6B82]">
        Ta fiche pour les assistants IA vivra sur ton propre domaine. Ton site et tes emails ne changent pas. Ensuite, GetPick
        s&apos;occupe de tout : contenu, mise à jour, signalement aux moteurs.
      </p>

      <section className="mt-8 rounded-2xl border border-[#E4E9F0] bg-white p-5">
        <h2 className="text-lg font-black">Chez {provider.name}</h2>
        <ol className="mt-3 grid gap-2 pl-5 text-sm font-bold leading-6">
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <table className="mt-4 w-full text-left text-sm">
          <tbody>
            <tr><th className="pr-4 font-black text-[#5B6B82]">Type</th><td className="font-mono font-bold select-all">CNAME</td></tr>
            <tr><th className="pr-4 font-black text-[#5B6B82]">Nom</th><td className="font-mono font-bold select-all">{AI_SUBDOMAIN}</td></tr>
            <tr><th className="pr-4 font-black text-[#5B6B82]">Cible</th><td className="font-mono font-bold select-all">{AI_CNAME_TARGET}.</td></tr>
          </tbody>
        </table>
        {provider.zoneUrl ? (
          <a href={provider.zoneUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-black text-[#123E5C] underline">
            Ouvrir {provider.name} →
          </a>
        ) : null}
      </section>

      <section className="mt-6">
        <CheckButton domain={domain} token={k} />
      </section>

      <section className="mt-8 rounded-2xl border border-[#E4E9F0] bg-[#EEF2F7] p-5">
        <h2 className="text-base font-black">Tu as un webmaster ? Transmets-lui ce message</h2>
        <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 select-all">{webmasterMessage(domain)}</pre>
      </section>
    </main>
  );
}
