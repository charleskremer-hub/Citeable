import type { Metadata } from "next";
import { headers } from "next/headers";
import { DM_Serif_Display, DM_Sans } from "next/font/google";
import "./globals.css";
import { localeFromHeaders } from "@/lib/i18n";

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
      title: "GetPick — L'agent GEO des marques DTC",
      description: "Il fait recommander ta marque par ChatGPT et Gemini — diagnostic, contenu, suivi. Sans agence. Audit gratuit en 2 minutes.",
    };
  }

  return {
    title: "GetPick — The GEO agent for DTC brands",
    description: "It gets your brand recommended by ChatGPT and Gemini — diagnosis, content, monitoring. No agency needed. Free audit in 2 minutes.",
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
    "GetPick is the GEO agent for DTC brands. It gets your brand recommended by AI assistants like ChatGPT and Gemini: it sends real buying questions to the AIs live, names the rival recommended in your place, writes the copy-paste fixes, and monitors weekly. The work a GEO agency charges 2,000-20,000 EUR/month for, at a flat tool price.",
  audience: {
    "@type": "Audience",
    audienceType: "Direct-to-consumer and e-commerce brands",
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
      name: "Monitor",
      price: "9",
      priceCurrency: "EUR",
      description: "12 buyer questions, weekly tracking and copy-paste fixes.",
    },
    {
      "@type": "Offer",
      name: "Agent",
      price: "19",
      priceCurrency: "EUR",
      description: "Interactive chat over your audit data.",
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
        <script
          src="https://phospho-nanocorp-prod--nanocorp-api-fastapi-app.modal.run/analytics/v1.js?c=9ce8bf27-b673-4c40-8ef6-ddfa5a1d7504"
          defer
        />
      </head>
      <body className="min-h-full bg-[#09090B] text-[#F0F0EC] antialiased">
        {children}
      </body>
    </html>
  );
}
