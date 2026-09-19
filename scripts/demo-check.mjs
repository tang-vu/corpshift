#!/usr/bin/env node
/**
 * pnpm demo:check — deterministic verification of the killer demo.
 *
 * Drives the full scenario through the running API and asserts the
 * objectively measurable outcome:
 *   - naive vault wrongfully liquidated the healthy position
 *   - aware vault kept it (HF 2.00) — same inputs, same corporate action
 *   - registry verified the 4e18 multiplier and returned the asset to ACTIVE
 *   - indexer recorded canonical actions
 *
 * Exit 0 = all assertions pass. Requires the demo stack (`pnpm demo`).
 */
const API = process.env.CORPSHIFT_API ?? "http://127.0.0.1:4000";

const E18 = 10n ** 18n;
let failures = 0;
let step = 0;

function check(name, cond, detail = "") {
  step++;
  if (cond) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failures++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function j(path, method = "GET") {
  const r = await fetch(API + path, { method, signal: AbortSignal.timeout(60_000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${body.error ?? "?"}`);
  return body;
}

async function main() {
  console.log(`\ndemo:check against ${API}\n`);

  const health = await j("/health");
  check("api healthy + bound to chain", health.ok && health.chainId > 0, JSON.stringify(health));
  check("demo conductor enabled", health.demoEnabled === true);

  const before = await j("/v1/actions");
  check("indexer recorded canonical actions", before.actions.length >= 1, `${before.actions.length} rows`);

  await j("/v1/demo/reset", "POST");
  const names = ["seed", "attest", "probe", "execute", "reconcile", "liquidate"];
  for (const want of names) {
    const r = await j("/v1/demo/step", "POST");
    check(`step ${want} executed (${r.txs.length} txs)`, r.ok === true && r.step === want, r.detail);
  }

  const s = await j("/v1/demo/state");
  console.log("\n  final onchain state:");
  console.log(`    assetState         ${s.assetState}`);
  console.log(`    uiMultiplier       ${Number(BigInt(s.uiMultiplier)) / 1e18}x`);
  console.log(`    oracle price       $${Number(BigInt(s.price)) / 1e8}`);
  console.log(`    naive vault        collateralValue $${Number(BigInt(s.vaults.naive.collateralValue)) / 1e18}, debt $${Number(BigInt(s.vaults.naive.debt)) / 1e6}`);
  console.log(`    aware vault        collateralValue $${Number(BigInt(s.vaults.aware.collateralValue)) / 1e18}, healthFactor ${Number(BigInt(s.vaults.aware.healthFactor)) / 1e18}`);
  console.log();

  check("registry verified multiplier onchain (4e18)", BigInt(s.uiMultiplier) === 4n * E18);
  check("asset returned to ACTIVE", s.assetState === "ACTIVE");
  check("naive vault position seized (wrongful liquidation)", BigInt(s.vaults.naive.collateralRaw) === 0n);
  check("aware vault position intact (10 stk)", BigInt(s.vaults.aware.collateralRaw) === 10n * E18);
  check("aware vault health factor 2.00", BigInt(s.vaults.aware.healthFactor) === 2n * E18);

  console.log();
  if (failures === 0) {
    console.log("  \x1b[32m✓ killer demo verified — CorpShift kept DeFi economically correct\x1b[0m\n");
  } else {
    console.log(`  \x1b[31m✗ ${failures}/${step} checks failed\x1b[0m\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`\n  \x1b[31m✗ demo:check failed: ${e.message}\x1b[0m`);
  console.error("  is the demo stack running?  pnpm demo\n");
  process.exit(1);
});
