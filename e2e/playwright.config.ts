import { defineConfig } from "@playwright/test";

// The frontend dev server proxies /api to :8787 (vite.config.ts), so the backend under
// test must run there. Both servers are started by Playwright against a throwaway
// Postgres that global-setup loads with a fixture.
export const E2E_DATABASE_URL = "postgres://postgres:postgres@localhost:5544/patientdedupe_e2e";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5188",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm --prefix ../backend run start",
      url: "http://localhost:8799/api/health",
      timeout: 60000,
      reuseExistingServer: false,
      env: { DATABASE_URL: E2E_DATABASE_URL, PORT: "8799", NODE_ENV: "development" },
    },
    {
      command: "npm --prefix ../frontend run dev -- --port 5188 --strictPort",
      url: "http://localhost:5188",
      timeout: 120000,
      reuseExistingServer: false,
      env: { VITE_API_PROXY: "http://localhost:8799" },
    },
  ],
});
