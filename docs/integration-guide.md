# Integrate CorpShift into a lending vault

The reference implementation is
[`CorpShiftAwareVault.sol`](../packages/contracts/src/demo/CorpShiftAwareVault.sol).
Its paired [`NaiveVault.sol`](../packages/contracts/src/demo/NaiveVault.sol)
shows the failure mode. Both are demonstration contracts, not audited lending
implementations. Start with the existing interface rather than copying a
concrete registry implementation into your protocol.

## 1. Gate the operation in the transaction

Depend on `ICorpShift` and `CorpShiftTypes`. For a borrow, query
`registry.checkPolicy(asset, CorpShiftTypes.PolicyOp.BORROW)` and revert when
`allowed` is false. Repeat with the correct operation for deposits, withdrawals
and liquidations. An API preflight is useful for UX but cannot enforce a
transaction's policy: state may change before inclusion.

Keep repayment possible. A permitted withdrawal still needs your own solvency
check. CorpShift's policy decision does not replace lending-market risk rules.

## 2. Value the deposited amount in the right units

Call `registry.economicUnitsOfAmount(asset, collateralRaw[user])` for collateral
held in your vault. Do not use the user's wallet balance: deposited tokens are
no longer in that wallet. `economicBalanceOf` is appropriate for wallet exposure.

For the demo's 18-decimal stock and 8-decimal **per-economic-unit** price:

```text
economic units = raw amount × live multiplier / 1e18
collateral USD (18 decimals) = economic units × price / 1e8
health factor (18 decimals) = collateral USD × 0.8e18 / (debt × 1e12)
```

The debt scale above assumes a 6-decimal debt token. Adapt these scales for the
actual token and oracle. A price already quoted per raw token must not receive
the multiplier again. Double-normalization overvalues collateral.

Read the live factor and the last verified factor as different concepts.
Normalization alone is not permission to borrow or liquidate; enforce the
policy in the same transaction. Production price freshness, manipulation
resistance, liquidity and liquidation incentives remain the consumer's job.

## 3. Reproduce the evidence

```bash
pnpm install
pnpm demo
# Open http://localhost:8056/lab and advance the six steps.
```

The reference position starts with 10 raw stock tokens, a $100 price, $400 debt,
and an 80% liquidation threshold. After the 4:1 split, 40 economic units at $25
still represent $1,000 and HF 2.00. The raw-balance vault sees only $250.

Inspect “Verify the outcome” and export the session evidence. Rejected calls
are simulations with decoded custom errors, not mined failed transactions.
Accepted writes have transaction hashes. The JSON is an API snapshot, not a
signed proof; verify receipts against the chain used by the demo. Refreshing
the page discards the browser execution log, so rerun from reset for a complete
session report. Reset is available only on the local chain and affects every visitor of the shared lab. An uncertain timeout must be followed by a state read before another write: the step endpoint advances the current step and is not idempotent.

## 4. Validate your consumer

Before integrating real assets, test pending and adjusting states, a mismatched
multiplier, revoked attestations, reverse splits, price staleness, decimal
rounding, and repayment/withdrawal behavior under degraded conditions. Review
the [trust model](threat-model.md) and the registry's signer/governance authority.
An attester's signature proves who signed data; it does not establish the
truth of the external corporate action by itself.
