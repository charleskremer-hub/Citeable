import type { Metadata } from "next";
import { AI_CNAME_TARGET, AI_SUBDOMAIN } from "@/lib/ai-site";

export const metadata: Metadata = {
  title: "Ta fiche IA — le seul geste — GetPick",
  robots: { index: false, follow: false },
};

/**
 * Page générique du seul geste client (offre agent GEO, 30/09) : faire ajouter
 * par son webmaster une ligne DNS. Le lien personnalisé (/brancher/<domaine>)
 * est envoyé par email après la souscription ; cette page sert de repli.
 */
export default function ConnecterPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-[#132A43]">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#123E5C]">Un seul geste · rien de technique pour toi</p>
      <h1 className="mt-2 text-3xl font-black leading-tight">Transfère un email à ton webmaster</h1>
      <p className="mt-3 text-base leading-7 text-[#5B6B82]">
        Notre agent écrit les réponses aux questions de tes clients, depuis les faits de ton site. Elles sont publiées sur{" "}
        <strong>{AI_SUBDOMAIN}.toncabinet.fr</strong>, ta fiche pour les assistants IA. Pour qu&apos;elle existe, ton webmaster ajoute une
        seule ligne à ton nom de domaine. Ton site et tes emails ne changent pas.
      </p>
      <div className="mt-6 rounded-2xl border border-[#E4E9F0] bg-white p-5 text-sm">
        <p className="m-0 font-black">La ligne à ajouter</p>
        <p className="m-0 mt-2 font-mono select-all">CNAME · {AI_SUBDOMAIN} · {AI_CNAME_TARGET}.</p>
      </div>
      <p className="mt-6 text-sm leading-6 text-[#5B6B82]">
        Tu as reçu par email le message exact, prêt à transférer, et un lien de suivi. Pas reçu ? Écris à hello@getpick.ai.
      </p>
    </main>
  );
}
