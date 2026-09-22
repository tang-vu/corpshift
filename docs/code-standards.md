# Code standards

## Toolchain

- Node ≥ 24 (native TS strip-mode for `apps/*`; `node:sqlite` store)
- pnpm workspaces; `pnpm -r` for typecheck/test/build
- `pnpm-workspace.yaml` uses copied packages in `node_modules/.pnpm-isolated` so Windows
  installs do not replace executable hardlinks held by another project's dev server.
- Foundry 1.8.x for contracts; `forge fmt` enforced
- eslint 9 (flat config) + prettier — `pnpm lint`, `pnpm format:check`
- `exactOptionalPropertyTypes` — optional props get `| undefined` explicitly
  or conditional spreads

## TypeScript

- Apps run under **native type-stripping**: no parameter properties
  (`constructor(private x)`), no `enum`, no `namespace`, no decorators in
  `apps/*/src` — vitest transpiles and would hide the incompatibility;
  verify changes with direct `node` execution.
- Imports in natively-run files need `.ts` specifiers
  (`import { x } from "./db.ts"`).
- Prefer `type` imports (`consistent-type-imports` enforced, inline style).
- No `any` without justification (`no-explicit-any` warns).
- Shared chain/manifest knowledge lives in `packages/shared` — never
  hardcode chain ids or addresses outside config.

## Solidity

- `forge fmt` (default config) before commit; CI checks it.
- Custom errors over revert strings (`error UnsafeAssetState(...)`).
- State transitions only via `_transition` — always emits `AssetStateChanged`.
- Adapter probes must be `staticcall`-based (`try/catch` misses decode
  reverts on EOAs).
- Events are the audit trail — every meaningful mutation emits.

## Testing

- Write the failing test first for bug fixes.
- Solidity: unit + fuzz (`testFuzz_`) + integration + handler invariants.
- Cross-implementation facts (digests, ids) get pinned vectors on both sides.
- SQLite tests use `:memory:` — file-backed is slow under vitest workers.
- E2E asserts **observable outcomes** (state changes, log entries), never
  transient UI states (disabled flags mid-request are racy by design).

## Git

- Every completed update goes through a feature branch and PR, then squash merge
  after passing CI. The owner has authorized routine PR creation and automatic
  merging without another confirmation; see `AGENTS.md`. Never bypass failed checks.

- Conventional-ish commits: `feat|fix|build|refactor|test(scope): why`.
- No `chore`/`docs` prefixes for `.claude` file changes.
- Don't commit `data/`, `test-results/`, `.claude/` artifacts.
- No secrets — only Anvil public demo keys belong in source; private testnet keys stay in ignored env files.

## Docs

- Update `docs/` with behavior changes (architecture facts, env vars,
  security claims).
- Numbers in docs must come from real runs (`--gas-snapshot`, measured
  timings) — never invented.
