import { defineConfig, devices } from "@playwright/test";

// Config E2E par défaut du repo (specs de `./e2e`).
// Serveur : next dev sur le port 3311 (réutilisé s'il tourne déjà).
//
// CE FICHIER EST VERSIONNÉ, ET C'EST LE POINT. Il est resté non suivi pendant
// deux stories : les specs étaient commités, mais sans testDir ni baseURL un
// clone propre les lançait sur « Cannot navigate to invalid URL ». La preuve
// e2e n'était donc rejouable que dans l'arbre de travail de qui l'avait écrite —
// ni en CI, ni par un reviewer. Un spec sans sa config n'est pas une preuve.
const PORT = 3311;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `PORT=${PORT} npm run dev`,
    url: `${BASE_URL}/vs`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
