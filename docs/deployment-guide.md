# Deployment guide

Three supported paths: local one-command demo, Docker, and Robinhood Chain
testnet.

## Local demo — `pnpm demo`

Requirements: **Node ≥ 24** (native TypeScript + `node:sqlite`), **pnpm 9+**,
**Foundry** (`anvil`, `forge` on PATH or `~/.foundry/bin`).

```bash
pnpm install
pnpm demo
```

`demo.mjs` orchestrates the full stack:

1. `anvil --port 8545` (skipped if the port is already serving a chain)
2. `forge script Deploy.s.sol` (demo mode: registry + adapters + mocks +
   both vaults) → `deployments/31337.json`
3. indexer in `fixture` + `dry-run` — real captured Robinhood data indexed
   without interfering with the conductor's scenario
4. api on `:4000` with demo keys wired to anvil accounts
5. vite dev server on `:3000`

Then:

```bash
pnpm demo:check   # 13-assertion acceptance run against the live stack
pnpm e2e          # Playwright — drives the scenario through the real UI
```

Env overrides: `CORPSHIFT_PORT_API`, `CORPSHIFT_PORT_WEB`, `ANVIL_PORT`,
`SKIP_ANVIL=1`, `SKIP_DEPLOY=1`. Service logs: `data/demo-logs/`.

## Docker

```bash
git submodule update --init --recursive   # forge-std
docker compose up --build
# http://localhost:3000/lab
```

One container runs everything (`pnpm demo` as the entrypoint). The Dockerfile
copies the foundry toolchain, caches the pnpm install layer, and healthchecks
`/health`. No secrets required — demo keys are anvil's well-known accounts.

## Robinhood Chain testnet

| | |
|---|---|
| chain id | `46630` |
| rpc | `https://rpc.testnet.chain.robinhood.com` |
| explorer | `https://explorer.testnet.chain.robinhood.com` |
| faucet | `https://faucet.testnet.chain.robinhood.com` |

Deploy:

```bash
cd packages/contracts
PRIVATE_KEY=0x… DEMO_MODE=false forge script script/Deploy.s.sol \
  --rpc-url https://rpc.testnet.chain.robinhood.com \
  --broadcast
# writes deployments/46630.json
```

Notes:

- `DEMO_MODE` **defaults to true** — pass `DEMO_MODE=false` for the
  production surface (registry, policy engine, adapters, settlement vault —
  no mocks, no demo vaults).
- **Verified 2026-09-19:** the script simulates cleanly against the live
  testnet RPC (`forge script … --rpc-url https://rpc.testnet.chain.robinhood.com`
  without `--broadcast`) — ~9.85M gas, ~0.0002 ETH. Broadcasting just needs a
  faucet-funded key.
- The deployer becomes operator/attester initially; rotate attester keys via
  `setAttester` and transfer ownership for production.
- Stock Token addresses come from the live Robinhood API
  (`GET https://api.robinhood.com/rhj/assets/`); register each with
  `registerAsset` so the adapters can normalize them. Testnet currently has
  no Stock Token deployments (verified 2026-09-19) — point `CORPSHIFT_SOURCE=live`
  at mainnet-shaped data or use `fixture`/`mock` sources for testnet demos.

## Indexer service

```bash
CORPSHIFT_CHAIN_ID=46630 \
CORPSHIFT_RPC_URL=https://rpc.testnet.chain.robinhood.com \
CORPSHIFT_MANIFEST=deployments/46630.json \
CORPSHIFT_ATTESTER_KEY=0x… \
CORPSHIFT_OPERATOR_KEY=0x… \
CORPSHIFT_DB=data/indexer-46630.sqlite \
CORPSHIFT_SOURCE=live \
node apps/indexer/src/main.ts
```

| Env | Default | Purpose |
|---|---|---|
| `CORPSHIFT_CHAIN_ID` | `31337` | chain to bind |
| `CORPSHIFT_RPC_URL` | `http://127.0.0.1:8545` | JSON-RPC endpoint |
| `CORPSHIFT_MANIFEST` | `deployments/<chainId>.json` | deployment manifest |
| `CORPSHIFT_SOURCE` | `fixture` | `live` (Robinhood API) · `fixture` · `mock` |
| `CORPSHIFT_DRY_RUN` | `false` | normalize + index without onchain writes |
| `CORPSHIFT_DB` | `data/indexer-<chain>.sqlite` | SQLite path (`:memory:` ok) |
| `CORPSHIFT_POLL_MS` | `15000` | pipeline interval |
| `CORPSHIFT_FROM_BLOCK` | `0` | event-index start block |
| `CORPSHIFT_SYMBOLS` | all | comma list to filter sources |
| `CORPSHIFT_ATTESTER_KEY` / `CORPSHIFT_OPERATOR_KEY` | — | hex keys (dry-run ignores) |

## API service

```bash
CORPSHIFT_CHAIN_ID=46630 \
CORPSHIFT_RPC_URL=… \
CORPSHIFT_API_PORT=4000 \
node apps/api/src/main.ts
```

Demo-conductor keys (only needed for `/v1/demo/*`):
`CORPSHIFT_DEMO_USER_KEY`, `CORPSHIFT_OPERATOR_KEY`,
`CORPSHIFT_LIQUIDATOR_KEY`, `CORPSHIFT_ATTESTER_KEY`.

`/v1/demo/reset` requires `evm_revert` — local chains only. On testnet, reset
returns an honest error and the conductor replays forward (seed is
idempotent; a full replay needs a fresh deploy).

## Web app

```bash
cd apps/web && pnpm dev          # dev server
pnpm build && pnpm preview       # production build + preview
```

The dev server proxies `/v1`, `/health`, `/openapi.yaml` to
`http://localhost:4000` (see `apps/web/vite.config.ts`). For a deployed api,
point the proxy at its origin or serve both behind one host.
