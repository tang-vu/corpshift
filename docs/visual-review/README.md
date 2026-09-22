# Continuity Engine visual review

Baseline: `5e16e51c7b0cfdd6b258e35f774921d8ca14fd3a`. The working tree was clean.
Implementation and validation use a separate `corpshift-continuity` worktree.
The hosted build directory and public processes are not used for validation.

## Composition and interaction

- Overview retains the hero and partition specimen, with four direct chapters.
  Vermilion partitions turn green at illustrative reconciliation. The equation
  always states the economic-share price basis; controls never submit writes.
- Lab uses a control dock immediately above paired measurements. Both valuation
  bars share one scale. Observed/verified disagreement has a causal annotation;
  the final reconciliation surface requires all eight evidence checks.
- Assets become a searchable register with labelled mobile records. The asset
  dossier contrasts factors and links indexed actions in a causal timeline.
- Actions remain an aligned ledger. The dossier prioritizes lifecycle, signer,
  readable parameters and indexed events, with raw evidence in disclosures.
- Policy exposes each contract decision and returned reason. Failed and unknown
  reads are distinct from allowed/blocked results; seeded defaults are separate.

The partition graphic is authored SVG; the specimen and valuation motion use
CSS. No reference assets or large rendering dependencies are introduced.

Reference study: [Bearplus](https://bear.plus/) and its
[CargoKite project](https://cargokite.com/). Both rendered in Chromium. The useful
principles were a distinctive domain object, asymmetric composition, strong
typographic hierarchy, and a progression from object to explanation.

## Isolated endpoints

| Service | Endpoint |
| --- | --- |
| Anvil | `http://127.0.0.1:28545` |
| API | `http://127.0.0.1:24000` |
| Vite | `http://127.0.0.1:28056` |
| Preserved baseline build | `http://127.0.0.1:28057` |
| Database | Worktree-local `data/continuity.sqlite` |

`CORPSHIFT_API` points to port 24000 for Vite and demo:check.
`E2E_BASE_URL` points to port 28056 for Playwright. Mutation suites run
sequentially. The baseline gateway only serves the preserved baseline build
and proxies to the isolated API.

## Screenshots and measured results

Captured all seven routes at 390, 768, 1024 and 1440 px, with reduced motion.
Every updated route has document width equal to viewport width. Baseline asset
detail overflowed to 753 px at a 390 px viewport; the full identifier now wraps.

| Route | Before (390 / 1440) | After (390 / 1440) |
| --- | --- | --- |

| overview | [mobile](before/overview-390.png) / [desktop](before/overview-1440.png) | [mobile](after/overview-390.png) / [desktop](after/overview-1440.png) |
| assets | [mobile](before/assets-390.png) / [desktop](before/assets-1440.png) | [mobile](after/assets-390.png) / [desktop](after/assets-1440.png) |
| asset | [mobile](before/asset-390.png) / [desktop](before/asset-1440.png) | [mobile](after/asset-390.png) / [desktop](after/asset-1440.png) |
| actions | [mobile](before/actions-390.png) / [desktop](before/actions-1440.png) | [mobile](after/actions-390.png) / [desktop](after/actions-1440.png) |
| action | [mobile](before/action-390.png) / [desktop](before/action-1440.png) | [mobile](after/action-390.png) / [desktop](after/action-1440.png) |
| lab | [mobile](before/lab-390.png) / [desktop](before/lab-1440.png) | [mobile](after/lab-390.png) / [desktop](after/lab-1440.png) |
| policy | [mobile](before/policy-390.png) / [desktop](before/policy-1440.png) | [mobile](after/policy-390.png) / [desktop](after/policy-1440.png) |

The `before/` and `after/` directories also contain the 768 and 1024 px captures.
Run `node scripts/capture-review.mjs after http://127.0.0.1:28056` to repeat the
read-only route capture; it rejects non-loopback hosts and aborts all POSTs.
The route snapshots deliberately include completed lab **partial evidence**:
a new page has no local execution log, so balances alone cannot establish proof.

## Validation environment notes

Node 24.14.1 and pnpm 11.24.0; frozen lockfile. Cold package reads and readiness
were unusually slow on this Windows host. The final install used offline cache,
`--package-import-method=hardlink --verify-store-integrity=false`; no package,
lockfile or repository install-policy change was made. An ignored copy of the
demo launcher increased readiness attempts to 600 and bound Vite to 127.0.0.1.
The normal repository launcher remains unchanged. All three Vite proxies were
checked against the isolated API; both public proof paths returned chain 46630.

The baseline build was captured before the worktree production build replaced
it. No public hosted build was overwritten and no public service was restarted.


## Scenario and failure-state captures

All seven lab stages (clean baseline plus six authoritative results) were captured
at all four widths in `stages/lab-{0..6}-{width}.png`. The same page session
exported `verified: true`, with all eight checks passing. Its API observations
showed naive collateral $250 versus aware $1,000 after execution, observed factor
4x versus verified 1x during ADJUSTING, then verified 4x after reconciliation.
The final liquidation left naive collateral/debt zero and aware HF 2.00.

- [Divergence, mobile](stages/lab-4-390.png) / [desktop](stages/lab-4-1440.png)
- [Verified outcome, mobile](stages/lab-6-390.png) / [desktop](stages/lab-6-1440.png)
- [Reconciled illustrative specimen](stages/specimen-390.png)
- [Stale read with retained values](stages/stale-390.png)
- [Failed and unknown policy reads](stages/policy-unavailable-390.png)

Failure-state images use explicitly injected browser API failures; they are not
records of an RPC incident. Lab stages use the isolated real Anvil conductor.

## Executed checks

- `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: passed.
- `pnpm test`: 48 tests passed; `pnpm test:hosting`: 1 passed.
- `forge fmt --check`, `forge build`, `forge test`: passed (61 contract tests,
  including fuzz/invariants). Contract logic is unchanged.
- `pnpm demo:check`: 13 real-chain assertions passed.
- `pnpm e2e`: 16 tests passed; an added racing-reset regression passed in a
  focused run (17 browser checks total; CI runs them together).
- Keyboard chapter activation, read-only illustration/replay, mobile navigation,
  reduced motion, full identifiers, partial evidence, stale export disabling,
  persistent action errors, 429 cooldown, ambiguous transport failure, duplicate
  clicks, external reset/progress, policy failed/unknown reads and asset filters
  were exercised. No polling or presentation control resends a mutation.

Browser review led to a larger paired comparison, clearer labels, a readable
policy reason with exact bytes in disclosure, and explicit unavailable dossier
fields. All requested routes remain implemented; public publishing is separate
from this source delivery.
