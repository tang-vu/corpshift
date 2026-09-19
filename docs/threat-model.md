# Threat model

CorpShift's security claim is narrow and testable: **a consumer protocol that
checks CorpShift state and normalization factors cannot be economically
misled by a corporate action it didn't see.** Everything else — oracle prices,
lending math, key custody — is outside the boundary and documented as such.

## Trust assumptions

| Component | Trust | If compromised |
|---|---|---|
| Token contract (ERC-8056) | `uiMultiplier()` / pending multiplier are ground truth | Nothing helps — the asset itself is corrupt; CorpShift *detects* divergence (DEGRADED) rather than inventing truth |
| Attester keys | EIP-712 signatures authorize canonical actions | Forged actions enter the registry (see mitigations) |
| Governance (owner) | register assets, manage attesters, invalidate | Can halt/unhalt assets and invalidate actions — intentionally small surface |
| Oracle | **not trusted by CorpShift** — consumers pick their own | Demo oracle is a mock; production consumers use Chainlink feeds |
| Indexer | liveness only — can be slow or down | No security impact: onchain state is authoritative; consumers read the registry directly |

## Attack surface & mitigations

### Attestation path

| Attack | Mitigation |
|---|---|
| Forged action from unauthorized signer | `submitAction` requires `isAttester[recovered]` — reverts otherwise |
| Cross-chain replay | EIP-712 domain binds `chainId` + `verifyingContract` — revert-tested |
| Cross-registry replay | domain `verifyingContract` = the registry itself — revert-tested |
| Tampered `params`/`evidence` | signature covers `paramsHash` + `evidenceHash`; recomputed onchain — revert-tested |
| Signature malleability | low-`s` enforced (`s ≤ n/2`), `v ∈ {27,28}` — revert-tested |
| Replay of a valid action | `actionId` is content-derived; second submission reverts `ActionExists` — tested |
| Revoked attester keeps signing | `setAttester(addr,false)` flips the mapping — revert-tested |
| Wrong schema | signature covers `keccak256("corpshift.action.v1")` — revert-tested |

### State machine

| Attack / failure | Mitigation |
|---|---|
| Action claimed, token never updates | `applyAction` **verifies** `uiMultiplier()` against the attested factor — mismatch → `DEGRADED`, never `ACTIVE` |
| Token moves to unexpected factor | same — `DEGRADED`, `WITHDRAW`-only policy |
| Stale `TRADING_RESUME` resolves a *newer* halt | resume resolves the halt **recorded at halt time**, not an arbitrary one — invariant-tested (`invariant_haltedImpliesActiveHalt`) |
| Governance invalidates an in-force halt | `invalidateAction` lifts the halt pointer and returns the asset `ACTIVE` — no orphaned `HALTED` state |
| Consumer ignores CorpShift | that's the `NaiveVault` — the demo shows the cost; not preventable at our layer |
| `effectiveAt` far-future action liveness | `activateAction` is permissionless — anyone can crank; no reliance on the submitter |

### Consumers

| Attack | Mitigation |
|---|---|
| Liquidation during unreconciled action | `LIQUIDATE` denied in every non-`ACTIVE` state — the killer demo's exact protection |
| Collateral mispriced post-split | `economicUnits(raw)` applies the **verified** factor; raw balance is never the unit of account |
| Protocol checks state once at deposit | that's a consumer bug; policy ops are per-call — `UseAsCollateral`/`PriceRead` exist for valuation paths |
| Griefing via dust-registration | registration is owner-gated |

## Honest residual risks

1. **Attester compromise is the big one.** A stolen key can attest a fake
   split; the factor check means the *token must actually move* for the asset
   to reconcile to `ACTIVE` — a fully fake economic action degrades at
   `applyAction`, but a *real-looking* one (e.g. claiming the actual pending
   multiplier with wrong metadata) can still slip semantically wrong data
   through. Production answer: multi-attester quorum or a Robinhood-signed
   attestation path — the EIP-712 surface already supports multiple signers.
2. **Governance is a single EOA in demo.** Acceptable for a buildathon; a
   timelock/multisig is the production shape.
3. **Source availability ≠ correctness.** A source outage means actions
   arrive late; `ACTION_PENDING`→`ADJUSTING` still protects consumers that
   check, but nothing forces consumers to check.
4. **SQLite is the demo store.** WAL + busy_timeout cover the API/indexer
   concurrency; it's not the production persistence tier.
5. **No key management.** Demo keys are anvil's well-known accounts by
   design; production needs real custody (KMS/HSM) — out of scope.

## Invariants under test

`InvariantsTest` handler-fuzzes the state machine (48 runs / 576 calls):
action ids unique, statuses always valid, asset states always valid,
normalization factor never zero, halted ⇒ live halt pointer, pending action
is always a live scheduled action, terminal actions never leave terminal
states.
