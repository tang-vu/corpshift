import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const [label, base] = process.argv.slice(2);
if (!["before", "after"].includes(label) || !base) {
  throw new Error("Usage: node scripts/capture-review.mjs before|after http://localhost:PORT");
}
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) {
  throw new Error("Visual review must target an isolated loopback stack");
}
const dir = `docs/visual-review/${label}`;
await mkdir(dir, { recursive: true });
const assets = await fetch(`${base}/v1/assets`).then((r) => r.json());
const actions = await fetch(`${base}/v1/actions`).then((r) => r.json());
const asset = assets.assets[0]?.asset;
const action =
  actions.actions.find((a) => a.asset.toLowerCase() === asset?.toLowerCase()) ?? actions.actions[0];
if (!asset || !action) throw new Error("Seed the isolated stack and wait for indexing first");
const routes = [
  ["overview", "/"],
  ["assets", "/assets"],
  ["asset", `/assets/${asset}`],
  ["actions", "/actions"],
  ["action", `/actions/${action.actionId}`],
  ["lab", "/lab"],
  ["policy", "/policy"],
];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  // This capture is strictly read-only, including when exercising the baseline.
  await page.route("**/*", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [name, route] of routes) {
      await page.goto(base + route);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: true });
      const contentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      console.log(`${label} ${name} ${width}px: content ${contentWidth}px`);
      if (label === "after" && contentWidth > width) process.exitCode = 1;
    }
  }
} finally {
  await browser.close();
}
