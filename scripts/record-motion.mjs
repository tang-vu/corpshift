#!/usr/bin/env node
/** Record the actual app against a dedicated local demo stack. This script resets it. */
import { chromium } from "@playwright/test";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const base = process.env.MOTION_RECORD_BASE_URL;
if (!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) {
  throw new Error(
    "Set MOTION_RECORD_BASE_URL to an isolated loopback demo stack; the recorder resets it.",
  );
}
const out = resolve(process.env.MOTION_RECORD_OUT ?? "data/motion-review");
await mkdir(out, { recursive: true });
const stampResponse = await fetch(`${base}/build-stamp.json`);
if (!stampResponse.ok) throw new Error("Record against a built preview with a build stamp.");
const stamp = await stampResponse.json();
if (!/^[0-9a-f]{40}$/.test(stamp.sourceSha) || !stamp.builtAt) {
  throw new Error("Built preview has an invalid frontend build stamp.");
}
await writeFile(
  resolve(out, "recording-manifest.json"),
  JSON.stringify({ preview: base, ...stamp, recordedAt: new Date().toISOString() }, null, 2),
);
const browser = await chromium.launch();
const observations = [];

async function run(name, viewport) {
  const context = await browser.newContext({ viewport, recordVideo: { dir: out, size: viewport } });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(base);
  await page.locator(".specimen-instrument").waitFor();
  await page.waitForTimeout(2300);
  if (name === "desktop") {
    const bounds = await page.evaluate(() => {
      const hero = document.querySelector(".editorial-hero");
      if (!hero) throw new Error("Hero unavailable");
      const start = hero.getBoundingClientRect().top + scrollY;
      return { start, end: start + hero.clientHeight - innerHeight };
    });
    for (const [beat, progress] of Object.entries({
      approach: 0.08,
      dock: 0.22,
      partition: 0.45,
      divergence: 0.65,
      reconcile: 0.82,
      carry: 0.95,
    })) {
      await page.evaluate(
        (y) => window.scrollTo({ top: y, behavior: "instant" }),
        bounds.start + (bounds.end - bounds.start) * progress,
      );
      await page.waitForTimeout(600);
      await page.screenshot({ path: resolve(out, `${name}-specimen-${beat}.png`) });
      observations.push({
        viewport: name,
        scene: "specimen",
        beat,
        observedBeat: await page.locator(".specimen-instrument").getAttribute("data-beat"),
      });
    }
  } else {
    for (const label of ["Observe", "Attest", "Reconcile", "Protect"]) {
      await page
        .getByRole("group", { name: "Continuity chapters" })
        .getByRole("button", { name: new RegExp(label) })
        .click();
      await page.locator(".specimen-stage").scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      await page.screenshot({ path: resolve(out, `${name}-specimen-${label.toLowerCase()}.png`) });
      observations.push({
        viewport: name,
        scene: "specimen",
        beat: label,
        observedBeat: await page.locator(".specimen-instrument").getAttribute("data-beat"),
      });
    }
  }

  await page.goto(`${base}/lab`);
  await page.getByRole("button", { name: "Reset shared lab" }).click();
  await page.waitForFunction(async () => (await (await fetch("/v1/demo/state")).json()).step === 0);
  const labels = [
    /Seed positions/,
    /Attest 4:1 split/,
    /Probe the vaults/,
    /Execute split/,
    /Reconcile/,
    /Liquidation test/,
  ];
  for (let step = 1; step <= labels.length; step++) {
    await page.getByRole("button", { name: labels[step - 1] }).click();
    await page.waitForFunction(
      async (expected) => (await (await fetch("/v1/demo/state")).json()).step === expected,
      step,
    );
    await page.waitForFunction((expected) => {
      const label = document.querySelector(".lab-action-dock strong")?.textContent ?? "";
      return label.includes(
        expected === 6 ? "Six-step scenario complete" : `Step ${expected + 1} of 6`,
      );
    }, step);
    await page.locator(".comparison-instrument").scrollIntoViewIfNeeded();
    await page.waitForTimeout(2200);
    if ([2, 4, 5, 6].includes(step)) {
      await page.screenshot({ path: resolve(out, `${name}-lab-step-${step}.png`) });
      observations.push({
        viewport: name,
        scene: "lab",
        step,
        text: await page.locator(".comparison-instrument").innerText(),
      });
      if (step === 4) {
        await page.locator(".comparison-policy").scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(out, `${name}-lab-step-4-policy.png`) });
      }
      if (step === 6) {
        await page.locator(".comparison-outcome").first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(out, `${name}-lab-step-6-outcome.png`) });
      }
    }
  }
  await page.getByRole("button", { name: /Replay visual/ }).click();
  await page.waitForTimeout(2300);
  await page.screenshot({ path: resolve(out, `${name}-lab-replay.png`) });
  await page.locator(".comparison-dossier-link").click();
  await page.locator("#lab-evidence-assembly").scrollIntoViewIfNeeded();
  await page.locator("#lab-evidence-assembly .dossier-replay").click();
  for (const [beat, delay] of [
    ["record", 150],
    ["layers", 650],
    ["path", 1400],
  ]) {
    await page.waitForTimeout(delay);
    await page.screenshot({ path: resolve(out, `${name}-dossier-${beat}.png`) });
  }
  observations.push({
    viewport: name,
    scene: "dossier",
    text: await page.locator("#lab-evidence-assembly").innerText(),
  });
  await page.locator("#lab-evidence-assembly .dossier-event-path").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(out, `${name}-dossier-event-path.png`) });
  await page.goto(`${base}/actions`);
  await page.locator(".record-table tbody tr a").first().click();
  await page.locator(".dossier-assembly").waitFor();
  await page.screenshot({ path: resolve(out, `${name}-indexed-action-dossier.png`) });
  const video = page.video();
  await context.close();
  if (video) await copyFile(await video.path(), resolve(out, `${name}-walkthrough.webm`));
}

try {
  await run("desktop", { width: 1440, height: 900 });
  await run("mobile", { width: 390, height: 844 });
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const reduced = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await reduced.newPage();
    await page.goto(base);
    await page.locator(".specimen-fallback").waitFor();
    await page.locator(".specimen-stage").scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(out, `${name}-reduced-specimen.png`) });
    await page.goto(`${base}/lab`);
    await page.locator(".comparison-instrument").scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(out, `${name}-reduced-lab.png`) });
    await page.locator(".dossier-assembly").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(out, `${name}-reduced-dossier.png`) });
    await reduced.close();
  }
  await writeFile(resolve(out, "observations.json"), JSON.stringify(observations, null, 2));
} finally {
  await browser.close();
}
