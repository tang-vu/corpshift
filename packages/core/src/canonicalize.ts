/**
 * Deterministic canonicalization: every CorpShift component anywhere must
 * derive the same hashes from the same logical action. The three rules:
 *   1. Strings → keccak256(utf8) unless already bytes32.
 *   2. Evidence → keccak256(stable-JSON) — keys sorted recursively.
 *   3. Params → ABI-encoded per action type; paramsHash = keccak256(bytes).
 */
import {
  encodeAbiParameters,
  isHex,
  keccak256,
  size,
  stringToHex,
  toHex,
  type Hex,
} from "viem";
import {
  ActionType,
  type ActionParams,
  type ActionPayload,
  type CanonicalAction,
  type CanonicalizedAction,
  type CashDividendParams,
  type GenericParams,
  type MultiplierChangeParams,
  type SplitParams,
} from "./types.js";
import { SCHEMA_ID } from "./schema.js";

export const SCHEMA_V1_HASH: Hex = keccak256(stringToHex(SCHEMA_ID));

/** keccak256 of a utf8 source identifier, e.g. "robinhood-rhj". */
export function sourceHashOf(source: string): Hex {
  return keccak256(stringToHex(source));
}

/** bytes32 event id: passed through when already bytes32, else keccak(utf8). */
export function eventIdOf(id: Hex | string): Hex {
  if (isHex(id) && size(id) === 32) return id;
  return keccak256(stringToHex(id));
}

/** Deterministic JSON: object keys sorted recursively, no whitespace.
 *  BigInts serialize as decimal strings. Undefined map values are dropped
 *  (same as JSON.stringify semantics). */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(sortValue);
  if (v !== null && typeof v === "object") {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      const val = src[k];
      if (val !== undefined) out[k] = sortValue(val);
    }
    return out;
  }
  return v;
}

/** keccak256(stableJson(evidence)) — the attested evidence fingerprint. */
export function evidenceHashOf(evidence: unknown): Hex {
  return keccak256(toHex(stableJson(evidence)));
}

/** ABI-encode action params in the layout the registry expects.
 *  Layout contract: the LAST uint256 word is always `expectedMultiplier`
 *  (0 = no reconciliation expectation). `_lastWord` in CorpShiftRegistry
 *  reads exactly this word. */
export function encodeParams(actionType: ActionType, params: ActionParams): Hex {
  switch (actionType) {
    case ActionType.ForwardSplit:
    case ActionType.ReverseSplit:
    case ActionType.StockDividend: {
      const p = params as SplitParams;
      return encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
        [p.numerator, p.denominator, p.expectedMultiplier],
      );
    }
    case ActionType.CashDividend: {
      const p = params as CashDividendParams;
      return encodeAbiParameters(
        [{ type: "uint256" }, { type: "address" }, { type: "uint256" }],
        [p.amountPerUnit, p.paymentToken, p.expectedMultiplier],
      );
    }
    case ActionType.MultiplierChange: {
      const p = params as MultiplierChangeParams;
      return encodeAbiParameters([{ type: "uint256" }], [p.expectedMultiplier]);
    }
    default: {
      // Generic/informational types: raw bytes passthrough. When the caller
      // supplies `raw` it must already be ABI-encoded (or arbitrary evidence
      // bytes — non-economic types never read a multiplier word).
      return (params as GenericParams).raw;
    }
  }
}

/** keccak256(abi.encode(sourceHash, sourceEventId)) — matches
 *  `AttestationLib.actionIdOf`. One source event → one action id, forever. */
export function actionIdOf(sourceHash: Hex, sourceEventId: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [sourceHash, sourceEventId]),
  );
}

/** Full canonicalization: derive all hashes + the submission-ready payload. */
export function canonicalize(action: CanonicalAction): CanonicalizedAction {
  const encodedParams = encodeParams(action.actionType, action.params);
  const sourceHash = sourceHashOf(action.source);
  const sourceEventId = eventIdOf(action.sourceEventId);
  const payload: ActionPayload = {
    schemaHash: SCHEMA_V1_HASH,
    sourceHash,
    sourceEventId,
    asset: action.asset,
    actionType: action.actionType,
    announcedAt: action.announcedAt,
    effectiveAt: action.effectiveAt,
    observedAt: action.observedAt,
    paramsHash: keccak256(encodedParams),
    evidenceHash: evidenceHashOf(action.evidence),
  };
  return { payload, encodedParams, actionId: actionIdOf(sourceHash, sourceEventId) };
}

/** Encode `submitAction(payload, params, signature)` calldata pieces —
 *  the trio every submitter needs. */
export function submissionArgs(action: CanonicalAction, signature: Hex) {
  const c = canonicalize(action);
  return { payload: c.payload, params: c.encodedParams, signature, actionId: c.actionId };
}
