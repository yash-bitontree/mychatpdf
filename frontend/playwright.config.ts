import { defineConfig, devices } from "@playwright/test";

const e2eHost = process.env.E2E_HOST ?? "0.0.0.0";
const e2ePort = process.env.E2E_PORT ?? "5173";
const e2eConnectHost = e2eHost === "0.0.0.0" ? "localhost" : e2eHost;
const e2eBaseUrl = process.env.E2E_BASE_URL ?? `http://${e2eConnectHost}:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry"
  },
  webServer: {
    command: `node e2e/write-fixture.mjs && npm run dev -- --host ${e2eHost}`,
    url: e2eBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_API_BASE_URL: process.env.E2E_API_BASE_URL ?? "",
      VITE_E2E_AUTH_BYPASS: "true"
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
