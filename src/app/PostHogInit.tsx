"use client";

import { useEffect } from "react";

/**
 * PostHog Cloud EU, chargé via notre propre domaine.
 *
 * POURQUOI MAINTENANT. `HomeClient.tsx` appelle `window.posthog?.capture(...)` à
 * sept endroits — début de saisie, blocage de validation, soumission, échec,
 * clics des cartes de prix, CTA de clôture — et `FunnelCheckoutLink` pose des
 * attributs `data-ph-capture-attribute-*` sur le clic le plus cher du site.
 * Depuis la sortie de l'infrastructure d'origine, plus aucun script d'analytics
 * n'est chargé : ces sept capteurs sont écrits, corrects, et ne remontent nulle
 * part. L'optionnel `?.` les fait échouer en silence, ce qui est exactement ce
 * qui rend le trou invisible. Rebrancher PostHog les rallume tous, sans toucher
 * à une seule ligne d'appelant.
 *
 * POURQUOI PAS `posthog-js` EN DÉPENDANCE. Le chargeur officiel `array.js` pose
 * `window.posthog` — c'est précisément le contrat que les sept appelants
 * utilisent déjà, et celui que déclare `posthog.d.ts`. Passer par le paquet npm
 * imposerait soit de réécrire les sept sites d'appel, soit de recopier l'objet
 * sur `window` avec un cast. Zéro dépendance pour le même résultat.
 *
 * EU. `api_host` pointe vers notre relais (voir `next.config.ts`), qui reverse
 * vers `eu.i.posthog.com` ; `ui_host` sert uniquement à ce que les liens « voir
 * dans PostHog » ouvrent la bonne région.
 *
 * TRAFIC INTERNE. Le cookie `gp_internal=1` — le même qui fait écarter nos
 * propres événements funnel côté serveur — empêche ici le chargement complet du
 * script. Un seul geste (poser le cookie sur nos navigateurs et nos runners)
 * nettoie les deux mesures à la fois, ce qui évite qu'elles divergent.
 */

const RELAY_PATH = "/gp-relay";
const INTERNAL_COOKIE = "gp_internal";

function isInternalBrowser() {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${INTERNAL_COOKIE}=1`);
}

export default function PostHogInit() {
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    // Pas de clé = pas de script. Une clé absente est un état normal (preview,
    // développement local), pas une panne à signaler.
    if (!token) return;
    if (window.posthog?.__loaded) return;
    if (isInternalBrowser()) return;

    const script = document.createElement("script");
    script.src = `${RELAY_PATH}/static/array.js`;
    script.async = true;
    script.onload = () => {
      window.posthog?.init?.(token, {
        api_host: RELAY_PATH,
        ui_host: "https://eu.posthog.com",
        // Pas de profil de personne tant que personne n'est identifié : on mesure
        // un funnel, on ne constitue pas une base de profils.
        person_profiles: "identified_only",
        capture_pageview: true,
        capture_pageleave: true,
        persistence: "localStorage+cookie",
      });
    };

    document.head.appendChild(script);
  }, []);

  return null;
}
