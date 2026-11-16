import { defineConfig, devices } from "@playwright/test";

/**
 * Two ways to run these checks:
 *
 * 1. Against an already-running preview (the default when PLAYWRIGHT_BASE_URL
 *    is set):
 *
 *      PLAYWRIGHT_BASE_URL=https://legal-papayas-sing.freebuff.dev \
 *        bunx playwright test
 *
 * 2. Against a throwaway server that Playwright owns for the duration of the
 *    run (used in CI and when no preview is reachable):
 *
 *      bunx playwright test
 *
 * In mode 2 Playwright starts `vite` on PORT below and shuts it down when the
 * suite ends. It deliberately uses a non-default port so it never collides
 * with (or replaces) the Freebuff-managed preview on 5173.
 */
const port = Number(process.env.PLAYWRIGHT_PORT ?? 4319);
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const useOwnServer = !externalBaseUrl;

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
    baseURL: externalBaseUrl ?? `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: useOwnServer
    ? {
        command: `bunx vite --port ${port} --strictPort`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe" as const,
        stderr: "pipe" as const,
      }
    : undefined,
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
