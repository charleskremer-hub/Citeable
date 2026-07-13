"use client";

import type { ReactNode } from "react";

type FunnelCheckoutLinkProps = {
  auditId: string;
  href: string;
  className?: string;
  source: string;
  children: ReactNode;
};

export default function FunnelCheckoutLink({ auditId, href, className, source, children }: FunnelCheckoutLinkProps) {
  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();

    let opened = false;
    const openCheckout = () => {
      if (opened) return;
      opened = true;
      window.location.assign(href);
    };

    const body = JSON.stringify({
      events: [
        {
          event_name: "teaser_cta_click",
          audit_id: auditId,
          source,
          metadata: { checkout_url: href },
        },
        {
          event_name: "checkout_opened",
          audit_id: auditId,
          source,
          metadata: { checkout_url: href },
        },
      ],
    });

    const timeout = window.setTimeout(openCheckout, 900);

    fetch("/api/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(timeout);
        openCheckout();
      });
  }

  return (
    <a
      href={href}
      className={className}
      onClick={handleClick}
      data-ph-capture-attribute-plan="agent_19eur"
      data-ph-capture-attribute-source={source}
    >
      {children}
    </a>
  );
}
