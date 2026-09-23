import { expect, test } from "@playwright/test";

const id = `0x${"a".repeat(64)}`;
const address = `0x${"1".repeat(40)}`;

test("specimen chapter seeks and reverse scroll remain read only", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") writes.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const specimen = page.locator(".specimen-instrument");
  await expect(specimen).toBeVisible();
  await page
    .getByRole("group", { name: "Continuity chapters" })
    .getByRole("button", { name: /Attest/ })
    .click();
  await expect(specimen).toHaveAttribute("data-beat", "dock");
  await page.getByRole("button", { name: "After split" }).click();
  await expect(specimen).toHaveAttribute("data-beat", "divergence");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Before split" }).click();
  await expect(specimen).toHaveAttribute("data-beat", "approach");
  await page.getByRole("link", { name: "Enter Protocol Lab" }).click();
  expect(writes).toEqual([]);
});

test("mobile specimen keeps direct controls and a reduced-motion equivalent", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const specimen = page.locator(".specimen-instrument");
  await expect(specimen).toHaveAttribute("data-motion", "reduced");
  await expect(specimen.locator(".specimen-fallback i")).toHaveCount(10);
  await page.getByRole("button", { name: "After split" }).click();
  await expect(specimen).toHaveAttribute("data-chapter", "2");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("comparison replay uses the confirmed observation and never writes", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") writes.push(request.url());
  });
  await page.route("**/v1/demo/state", (route) =>
    route.fulfill({
      json: {
        runId: "motion-test",
        chainId: 31337,
        registry: address,
        step: 4,
        asset: address,
        assetState: "ADJUSTING",
        normalizationFactor: "4000000000000000000",
        verifiedFactor: "1000000000000000000",
        uiMultiplier: "4000000000000000000",
        price: "2500000000",
        userStockBalance: "0",
        demoActionId: id,
        pendingEffectiveAt: null,
        vaults: {
          naive: {
            collateralRaw: "10000000000000000000",
            collateralValue: "250000000000000000000",
            debt: "400000000",
            healthFactor: "500000000000000000",
          },
          aware: {
            collateralRaw: "10000000000000000000",
            collateralValue: "1000000000000000000000",
            debt: "400000000",
            healthFactor: "2000000000000000000",
          },
        },
      },
    }),
  );
  await page.route("**/v1/policy/**", (route) =>
    route.fulfill({
      json: { allowed: route.request().url().endsWith("/8"), reason: "0x" + "0".repeat(64) },
    }),
  );
  await page.goto("/lab");
  await expect(page.getByTestId("comparison-instrument")).toContainText("$250 observed");
  await expect(page.getByTestId("comparison-instrument")).toContainText("$1,000 observed");
  await expect(page.locator(".comparison-policy")).toContainText("PRICE_READ · allowed");
  await page.getByRole("button", { name: /Replay visual/ }).click();
  await page.getByRole("button", { name: /Replay visual/ }).click();
  expect(writes).toEqual([]);
});

test("dossier orders actual indexed events and shows an evidence gap", async ({ page }) => {
  await page.route(`**/v1/actions/${id}`, (route) =>
    route.fulfill({
      json: {
        actionId: id,
        asset: address,
        actionType: "FORWARD_SPLIT",
        status: "SCHEDULED",
        announcedAt: 1,
        effectiveAt: 2,
        observedAt: 3,
        submittedAt: 4,
        params: "0x",
        paramsHash: id,
        evidenceHash: id,
        evidence: {},
        attestedBy: address,
        txHash: `0x${"b".repeat(64)}`,
        trust: "attested",
        error: null,
        events: [
          {
            id: 2,
            block_number: 12,
            log_index: 0,
            event_name: "ActionUpdated",
            tx_hash: `0x${"c".repeat(64)}`,
            asset: address,
            action_id: id,
            data: "0x",
          },
          {
            id: 1,
            block_number: 11,
            log_index: 0,
            event_name: "ActionSubmitted",
            tx_hash: `0x${"d".repeat(64)}`,
            asset: address,
            action_id: id,
            data: "0x",
          },
        ],
      },
    }),
  );
  await page.goto(`/actions/${id}`);
  const path = page.locator(".dossier-event-track");
  await expect(path).toContainText("ActionSubmitted");
  const text = await path.innerText();
  expect(text.indexOf("ActionSubmitted")).toBeLessThan(text.indexOf("ActionUpdated"));
  await expect(page.locator(".dossier-evidence-gap")).toContainText("not present");
});
