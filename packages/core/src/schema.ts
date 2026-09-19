/**
 * `corpshift.action.v1` — the canonical corporate-action schema.
 * Validates the decoded (logical) form; `canonicalize` derives hashes.
 */
import { isAddress, isHex, size, type Address, type Hex } from "viem";
import { z } from "zod";
import { ActionType, type CanonicalAction } from "./types.js";

export const SCHEMA_ID = "corpshift.action.v1" as const;

const address = z
  .string()
  .refine((v): v is Address => isAddress(v, { strict: false }), "invalid address");

const bytes32 = z
  .string()
  .refine((v): v is Hex => isHex(v) && size(v as Hex) === 32, "expected bytes32 hex");

const sourceEventId = z.union([
  bytes32,
  z.string().min(1).max(256), // utf8 ids are keccak-hashed downstream
]);

const uint64 = z.bigint().min(0n).max(2n ** 64n - 1n);
const uint256 = z.bigint().min(0n).max(2n ** 256n - 1n);

const splitParams = z.object({
  numerator: uint256,
  denominator: uint256.refine((v) => v > 0n, "denominator must be > 0"),
  expectedMultiplier: uint256,
});
const cashDividendParams = z.object({
  amountPerUnit: uint256,
  paymentToken: address,
  expectedMultiplier: uint256,
});
const multiplierChangeParams = z.object({ expectedMultiplier: uint256 });
const genericParams = z.object({ raw: z.string().refine((v): v is Hex => isHex(v)) });

const base = z.object({
  schema: z.literal(SCHEMA_ID),
  source: z.string().min(1).max(128),
  sourceEventId,
  asset: address,
  announcedAt: uint64,
  effectiveAt: uint64,
  observedAt: uint64,
  evidence: z.unknown(),
});

const withType = <P extends z.ZodTypeAny>(t: ActionType, p: P) =>
  base.extend({ actionType: z.literal(t), params: p });

// z.union (not discriminatedUnion): zod 3 cannot extract a discriminator
// from union-of-literals, and one option per action type is clearer anyway.
export const canonicalActionSchema = z.union([
  withType(ActionType.ForwardSplit, splitParams),
  withType(ActionType.ReverseSplit, splitParams),
  withType(ActionType.StockDividend, splitParams),
  withType(ActionType.CashDividend, cashDividendParams),
  withType(ActionType.MultiplierChange, multiplierChangeParams),
  withType(ActionType.Merger, genericParams),
  withType(ActionType.SpinOff, genericParams),
  withType(ActionType.Redemption, genericParams),
  withType(ActionType.SymbolChange, genericParams),
  withType(ActionType.TradingHalt, genericParams),
  withType(ActionType.TradingResume, genericParams),
  withType(ActionType.Unknown, genericParams),
]);

/** Parse + validate a canonical action. Throws ZodError on malformed input. */
export function parseCanonicalAction(input: unknown): CanonicalAction {
  return canonicalActionSchema.parse(input) as CanonicalAction;
}
