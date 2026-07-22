"use client";

import { useEffect } from "react";
import type { Locale } from "@/lib/i18n";

/**
 * Aligns <html lang> with the content locale of the current page.
 *
 * The root layout sets lang from Accept-Language / geo headers, which is correct
 * for `/`. Explicit routes like `/en` and `/fr` (and audit reports with a stored
 * locale) must override that so crawlers and AI engines read the right language.
 */
export default function LocaleLang({ locale }: { locale: Locale }) {
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return null;
}
