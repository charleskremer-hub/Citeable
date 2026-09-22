import type { Metadata } from "next";
import { headers } from "next/headers";
import { DM_Serif_Display, DM_Sans } from "next/font/google";
import "./globals.css";
import { localeFromHeaders } from "@/lib/i18n";
import { BEACHHEAD_TRADE, RECHECK_CADENCE, SERVICE_PLAN_PRICE_EUR } from "@/lib/plan-promises";
import { Analytics } from "@vercel/analytics/next";
import PostHogInit from "./PostHogInit";

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = localeFromHeaders(await headers());

  if (locale === "fr") {
    return {
      title: `GetPick — L'agent qui fait recommander les ${BEACHHEAD_TRADE.fr}s par l'IA`,
      description: `Quand un client cherche un ${BEACHHEAD_TRADE.fr}, ChatGPT répond un nom. GetPick construit et entretient ta présence là où l'IA va chercher qui recommander — hors de ton site, zéro technique. Diagnostic gratuit en 2 minutes.`,
    };
  }

  return {
    title: `GetPick — The agent that gets ${BEACHHEAD_TRADE.en}s recommended by AI`,
    description: `When a client looks for an ${BEACHHEAD_TRADE.en}, ChatGPT answers with a name. GetPick builds and maintains your presence where AI looks for who to recommend — off-site, zero technical. Free diagnostic in 2 minutes.`,
  };
}

/**
 * Données structurées.
 *
 * La home ne servait aucun JSON-LD : notre propre audit pénalise les marques qui
 * n'en ont pas, et nous échouions à notre propre check. Surtout, notre audit de
 * dogfooding a montré que les IA décrivaient le produit comme « une solution no-code
 * pour les commerces locaux » — alors que l'ICP est la marque DTC / e-commerce.
 * Ce schéma déclare explicitement la catégorie et l'audience pour corriger ce
 * mauvais cadrage à la source.
 */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "GetPick",
  url: "https://www.getpick.ai",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "GEO agent (AI visibility / AEO)",
  operatingSystem: "Web",
  description:
    `GetPick is the GEO agent for service professionals, ${BEACHHEAD_TRADE.en}s first. It gets you recommended by AI assistants like ChatGPT and Gemini and does the work off-site: it sends your clients' real questions to the AIs live, names the peer cited in your place, then creates and hosts your answer page, places you on the sources AI trusts, and re-tests ${RECHECK_CADENCE.en.adverb}. You never touch your own website. The work a GEO agency charges 2,000-20,000 EUR/month for, at one flat price.`,
  audience: {
    "@type": "Audience",
    audienceType: "Service professionals and small firms (accountants, lawyers, consultants, trades)",
  },
  offers: [
    {
      "@type": "Offer",
      name: "Free audit",
      price: "0",
      priceCurrency: "EUR",
      // Le compte de questions vient du moteur (`audit-engine.ts`, `const count =
      // tier === "free" ? N : M`), pas d'une valeur de copy : ce JSON-LD est rendu
      // sur TOUTES les pages, c'est le signal structuré de plus haute confiance
      // pour un crawler IA et il ne peut pas contredire `public/llms.txt`.
      // Verrouillé par « surfaces machine — le nombre de questions par tier est
      // celui du moteur d'audit » (scripts/landing-copy.test.ts).
      description: "AI visibility audit on 6 real buyer questions.",
    },
    {
      "@type": "Offer",
      // Le montant vient de `SERVICE_PLAN_PRICE_EUR` (`plan-promises.ts`), jamais
      // d'une valeur de copy : ce JSON-LD est rendu sur TOUTES les pages et ne
      // peut pas contredire la grille, `public/llms.txt` ou /vs. Verrouillé par
      // `offre-services.test.ts`.
      name: "Done for you",
      price: String(SERVICE_PLAN_PRICE_EUR),
      priceCurrency: "EUR",
      description: `12 buyer questions, ${RECHECK_CADENCE.en.adjective} re-testing, answer page created and hosted for you, placement on the sources AI trusts. Nothing to install.`,
    },
  ],
} as const;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = localeFromHeaders(await headers());

  return (
    <html
      lang={locale}
      className={`${dmSerifDisplay.variable} ${dmSans.variable} h-full`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
      </head>
      <body className="min-h-full bg-[#09090B] text-[#F0F0EC] antialiased">
        {children}
        <Analytics />
        <PostHogInit />
      </body>
    </html>
  );
}
