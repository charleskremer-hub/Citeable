"use client";

import type { ReactNode } from "react";
import { MONITOR_CHECKOUT_URL, MONITOR_TEST_CHECKOUT_URL } from "@/lib/checkout-links";

type FunnelCheckoutLinkProps = {
  auditId: string;
  href: string;
  className?: string;
  source: string;
  children: ReactNode;
};

/**
 * Le plan est déduit de la destination réelle, jamais codé en dur : ce composant
 * sert à la fois Monitor 9 € (carte + actions) et Agent 19 € (teaser). L'attribut
 * PostHog était figé sur "agent_19eur", donc les clics Monitor — la majorité —
 * remontaient sous le mauvais plan et faussaient l'analyse de conversion.
 */
function planFromHref(href: string) {
  return href === MONITOR_CHECKOUT_URL || href === MONITOR_TEST_CHECKOUT_URL ? "monitor_9eur" : "agent_19eur";
}

/**
 * Checkout CTA with funnel tracking.
 *
 * The tracking call must NEVER stand between the buyer and Stripe. A previous
 * version called event.preventDefault() and navigated with window.location.assign()
 * after the /api/funnel fetch settled (or a 900ms timeout). That made the single
 * most valuable click on the site depend on JS succeeding, and it silently broke
 * cmd/ctrl+click and middle-click (they fire onClick, so they were hijacked into
 * a same-tab navigation).
 *
 * Now: navigation is the browser's native anchor behaviour, and the event is sent
 * with sendBeacon, which is designed to survive page unload. fetch(keepalive) is
 * kept as a fallback for the rare browser without sendBeacon.
 */
export default function FunnelCheckoutLink({ auditId, href, className, source, children }: FunnelCheckoutLinkProps) {
  function handleClick() {
    const plan = planFromHref(href);
    const body = JSON.stringify({
      events: [
        {
          event_name: "teaser_cta_click",
          audit_id: auditId,
          source,
          metadata: { checkout_url: href, plan },
        },
        {
          event_name: "checkout_opened",
          audit_id: auditId,
          source,
          metadata: { checkout_url: href, plan },
        },
      ],
    });

    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const sent = navigator.sendBeacon("/api/funnel", new Blob([body], { type: "application/json" }));
        if (sent) return;
      }

      void fetch("/api/funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // Tracking must never block the checkout.
    }
  }

  return (
    <a
      href={href}
      className={className}
      onClick={handleClick}
      data-ph-capture-attribute-plan={planFromHref(href)}
      data-ph-capture-attribute-source={source}
    >
      {children}
    </a>
  );
}
