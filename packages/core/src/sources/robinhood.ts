/**
 * Robinhood `/rhj/` REST source normalizer.
 * Maps the documented corporate-action wire format onto the canonical
 * `corpshift.action.v1` model. STRICT: an action whose economics cannot be
 * extracted throws `UnnormalizableActionError` — the indexer records the
 * failure rather than attesting garbage onchain.
 */
import type { Address, Hex } from "viem";
import { ActionType, type CanonicalAction } from "../types.js";

export const ROBINHOOD_SOURCE_ID = "robinhood-rhj";

/* ------------------------------------------------------------------ */
/* Wire types (subset of the documented response surface)              */
/* ------------------------------------------------------------------ */

export interface RhDate {
  year: number;
  month: number;
  day: number;
}
export interface RhDeployment {
  contractAddress: string;
  chainId: number;
  networkName?: string;
}
export interface RhCorporateAction {
  id: string;
  type: string;
  status: string;
  processDate?: RhDate;
  announcedDate?: RhDate;
  tokenSymbol?: string;
  deployments?: readonly RhDeployment[];
  details?: Record<string, Record<string, unknown> | undefined>;
}
export interface RhAsset {
  id: string;
  tokenSymbol: string;
  tokenName?: string;
  deployments?: readonly RhDeployment[];
  currentMultiplier?: string;
  pendingMultiplier?: string;
  status?: string;
  tokenDecimals?: number;
  isin?: string;
}

export interface NormalizeContext {
  /** Target chain — selects the matching entry of `deployments[]`. */
  chainId: number;
  /** Payment token for cash entitlements (USDG or mock). */
  paymentToken: Address;
  /** Decimals of the payment token (USDG = 6). */
  paymentTokenDecimals: number;
  /** Observation time for this ingestion pass (unix seconds). */
  observedAt: bigint;
}

export class UnnormalizableActionError extends Error {
  constructor(
    public readonly sourceEventId: string,
    reason: string,
  ) {
    super(`[${sourceEventId}] ${reason}`);
    this.name = "UnnormalizableActionError";
  }
}

/* ------------------------------------------------------------------ */
/* Type mapping — unmapped enum values become UNKNOWN, never guessed   */
/* ------------------------------------------------------------------ */

const TYPE_MAP: Record<string, ActionType> = {
  CORPORATE_ACTION_TYPE_FORWARD_SPLIT: ActionType.ForwardSplit,
  CORPORATE_ACTION_TYPE_REVERSE_SPLIT: ActionType.ReverseSplit,
  CORPORATE_ACTION_TYPE_CASH_DIVIDEND: ActionType.CashDividend,
  CORPORATE_ACTION_TYPE_STOCK_DIVIDEND: ActionType.StockDividend,
  CORPORATE_ACTION_TYPE_MERGER: ActionType.Merger,
  CORPORATE_ACTION_TYPE_SPIN_OFF: ActionType.SpinOff,
  CORPORATE_ACTION_TYPE_REDEMPTION: ActionType.Redemption,
  CORPORATE_ACTION_TYPE_NAME_CHANGE: ActionType.SymbolChange,
  CORPORATE_ACTION_TYPE_SYMBOL_CHANGE: ActionType.SymbolChange,
  CORPORATE_ACTION_TYPE_TRADING_HALT: ActionType.TradingHalt,
  CORPORATE_ACTION_TYPE_TRADING_RESUME: ActionType.TradingResume,
  CORPORATE_ACTION_TYPE_MULTIPLIER_UPDATE: ActionType.MultiplierChange,
  CORPORATE_ACTION_TYPE_UI_MULTIPLIER_UPDATE: ActionType.MultiplierChange,
};

