# Winner benchmark and CorpShift execution priorities

Researched 2026-09-22. These are observed product patterns, not a formula for
winning. Awards establish selection, not security or product-market fit.
Recommendations below are our interpretation; no source says these individual
features caused an award.

## Comparable projects

| Project | Verified distinction / source | Useful pattern | CorpShift application |
| --- | --- | --- | --- |
| Tilt Protocol | First listed winner, $15k, [Open House NYC announcement](https://blog.arbitrum.foundation/open-house-nyc-buildathon-concludes-meet-the-winning-teams/); [project submission](https://www.hackquest.io/projects/Arbitrum-Open-House-NYC-Online-Buildathon-Tilt-Protocol) | Specific RWA workflow, interactive vault interface, testnet deployment described in submission | Make a lending integrator the primary user; deliver deployed contracts and a reproducible integration path |
| Liquida | First prize, London Founder House, [official announcement](https://blog.arbitrum.foundation/top-founders-take-home-300k-at-london-founder-house/) | Concrete institutional collateral use case | Explain precisely whose collateral accounting fails and why normalization repairs it |
| The Risk Protocol | Second prize, same London announcement | Risk infrastructure as a standalone product | Present CorpShift as corporate-action accounting and policy infrastructure; distinguish it from price oracles and general market-risk hedging |
| Agama Finance | Robinhood Chain Innovation Award, same London announcement | Tokenized-stock utility on the target ecosystem | Show how downstream stock-backed vaults consume CorpShift; this is a prospective integration category, not a claimed partnership |
| StreamWork | [ETHGlobal HackMoney 2026 showcase](https://ethglobal.com/showcase/streamwork-banj1), ENS Integrate ENS pool prize, not overall first place | Human-readable interaction and reduced onboarding friction | Let judges understand the outcome before reading addresses or learning the state machine |
| Keryx | [Product](https://keryx.cc/); first-place result supplied by the owner, not independently verified from an organizer announcement in this pass | A concise economic promise, question-and-budget input, and visible source/payment traceability | Give CorpShift an equally direct promise: preserve correct collateral accounting through corporate actions; link every demo outcome to evidence |

Keryx has several unrelated namesakes. This comparison uses keryx.cc, the
paid-citation research product. The displayed payment feed was not independently
verified as settled transactions. London Founder House is a different program
phase from Singapore's online buildathon; its awards are directional context,
not Singapore qualification rules.

Keryx's [public proof page](https://keryx.cc/proof) explicitly separates code,
authority, settlement and adoption evidence. CorpShift should likewise keep
test results, onchain receipts, mock scenarios and real user adoption distinct.

## Product thesis

Two further cross-event references sharpen the engineering priorities:

- [TX Delay Insurance](https://ethglobal.com/showcase/tx-delay-insurance-5fhae),
  ETHGlobal New York 2025 finalist and Flow pool-prize recipient, describes
  signed RPC observations for delay claims. Transferable pattern: keep the
  evidence that supports an outcome, and distinguish an observation from a
  stronger cryptographic guarantee.
- [SafeCreate2](https://ethglobal.com/showcase/safecreate2-szzw3), ETHGlobal
  New York 2023 finalist and Axelar Best Use winner, addresses a specific
  deployment/admin workflow through a reusable contract integration.
  Transferable pattern: make infrastructure easy for another developer to adopt,
  with a small integration surface and explicit authority boundaries.

Primary user: an engineer or risk operator integrating tokenized equities into
a lending market. Trigger: the issuer announces an action that changes economic
units. Job: keep borrowing and liquidation decisions consistent before, during,
and after that action. Demonstrable benefit: in the reference 4:1 split, preserve
the aware vault's $1,000 collateral valuation while the raw-balance vault
misvalues the same starting position and liquidates it.

This is a controlled failure demonstration, not evidence that an existing
production protocol has this vulnerability or that $1,000 of user funds has
actually been saved. The reference price oracle and tokens are mocks.

## Priority order and acceptance gates

| Priority | Work | Evidence required before calling it done |
| --- | --- | --- |
| P0 | Public deployment on an eligible chain | Broadcast receipt, chain ID, deployed bytecode, committed public manifest, explorer links; a dry run does not qualify |
| P0 | Trustworthy demonstration | Expected decoded reverts only; successful receipts; observed final balances; failed reads never produce a green verdict |
| P0 | Public demo and video | Fresh visitor completes the scenario, understands mocks, can inspect receipts; video shows the same deployed build |
| P1 | Integration experience | External developer follows a concise guide to gate operations and normalize units; tests cover their integration |
| P1 | Adversarial scenarios | Wrong multiplier, late action, unavailable source, invalidated action and reverse split have explicit outcomes and reproducible tests |
| P1 | Market evidence | At least three documented conversations with relevant builders, with consent for any public quotations; no invented users or partnerships |
| P1 | USDG decision | Verify official supported chain/address and demonstrate actual settlement if feasible; mUSDG mock usage is not Paxos USDG integration |
| P2 | Second end-to-end use case | Dividend entitlement from source to claim with traceable evidence; add after the core scenario is dependable |
| P2 | Production trust model | Explicit signer/governance authority, stale-source behavior, monitoring and external review plan |

## Changes started from this benchmark

- Replace static test-count marketing in the landing page with an inspectable
  proof path and specific user roles.
- Reject transport failures as evidence of a policy decision and reject reverted
  receipts as completed writes.
- Add live outcome checks and downloadable session evidence to Protocol Lab.
- Treat testnet deployment as a pre-submission requirement. Missing native
  testnet Stock Tokens does not prevent a transparently labeled mock deployment.

## Avoid diluting the product

Add a capability when it makes economic correctness, integration, or verification
measurably better. An unrelated AI agent, extra chains, a token, or a dashboard
does not become valuable merely because another winner used it.

## Submission constraints still to verify

The [Singapore event page](https://www.hackquest.io/vi/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon)
requires deployment on an Arbitrum chain and lists contract quality,
product-market fit, innovation, and real problem solving. Review the linked
Terms and actual submission form before finalizing eligibility, milestone
obligations, video length, required fields, and deadline timezone. That review
is not marked complete here. The linked Singapore Terms PDF returned HTTP 403
to the research fetch on 2026-09-22; its contents were not verified.
