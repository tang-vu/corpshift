import { expect, test } from "@playwright/test";

test("split illustration explains the units without sending a transaction", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") writes.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "After split" }).click();
  await expect(page.getByRole("button", { name: "After split" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("40 × $25", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Before split" }).click();
  await expect(page.getByText("10 × $100", { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await page.getByRole("link", { name: "Inspect. Execute. Verify." }).click();
  await expect(page.getByRole("heading", { name: "Protocol Lab" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("mobile overview and data pages keep content inside the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/assets", "/actions", "/policy"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (route !== "/") await expect(page.locator("table").first()).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      route,
    ).toBeLessThanOrEqual(390);
  }
});