export function mapRobinhoodType(raw: string): ActionType {
  return TYPE_MAP[raw] ?? ActionType.Unknown;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Decimal-string → scaled bigint. "0.874889" @6 → 874889n.
 *  Errors on precision loss beyond `decimals` — never silently round
 *  an attested economic quantity. */
export function decimalToScaled(value: string, decimals: number): bigint {
  const m = /^(-?\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) throw new Error(`invalid decimal: ${value}`);
  const [, intPart, frac = ""] = m;
  if (frac.length > decimals && /[1-9]/.test(frac.slice(decimals))) {
    throw new Error(`precision loss: ${value} exceeds ${decimals} decimals`);
  }
  const scaled = intPart + frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(scaled);
}

function dateToUnix(d: RhDate | undefined, id: string): bigint {
  if (!d) throw new UnnormalizableActionError(id, "missing processDate");
  return BigInt(Math.floor(Date.UTC(d.year, d.month - 1, d.day) / 1000));
}

function deploymentFor(a: RhCorporateAction, chainId: number): RhDeployment | undefined {
  return a.deployments?.find((d) => d.chainId === chainId);
}

/** Split-style ratios: accept {numerator,denominator}, {ratio:"4:1"},
 *  or {newMultiplier:"4.000000000000000000"} detail shapes. */
function splitParams(
  details: Record<string, unknown> | undefined,
  id: string,
): { numerator: bigint; denominator: bigint; expectedMultiplier: bigint } {
  const d = details ?? {};
  if (d.newMultiplier !== undefined) {
    const expectedMultiplier = decimalToScaled(String(d.newMultiplier), 18);
    return { numerator: expectedMultiplier, denominator: 10n ** 18n, expectedMultiplier };
  }
  const num = d.numerator ?? d.newShares ?? d.splitNumerator;
  const den = d.denominator ?? d.oldShares ?? d.splitDenominator;
  if (num !== undefined && den !== undefined) {
    const numerator = BigInt(String(num));
    const denominator = BigInt(String(den));
    if (denominator === 0n) throw new UnnormalizableActionError(id, "zero split denominator");
    const expectedMultiplier = (numerator * 10n ** 18n) / denominator;
    return { numerator, denominator, expectedMultiplier };
  }
  if (typeof d.ratio === "string") {
    const [n, dnm] = d.ratio.split(":").map((s) => BigInt(s.trim()));
    if (n && dnm) {
      const expectedMultiplier = (n * 10n ** 18n) / dnm;
      return { numerator: n, denominator: dnm, expectedMultiplier };
    }
  }
  throw new UnnormalizableActionError(id, "split detail shape unrecognized");
}

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */

export function normalizeRobinhoodAction(
  raw: RhCorporateAction,
  ctx: NormalizeContext,
): CanonicalAction {
  const id = raw.id;
  const actionType = mapRobinhoodType(raw.type);
  const deployment = deploymentFor(raw, ctx.chainId);
  if (!deployment) {
    throw new UnnormalizableActionError(id, `no deployment on chainId ${ctx.chainId}`);
  }
  const effectiveAt = dateToUnix(raw.processDate, id);
  const announcedAt = raw.announcedDate
    ? dateToUnix(raw.announcedDate, id)
    : // announcedAt isn't published — the action was certainly announced by
      // its effective date at the latest, so clamp to the earlier of the two.
      effectiveAt < ctx.observedAt
      ? effectiveAt
      : ctx.observedAt;

  const detailKey = Object.keys(raw.details ?? {})[0];
  const details = detailKey ? raw.details?.[detailKey] : undefined;

  let params: CanonicalAction["params"];
  switch (actionType) {
    case ActionType.ForwardSplit:
    case ActionType.ReverseSplit:
    case ActionType.StockDividend:
      params = splitParams(details, id);
      break;
    case ActionType.CashDividend: {
      const rate = details?.rate;
      if (rate === undefined) {
        throw new UnnormalizableActionError(id, "cash dividend missing rate");
      }
      params = {
        amountPerUnit: decimalToScaled(String(rate), ctx.paymentTokenDecimals),
        paymentToken: ctx.paymentToken,
        expectedMultiplier: 0n, // pure cash entitlement → informational
      };
      break;
    }
    case ActionType.MultiplierChange: {
      const nm = details?.newMultiplier ?? details?.multiplier;
      if (nm === undefined) {
        throw new UnnormalizableActionError(id, "multiplier change missing value");
      }
      params = { expectedMultiplier: decimalToScaled(String(nm), 18) };
      break;
    }
    default:
      params = { raw: "0x" as Hex };
  }

  return {
    schema: "corpshift.action.v1",
    source: ROBINHOOD_SOURCE_ID,
    sourceEventId: id,
    asset: deployment.contractAddress as Address,
    actionType,
    announcedAt,
    effectiveAt,
    observedAt: ctx.observedAt,
    params,
    evidence: raw,
  };
}

export interface NormalizeBatchResult {
  actions: CanonicalAction[];
  failures: { sourceEventId: string; reason: string }[];
}

/** Batch normalization that never dies on a single bad record —
 *  failures are reported with their source ids for reconciliation. */
export function normalizeRobinhoodActions(
  raws: RhCorporateAction[],
  ctx: NormalizeContext,
): NormalizeBatchResult {
  const actions: CanonicalAction[] = [];
  const failures: NormalizeBatchResult["failures"] = [];
  for (const raw of raws) {
    try {
      actions.push(normalizeRobinhoodAction(raw, ctx));
    } catch (e) {
      failures.push({
        sourceEventId: raw.id ?? "unknown",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { actions, failures };
}
