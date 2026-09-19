# Project overview (PDR)

## Problem

Stock Tokens (ERC-8056 on Robinhood Chain) expose `uiMultiplier()` — a
normalization factor corporate actions mutate. A 4:1 split moves it `1e18 →
4e18` while price drops `$100 → $25`. Protocols reading raw `balanceOf()`
misprice collateral by the factor: over-lending pre-split, wrongful
liquidation post-split. No onchain runtime exists that turns corporate-action
data into state protocols can gate on.

## Product

CorpShift is the corporate-action runtime for onchain finance:

1. **Normalize** — corporate actions (splits, dividends, mergers, halts,
   redemptions, symbol changes, multiplier updates) → canonical
   `corpshift.action.v1` schema.
2. **Attest** — EIP-712 signatures from registry-authorized attesters
   (domain-bound, low-s, replay-safe).
3. **Register** — `CorpShiftRegistry` stores actions + per-asset state
   machine (`ACTIVE/ACTION_PENDING/ADJUSTING/HALTED/MIGRATING/REDEEMING/
   DEGRADED/UNSUPPORTED`).
4. **Verify** — `applyAction` checks live `uiMultiplier()` against the
   attested factor; mismatch → `DEGRADED`, never silent `ACTIVE`.
5. **Protect** — `PolicyEngine` answers `allowed(asset, op)`;
   `economicUnits(raw)` applies the verified factor. Consumers gate ops and
   value collateral correctly.

## Killer demo

Two identical vaults, same user, same 10 stk collateral, same $400 debt,
same 4:1 split:

- **NaiveVault** (raw `balanceOf`): post-split sees $250 collateral →
  liquidates a healthy position.
- **CorpShiftAwareVault** (economic units + policy gates): blocks new borrows
  in `ACTION_PENDING`, rejects the wrongful liquidation — HF stays 2.00.

Every step is a real transaction driven by `apps/api`'s demo conductor
through `POST /v1/demo/step`, verified by `pnpm demo:check` (13 assertions)
and `pnpm e2e` (Playwright, real browser).

## Users

- Lending/vault protocols on Robinhood Chain — gate ops, value collateral.
- Wallets/agents — query normalized exposure instead of raw balances.
- The runtime itself — indexer + API serving canonical actions and policy
  answers to anything that asks.

## Non-goals (v1)

- Not an oracle — prices stay the consumer's choice.
- Not a DEX / trading product — no order flow.
- Not a custodian — no user funds held (SettlementVault holds only declared
  entitlements).
- No tokenomics — the runtime is infrastructure.

## Success criteria (hackathon)

- [x] Full lifecycle onchain: attest → pending → execute → reconcile.
- [x] Real txs in demo: 21 across six steps, all verifiable.
- [x] Objective divergence: naive seized, aware HF 2.00.
- [x] 59 forge + 41 vitest + 13 acceptance + 3 e2e checks green.
- [x] Docker + CI + docs + submission materials.
