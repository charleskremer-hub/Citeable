import { defineConfig } from "@playwright/test";

// Config E2E minimale — story « re-run étude 21 marques, édition juillet 2026 ».
// L'app est buildée puis servie en mode production (next start) : /study est
// force-static, on teste donc exactement ce qui sera publié.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3111",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx next start -p 3111",
    url: "http://localhost:3111/study",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
