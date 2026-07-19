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
      title: "Citeable — Audit gratuit de recommandation IA",
      description: "Entre le nom de ton entreprise et ton site, puis vois si l'IA te recommande.",
    };
  }

  return {
    title: "Citeable — Free AI Recommendation Audit",
    description: "Enter your business name and website, then see whether AI recommends you.",
  };
}

/**
 * Données structurées.
 *
 * La home ne servait aucun JSON-LD : notre propre audit pénalise les marques qui
 * n'en ont pas, et nous échouions à notre propre check. Surtout, notre audit de
 * dogfooding a montré que les IA décrivaient Citeable comme « une solution no-code
 * pour les commerces locaux » — alors que l'ICP est la marque DTC / e-commerce.
 * Ce schéma déclare explicitement la catégorie et l'audience pour corriger ce
 * mauvais cadrage à la source.
 */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Citeable",
  url: "https://getciteable.nanocorp.app",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "AI visibility monitoring (GEO / AEO)",
  operatingSystem: "Web",
  description:
    "Citeable checks whether AI assistants like ChatGPT and Gemini recommend your brand when shoppers ask what to buy, names the competitors cited in your place, and gives you copy-paste fixes. Built for DTC and e-commerce brands.",
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
      description: "AI visibility audit on 3 real buyer questions.",
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
