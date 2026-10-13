import { defineConfig, devices } from "playwright/test";

const baseURL = "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./tests/e2e-integration",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalTeardown: "./scripts/testing/e2e-teardown.mjs",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium-integration", use: { ...devices["Desktop Chrome"], locale: "ja-JP", timezoneId: "Asia/Tokyo" } }],
  webServer: [
    {
      command: "node scripts/testing/e2e-database.mjs setup && node apps/server/dist/server.js",
      url: "http://127.0.0.1:3001/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "cd apps/client && ../../node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
