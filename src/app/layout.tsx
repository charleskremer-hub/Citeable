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
