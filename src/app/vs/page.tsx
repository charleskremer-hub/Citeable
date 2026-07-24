import type { Metadata } from "next";
import VsComparison from "./VsComparison";
import { vsCopy } from "@/lib/vs-comparison";

export const dynamic = "force-static";

// CANONIQUE = www tant que l'apex getpick.ai n'est pas déclaré dans le projet
// Vercel (son certificat SSL ne le couvre pas). Voir src/app/robots.ts.
const siteUrl = "https://www.getpick.ai";
const canonical = `${siteUrl}/vs`;

export const metadata: Metadata = {
  title: vsCopy.en.metaTitle,
  description: vsCopy.en.metaDescription,
  alternates: {
    canonical,
    // hreflang croisé : la version FR vit sur /fr/vs.
    languages: { fr: `${siteUrl}/fr/vs` },
  },
  openGraph: {
    title: vsCopy.en.metaTitle,
    description: vsCopy.en.metaDescription,
    url: canonical,
    siteName: "GetPick",
    locale: "en_US",
    type: "article",
  },
};

export default function VsPage() {
  return <VsComparison locale="en" />;
}
