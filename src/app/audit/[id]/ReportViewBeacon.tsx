"use client";

import { useEffect } from "react";

type ReportViewBeaconProps = {
  auditId: string;
  brandName: string;
  websiteUrl: string;
  auditTier: string;
  complete: boolean;
  failed: boolean;
};

/**
 * Capteur de `report_viewed` — la north star.
 *
 * Avant : la page serveur appelait `recordFunnelEvent` à chaque rendu. Donc un
 * F5 comptait, un pré-rendu comptait, un crawler comptait, et nos propres
 * vérifications de liens comptaient — +10 vues en une matinée le 27/07, sur un
 * total de 59. Le capteur était indiscernable de notre automatisation.
 *
 * Maintenant : l'événement part du NAVIGATEUR, donc il n'existe que si une page
 * a réellement été peinte, et il porte un `User-Agent` et un `referrer` réels que
 * `/api/funnel` peut filtrer (voir `src/lib/traffic-filter.ts`).
 *
 * Trois garde-fous ici, le reste est côté serveur :
 *
 *  1. UNE vue par session et par audit. La clé de dédup est
 *     `report_viewed:<auditId>:<sessionId>`, et `recordFunnelEvent` a déjà un
 *     `ON CONFLICT (dedupe_key) DO NOTHING` : le F5 et le retour arrière sont
 *     absorbés par la base, pas par une promesse côté client.
 *  2. Un garde en mémoire (`sent`) pour le double-effet de React en mode strict,
 *     qui sinon enverrait deux requêtes identiques à chaque montage en dev.
 *  3. Rien ne part tant que l'onglet n'a pas été visible. Un onglet ouvert en
 *     arrière-plan (cmd+clic, restauration de session, préchargement) n'est pas
 *     une lecture de rapport.
 *
 * `sendBeacon` plutôt que `fetch` : la mesure ne doit jamais retarder le rendu ni
 * mourir si le lecteur referme aussitôt.
 */

const SESSION_KEY = "gp_sid";
const sent = new Set<string>();

function sessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_KEY, generated);
    return generated;
  } catch {
    // Navigation privée ou stockage refusé : on retombe sur une granularité au
    // jour. On perd la finesse, on ne regagne PAS le double comptage — c'est le
    // bon sens du compromis, un rapport lu deux fois le même jour par le même
    // visiteur sans stockage compte une fois.
    return `nosession-${new Date().toISOString().slice(0, 10)}`;
  }
}

function trafficSource(): string {
  try {
    const explicit = new URLSearchParams(window.location.search).get("src");
    if (explicit) return `param:${explicit.slice(0, 60)}`;

    const referrer = document.referrer;
    if (!referrer) return "direct";

    const host = new URL(referrer).hostname;
    return host === window.location.hostname ? "internal_nav" : `ref:${host.slice(0, 60)}`;
  } catch {
    return "unknown";
  }
}

export default function ReportViewBeacon({ auditId, brandName, websiteUrl, auditTier, complete, failed }: ReportViewBeaconProps) {
  useEffect(() => {
    let cancelled = false;

    function send() {
      if (cancelled) return;

      const dedupeKey = `report_viewed:${auditId}:${sessionId()}`;
      if (sent.has(dedupeKey)) return;
      sent.add(dedupeKey);

      const body = JSON.stringify({
        events: [
          {
            event_name: "report_viewed",
            audit_id: auditId,
            source: trafficSource(),
            dedupe_key: dedupeKey,
            metadata: { brandName, websiteUrl, auditTier, complete, failed },
          },
        ],
      });

      try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const delivered = navigator.sendBeacon("/api/funnel", new Blob([body], { type: "application/json" }));
          if (delivered) return;
        }
        void fetch("/api/funnel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => undefined);
      } catch {
        // La mesure ne casse jamais la page.
      }
    }

    if (document.visibilityState === "visible") {
      send();
      return () => {
        cancelled = true;
      };
    }

    document.addEventListener("visibilitychange", send, { once: true });
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", send);
    };
  }, [auditId, auditTier, brandName, complete, failed, websiteUrl]);

  return null;
}
