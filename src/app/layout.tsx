import type { Metadata } from "next";
import { DM_Serif_Display, DM_Sans } from "next/font/google";
import "./globals.css";

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Citeable — Free AI Business Visibility Audit",
  description:
    "Check whether ChatGPT and Gemini mention your business, then get a score and 3 simple fixes by email.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
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
