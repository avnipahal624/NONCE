import { defineConfig, devices } from "@playwright/test";

/**
 * Run against an already-running preview:
 *
 *   PLAYWRIGHT_BASE_URL=https://legal-papayas-sing.freebuff.dev \
 *     bunx playwright test
 *
 * The config deliberately does not start a Vite dev server. The Freebuff
 * platform owns the preview process, and E2E tests must not create a second one.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
