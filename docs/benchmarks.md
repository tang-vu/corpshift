# Benchmarks

Measured on the local anvil deployment (`deployments/31337.json`), Windows
host, Node 24.14.1, Foundry 1.8.1. Full snapshot: `packages/contracts/.gas-snapshot`.

## Gas — protocol surface

| Operation | Gas | Note |
|---|---|---|
| `submitAction` (attested split) | ~478,706 | includes EIP-712 ecrecover + record + event |
| Attestation reverts (wrong signer/chain/params/…) | 34k–83k | cheap failure — no partial state |
| Policy checks (`allowed`) | ~10k–560k | `test_policy_*` include registry setup; the check itself is a mapping read |
| Economic-balance read | ~171k | adapter probe + multiplier math |
| Settlement: open dividend | ~33,585 | snapshot factor recorded |
| Settlement: claim entitlement | ~238,554 | pays out at snapshotted factor |
| Settlement: close + sweep | ~310,130 | |
| **Killer demo end-to-end** | **~1,765,101** | seed both vaults → attest → pending-borrow block → execute → reconcile → naive seize + aware protect (the live api run lands 21 real txs: 11/1/2/4/1/2 per step) |
| Reverse-split naive over-lending | ~1,353,549 | second scenario |

## Invariant coverage

`InvariantsTest` — 7 invariants × 48 runs × 12 calls = **576 calls, 0 reverts**
in <1s after handler bounding. Invariants: unique action ids, valid
statuses/states, factor never zero, halt pointer integrity, pending-action
liveness, terminal-state stickiness.

## Pipeline latency (indexer tick)

The `fetch → normalize → attest → submit → index → reconcile` tick on a
49-action fixture:

| Stage | Before | After fix |
|---|---|---|
| SQLite batch persist | ~16.8s | **~214ms** |

The fix: cached prepared statements + a single transaction around the batch
(`apps/indexer/src/db.ts`). Root cause was per-statement auto-commit fsyncs,
not query cost.

## API

`node:sqlite` keeps the whole persistence layer dependency-free. WAL +
`PRAGMA busy_timeout = 5000` let the api's demo-meta writes coexist with the
indexer's `BEGIN IMMEDIATE` batches on the same file.

## Web

- `pnpm build` (vite, production): ~2s, ~196KB JS bundle (221KB dist total),
  zero runtime deps beyond react/react-router
- Demo state poll: 2s interval; each `/v1/demo/state` is a fan-out of ~12
  `eth_call`s — sub-50ms on anvil

## Test wall-time (CI-relevant)

| Suite | Time |
|---|---|
| `forge test` (61) | ~6s |
| `pnpm test` (41 vitest) | ~15s |
| `pnpm demo:check` (13 assertions, real txs) | ~30s |
| `pnpm e2e` (3 Playwright specs) | ~110s — the scenario is real transactions |
