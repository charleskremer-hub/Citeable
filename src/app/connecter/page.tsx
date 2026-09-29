import type { Metadata } from "next";
import { gbpManagerEmail, gbpManagerSteps } from "@/lib/gbp-onboarding";

export const metadata: Metadata = {
  title: "Connecter ta fiche Google — GetPick",
  robots: { index: false, follow: false },
};

/**
 * Le seul geste du client : nous ajouter comme administrateur de sa fiche
 * Google. Page publique, sans compte : elle est liée depuis l'email de
 * bienvenue et la page de confirmation de paiement.
 */
export default function ConnecterPage() {
  const manager = gbpManagerEmail();
  const steps = gbpManagerSteps(manager).slice(0, 4);
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-[#132A43]">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#123E5C]">Une seule étape · 1 minute · rien de technique</p>
      <h1 className="mt-2 text-3xl font-black leading-tight">Ajoute GetPick à ta fiche Google</h1>
      <p className="mt-3 text-base leading-7 text-[#5B6B82]">
        C&apos;est la fiche que Gemini et Google lisent pour recommander un cabinet. Tu nous y ajoutes comme administrateur — comme
        on partage un document. Tu restes propriétaire, tu peux nous retirer à tout moment.
      </p>
      <ol className="mt-8 grid gap-3 pl-5 text-base font-bold leading-7">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="mt-6 rounded-2xl border border-[#123E5C]/30 bg-white p-5">
        <p className="m-0 text-xs font-black uppercase tracking-[0.1em] text-[#5B6B82]">Adresse à inviter</p>
        <p className="m-0 mt-1 select-all font-mono text-lg font-black text-[#123E5C]">{manager}</p>
      </div>
      <a
        href="https://business.google.com/"
        target="_blank"
        rel="noreferrer"
        className="mt-6 inline-block rounded-xl bg-[#123E5C] px-5 py-3 text-sm font-black text-white no-underline"
      >
        Ouvrir ma fiche Google →
      </a>
      <section className="mt-10 rounded-2xl border border-[#E4E9F0] bg-[#EEF2F7] p-5 text-sm leading-6">
        <h2 className="m-0 text-base font-black">Ensuite, on s&apos;occupe de tout</h2>
        <ul className="mt-2 grid gap-1 pl-5">
          <li>Sous 48 h : ta fiche complétée pour les vraies questions de tes clients (services, spécialités, zone).</li>
          <li>Tes annuaires alignés : Bing, Yelp, PagesJaunes.</li>
          <li>Chaque mois : ce que l&apos;IA a lu, et qui elle cite — toi ou ton confrère.</li>
        </ul>
        <p className="m-0 mt-3 text-[#5B6B82]">Un souci ? Écris à hello@getpick.ai, on le fait avec toi.</p>
      </section>
    </main>
  );
}
