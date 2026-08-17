import { defineConfig } from "@playwright/test";

/**
 * Config E2E de la story « le détail du rapport ne s'ouvre que sur un droit ».
 *
 * Séparée des deux autres configs parce que les critères portent sur le HTML
 * RENDU par le vrai serveur, pour des audits déjà en base : le serveur tourne
 * donc sur une base Postgres LOCALE JETABLE, et les audits sont posés en
 * fixtures. AUCUN audit n'est lancé — ni appel Gemini, ni appel payant.
 *
 * Le projet est `api` : on lit le HTML avec le contexte de requête de
 * Playwright, sans navigateur. C'est délibéré, et pas seulement pour la vitesse —
 * ouvrir la page dans un navigateur déclencherait `ReportViewBeacon`, donc un
 * `report_viewed`. On ne pollue pas la north star, même en local.
 *
 * AUCUN SITE FACTICE N'EST LANCÉ. La page sonde la lisibilité du site audité par
 * les crawlers IA ; ici ce sondage tombe sur un port fermé et rend « site
 * injoignable », ce qui n'a aucune influence sur la porte. Ne pas dépendre d'un
 * bouchon rend cette suite autoportante.
 *
 * Variables attendues (fournies par le lanceur) :
 *   E2E_DATABASE_URL   base Postgres locale jetable — JAMAIS la production
 *   E2E_GATE_PORT      port du serveur next dev (défaut 3313)
 *
 * Lancer :
 *   E2E_DATABASE_URL=postgres://…/e2e npx playwright test -c playwright.report-gate.config.ts
 */
const PORT = Number(process.env.E2E_GATE_PORT ?? 3313);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Secret de partage du run E2E. Il n'ouvre que cette base jetable : le secret de
 * production vit dans l'environnement Vercel, et jamais dans le dépôt.
 */
export const E2E_AUDIT_SHARE_SECRET = "e2e-secret-de-partage-des-rapports-daudit";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /audit-report-gate\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "api", use: {} }],
  webServer: [
    {
      command: `npx next dev -p ${PORT}`,
      url: `${BASE_URL}/api/funnel`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
        AUDIT_SHARE_SECRET: E2E_AUDIT_SHARE_SECRET,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
