"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type AuditPollerProps = {
  auditId: string;
  email: string;
  brandName: string;
  websiteUrl: string;
  complete: boolean;
};

export default function AuditPoller({ auditId, email, brandName, websiteUrl, complete }: AuditPollerProps) {
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
      }),
    }).finally(() => router.refresh());

    const interval = window.setInterval(() => router.refresh(), 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [auditId, brandName, complete, email, router, websiteUrl]);

  return null;
}
