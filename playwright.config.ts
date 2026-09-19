import { defineConfig } from "@playwright/test";

/**
 * E2E for the killer demo. Expects the demo stack running (`pnpm demo`)
 * or reachable via E2E_BASE_URL — tests drive REAL transactions, so the
 * api must have demo keys configured (demo.mjs does this).
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
