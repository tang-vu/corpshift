/**
 * Canonical domain model — mirrors `CorpShiftTypes.sol` exactly.
 * Numeric values MUST match the onchain enums: the registry interprets
 * `actionType` as a uint8 index into this list.
 */
import type { Address, Hex } from "viem";

export const ActionType = {
  ForwardSplit: 0,
  ReverseSplit: 1,
  CashDividend: 2,
  StockDividend: 3,
  Merger: 4,
  SpinOff: 5,
  Redemption: 6,
  SymbolChange: 7,
  TradingHalt: 8,
  TradingResume: 9,
  MultiplierChange: 10,
  Unknown: 11,
} as const;
export type ActionType = (typeof ActionType)[keyof typeof ActionType];
export const ACTION_TYPE_NAMES: Record<ActionType, string> = {
  [ActionType.ForwardSplit]: "FORWARD_SPLIT",
  [ActionType.ReverseSplit]: "REVERSE_SPLIT",
  [ActionType.CashDividend]: "CASH_DIVIDEND",
  [ActionType.StockDividend]: "STOCK_DIVIDEND",
  [ActionType.Merger]: "MERGER",
  [ActionType.SpinOff]: "SPIN_OFF",
  [ActionType.Redemption]: "REDEMPTION",
  [ActionType.SymbolChange]: "SYMBOL_CHANGE",
  [ActionType.TradingHalt]: "TRADING_HALT",
  [ActionType.TradingResume]: "TRADING_RESUME",
  [ActionType.MultiplierChange]: "MULTIPLIER_CHANGE",
  [ActionType.Unknown]: "UNKNOWN",
};

export const ActionStatus = {
  Scheduled: 0,
  Active: 1,
  Resolved: 2,
  Invalidated: 3,
  Unsupported: 4,
} as const;
export type ActionStatus = (typeof ActionStatus)[keyof typeof ActionStatus];

export const AssetState = {
  Active: 0,
  ActionPending: 1,
  Adjusting: 2,
  Halted: 3,
  Migrating: 4,
  Redeeming: 5,
  Degraded: 6,
  Unsupported: 7,
} as const;
export type AssetState = (typeof AssetState)[keyof typeof AssetState];
export const ASSET_STATE_NAMES: Record<AssetState, string> = {
  [AssetState.Active]: "ACTIVE",
  [AssetState.ActionPending]: "ACTION_PENDING",
  [AssetState.Adjusting]: "ADJUSTING",
  [AssetState.Halted]: "HALTED",
  [AssetState.Migrating]: "MIGRATING",
  [AssetState.Redeeming]: "REDEEMING",
  [AssetState.Degraded]: "DEGRADED",
  [AssetState.Unsupported]: "UNSUPPORTED",
};

export const PolicyOp = {
  Deposit: 0,
  Withdraw: 1,
  Borrow: 2,
  Liquidate: 3,
  CreateOrder: 4,
  Settle: 5,
  Transfer: 6,
  UseAsCollateral: 7,
  PriceRead: 8,
} as const;
export type PolicyOp = (typeof PolicyOp)[keyof typeof PolicyOp];

/** Action parameters — the decoded form. `encodeParams` ABI-encodes these
 *  in the exact layout the registry expects (last word = expectedMultiplier). */
export interface SplitParams {
  numerator: bigint;
  denominator: bigint;
  expectedMultiplier: bigint;
}
export interface CashDividendParams {
  /** Atomic payment-token units per 1.0 economic unit (e.g. USDG 6dp). */
  amountPerUnit: bigint;
  paymentToken: Address;
  /** 0 = pure cash entitlement (informational); >0 = reinvested model. */
  expectedMultiplier: bigint;
}
export interface MultiplierChangeParams {
  expectedMultiplier: bigint;
}
export interface GenericParams {
  /** ABI-ready bytes for action types with no canonical field layout. */
  raw: Hex;
}
export type ActionParams =
  SplitParams | CashDividendParams | MultiplierChangeParams | GenericParams;

/** The canonical, schema-validated corporate action (`corpshift.action.v1`).
 *  This is the offchain truth; `toActionPayload` derives the hashed onchain form. */
export interface CanonicalAction {
  schema: "corpshift.action.v1";
  /** Source identifier, e.g. "robinhood-rhj". Hashed into sourceHash. */
  source: string;
  /** Source-assigned event id — bytes32 hex, or utf8 (hashed). */
  sourceEventId: Hex | string;
  asset: Address;
  actionType: ActionType;
  announcedAt: bigint;
  effectiveAt: bigint;
  observedAt: bigint;
  params: ActionParams;
  /** Raw source evidence — hashed into evidenceHash via canonical JSON. */
  evidence: unknown;
}

/** The EIP-712 signed struct, as submitted to `submitAction`. */
export interface ActionPayload {
  schemaHash: Hex;
  sourceHash: Hex;
  sourceEventId: Hex;
  asset: Address;
  actionType: number;
  announcedAt: bigint;
  effectiveAt: bigint;
  observedAt: bigint;
  paramsHash: Hex;
  evidenceHash: Hex;
}

/** Result of full canonicalization: payload + encoded params for submission. */
export interface CanonicalizedAction {
  payload: ActionPayload;
  encodedParams: Hex;
  actionId: Hex;
}
