# Demo script — ~4 minutes

Setup: `pnpm demo` running, browser on `http://localhost:8056/lab`.

---

**[0:00 — landing]** *(10s)*

"Stock Tokens are programmable. But corporate actions change what a token
*means*. This is CorpShift — the corporate-action runtime for onchain
finance."

*(Scroll to the live pipeline strip — real indexed actions visible.)*

"These are captured corporate-action records from Robinhood's public API,
replayed through our normalizer. The lending scenario uses mock tokens."

**[0:15 — the problem]** *(20s)* — open `/lab`

"Two identical lending vaults. Same user deposits 10 stock tokens, borrows
$400 in each — health factor 2.0. The only difference: the left vault reads
raw `balanceOf` with a per-share price. The right one reads CorpShift economic
units with that same price."

**[0:35 — seed]** *(15s)* — click **▶ Seed positions**

"Every click is real transactions — watch the execution log."

*(11 txs land; both panels show $1,000 collateral, $400 debt, HF 2.00.)*

**[0:50 — attest]** *(20s)* — click **▶ Attest 4:1 split**

"A 4-for-1 split lands onchain — EIP-712 attested, canonical schema, state
machine moves to `ACTION_PENDING`."

*(Asset state badge flips amber.)*

**[1:10 — probe]** *(25s)* — click **▶ Probe the vaults**

"Now we try to borrow more in both vaults. The naive vault lets you — it
doesn't know a split is coming. The aware vault blocks it — `BORROW` is
denied in `ACTION_PENDING`."

*(Log shows ✓ on naive, ✗ UnsafeAssetState on aware.)*

**[1:35 — execute]** *(15s)* — click **▶ Execute split**

"The split executes: multiplier 1→4×, price $100→$25. Watch what each vault
sees."

*(uiMultiplier → 4.00×, price → $25. Naive collateral $250; aware $1,000.)*

"Same raw balance — the naive vault is now *economically blind*."

**[1:50 — reconcile]** *(15s)* — click **▶ Reconcile**

"The registry verifies the token's live multiplier against the attested
factor — verified, back to `ACTIVE` at 4×. This checks the token's onchain
multiplier; the external action still relies on an authorized attester."

**[2:05 — the divergence]** *(30s)* — click **▶ Liquidation test**

"A liquidator submits `liquidate` to the naive vault. Naive: collateral $250 < debt
$400 → the position gets seized — **a healthy position, wrongfully
liquidated**. Aware: 40 economic units × $25 = $1,000 → HF 2.00 → the
liquidation simulation returns `NotLiquidatable` — the user's position is untouched."

*(LIQUIDATED badge on naive; aware stays HF 2.00.)*

**[2:35 — receipts]** *(30s)* — show Verify the outcome, then Export evidence

"These checks use observed state and the expected contract errors. Accepted
writes have transaction hashes; rejected operations are simulations. Download
the report to inspect chain addresses, balances and this session's transaction
references. The $1,000 is gross collateral retained, with $400 debt remaining."

**[2:55 — close]** *(30s)* — back to landing / `/actions`

"Corporate actions will keep happening — splits, dividends, mergers, halts.
CorpShift turns them into canonical, attested, verified onchain state that
protocols can gate on. The stock changes; DeFi stays correct."

---

## Backup / judge Q&A prompts

- "Show the API" → `GET /v1/actions` (canonical records), `/v1/policy/<asset>/<op>`,
  `/v1/exposure/<asset>/<account>` (raw vs economic side by side),
  `/openapi.yaml`.
- "Which parts are executed?" → `pnpm demo:check` — 13 assertions on live state;
  inspect accepted transaction receipts separately from rejected simulations.
- "Show the edge cases" → `forge test` — cross-chain replay, tampered params,
  malleable-s, halted-invariant fuzzing.
- "What about dividends?" → `SettlementVault` pays entitlements at the
  snapshot factor (`forge test` suite) — wired, just not in the main demo path.
- "Reset and run it again" → click **reset** — verified `evm_revert` baseline
  check, then the full scenario replays.
