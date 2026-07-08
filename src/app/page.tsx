import { headers } from "next/headers";
import HomeClient from "./HomeClient";
import { localeFromHeaders } from "@/lib/i18n";

export default async function Home() {
  const locale = localeFromHeaders(await headers());

  return <HomeClient locale={locale} />;
}
