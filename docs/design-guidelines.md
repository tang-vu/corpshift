# Design guidelines

## Product design

1. **Economic truth over raw state.** Never expose `balanceOf` as "the
   balance" — use live adapter `economicUnits(raw)` and show the last verified factor separately. Raw
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
5. **Risk-off by default.** Read the actual operation matrix. The seeded `ADJUSTING` state permits only `PRICE_READ`; withdrawals are not universally available. Governance may override defaults.

## API design

- REST, versioned (`/v1/`); `openapi.yaml` is the contract.
- Bigints serialize as decimal strings — never floats.
- Responses carry both raw and normalized values (`collateralRaw` +
  `collateralValue`) so clients see the difference explicitly.
- Demo endpoints are first-class (`/v1/demo/*`) but fail honestly on
  non-local chains rather than simulating.
- Shared SQLite between api + indexer: WAL + busy_timeout; writers use
  transactions.

## UI design — Continuity Engine (current)

- Warm paper, dark green ink and vermilion, as specified in `frontend-design.md`. DM Sans for hierarchy, Instrument Serif for editorial emphasis, IBM Plex Mono for measurements. The former dark terminal direction is superseded.
- State language is color-coded consistently everywhere:
  `ACTIVE` green, `ACTION_PENDING`/`ADJUSTING` amber, `HALTED`/`DEGRADED`/
  `LIQUIDATED` red, terminal states faint.
- The naive/aware vaults render side-by-side with identical layouts — the
  contrast is the story; divergence must be visible without reading.
- Every transaction hash links to an explorer (`HexLink`); local chains show
  truncated hex without links (no explorer exists — don't fake it).
- Step tracker mirrors the six-stage scenario; execution log appends actual
  `DemoStepResult`s, distinguishing mined writes and rejected simulations. Missing session history is not reconstructed.
- Loading states: shimmer skeletons for cold loads, `executing…` on the
  action button during a step, error line for api failures.
- Compact density — dashboards, not marketing pages. Numbers right-aligned
  or in fixed columns; motion explains observed results, supports reduced motion and never executes writes.

## Contracts style

- NatSpec `@notice`/`@dev` on all public surface; `///` section banners.
- Minimal external calls; probes via `staticcall` with manual decode.
- No floating pragmas; `0.8.30`.
