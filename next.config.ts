import type { NextConfig } from "next";

/**
 * Relais PostHog Cloud EU.
 *
 * Le chemin n'est ni `/ingest` ni `/e` : ces deux-là sont dans toutes les listes
 * de filtrage publiques, donc proxifier vers eux ne sert à rien. Un chemin propre
 * au produit fait que la mesure passe par notre domaine — première partie, un
 * seul domaine à déclarer dans la politique de confidentialité, et pas de requête
 * tierce vers un domaine d'analytics.
 *
 * Destination EU, volontairement : nos prospects et nos clients sont européens,
 * la prospection est encadrée par le RGPD, et faire transiter les événements par
 * l'instance US ajouterait un transfert hors UE à documenter pour zéro gain.
 *
 * Les deux règles `static` et `array` DOIVENT précéder l'attrape-tout : Next
 * évalue les réécritures dans l'ordre du tableau.
 */
const POSTHOG_RELAY_PATH = "/gp-relay";

const nextConfig: NextConfig = {
  // PostHog appelle ses endpoints avec un slash final. Sans ceci, Next répond une
  // redirection que le SDK ne suit pas, et les événements disparaissent en silence.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: `${POSTHOG_RELAY_PATH}/static/:path*`,
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: `${POSTHOG_RELAY_PATH}/array/:path*`,
        destination: "https://eu-assets.i.posthog.com/array/:path*",
      },
      {
        source: `${POSTHOG_RELAY_PATH}/:path*`,
        destination: "https://eu.i.posthog.com/:path*",
      },
    ];
  },
};

export default nextConfig;
