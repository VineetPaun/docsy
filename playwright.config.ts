import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration (AUDIT.md §10).
 *
 * Specs are `*.e2e.ts`, not `*.spec.ts`, because `bun test` claims `.spec.ts`
 * by default and would try to run Playwright files as unit tests.
 *
 * Not wired into CI: booting the app needs a real Clerk publishable key, and
 * the flow worth testing needs a signed-in user, Qdrant, an embeddings key and
 * an LLM key. Run it locally against a configured `.env.local`:
 *
 *   bunx playwright install chromium   # once
 *   bun run e2e
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts/,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // The responsive work in §9.1 was written by reading; this is the profile
    // to run it under once there is a signed-in session to test with.
    { name: "mobile", use: { ...devices["iPhone 14"] } },
  ],

  // Reuses a server you already have running, which is the usual case here —
  // `bunx convex dev` has to be running alongside it either way.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "bun dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
