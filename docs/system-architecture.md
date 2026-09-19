# System architecture

CorpShift turns messy real-world corporate actions into a small number of
things onchain protocols can trust: a canonical action record, an asset state
machine, a verified normalization factor, and policy answers.

## Component view

```mermaid
flowchart TB
  subgraph offchain["offchain (indexer · api · sdk · web)"]
    SRC["sources<br/>Robinhood /rhj · fixture · mock"]
    NORM["normalizer<br/>@corpshift/core"]
    ATT["attester<br/>EIP-712 signer"]
    SUB["submitter"]
    EVT["event indexer"]
    RCN["reconciler"]
    DB[("SQLite<br/>actions · events · meta")]
    API["REST API<br/>hono · /v1/*"]
    SDK["@corpshift/sdk<br/>CorpShiftClient"]
    WEB["Protocol Lab +<br/>assets/actions/policy UI"]
  end

  subgraph chain["chain (Robinhood Chain · anvil)"]
    REG["CorpShiftRegistry<br/>actions · assets · factors"]
    POL["PolicyEngine<br/>state × op → allow/deny"]
    SADA["StockTokenAdapter<br/>ERC-8056 probe"]
    EADA["ERC20Adapter<br/>generic fallback"]
    TOK["StockToken<br/>uiMultiplier()"]
    ORA["price oracle"]
    CONS["consumer protocols<br/>vaults · lending · agents"]
  end

  SRC --> NORM --> ATT --> SUB
  SUB -->|submitAction| REG
  REG --> EVT --> DB
  RCN -->|verify multiplier /<br/>crank activate·apply| REG
  SADA --> REG
  EADA --> REG
  SADA -.reads.-> TOK
  REG --> POL --> CONS
  CONS -.raw balances.-> TOK
  REG --> API --> WEB
  DB --> API
  SDK --> REG
  ORA -.price.-> CONS
```

## Asset state machine

One state per registered asset. Transitions are enforced by
`CorpShiftRegistry` — every transition emits `AssetStateChanged` with the
causal `actionId`, so the full history is auditable onchain.

```mermaid
stateDiagram-v2
  [*] --> ACTIVE : registerAsset
  ACTIVE --> ACTION_PENDING : verified economic action<br/>scheduled (effectiveAt &gt; now)
  ACTIVE --> ADJUSTING : effective-now economic action
  ACTION_PENDING --> ADJUSTING : activateAction at effectiveAt
  ADJUSTING --> ACTIVE : applyAction — normalization<br/>factor verified onchain
  ADJUSTING --> DEGRADED : reconcile failed<br/>(multiplier mismatch)
  DEGRADED --> ACTIVE : later reconciliation succeeds
  ACTIVE --> HALTED : TRADING_HALT
  HALTED --> ACTIVE : TRADING_RESUME resolves halt
  ACTIVE --> MIGRATING : MERGER · SPIN_OFF · SYMBOL_CHANGE
  MIGRATING --> ACTIVE : applyAction (new factor verified)
  ACTIVE --> REDEEMING : REDEMPTION
  REDEEMING --> ACTIVE : applyAction completes
  ACTIVE --> UNSUPPORTED : adapter cannot normalize
  UNSUPPORTED --> [*]
```

`applyAction` verifies the expected `uiMultiplier` against live token state
before returning the asset to `ACTIVE`. If the token never updated — or moved
to an unexpected factor — the asset lands in `DEGRADED` and `PriceRead` is
denied, so consumers stop trusting stale valuations instead of guessing.

## Action lifecycle

```mermaid
stateDiagram-v2
  [*] --> SCHEDULED : attested submitAction
  SCHEDULED --> ACTIVE : activateAction<br/>(effectiveAt reached)
  ACTIVE --> RESOLVED : applyAction reconciled<br/>(terminal)
  SCHEDULED --> INVALIDATED : governance revoke<br/>(terminal)
  SCHEDULED --> UNSUPPORTED : type unprocessable<br/>(terminal)
  note right of SCHEDULED
    ids are content-derived
    (canonicalize hash) —
    resubmission is idempotent,
    replay reverts
  end note
```

## Ingestion pipeline

```mermaid
sequenceDiagram
  autonumber
  participant S as Source (rhj/fixture/mock)
  participant N as Normalizer
  participant A as Attester
  participant X as Submitter
  participant R as CorpShiftRegistry
  participant E as EventIndexer
  participant C as Reconciler
  participant T as StockToken

  loop every poll (8s demo)
    S->>N: raw corporate-action records
    N->>N: canonicalize → actionId,<br/>paramsHash, evidenceHash
    N-->>DB: persist (incl. normalization failures)
    A->>A: EIP-712 sign canonical action
    X->>R: submitAction(payload, params, sig)
    R-->>E: ActionSubmitted / AssetStateChanged
    E->>DB: index events (tx_hash+log_index unique)
    C->>R: activateAction (effectiveAt reached)
    C->>T: uiMultiplier() / pendingMultiplier()
    C->>R: applyAction — factor verified
  end
```

Failures are never dropped silently: records that fail normalization persist
with `status = -1` and the error, so the API can surface "we saw it but
couldn't canonicalize it" instead of pretending it never happened.

## Policy enforcement

```mermaid
flowchart LR
  OP["consumer op<br/>deposit · borrow ·<br/>liquidate · settle …"]
  PE["PolicyEngine.allowed<br/>(asset, op)"]
  ST["registry.assetState(asset)"]
  M{"state × op matrix"}
  ALLOW["execute"]:::ok
  DENY["revert UnsafeAssetState"]:::no

  OP --> PE --> ST --> M
  M -->|allowed| ALLOW
  M -->|denied| DENY
```

The seeded defaults (governance can tighten per state × op via `setPolicy`):

| Asset state | Deposit | Withdraw | Borrow | Liquidate | Order | Settle | Transfer | Collateral | PriceRead |
|---|---|---|---|---|---|---|---|---|---|
| `ACTIVE` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ACTION_PENDING` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| `ADJUSTING` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `HALTED` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `MIGRATING` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `REDEEMING` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `DEGRADED` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `UNSUPPORTED` | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

The matrix encodes one principle: **while economic meaning is in flux, the
only safe operation is the one that reduces exposure.** Withdrawals and price
reads stay open in every state; anything that creates new risk — borrows,
orders, liquidations — waits for verified state. `PRICE_READ` staying
permitted is deliberate: consumers should keep *seeing* the asset, just not
*act* on it.

## Trust boundaries

- **Attesters** — registry-authorized EIP-712 signers; the only path a
  canonical action takes onchain. Compromise ⇒ forged actions; mitigated by
  domain binding, content-derived ids, replay reverts, onchain factor
  verification, and governance revoke (`invalidateAction`).
- **Token contract** — `uiMultiplier`/`newUIMultiplier`/`effectiveAt` are the
  ground truth; the registry *verifies* rather than *asserts* economic
  factors. A lying adapter cannot push an asset to `ACTIVE` on a false factor.
- **Oracle** — consumers choose their own; CorpShift never touches prices.
  The demo's mock oracle exists only to make the 4:1 split visible.
- **Governance** — asset registration, attester management, invalidation.
  Deliberately minimal: no pause that could freeze consumer `WITHDRAW`.

See [threat-model.md](threat-model.md) for the full analysis.
