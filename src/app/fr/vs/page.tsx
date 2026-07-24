import type { Metadata } from "next";
import VsComparison from "../../vs/VsComparison";
import { vsCopy } from "@/lib/vs-comparison";

export const dynamic = "force-static";

// CANONIQUE = www tant que l'apex getpick.ai n'est pas déclaré dans le projet
// Vercel (son certificat SSL ne le couvre pas). Voir src/app/robots.ts.
const siteUrl = "https://www.getpick.ai";
const canonical = `${siteUrl}/fr/vs`;

export const metadata: Metadata = {
  title: vsCopy.fr.metaTitle,
  description: vsCopy.fr.metaDescription,
  alternates: {
    canonical,
    // hreflang croisé : la version EN vit sur /vs.
    languages: { en: `${siteUrl}/vs` },
  },
  openGraph: {
    title: vsCopy.fr.metaTitle,
    description: vsCopy.fr.metaDescription,
    url: canonical,
    siteName: "GetPick",
    locale: "fr_FR",
    type: "article",
  },
};

export default function FrenchVsPage() {
  return <VsComparison locale="fr" />;
}
