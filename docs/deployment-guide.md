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
5. vite dev server on `:8056`

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
# http://localhost:8056/lab
```

One container runs everything (`pnpm demo` as the entrypoint). The Dockerfile
copies the foundry toolchain, caches the pnpm install layer, and healthchecks
`/health`. No secrets required — demo keys are anvil's well-known accounts.

## Robinhood Chain testnet

Live demo deployment broadcast on 2026-09-22. Manifest: [46630.json](../deployments/46630.json). Receipt and configuration checks: [deployment evidence](../deployments/46630-evidence.json).

Registry: [0x9914779e3ae832922CA077943cb1d024afD0bb73](https://explorer.testnet.chain.robinhood.com/address/0x9914779e3ae832922CA077943cb1d024afD0bb73). This deployment includes explicitly labelled mock stock/mUSDG and reference vaults. Deployment verification does not establish that the full six-step scenario has run on testnet, or that explorer source verification is complete.

The dedicated deployer key is stored only in the Git-ignored root `.env.robinhood-testnet`. Load that file into the deploy process environment; do not put the key in CLI arguments or frontend variables. `DEMO_MODE=true` deploys the public demonstration surface; the command below shows the separate core-only option.

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
  `setSigner` and transfer ownership for production.
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

## Public demo on this Windows host

URL: https://corpshift.tangvu.dev. Cloudflare tunnel `corpshift` routes only to
`127.0.0.1:18056`. The origin serves `apps/web/dist`, explicit public deployment
proof files, and the application API. It does not serve the repository root.

PM2 configuration: `ecosystem.config.cjs`.

- `corpshift-stack`: supervises Anvil :18545, API :14000, indexer, and production web :18056.
- `corpshift-tunnel`: uses `~/.cloudflared/corpshift.yml`; credentials remain outside the repo.
- Logs: `data/public-logs/` and PM2 logs. Each fresh sandbox gets a separate SQLite file in `data/public-sessions/` to avoid stale records from earlier chains.
- Private testnet env is not loaded into the public sandbox process.

Build with `pnpm build`, then `pm2 start ecosystem.config.cjs`. For updates use
`pnpm build` followed by `pm2 restart corpshift-stack`. Save the process list
with `pm2 save`. Host availability and Windows/PM2 startup determine uptime;
PM2 does not keep the machine awake.

The interactive lab is shared across visitors, and reset affects everyone.
It sends actual transactions on Anvil, not Robinhood testnet. The separate
Robinhood testnet deployment is linked on Overview with downloadable receipts.
A stack restart starts a fresh sandbox. This is a demonstration service,
not a durable hosted production protocol.
