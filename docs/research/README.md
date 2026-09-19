# CorpShift — Research Notes

Verified against official sources on 2026-09-19. Raw API captures in `./raw/`.

## Hackathon

- **Arbitrum Open House Singapore: Online Buildathon** — Sep 14 → Oct 4, 2026.
  Hosted on HackQuest: `https://arbitrum-singapore.hackquest.io/buildathons/Arbitrum-Open-House-Singapore-Online-Buildathon`
- $115K prizes: $70K open track (1st $40K / 2nd $20K / 3rd $10K), $15K Promising
  Products track, $30K milestone grants. **≥1 top-3 spot reserved for a
  Robinhood Chain project.** Arbitrum Foundation + Robinhood Chain co-sponsor.
- Sources: blog.arbitrum.foundation (Open House Singapore announcements),
  web3voyager.com event page.

## Robinhood Chain network

| Property | Mainnet | Testnet |
|---|---|---|
| Chain ID | 4663 | 46630 |
| RPC | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` | `https://explorer.testnet.chain.robinhood.com` |
| Gas token | ETH | ETH (faucet: `https://faucet.testnet.chain.robinhood.com`) |
| Verifier | Blockscout (`/api/`) | Blockscout (`/api/`) |

- Alchemy-hosted RPC also available: `robinhood-{mainnet,testnet}.g.alchemy.com/v2/{API_KEY}`
- Verified live 2026-09-19: testnet chain-id 46630 responds, ~121.5M blocks,
  Blockscout v2 API up, gas ~0.09 gwei.
- Source: `https://docs.robinhood.com/chain/connecting/`,
  `https://docs.robinhood.com/chain/deploy-smart-contracts/`

## Stock Tokens (ERC-20 + ERC-8056)

- Stock Tokens are ERC-20, 18 decimals. Canonical list:
  `https://docs.robinhood.com/chain/contracts/` (194 assets on mainnet as of
  2026-09-19; **zero deployments on testnet** → testnet demos need clearly
  labelled mock tokens).
- **ERC-8056 Scaled UI Amount** — verified onchain (CRWD @
  `0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931`, `uiMultiplier() = 4e18` after a
  real 4:1 split):
  ```solidity
  uiMultiplier() → uint256          // 1e18 = 1.0, shares-per-token
  newUIMultiplier() → uint256       // pending (or current if none scheduled)
  effectiveAt() → uint256           // when pending multiplier goes live
  balanceOfUI(address) → uint256    // raw balance × multiplier / 1e18
  totalSupplyUI() → uint256
  oraclePaused() → bool             // advisory; true while CA is processed
  uid() → bytes32                   // asset id, matches REST API `id`
  event UIMultiplierUpdated(uint256 oldM, uint256 newM, uint256 effectiveAtTimestamp);
  event TransferWithScaledUI(address indexed from, address indexed to, uint256 value, uint256 uiValue);
  ```
- `underlying shares = rawAmount × uiMultiplier / 1e18`. `balanceOf()` /
  `totalSupply()` never change — not rebasing.
- Tokens do **not** implement ERC-165 → probe `uiMultiplier()`; distinguish
  missing-function from RPC failure.
- Sources: `https://docs.robinhood.com/chain/building-with-stock-tokens/`,
  `https://docs.robinhood.com/chain/stock-tokens/`

## Price feeds (Chainlink)

- One `AggregatorV3Interface` feed per Stock Token. Feed price = **per-token**
  price (share price × multiplier already applied — do NOT multiply again).
- `underlying share price = feedPrice × 1e18 / uiMultiplier`.
- Feed list source of truth:
  `https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood`
- Stock feeds update 24/5. Check staleness vs heartbeat, reject ≤0, read
  `decimals()`, check L2 sequencer uptime feed, treat `oraclePaused()` as
  "price temporarily unavailable".
- Source: `https://docs.robinhood.com/chain/oracles-and-price-feeds/`

## REST API (`https://api.robinhood.com/rhj/`, 60 req/s)

- `GET /assets` (cache ~1min): `id` (uid, 0x+66hex), `tokenSymbol`, `tokenName`,
  `deployments[]{contractAddress,chainId,networkName}`, `currentMultiplier`
  (18dp decimal string), `pendingMultiplier` (`""` when none),
  `pendingMultiplierEffectiveTime` (RFC-3339), `logoUrl`,
  `tradingCapabilities`, `status` (`ASSET_STATUS_*`).
- `GET /prices`: raw underlying-equity bid/ask (NOT multiplier-adjusted) +
  `isTradingHalt` flag.
- `GET /corporate-actions` (cache 1h): `corpActions[]` — `id` (uid, stable
  dedup key), `type`, `status`, `processDate{year,month,day}` (ctok scheduling
  date; multiplier-effective date for splits), `tokenSymbol`, `deployments[]`,
  `details` (exactly one key by type; `*Rate` fields are decimal strings).
- Types active at launch: `FORWARD_SPLIT`, `REVERSE_SPLIT`, `CASH_DIVIDEND`,
  `STOCK_DIVIDEND`. Forward-compat (never pretend to understand):
  `SPIN_OFF`, `CASH_MERGER`, `STOCK_MERGER`, `STOCK_AND_CASH_MERGER`,
  `REDEMPTION`, `NAME_CHANGE`, `WORTHLESS_REMOVAL`, `RIGHTS_DISTRIBUTION`,
  `UNIT_SPLIT`. Statuses: `IN_PROGRESS`, `COMPLETED`.
- Live capture 2026-09-19: 48 in-progress cash dividends.
- Source: `https://docs.robinhood.com/chain/stock-token-apis/`

## USDG (Global Dollar)

- Mainnet: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` — verified onchain:
  `symbol()="USDG"`, `name()="Global Dollar"`, `decimals()=6`.
- **Not deployed on testnet** (no code at address) → testnet uses explicitly
  labelled MockUSDG (6 decimals).
- WETH mainnet: `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`.
- Source: `https://docs.robinhood.com/chain/contracts/` + onchain probes.

## Implications for CorpShift

1. CorpShift adapters must read `uiMultiplier()` + `newUIMultiplier()` +
   `effectiveAt()` + `oraclePaused()` — all verified real.
2. Corporate-action truth arrives offchain (REST API) → EIP-712 attested
   ingestion is the honest trust model for v1; `uid()` links actions to
   tokens onchain.
3. Testnet has no Stock Tokens/USDG → demo deploys labelled mocks implementing
   the exact same interfaces; mainnet deployment can point adapters at real
   tokens unchanged.
4. Feed prices are already multiplier-adjusted → normalization layer handles
   units, not price correction.
