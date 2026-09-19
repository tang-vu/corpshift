/**
 * Real-data fixtures captured from live Robinhood Chain mainnet state and
 * the /rhj/ API on 2026-09-19 (see docs/research). These let the demo and
 * tests replay REAL corporate actions deterministically — labeled as
 * fixture data wherever surfaced.
 */
import type { Address, Hex } from "viem";
import { ActionType, type CanonicalAction } from "../types.js";

/** Live-verified mainnet Stock Token addresses (2026-09-19). */
export const MAINNET_TOKENS = {
  CRWD: "0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931" as Address,
  AAPL: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9" as Address,
  SGOV: "0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5" as Address,
  NVDA: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC" as Address,
  GLW: "0x7c04E6A3368F2A1DE3874f0e80d2e0A1a9915da6" as Address,
  TSM: "0x58FfE4a942d3885bAa22D7520691F611EF09e7AA" as Address,
} as const;

/** Mainnet USDG — no testnet deployment existed at research time. */
export const USDG_MAINNET = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;

/** CRWD onchain uid() — equals the /assets `id` field. */
export const CRWD_UID: Hex =
  "0x000000000000000000000000000000001adecf2c6a3749f9873b8926b5977c0a";

/** The CRWD 4-for-1 split, as verified live: uiMultiplier went to 4e18
 *  with effectiveAt = 1782999000. The strongest possible demo evidence —
 *  this is a real corporate action that actually changed a Stock Token's
 *  economic meaning. */
export const CRWD_FORWARD_SPLIT: CanonicalAction = {
  schema: "corpshift.action.v1",
  source: "robinhood-rhj",
  // Synthetic-but-stable event id for the fixture (source feed had not yet
  // published this action at capture time — labeled as such in evidence).
  sourceEventId: "fixture.crwd.forward-split.4for1.2026-07-02",
  asset: MAINNET_TOKENS.CRWD,
  actionType: ActionType.ForwardSplit,
  announcedAt: 1781625600n, // 2026-06-16T16:00Z (approx. announcement window)
  effectiveAt: 1782999000n, // live onchain effectiveAt for the 4e18 multiplier (2026-07-02T13:30Z)
  observedAt: 1782864000n, // 2026-07-01T00:00Z
  params: { numerator: 4n, denominator: 1n, expectedMultiplier: 4_000_000_000_000_000_000n },
  evidence: {
    fixture: true,
    source: "live-verification",
    verifiedAt: "2026-09-19",
    asset: "CRWD",
    address: MAINNET_TOKENS.CRWD,
    uid: CRWD_UID,
    observedMultiplier: "4.000000000000000000",
    onchainEffectiveAt: 1782999000,
    note: "CRWD uiMultiplier()=4e18 read live from mainnet; source corporate-actions feed had not yet listed this action at capture time.",
  },
};

/** A real in-progress cash dividend from the feed (GLW, rate 0.28). */
export const GLW_CASH_DIVIDEND_RAW = {
  id: "0x0000000000000000000000000000000040b2153b3d3d4715b8d22a15ba1acff2",
  type: "CORPORATE_ACTION_TYPE_CASH_DIVIDEND",
  status: "CORPORATE_ACTION_STATUS_IN_PROGRESS",
  processDate: { year: 2026, month: 9, day: 29 },
  tokenSymbol: "GLW",
  deployments: [
    {
      contractAddress: "0x7c04E6A3368F2A1DE3874f0e80d2e0A1a9915da6",
      chainId: 4663,
      networkName: "Robinhood Chain",
    },
  ],
  details: { cashDividend: { underlyingSymbol: "GLW", rate: "0.28" } },
} as const;

/** TSM dividend — second real record, for list/timeline fixtures. */
export const TSM_CASH_DIVIDEND_RAW = {
  id: "0x000000000000000000000000000000002e890a0884474abd86ba66b19722e827",
  type: "CORPORATE_ACTION_TYPE_CASH_DIVIDEND",
  status: "CORPORATE_ACTION_STATUS_IN_PROGRESS",
  processDate: { year: 2026, month: 10, day: 8 },
  tokenSymbol: "TSM",
  deployments: [
    {
      contractAddress: "0x58FfE4a942d3885bAa22D7520691F611EF09e7AA",
      chainId: 4663,
      networkName: "Robinhood Chain",
    },
  ],
  details: { cashDividend: { underlyingSymbol: "TSM", rate: "0.874889" } },
} as const;
