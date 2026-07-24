import type { Metadata } from "next";
import { headers } from "next/headers";
import { DM_Serif_Display, DM_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { localeFromHeaders } from "@/lib/i18n";

/**
 * Google Analytics 4 — piloté par `NEXT_PUBLIC_GA_MEASUREMENT_ID` (à poser sur
 * Vercel, jamais en dur ici). Absente, aucun script GA n'est rendu : le build
 * reste propre en local et en preview. GA4 apporte le haut de funnel qui nous
 * manquait (sessions, sources d'acquisition) — le trafic est le goulot (ICP §9).
 * La conversion audit → email reste mesurée côté serveur (`funnel_events`).
 */
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

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
        {GA_MEASUREMENT_ID ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
            </Script>
          </>
        ) : null}
      </head>
      <body className="min-h-full bg-[#09090B] text-[#F0F0EC] antialiased">
        {children}
      </body>
    </html>
  );
}
