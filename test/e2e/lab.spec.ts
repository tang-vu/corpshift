import { expect, test } from "@playwright/test";

/**
 * Killer-demo E2E — drives the real stack through the browser.
 * Run `pnpm demo` first (or point E2E_BASE_URL at a deployed instance).
 */

test.describe("landing", () => {
  test("hero + pipeline render with live counts", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("DeFi must change with it");
    await expect(page.getByText("Live pipeline")).toBeVisible();
    await expect(page.getByText("indexed actions")).toBeVisible();
    await expect(page.getByText("FORWARD_SPLIT 4:1 attested")).toBeVisible();
  });
});

test.describe("protocol lab", () => {
  test("killer demo: naive liquidates, aware protects — all real txs", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/lab");
    await expect(page.getByRole("heading", { name: "Protocol Lab" })).toBeVisible();
    await expect(page.getByText("NaiveVault")).toBeVisible();
    await expect(page.getByText("CorpShiftAwareVault")).toBeVisible();

    // fresh run — reset then click through all six steps. Reset must restore
    // the verified-clean baseline (uiMultiplier 1.00×), not just claim to.
    await page.getByRole("button", { name: "reset" }).click();
    await expect(page.getByText("chain reverted to post-deploy snapshot")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("1.00×").first()).toBeVisible({ timeout: 30_000 });

    const steps = [
      "Seed positions",
      "Attest 4:1 split",
      "Probe the vaults",
      "Execute split",
      "Reconcile",
      "Liquidation test",
    ];
    for (let i = 0; i < steps.length; i++) {
      const btn = page.getByRole("button", { name: new RegExp(`▶ ${steps[i]}`, "i") });
      await expect(btn).toBeEnabled({ timeout: 30_000 });
      await btn.click();
      // completion is observable: the action button advances to the next
      // step's label once the api finishes + state refreshes
      const next = steps[i + 1];
      await expect(
        page.getByRole("button", {
          name: next ? new RegExp(`▶ ${next}`, "i") : /scenario complete/i,
        }),
      ).toBeVisible({ timeout: 90_000 });
    }

    // ── the objectively measurable divergence ──
    // naive vault: seized (LIQUIDATED badge, zero collateral)
    await expect(page.getByText("LIQUIDATED")).toBeVisible();

    // aware vault: healthy — 40 units × $25 = $1,000 → HF 2.00
    await expect(page.getByTestId("hf-aware")).toHaveText("2.00");

    // asset recovered to ACTIVE with the verified 4× factor
    await expect(page.getByText("ACTIVE").first()).toBeVisible();
    await expect(page.getByText("4.00×").first()).toBeVisible();
    await expect(page.getByText("$25.00")).toBeVisible();

    // execution log contains real tx hashes (0x…)
    await expect(page.locator("text=/0x[0-9a-f]{6}…/i").first()).toBeVisible();
  });
});

test.describe("actions", () => {
  test("indexed canonical actions render", async ({ page }) => {
    await page.goto("/actions");
    await expect(page.getByRole("heading", { name: "Canonical actions" })).toBeVisible();
    // fixture mode indexes the real CRWD split + the demo action
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 });
  });
});
