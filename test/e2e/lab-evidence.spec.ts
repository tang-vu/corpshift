import { expect, test } from "@playwright/test";

// Fault-injection tests for the UI, deliberately distinct from lab.spec.ts's
// real-chain scenario. No chain writes are sent by these tests.
const completedState = {
  chainId: 31337,
  registry: "0x0000000000000000000000000000000000000001",
  step: 6,
  assetState: "ACTIVE",
  verifiedFactor: "4000000000000000000",
  normalizationFactor: "4000000000000000000",
  uiMultiplier: "4000000000000000000",
  price: "2500000000",
  userStockBalance: "0",
  demoActionId: null,
  pendingEffectiveAt: null,
  vaults: {
    naive: { collateralRaw: "0", collateralValue: "0", debt: "0", healthFactor: "0" },
    aware: {
      collateralRaw: "10000000000000000000",
      collateralValue: "1000000000000000000000",
      debt: "400000000",
      healthFactor: "2000000000000000000",
    },
  },
};

test("mobile navigation and evidence stay within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/v1/demo/state", (route) => route.fulfill({ json: completedState }));
  await page.goto("/lab");
  await expect(page.getByText("Verify the outcome")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole("link", { name: "Protocol Lab", exact: true })).toBeVisible();
});

test("completion metadata alone cannot claim verified protection", async ({ page }) => {
  await page.route("**/v1/demo/state", (route) => route.fulfill({ json: completedState }));
  await page.goto("/lab");
  await expect(page.getByText("Verify the outcome")).toBeVisible();
  await expect(page.getByText("verdict — same chain", { exact: false })).toHaveCount(0);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export evidence" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let body = "";
  for await (const chunk of stream!) body += chunk.toString();
  const report = JSON.parse(body);
  expect(report.verified).toBe(false);
  expect(report.state.chainId).toBe(31337);
  expect(report.executionLog).toEqual([]);
});

test("polling preserves action errors and marks stale reads", async ({ page }) => {
  let offline = false;
  await page.route("**/v1/demo/state", (route) =>
    route.fulfill(
      offline
        ? { status: 503, json: { error: "RPC unavailable" } }
        : { json: { ...completedState, step: 0 } },
    ),
  );
  await page.route("**/v1/demo/step", (route) =>
    route.fulfill({ status: 500, json: { error: "Transaction reverted" } }),
  );
  await page.goto("/lab");
  await page.getByRole("button", { name: /Seed positions/ }).click();
  await expect(page.getByRole("alert")).toContainText("Transaction reverted");
  const poll = page.waitForResponse("**/v1/demo/state");
  await poll;
  await expect(page.getByRole("alert")).toContainText("Transaction reverted");
  offline = true;
  await expect(page.getByRole("alert")).toContainText("Displayed values may be stale");
  await expect(page.getByRole("button", { name: "Export evidence" })).toBeDisabled();
});
