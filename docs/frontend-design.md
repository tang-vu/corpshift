# CorpShift visual language

The interface treats corporate actions as a matter of precise accounting.
Warm paper, dark green ink and vermilion signals reference financial documents
and technical field notes. Large DM Sans headlines pair with Instrument Serif
emphasis; IBM Plex Mono is reserved for labels, addresses and measurements.

The overview explains the product through an interactive stock-split model,
then exposes public deployment evidence, the processing sequence, a valuation
comparison and actual API observations. The model is explicitly an illustration
and never submits transactions. Protocol Lab remains the transactional demo.

Use whitespace, rules and typographic hierarchy to group information. Keep
colour semantic: green for preserved/allowed, red for loss/blocked, and orange
for the primary action. Preserve visible focus rings, labelled controls,
reduced-motion behaviour and scroll containers around wide data tables.

Shared tokens and the editorial layouts live in `apps/web/src/index.css`;
common data surfaces live in `components/ui.tsx`. The public website serves the
production Vite build, so a frontend update needs `pnpm --filter @corpshift/web
build`; no PM2 restart or sandbox reset is needed for static changes.

## Continuity Engine

The existing editorial identity extends into a register (assets), causal asset
history, corporate-action ledger, evidence dossier and read-only operation
inspector. The authored partition SVG represents one position in different
units; an offset partition denotes observed/verified disagreement. No reference
imagery is copied. Bearplus and its CargoKite project informed the composition
study: a domain object, generous hierarchy and explicit explanatory chapters.
Reference review: https://bear.plus/ and https://cargokite.com/.

The continuity specimen now uses a lit Three.js assembly of ten persistent raw
holders inside one fixed-value frame. A single GSAP clock drives its approach,
action-slip dock, partition, observed/verified rail divergence, reconciliation
and carry. Scroll and chapter controls seek the same clock; reduced motion or an
unavailable renderer uses the stepped ten-holder illustration. The canvas
renders on demand and pauses while offscreen. Neither path writes to the API.

Protocol Lab's comparison instrument animates an event branch and exact API
observations. It can interpolate geometry between values captured in the same
page session, but never manufactures financial observations. On external run
changes or progress, history is cleared with execution evidence. During
ADJUSTING, the operation labels come from fresh policy endpoint reads; the
reviewed default allows PRICE_READ and blocks the other eight operations.
Liquidation outcome annotations require the page-session liquidation response.

The ledger uses a browser view transition when available to carry a selected
action ID into its dossier. The dossier orders actual indexed events by block
and log index and marks missing indexed evidence. Full raw JSON, ABI bytes and
copyable identifiers remain below the animation. A production frontend build
emits `/build-stamp.json` with its source SHA and build time; this stamp is
separate from the contract deployment manifest.

The landing specimen has four direct chapter controls and retains Before/After
shortcuts. Every control is present on mobile and works without motion. The
illustration makes no mutation requests. Raw balance stays 10; after the 4:1
split it represents 40 economic shares at $25 per economic share. Already
normalized per-raw-token prices must not receive the multiplier again.

Protocol Lab pairs values by metric at every viewport. Both valuation bars use
the same scale; displayed USD, debt and health factor come from API decimal
strings. Economic-share annotations use bigint with the returned live adapter
factor. Visual replay only restarts the presentation of the current observation.
During ADJUSTING, live units can already be 4× while last verified remains 1×.

Essential annotations have a readable 11–12px floor. Mobile registers keep
labels and values together. Full identifiers can be copied; raw API state,
ABI and evidence JSON remain available in disclosures.

## Shared execution and evidence

Anvil is shared by all visitors. Reset shared lab affects everyone. A synchronous
submission lock prevents duplicate local actions. HTTP 429 respects Retry-After
and never automatically retries. An uncertain write outcome clears associated
session evidence and refreshes authoritative state before enabling another write.
Successful polling does not clear action errors. Failed reads mark retained
values stale and disable execution and evidence export.

The API returns an additive runId, renewed on conductor startup and successful
reset. Step responses include it. Observed external progress, a changed runId,
or an execution response inconsistent with refreshed state invalidates the local
execution log. This improves correlation; it is not a transactional snapshot.
Read responses can span blocks, and another visitor may advance the shared lab.

All eight outcome checks plus clean read/action/busy state are required for the
verdict. Refreshing a completed scenario does not reconstruct execution history.
The corpshift.demo-evidence.v1 export remains an unsigned browser-observed API
snapshot with capture time, checks, full state and page-session execution log.
Expected decoded contract rejections have no invented transaction hash.

Committed Robinhood evidence is a dated snapshot: counts are derived from the
record. Scope is deployment receipts, bytecode and initial configuration with
mock tokens, not an audit, source verification or completed testnet split.
The manifest's unknown gitCommit remains unknown. Public proof routes are separate
from the sandbox. Source mode remains explicitly unknown because /v1/source does
not supply it; indexer tick/block and normalization failures are shown separately.

## Isolated validation

Use Node 24 and `pnpm install --frozen-lockfile` in a separate worktree. Set
ANVIL_PORT, CORPSHIFT_PORT_API, CORPSHIFT_PORT_WEB and CORPSHIFT_DB before `pnpm demo`.
Vite proxies all three API routes via CORPSHIFT_API when provided, otherwise
http://localhost:${CORPSHIFT_PORT_API:-4000}. The normal default remains port 4000.
Set CORPSHIFT_API for demo:check and E2E_BASE_URL for Playwright; run these mutation
suites sequentially against the isolated stack. Never target the public sandbox.
Validation builds must not use the directory serving the hosted public assets.
