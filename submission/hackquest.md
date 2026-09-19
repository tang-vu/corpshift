# CorpShift — HackQuest submission

**Track:** Robinhood Chain · Arbitrum Open House Singapore Online Buildathon

## Tagline

The corporate-action runtime for onchain finance.

## The problem (60 seconds)

Robinhood Stock Tokens are programmable — but corporate actions change their
*economic meaning*. When CRWD split 4:1, its ERC-8056 `uiMultiplier` moved
`1e18 → 4e18` and the per-token price dropped `$100 → $25` (verified live on
mainnet). Any protocol reading raw `balanceOf()` now misprices collateral by
4× — over-lending before the split is priced in, **wrongfully liquidating
healthy positions after it**. This isn't hypothetical: it's the default
behavior of every naive integration today.

## What CorpShift does

CorpShift keeps DeFi economically correct when the stock underneath a Stock
Token changes:

- **Normalizes** corporate actions (splits, dividends, mergers, halts,
  redemptions, symbol changes, multiplier updates) into a canonical schema
  sourced from the live Robinhood `/rhj` corporate-actions API.
- **Attests** them with EIP-712 (registry-authorized signers, domain-bound,
  replay-safe).
- **Lands** them in `CorpShiftRegistry` — an onchain action registry plus a
  per-asset state machine: `ACTIVE → ACTION_PENDING → ADJUSTING → ACTIVE`,
  with `HALTED`, `MIGRATING`, `REDEEMING`, `DEGRADED`, `UNSUPPORTED`.
- **Verifies** — `applyAction` checks the token's live `uiMultiplier()`
  against the attested factor. Mismatch → `DEGRADED`, never silent `ACTIVE`.
- **Protects** — `PolicyEngine` answers `allowed(asset, op)` per state;
  `economicUnits(raw)` applies the verified factor. Protocols gate ops and
  value collateral correctly.

## The demo (deterministic, all real transactions)

Two identical vaults, same user, same 10 stk collateral, same $400 debt:

| | NaiveVault | CorpShiftAwareVault |
|---|---|---|
| reads | raw `balanceOf` | CorpShift economic units + policy gates |
| during `ACTION_PENDING` | still lends | blocks new borrows |
| after 4:1 split | sees $250 collateral → **seizes a healthy position** | sees 40 units → $1,000 → **HF 2.00, untouched** |

Six steps — seed, attest, probe, execute, reconcile, liquidate — **21 real
onchain transactions**, each linked in the UI's execution log.

**Run it:** `pnpm install && pnpm demo` → `http://localhost:3000/lab`
(or `docker compose up --build`). **Verify it:** `pnpm demo:check`
(13 assertions) · `pnpm e2e` (Playwright, real browser) · `forge test`
(61/61).

## Why it's technically real, not a demo facade

- EIP-712 digests computed in TypeScript are **pinned byte-for-byte against
  the Solidity implementation** by cross-implementation test vectors.
- Attestation attack surface is revert-tested: cross-chain, cross-contract,
  tampered params, malleable-s, revoked signer, replayed action, wrong schema.
- The handler-based invariant suite fuzzes the state machine (576 calls):
  unique action ids, halt-pointer integrity, terminal stickiness,
  factor-never-zero.
- The indexer pipeline ingests **real Robinhood API data** (48 live
  corporate actions + the actual CRWD 4:1 split fixture) and reconciles
  against chain state — normalization failures persist visibly, never
  silently dropped.

## Stack

Solidity 0.8.30 / Foundry · TypeScript (Node 24 native TS) · viem · zod ·
hono · `node:sqlite` · React + Tailwind · Playwright · Docker · GitHub Actions.

## Repo map

`packages/contracts` (registry, policy, adapters, settlement, mocks, demo
vaults) · `packages/core` (canonical model + EIP-712) · `packages/sdk` ·
`apps/indexer` · `apps/api` · `apps/web` · `scripts` (demo orchestration) ·
`docs` (architecture, threat model, benchmarks) · `test/e2e`.

## Honest limitations

- Demo governance/attester is a single key (anvil's public account) — a
  production deployment wants a quorum or Robinhood-signed attestations.
- Robinhood testnet currently hosts no Stock Token deployments (verified
  2026-09-19), so the live-API path targets mainnet-shaped data; the local
  stack reproduces the full ERC-8056 surface on mocks.
- `node:sqlite` is the demo store; Postgres sits behind the same Store
  interface for production.

## Links

- Docs: [README](../README.md) · [architecture](../docs/system-architecture.md) ·
  [threat model](../docs/threat-model.md) · [benchmarks](../docs/benchmarks.md) ·
  [deployment](../docs/deployment-guide.md)
- API: `apps/api/openapi.yaml`
- Research: `docs/research/README.md` (Robinhood Chain / ERC-8056 facts, all
  verified against live chain state + the public API)
