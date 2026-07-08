"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type AuditPollerProps = {
  locale: "en" | "fr";
  auditId: string;
  email: string;
  brandName: string;
  websiteUrl: string;
  complete: boolean;
};

export default function AuditPoller({ auditId, email, brandName, websiteUrl, complete, locale }: AuditPollerProps) {
  const router = useRouter();

  useEffect(() => {
    if (complete) return;

    void fetch("/api/run-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audit_id: auditId,
        email,
        brand_name: brandName,
        website_url: websiteUrl,
        locale,
      }),
    }).finally(() => router.refresh());

    const interval = window.setInterval(() => router.refresh(), 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [auditId, brandName, complete, email, locale, router, websiteUrl]);

  return null;
}
