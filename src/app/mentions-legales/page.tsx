import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { localeFromHeaders } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Mentions légales (LCEN art. 6-III). Données KINZE SAS fournies par Charles le
 * 01/10/2026 via sa fiche Pappers (RCS Paris 845 010 248).
 *
 * Directeur de la publication : désigné par sa fonction (« le président de
 * KINZE SAS ») — Charles ne veut pas son nom de famille sur les surfaces GetPick.
 * La fonction renvoie à une personne unique, identifiable au RCS public.
 */
const KINZE = {
  name: "KINZE SAS",
  capital: "500 €",
  rcs: "RCS Paris 845 010 248",
  vat: "FR67845010248",
  address: "30 rue Juliette Lamber, 75017 Paris",
  email: "hello@getpick.ai",
};

const HOST = "Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — vercel.com";

const COPY = {
  fr: {
    title: "Mentions légales",
    rows: [
      ["Éditeur", `GetPick est un service édité par ${KINZE.name}, société par actions simplifiée au capital de ${KINZE.capital}, ${KINZE.rcs}, TVA intracommunautaire ${KINZE.vat}.`],
      ["Siège social", KINZE.address],
      ["Contact", KINZE.email],
      ["Directeur de la publication", `Le président de ${KINZE.name}.`],
      ["Hébergeur", HOST],
      ["Données personnelles", "Prospection : voir notre politique de prospection. Pour toute demande relative à vos données, écrivez à l'adresse de contact ; vous pouvez aussi saisir la CNIL."],
    ],
    policy: "Politique de prospection",
    back: "← Retour à l'accueil",
  },
  en: {
    title: "Legal notice",
    rows: [
      ["Publisher", `GetPick is a service published by ${KINZE.name}, a French simplified joint-stock company with share capital of ${KINZE.capital}, ${KINZE.rcs}, EU VAT ${KINZE.vat}.`],
      ["Registered office", KINZE.address],
      ["Contact", KINZE.email],
      ["Publication director", `The president of ${KINZE.name}.`],
      ["Host", HOST.replace("États-Unis", "USA")],
      ["Personal data", "Outbound: see our outbound policy. For any request about your data, write to the contact address; you may also contact your data protection authority."],
    ],
    policy: "Outbound policy",
    back: "← Back to home",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const copy = COPY[localeFromHeaders(await headers())];
  return {
    title: `${copy.title} — GetPick`,
    alternates: { canonical: "https://www.getpick.ai/mentions-legales" },
    robots: { index: true, follow: true },
  };
}

export default async function LegalNoticePage() {
  const copy = COPY[localeFromHeaders(await headers())];
  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-6">
        <Link href="/" className="text-sm text-[#5E6E86] no-underline hover:text-[#132A43]">
          {copy.back}
        </Link>
        <h1 className="mt-8 mb-8 text-4xl tracking-[-0.03em]" style={{ fontFamily: "var(--font-display)" }}>
          {copy.title}
        </h1>
        <dl className="m-0">
          {copy.rows.map(([label, value]) => (
            <div key={label} className="mb-6">
              <dt className="text-sm font-black uppercase tracking-[0.08em] text-[#123E5C]">{label}</dt>
              <dd className="m-0 mt-1 leading-relaxed text-[#5B6B82]">{value}</dd>
            </div>
          ))}
        </dl>
        <Link href="/prospection" className="text-sm text-[#123E5C]">
          {copy.policy}
        </Link>
      </main>
    </div>
  );
}
