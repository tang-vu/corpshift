# X post — announcement draft

Stock Tokens are programmable — but a 4:1 split changes what `balanceOf()` *means*. Your lending protocol just mispriced collateral by 4×.

Built **CorpShift** for the @arbitrum × @RobinhoodApp buildathon: the corporate-action runtime for onchain finance.

The demo that makes it real — same user, same collateral, same split:

• naive vault: seizes a healthy $1,000 position
• CorpShift-aware vault: HF 2.00, untouched

21 real transactions. EIP-712 attested actions. Onchain state machine that *verifies* the ERC-8056 multiplier instead of trusting it.

Splits, dividends, halts, mergers — normalized, attested, policy-gated.

The stock changes. DeFi stays correct.

`pnpm demo` → github.com/tang-vu/corpshift

---

## Shorter variant (if needed)

Your protocol reads `balanceOf()`. A 4:1 split just made it wrong by 4×.

CorpShift = corporate-action runtime for Robinhood Chain: canonical actions → EIP-712 attested → onchain registry → verified multiplier → policy gates.

Demo: naive vault wrongfully liquidates; CorpShift-aware vault stays HF 2.00. All real txs.

#Arbitrum #RobinhoodChain
