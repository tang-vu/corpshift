# Project roadmap

## Done (buildathon scope)

- [x] Canonical `corpshift.action.v1` schema + zod validation + fixtures
- [x] EIP-712 attestation (Solidity ≡ TS, digest vectors pinned both ways)
- [x] `CorpShiftRegistry` — actions, asset state machine, factor verification
- [x] `PolicyEngine` — state × op matrix, governance-tunable
- [x] ERC-8056 + ERC-20 adapters; `SettlementVault` cash entitlements
- [x] Indexer pipeline (live `rhj` API / fixture / mock sources), SQLite store
- [x] REST API + OpenAPI; `CorpShiftClient` SDK
- [x] Killer demo: naive wrongful liquidation vs aware protection — real txs
- [x] Protocol Lab UI + Playwright e2e + `demo:check` acceptance
- [x] Docker + compose + GitHub Actions CI
- [x] Docs: architecture, threat model, deployment, benchmarks
- [x] 61 forge + 41 vitest + 13 acceptance + 3 e2e — all green

## Next (post-hackathon, ordered)

1. **Testnet deployment** — deploy to Robinhood testnet (46630); blocked on
   Stock Token testnet availability (none exist as of 2026-09-19 — mock
   source can still demonstrate the full pipeline there).
2. **Multi-attester quorum** — M-of-N attestation or Robinhood-signed
   actions; the EIP-712 surface already supports it.
3. **Real production persistence** — swap `node:sqlite` for Postgres behind
   the Store interface (schema is already normalized).
4. **Cash-dividend e2e flow** — `SettlementVault` is tested onchain; wire it
   into the indexer pipeline + a second Protocol Lab scenario.
5. **Consumer SDK helpers** — `withCorpShiftPolicy(vault)` wrapper patterns
   so integrations are one-liner gates, plus a reference lending adapter.
6. **WebSocket/event push** — replace 2s polling with subscriptions.
7. **Governance hardening** — timelock + multisig for attester management
   and invalidation.

## Ideas (unscheduled)

- Merkle-proof entitlement distribution for large holder sets.
- `DegradedPrice` oracle wrapper — consumers opt into "last verified good"
  pricing during `DEGRADED`.
- Corporate-action SLA metrics surfaced in the API (time-to-detect,
  time-to-reconcile per action).
- Agent-facing MCP tool surface over the REST API.
