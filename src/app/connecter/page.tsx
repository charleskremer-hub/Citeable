import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connecte ton site — le seul geste — GetPick",
  robots: { index: false, follow: false },
};

/**
 * Page générique du seul geste client (29/09, « comme Delos, sans webmaster ») :
 * connecter son site. Le lien personnalisé (/brancher/<domaine>) est envoyé
 * par email juste après la souscription ; cette page est l'étape d'attente.
 */
export default function ConnecterPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-[#132A43]">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#123E5C]">Un seul geste · 1 minute · sans webmaster</p>
      <h1 className="mt-2 text-3xl font-black leading-tight">Connecte ton site à ton agent GEO</h1>
      <p className="mt-3 text-base leading-7 text-[#5B6B82]">
        Notre agent écrit déjà les réponses aux questions de tes clients, depuis les informations de ton site. Tu vas recevoir par email
        un lien « Connecter mon site » : sur WordPress, tu te connectes et tu cliques « Approuver ». L&apos;agent publie ensuite
        lui-même, sur ton site, et tient la page à jour chaque mois.
      </p>
      <p className="mt-6 text-sm leading-6 text-[#5E6E86]">
        Rien à installer, rien à transmettre. Accès révocable à tout moment. Pas reçu l&apos;email d&apos;ici quelques minutes ? Écris à
        hello@getpick.ai.
      </p>
    </main>
  );
}
