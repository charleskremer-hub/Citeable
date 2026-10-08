import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AI_CNAME_TARGET, AI_SUBDOMAIN, dnsProviderFromNameservers, dohLookup, normalizeRootDomain, providerSteps, verifyAiSiteToken, webmasterMessage } from "@/lib/ai-site";
import { loadCmsConnection, publishModeForDomain } from "@/lib/cms-connection-store";
import { discoverSite } from "@/lib/wp-connect";
import CheckButton from "./CheckButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connecter ton site — GetPick", robots: { index: false, follow: false } };

const CONNECTION_ERRORS: Record<string, string> = {
  refused: "Tu as refusé la connexion. Rien n'a été modifié sur ton site. Tu peux recommencer quand tu veux.",
  incomplete: "WordPress n'a pas renvoyé l'autorisation. Recommence : connecte-toi à ton WordPress puis clique « Approuver ».",
  other_site: "L'autorisation venait d'un autre site que le tien. Recommence depuis ce bouton.",
  cannot_publish_pages: "Ton compte WordPress ne peut pas publier de pages. Connecte-toi avec un compte administrateur ou éditeur.",
};

/**
 * Onboarding de l'agent GEO. Chemin principal (29/09) : « Connecter mon site »
 * — le cabinet approuve GetPick dans SON WordPress, l'agent publie directement.
 * Repli, seulement si le site n'est pas connectable : la fiche `ai.<domaine>`.
 */
