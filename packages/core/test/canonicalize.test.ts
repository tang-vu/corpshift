import { describe, expect, it } from "vitest";
import { decodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import {
  actionIdOf,
  canonicalize,
  encodeParams,
  evidenceHashOf,
  stableJson,
} from "../src/canonicalize.js";
import { ActionType, type CanonicalAction } from "../src/types.js";
import { parseCanonicalAction } from "../src/schema.js";
import { CRWD_FORWARD_SPLIT } from "../src/fixtures/mainnet.js";

describe("stableJson", () => {
  it("sorts keys recursively and drops undefined", () => {
    const a = { z: 1, b: { y: 2, a: 3 }, c: undefined };
    const b = { b: { a: 3, y: 2 }, z: 1 };
    expect(stableJson(a)).toBe(stableJson(b));
    expect(stableJson(a)).toBe('{"b":{"a":3,"y":2},"z":1}');
  });
  it("serializes bigint deterministically", () => {
    expect(stableJson({ m: 4_000_000_000_000_000_000n })).toBe('{"m":"4000000000000000000"}');
  });
});

describe("encodeParams", () => {
  it("encodes split params with expectedMultiplier as the last word", () => {
    const enc = encodeParams(ActionType.ForwardSplit, {
      numerator: 4n,
      denominator: 1n,
      expectedMultiplier: 4_000_000_000_000_000_000n,
    });
    const [num, den, exp] = decodeAbiParameters(parseAbiParameters("uint256,uint256,uint256"), enc);
    expect([num, den, exp]).toEqual([4n, 1n, 4_000_000_000_000_000_000n]);
  });

  it("encodes cash dividend with payment token and zero expected multiplier", () => {
    const enc = encodeParams(ActionType.CashDividend, {
      amountPerUnit: 280_000n,
      paymentToken: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      expectedMultiplier: 0n,
    });
    const [amount, token, exp] = decodeAbiParameters(
      parseAbiParameters("uint256,address,uint256"),
      enc,
    );
    expect(amount).toBe(280_000n);
    expect(token.toLowerCase()).toBe("0x5fc5360d0400a0fd4f2af552add042d716f1d168");
    expect(exp).toBe(0n);
  });
});

describe("canonicalize", () => {
  it("produces a submission-ready payload for the CRWD fixture", () => {
    const c = canonicalize(CRWD_FORWARD_SPLIT);
    expect(c.payload.asset).toBe("0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931");
    expect(c.payload.actionType).toBe(ActionType.ForwardSplit);
    // actionId is deterministic — recomputing yields the same id.
    expect(c.actionId).toBe(actionIdOf(c.payload.sourceHash, c.payload.sourceEventId));
    // paramsHash binds the encoded params.
    expect(c.payload.paramsHash).toBe(keccak256(c.encodedParams));
  });

  it("is deterministic across identical logical actions", () => {
    const a = canonicalize(CRWD_FORWARD_SPLIT);
    const b = canonicalize({ ...CRWD_FORWARD_SPLIT, evidence: { reordered: true, z: 1, a: 2 } });
    expect(a.payload.sourceEventId).toBe(b.payload.sourceEventId);
    expect(a.actionId).toBe(b.actionId); // evidence hash differs, id does not
    expect(a.payload.evidenceHash).not.toBe(b.payload.evidenceHash);
  });

  it("evidenceHashOf is order-independent", () => {
    expect(evidenceHashOf({ a: 1, b: [3, { d: 4, c: 5 }] })).toBe(
      evidenceHashOf({ b: [3, { c: 5, d: 4 }], a: 1 }),
    );
  });
});

describe("schema", () => {
  it("accepts the CRWD fixture", () => {
    expect(() => parseCanonicalAction(CRWD_FORWARD_SPLIT)).not.toThrow();
  });
  it("rejects a split with mismatched param shape", () => {
    const bad: CanonicalAction = {
      ...CRWD_FORWARD_SPLIT,
      params: { raw: "0x1234" },
    };
    expect(() => parseCanonicalAction(bad)).toThrow();
  });
  it("rejects malformed asset addresses", () => {
    const bad = { ...CRWD_FORWARD_SPLIT, asset: "0x1234" };
    expect(() => parseCanonicalAction(bad)).toThrow();
  });
});
