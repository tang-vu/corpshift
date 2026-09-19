# Design guidelines

## Product design

1. **Economic truth over raw state.** Never expose `balanceOf` as "the
   balance" — always `economicUnits(raw)` with the *verified* factor. Raw
   values are labeled "raw" everywhere (UI, API fields like `collateralRaw`).
2. **Verify, don't assert.** The registry never trusts that an action
   happened — `applyAction` checks the token's live multiplier. The same
   principle applies offchain: the demo reset verifies the reverted baseline
   instead of trusting `evm_revert` blindly.
3. **Fail loudly, degrade safely.** Reconciliation failure → `DEGRADED` +
   withdraw-only policy, never silent `ACTIVE`. Indexer persists
   normalization failures instead of dropping them. API errors carry real
   messages (`UnsafeAssetState(op, reason)` decoded).
4. **State machine as the contract surface.** Consumers read one enum, not a
   pile of flags. Every transition emits the causal `actionId` — the audit
   trail is the feature.
5. **Risk-off by default.** Policy matrix allows exits (withdraw, settle,
   reads) in every state; new exposure requires `ACTIVE`.

## API design

- REST, versioned (`/v1/`); `openapi.yaml` is the contract.
- Bigints serialize as decimal strings — never floats.
- Responses carry both raw and normalized values (`collateralRaw` +
  `collateralValue`) so clients see the difference explicitly.
- Demo endpoints are first-class (`/v1/demo/*`) but fail honestly on
  non-local chains rather than simulating.
- Shared SQLite between api + indexer: WAL + busy_timeout; writers use
  transactions.

## UI design — institutional market-infrastructure aesthetic

- Dark terminal theme; monospace for all data (addresses, amounts, states),
  sans for prose.
- State language is color-coded consistently everywhere:
  `ACTIVE` green, `ACTION_PENDING`/`ADJUSTING` amber, `HALTED`/`DEGRADED`/
  `LIQUIDATED` red, terminal states faint.
- The naive/aware vaults render side-by-side with identical layouts — the
  contrast is the story; divergence must be visible without reading.
- Every transaction hash links to an explorer (`HexLink`); local chains show
  truncated hex without links (no explorer exists — don't fake it).
- Step tracker mirrors the six-stage scenario; execution log appends real
  `DemoStepResult`s — the UI never simulates what the api did.
- Loading states: shimmer skeletons for cold loads, `executing…` on the
  action button during a step, error line for api failures.
- Compact density — dashboards, not marketing pages. Numbers right-aligned
  or in fixed columns; no animated chart junk.

## Contracts style

- NatSpec `@notice`/`@dev` on all public surface; `///` section banners.
- Minimal external calls; probes via `staticcall` with manual decode.
- No floating pragmas; `0.8.30`.