export default async function BrancherPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ k?: string; connexion?: string }>;
}) {
  const { domain: raw } = await params;
  const { k = "", connexion } = await searchParams;
  const domain = normalizeRootDomain(decodeURIComponent(raw));
  if (!domain || !verifyAiSiteToken(domain, k)) notFound();

  const connection = await loadCmsConnection(domain).catch(() => null);
  // Avocats (08/10/2026) : vouvoiement, et la page part en brouillon à relire.
  const review = (await publishModeForDomain(domain).catch(() => "publish")) === "review";
  const connectHref = `/api/connect/wordpress/start?d=${encodeURIComponent(domain)}&k=${encodeURIComponent(k)}`;

  if (review && connection && connection.status !== "revoked") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-[#132A43]">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#17705B]">Site connecté</p>
        <h1 className="mt-2 text-3xl font-black leading-tight">C&apos;est fait. L&apos;agent travaille sur {domain}.</h1>
        <p className="mt-3 text-base leading-7 text-[#5B6B82]">
          {connection.status === "published" && connection.page_url ? (
            <>
              Votre page est en ligne :{" "}
              <a className="font-black text-[#123E5C] underline" href={connection.page_url}>
                {connection.page_url}
              </a>
              . Chaque mois, nous reposons les questions de vos futurs clients à l&apos;IA et vous envoyons le résultat.
            </>
          ) : connection.page_url ? (
            <>
              Votre page est prête, en brouillon : rien n&apos;est en ligne.{" "}
              <a className="font-black text-[#123E5C] underline" href={connection.page_url}>
                Relisez-la et publiez-la dans WordPress →
              </a>
            </>
          ) : (
            <>L&apos;agent rédige vos réponses et les dépose en brouillon sur votre WordPress dans les minutes qui viennent. Vous recevez le lien par email pour les relire et les publier.</>
          )}
        </p>
        <p className="mt-6 text-sm leading-6 text-[#5E6E86]">
          Vous gardez la main : l&apos;accès « GetPick — agent GEO » se retire à tout moment dans votre WordPress (Profil → Mots de passe d&apos;application).
        </p>
      </main>
    );
  }

  if (connection && connection.status !== "revoked") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-[#132A43]">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#17705B]">Site connecté</p>
        <h1 className="mt-2 text-3xl font-black leading-tight">C&apos;est fait. L&apos;agent travaille sur {domain}.</h1>
        <p className="mt-3 text-base leading-7 text-[#5B6B82]">
          {connection.page_url ? (
            <>
              Tes réponses sont publiées sur ton site :{" "}
              <a className="font-black text-[#123E5C] underline" href={connection.page_url}>
                {connection.page_url}
              </a>
              . Chaque mois, on repose les questions de tes clients à l&apos;IA, on met la page à jour, et tu reçois le résultat par email.
            </>
          ) : (
            <>L&apos;agent écrit tes réponses et les publie sur ton site dans les minutes qui viennent. Tu reçois le lien par email.</>
          )}
        </p>
        <p className="mt-6 text-sm leading-6 text-[#5E6E86]">
          Tu gardes la main : l&apos;accès « {`GetPick — agent GEO`} » se retire à tout moment dans ton WordPress (Profil → Mots de passe d&apos;application).
        </p>
      </main>
    );
  }

  const site = await discoverSite(domain);
  const error = connexion && connexion !== "ok" ? CONNECTION_ERRORS[connexion] ?? "La connexion n'a pas abouti. Recommence, ou réponds à notre email : on s'en occupe." : null;

  if (site.kind === "wordpress" && review) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-[#132A43]">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#123E5C]">Un clic · 1 minute · sans webmaster</p>
        <h1 className="mt-2 text-3xl font-black leading-tight">Connectez {domain} à votre agent GEO</h1>
        <p className="mt-3 text-base leading-7 text-[#5B6B82]">
          Vous vous connectez à votre WordPress et cliquez « Approuver ». L&apos;agent rédige alors, à partir des informations de votre site, les
          réponses aux questions que vos futurs clients posent à l&apos;IA, et les dépose en <strong>brouillon</strong>. Vous les relisez et les
          publiez vous-même : rien n&apos;est mis en ligne sans votre validation.
        </p>
        {error ? <p className="mt-4 rounded-xl border border-[#B04329] bg-white p-3 text-sm font-bold text-[#B04329]">{error}</p> : null}
        <a href={connectHref} className="mt-8 inline-block rounded-2xl bg-[#123E5C] px-6 py-4 text-base font-black text-white">
          Connecter mon site WordPress →
        </a>
        <ul className="mt-8 grid gap-2 text-sm leading-6 text-[#5E6E86]">
          <li>· Une seule page, « Questions fréquentes », en brouillon. Aucune autre page touchée, rien de publié sans vous.</li>
          <li>· Sans superlatif, sans comparaison avec un confrère, sans promesse de résultat.</li>
          <li>· Une page que vous avez publiée n&apos;est jamais modifiée sans vous.</li>
          <li>· Si votre site n&apos;a pas encore de fichier llms.txt (la fiche que lisent ChatGPT, Claude et Perplexity), l&apos;agent active l&apos;extension gratuite « Website LLMs.txt » de l&apos;annuaire WordPress — désactivable en un clic.</li>
          <li>· Accès révocable à tout moment (WordPress → Profil → Mots de passe d&apos;application). Aucune mention de GetPick sur votre site.</li>
        </ul>
      </main>
    );
  }

  if (site.kind === "wordpress") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-[#132A43]">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#123E5C]">Un clic · 1 minute · sans webmaster</p>
        <h1 className="mt-2 text-3xl font-black leading-tight">Connecte {domain} à ton agent GEO</h1>
        <p className="mt-3 text-base leading-7 text-[#5B6B82]">
          Tu te connectes à ton WordPress, tu cliques « Approuver ». Ensuite l&apos;agent publie lui-même, sur ton site, les réponses aux
          questions que tes clients posent à l&apos;IA — et les tient à jour chaque mois. Rien à installer de ton côté, rien à transmettre.
        </p>
        {error ? <p className="mt-4 rounded-xl border border-[#B04329] bg-white p-3 text-sm font-bold text-[#B04329]">{error}</p> : null}
        <a
          href={connectHref}
          className="mt-8 inline-block rounded-2xl bg-[#123E5C] px-6 py-4 text-base font-black text-white"
        >
          Connecter mon site WordPress →
        </a>
        <ul className="mt-8 grid gap-2 text-sm leading-6 text-[#5E6E86]">
          <li>· Une seule page ajoutée : « Questions fréquentes », écrite à partir des informations de ton site. Aucune autre page touchée.</li>
          <li>· Si ton site n&apos;a pas encore de fichier llms.txt (la fiche que lisent ChatGPT, Claude et Perplexity), l&apos;agent active l&apos;extension gratuite « Website LLMs.txt » de l&apos;annuaire WordPress — désactivable en un clic.</li>
          <li>· Accès révocable à tout moment (WordPress → Profil → Mots de passe d&apos;application).</li>
          <li>· Pas de mention de GetPick sur ton site, aucun confrère cité.</li>
        </ul>
      </main>
    );
  }

  // Repli : site non connectable en un clic (Wix, WordPress verrouillé, autre).
  const provider = dnsProviderFromNameservers(await dohLookup(domain, "NS"));
  const steps = providerSteps(provider, domain);
  const why =
    site.kind === "wix"
      ? "Ton site est sur Wix : la connexion en un clic arrive bientôt."
      : site.kind === "wordpress_locked"
        ? "Ton WordPress bloque les connexions d'application (souvent une extension de sécurité)."
        : "Ton site ne permet pas la connexion en un clic.";

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-[#132A43]">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#123E5C]">Une seule étape · 2 minutes</p>
      <h1 className="mt-2 text-3xl font-black leading-tight">Branche {AI_SUBDOMAIN}.{domain}</h1>
      <p className="mt-3 text-base leading-7 text-[#5B6B82]">
        {why} Tes réponses vivront donc sur {AI_SUBDOMAIN}.{domain}, sur ton propre domaine. Ton site et tes emails ne changent pas.
        Ensuite, GetPick s&apos;occupe de tout : contenu, mise à jour, signalement aux moteurs.
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
