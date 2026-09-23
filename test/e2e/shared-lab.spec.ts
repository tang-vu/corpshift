import { expect, test } from "@playwright/test";

const state = {
  chainId: 31337,
  registry: "0x0000000000000000000000000000000000000001",
  runId: "run-a",
  step: 0,
  assetState: "ACTIVE",
  verifiedFactor: "1000000000000000000",
  normalizationFactor: "1000000000000000000",
  uiMultiplier: "1000000000000000000",
  price: "10000000000",
  userStockBalance: "0",
  demoActionId: null,
  vaults: Object.fromEntries(
    ["naive", "aware"].map((k) => [
      k,
      { collateralRaw: "0", collateralValue: "0", debt: "0", healthFactor: "0" },
    ]),
  ),
};

test("rate limits respect Retry-After without replaying writes", async ({ page }) => {
  let writes = 0;
  await page.route("**/v1/demo/state", (r) => r.fulfill({ json: state }));
  await page.route("**/v1/demo/step", (r) => {
    writes++;
    return r.fulfill({
      status: 429,
      headers: { "Retry-After": "3" },
      json: { error: "Shared write limit" },
    });
  });
  await page.goto("/lab");
  await page.getByRole("button", { name: /Seed positions/ }).click();
  await expect(page.getByText(/retry available in/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Seed positions/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Seed positions/ })).toBeEnabled({
    timeout: 10000,
  });
  expect(writes).toBe(1);
  await expect(page.getByRole("alert")).toContainText("Shared write limit");
});

test("ambiguous transport failure reads state before another mutation", async ({ page }) => {
  let writes = 0;
  let unavailable = false;
  await page.route("**/v1/demo/state", (r) =>
    r.fulfill(unavailable ? { status: 503, json: { error: "RPC offline" } } : { json: state }),
  );
  await page.route("**/v1/demo/step", async (r) => {
    writes++;
    unavailable = true;
    await r.abort("timedout");
  });
  await page.goto("/lab");
  await page.getByRole("button", { name: /Seed positions/ }).click();
  await expect(page.getByText(/Request outcome uncertain/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Seed positions/ })).toBeDisabled();
  unavailable = false;
  await expect(page.getByRole("button", { name: /Seed positions/ })).toBeEnabled({
    timeout: 10000,
  });
  expect(writes).toBe(1);
  await expect(page.getByRole("alert")).toBeVisible();
});

test("a reset at the same step invalidates session execution evidence", async ({ page }) => {
  let current = { ...state };
  await page.route("**/v1/demo/state", (r) => r.fulfill({ json: current }));
  await page.route("**/v1/demo/step", (r) => {
    current = { ...current, step: 1 };
    return r.fulfill({
      json: { step: "seed", runId: "run-a", ok: true, detail: "Seed receipt observed", txs: [] },
    });
  });
  await page.goto("/lab");
  await page.getByRole("button", { name: /Seed positions/ }).click();
  await expect(page.getByText("Seed receipt observed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Attest 4:1/ })).toBeEnabled();
  current = { ...current, runId: "run-b" };
  await expect(page.getByText(/Shared lab changed outside/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Seed receipt observed", { exact: true })).toHaveCount(0);
});

test("policy reads show independent failure and returned denial reason", async ({ page }) => {
  const asset = "0x" + "1".repeat(40);
  await page.route("**/v1/assets", (r) =>
    r.fulfill({ json: { assets: [{ asset, state: "ADJUSTING" }] } }),
  );
  await page.route("**/v1/policy/**", (r) =>
    r.fulfill(
      r.request().url().endsWith("/0")
        ? { status: 503, json: { error: "RPC offline" } }
        : { json: { allowed: false, reason: "ADJUSTING" } },
    ),
  );
  await page.goto("/policy");
  await expect(page.getByText("FAILED", { exact: true })).toBeVisible();
  await expect(page.getByText("Read failed: RPC offline")).toBeVisible();
  await expect(page.getByText("Returned reason: ADJUSTING").first()).toBeVisible();
  await expect(page.getByText("LOADING", { exact: true })).toHaveCount(0);
});

test("visual replay and chapter controls are read-only and keyboard accessible", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") writes.push(r.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "04 Protect" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Agreement restored")).toBeVisible();
  await page.route("**/v1/demo/state", (r) => r.fulfill({ json: state }));
  await page.goto("/lab");
  await page.getByRole("button", { name: /Replay visual/ }).click();
  expect(writes).toEqual([]);
});

test("duplicate clicks cannot advance two shared steps", async ({ page }) => {
  let writes = 0;
  let current = { ...state };
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/v1/demo/state", (r) => r.fulfill({ json: current }));
  await page.route("**/v1/demo/step", async (r) => {
    writes++;
    await pending;
    current = { ...state, step: 1 };
    await r.fulfill({
      json: { step: "seed", runId: "run-a", ok: true, detail: "One seed only", txs: [] },
    });
  });
  await page.goto("/lab");
  const button = page.getByRole("button", { name: /Seed positions/ });
  await button.evaluate((element: HTMLButtonElement) => {
    element.click();
    element.click();
  });
  await expect.poll(() => writes).toBe(1);
  release();
  await expect(page.getByRole("button", { name: /Attest 4:1/ })).toBeEnabled();
  expect(writes).toBe(1);
});

test("an incomplete policy response stays unknown instead of implying permission", async ({
  page,
}) => {
  const asset = "0x" + "2".repeat(40);
  await page.route("**/v1/assets", (r) =>
    r.fulfill({ json: { assets: [{ asset, state: "ACTIVE" }] } }),
  );
  await page.route("**/v1/policy/**", (r) => r.fulfill({ json: {} }));
  await page.goto("/policy");
  await expect(page.getByText("UNKNOWN", { exact: true })).toHaveCount(9);
  await expect(page.getByText("ALLOWED", { exact: true })).toHaveCount(0);
  await expect(page.getByText("BLOCKED", { exact: true })).toHaveCount(0);
});

test("asset register filters supported addresses and conditions with an explicit empty state", async ({
  page,
}) => {
  const rows = ["ACTIVE", "ADJUSTING"].map((state, i) => ({
    asset: "0x" + String(i + 1).repeat(40),
    state,
    normalizationFactor: "4000000000000000000",
    verifiedFactor: "1000000000000000000",
    pendingActionId: "0x" + "0".repeat(64),
  }));
  await page.route("**/v1/assets", (r) => r.fulfill({ json: { assets: rows } }));
  await page.goto("/assets");
  await page.getByRole("combobox").selectOption("ADJUSTING");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("searchbox").fill("no-match");
  await expect(
    page.getByText("No matching assets. Clear the search or change the condition."),
  ).toBeVisible();
  await page.getByRole("searchbox").fill("2222");
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("a reset racing with a named response cannot reuse an earlier run's evidence", async ({
  page,
}) => {
  let current = { ...state, step: 2 };
  await page.route("**/v1/demo/state", (r) => r.fulfill({ json: current }));
  await page.route("**/v1/demo/step", (r) => {
    current = { ...current, step: 3, runId: "run-b" };
    return r.fulfill({
      json: {
        step: "probe",
        runId: "run-b",
        ok: true,
        detail: "Different run probe",
        txs: [],
        reverts: [{ error: "UnsafeAssetState" }],
      },
    });
  });
  await page.goto("/lab");
  await page.getByRole("button", { name: /Probe the vaults/ }).click();
  await expect(page.getByText(/Execution evidence cannot be associated confidently/)).toBeVisible();
  await expect(page.getByText("Different run probe", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Execute split/ })).toBeEnabled();
});
