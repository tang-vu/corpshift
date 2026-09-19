# Judge notes — what to look for

## The one thing to watch

`http://localhost:3000/lab` — click through the six steps. The moment that
matters is **Liquidation test**: the naive vault seizes a healthy $1,000
position while the aware vault's identical position stays at HF 2.00. Same
chain, same block range, same user — the only difference is whether the
vault reads CorpShift.

## Evidence it's real (not staged)

1. **Every UI step lands real transactions.** The execution log shows tx
   hashes; `cast receipt <hash>` on anvil verifies them.
2. **`pnpm demo:check` re-verifies the whole story via the API** — no UI
   involved: seeds, attests, probes, executes, reconciles, liquidates, then
   asserts onchain state (`uiMultiplier 4e18`, `ACTIVE`, naive seized,
   aware intact).
3. **The EIP-712 digest is cross-verified.** `DigestVector.t.sol` and
   `eip712.test.ts` pin the same action's digest in Solidity and TypeScript
   — if the implementations ever drifted, both suites fail.
4. **The indexer ingests real Robinhood data.** Fixture mode replays the
   captured `/rhj` feed including the actual CRWD 4:1 split (CRWD's live
   `uiMultiplier` really is 4e18 — check it yourself:
   `cast call <crwd> "uiMultiplier()" --rpc-url https://rpc.mainnet.chain.robinhood.com`).
5. **Adversarial coverage exists.** AttestationTest: 13 revert tests over
   the signature surface. InvariantsTest: 576 handler-fuzzed calls, 7
   invariants — including two real bugs it caught during development
   (orphaned halt on invalidate; stale resume resolving a newer halt).

## Design decisions worth noticing

- **The registry verifies, never asserts.** `applyAction` reads the token's
  live `uiMultiplier()` before returning an asset to `ACTIVE` — a forged or
  failed action degrades instead of passing.
- **Policy is a matrix, not a boolean.** `state × op` — withdrawals and
  reads stay open in every state; new exposure needs `ACTIVE`. Governance
  can tighten it per-cell.
- **Content-derived action ids.** Resubmission is idempotent by
  construction; replay is impossible.
- **Normalization failures persist.** The indexer records them
  (`status = -1` + error) — silent drops are how real systems lie.
- **The demo conductor is honest.** `reset` checks `evm_revert`'s return AND
  verifies the reverted baseline (multiplier, zero positions) before
  reporting success — it will tell you to restart rather than pretend.

## Known limitations (we documented them, not hid them)

- **Single-attester demo** — production wants quorum or Robinhood-signed
  actions; the EIP-712 domain already supports multiple signers.
- **No Stock Tokens on Robinhood testnet** (verified 2026-09-19 via the live
  assets API — 194 on mainnet, 0 on 46630). The deploy command for 46630 is
  documented and ready; the local stack demonstrates the complete pipeline.
- **`node:sqlite` demo store** — the Store interface is the seam for
  Postgres.
- **Mocks ≠ production tokens** — `MockStockToken` implements the full
  ERC-8056 surface (incl. pending multiplier + `effectiveAt`) so the adapter
  code path is identical to real Stock Tokens.

## Where the interesting code lives

| Question | Answer |
|---|---|
| Signature verification | `packages/contracts/src/libraries/AttestationLib.sol` |
| State machine + factor verify | `packages/contracts/src/CorpShiftRegistry.sol` (`applyAction`, `_transition`) |
| Policy matrix | `packages/contracts/src/PolicyEngine.sol` (`_seedDefaults`) |
| ERC-8056 probing | `packages/contracts/src/adapters/StockTokenAdapter.sol` |
| The exploit itself | `packages/contracts/src/demo/NaiveVault.sol` vs `CorpShiftAwareVault.sol` |
| Canonicalization + digest | `packages/core/src/canonicalize.ts` + `eip712.ts` |
| Pipeline | `apps/indexer/src/pipeline.ts` |
| Killer scenario | `apps/api/src/demo.ts` (conductor), `packages/contracts/test/DemoVaults.t.sol` (onchain proof) |
