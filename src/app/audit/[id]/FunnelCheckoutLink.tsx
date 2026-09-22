"use client";

import type { ReactNode } from "react";
import { MONITOR_CHECKOUT_URL, MONITOR_TEST_CHECKOUT_URL, SERVICE_CHECKOUT_URL } from "@/lib/checkout-links";

type FunnelCheckoutLinkProps = {
  auditId: string;
  href: string;
  className?: string;
  source: string;
  /**
   * `false` quand la caisse n'est pas configurée et que `href` retombe sur une
   * ancre de la landing. Le lien reste cliquable et `teaser_cta_click` part
   * toujours — c'est l'intérêt qu'il mesure — mais `checkout_opened` NE PART
   * PAS : il n'y a pas de caisse à ouvrir. Un compteur de caisse qui bouge sans
   * caisse est pire qu'un compteur à zéro (fail-safe de `checkout-links.ts`,
   * 31/07, et défaut de caisse mesuré le 14/09).
   */
  checkoutConfigured?: boolean;
  children: ReactNode;
};

/**
 * Le plan est déduit de la destination réelle, jamais codé en dur. Depuis le
 * pivot du 22/09 la destination vendue à un prospect est l'offre unique
 * `service_69eur` ; `monitor_9eur` et `agent_19eur` restent reconnus parce que
 * des liens de ces deux paliers vivent encore dans des emails déjà envoyés et
 * dans les surfaces réservées aux clients existants.
 *
 * L'ordre des tests compte : une chaîne VIDE ne désigne aucun plan. Les trois
 * constantes peuvent valoir "" en même temps (fail-safe), donc chaque
 * comparaison exige d'abord que `href` soit non vide, sinon le repli
 * `#pricing` serait attribué au premier plan de la liste.
 */
function planFromHref(href: string) {
  if (!href) return "none";
  if (href === SERVICE_CHECKOUT_URL) return "service_69eur";
  if (href === MONITOR_CHECKOUT_URL || href === MONITOR_TEST_CHECKOUT_URL) return "monitor_9eur";
  return "agent_19eur";
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
export default function FunnelCheckoutLink({ auditId, href, className, source, checkoutConfigured = true, children }: FunnelCheckoutLinkProps) {
  function handleClick() {
    const plan = planFromHref(href);
    const events = [
      {
        event_name: "teaser_cta_click",
        audit_id: auditId,
        source,
        metadata: { checkout_url: href, plan },
      },
    ];
    if (checkoutConfigured) {
      events.push({
        event_name: "checkout_opened",
        audit_id: auditId,
        source,
        metadata: { checkout_url: href, plan },
      });
    }
    const body = JSON.stringify({ events });

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
