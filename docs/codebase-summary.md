# Codebase summary

pnpm monorepo. Solidity (Foundry) + TypeScript (Node 24 native TS, no build
step for apps; `tsc` typecheck + emit for packages).

```
packages/
  contracts/          Foundry project (~2.4k LOC)
    src/
      CorpShiftRegistry.sol     action records + asset state machine + factor verify
      PolicyEngine.sol          state × op decision matrix (governance-tunable)
      SettlementVault.sol       cash-entitlement claims at snapshotted factor
      adapters/                 StockTokenAdapter (ERC-8056 probe), ERC20Adapter
      interfaces/               ICorpShift consumer surface, IAssetAdapter, ERC-8056
      libraries/                CorpShiftTypes (enums/structs), AttestationLib (EIP-712)
      mocks/                    MockStockToken, MockUSDG, MockPriceOracle
      demo/                     NaiveVault, CorpShiftAwareVault
    script/Deploy.s.sol         writes deployments/<chainId>.json
    test/                       7 suites, 59 tests (unit/fuzz/integration/invariant)

  core/               canonical model — types, zod schema, canonicalize(),
                      EIP-712 encode (digest pinned vs Solidity), rhj normalizer,
                      fixtures (real CRWD split)
  shared/             chain defs (4663/46630/31337), manifest types, explorer urls
  sdk/                CorpShiftClient — viem reads/writes, policy, exposure, sign

apps/
  indexer/            pipeline: fetch → normalize → attest → submit →
                      event-index → reconcile. Sources: live|fixture|mock.
                      Store: node:sqlite, cached stmts, tx-batched.
  api/                hono REST — /v1/assets|actions|policy|exposure|events|demo.
                      DemoConductor: six-step scenario w/ verified evm reset.
  web/                vite+react+tailwind — landing, assets, actions, policy,
                      Protocol Lab (killer demo UI)

scripts/
  demo.mjs            stack orchestrator (anvil→deploy→indexer→api→web)
  demo-check.mjs      13-assertion acceptance run
  export-abi.mjs      forge artifacts → sdk abi modules

test/e2e/             playwright specs
deployments/          chain deployment manifests (31337 committed)
docs/                 architecture, threat model, deployment, benchmarks, research
submission/           hackathon materials
```

## Data flow (one line)

`source → normalize → attest (EIP-712) → submitAction → AssetStateChanged →
applyAction verifies uiMultiplier → PolicyEngine gates consumers → API/UI
surfaces it all`.

## Key invariants to preserve when editing

- Solidity enums ≡ `packages/core/src/types.ts` numeric values.
- EIP-712 digest: `AttestationLib` ≡ `packages/core/src/eip712.ts` (pinned
  by DigestVector.t.sol + eip712.test.ts).
- `actionId` derives from canonical content only — same on every impl.
- Indexer never drops normalization failures (status `-1` + error).
- API + indexer share the SQLite schema (`apps/indexer/src/db.ts`).
- Relative config paths resolve from repo root, not cwd.
- Node runs apps via native type-stripping — no parameter properties,
  enums, or namespaces in `apps/*/src`.
