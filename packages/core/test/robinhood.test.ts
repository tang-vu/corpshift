import { describe, expect, it } from "vitest";
import {
  decimalToScaled,
  mapRobinhoodType,
  normalizeRobinhoodAction,
  normalizeRobinhoodActions,
  UnnormalizableActionError,
  type NormalizeContext,
} from "../src/sources/robinhood.js";
import { ActionType, type CashDividendParams, type SplitParams } from "../src/types.js";
import {
  GLW_CASH_DIVIDEND_RAW,
  TSM_CASH_DIVIDEND_RAW,
  USDG_MAINNET,
} from "../src/fixtures/mainnet.js";

const CTX: NormalizeContext = {
  chainId: 4663,
  paymentToken: USDG_MAINNET,
  paymentTokenDecimals: 6,
  observedAt: 1_782_864_000n,
};

describe("mapRobinhoodType", () => {
  it("maps documented enum values", () => {
    expect(mapRobinhoodType("CORPORATE_ACTION_TYPE_FORWARD_SPLIT")).toBe(ActionType.ForwardSplit);
    expect(mapRobinhoodType("CORPORATE_ACTION_TYPE_CASH_DIVIDEND")).toBe(ActionType.CashDividend);
    expect(mapRobinhoodType("CORPORATE_ACTION_TYPE_REVERSE_SPLIT")).toBe(ActionType.ReverseSplit);
  });
  it("maps unrecognized values to UNKNOWN — never guesses", () => {
    expect(mapRobinhoodType("CORPORATE_ACTION_TYPE_WHATEVER_NEW")).toBe(ActionType.Unknown);
    expect(mapRobinhoodType("")).toBe(ActionType.Unknown);
  });
});

describe("decimalToScaled", () => {
  it("converts dividend rates to atomic units", () => {
    expect(decimalToScaled("0.28", 6)).toBe(280_000n);
    expect(decimalToScaled("0.874889", 6)).toBe(874_889n);
    expect(decimalToScaled("4.000000000000000000", 18)).toBe(4_000_000_000_000_000_000n);
  });
  it("refuses precision loss rather than rounding an attested quantity", () => {
    expect(() => decimalToScaled("0.1234567", 6)).toThrow(/precision/);
    expect(() => decimalToScaled("not-a-number", 6)).toThrow();
  });
});

describe("normalizeRobinhoodAction", () => {
  it("normalizes the real GLW cash dividend", () => {
    const a = normalizeRobinhoodAction(GLW_CASH_DIVIDEND_RAW, CTX);
    expect(a.actionType).toBe(ActionType.CashDividend);
    expect(a.asset).toBe("0x7c04E6A3368F2A1DE3874f0e80d2e0A1a9915da6");
    expect(a.sourceEventId).toBe(GLW_CASH_DIVIDEND_RAW.id); // bytes32 passthrough
    expect(a.effectiveAt).toBe(BigInt(Date.UTC(2026, 8, 29) / 1000));
    const p = a.params as CashDividendParams;
    expect(p.amountPerUnit).toBe(280_000n);
    expect(p.paymentToken).toBe(USDG_MAINNET);
    expect(p.expectedMultiplier).toBe(0n);
    expect(a.evidence).toBe(GLW_CASH_DIVIDEND_RAW);
  });

  it("normalizes the TSM dividend with 6dp rate precision", () => {
    const a = normalizeRobinhoodAction(TSM_CASH_DIVIDEND_RAW, CTX);
    expect((a.params as CashDividendParams).amountPerUnit).toBe(874_889n);
  });

  it("rejects actions with no deployment on the target chain", () => {
    const testnetCtx = { ...CTX, chainId: 46630 };
    expect(() => normalizeRobinhoodAction(GLW_CASH_DIVIDEND_RAW, testnetCtx)).toThrow(
      UnnormalizableActionError,
    );
  });

  it("normalizes a forward split from ratio details", () => {
    const raw = {
      id: "0x" + "ab".repeat(32),
      type: "CORPORATE_ACTION_TYPE_FORWARD_SPLIT",
      status: "CORPORATE_ACTION_STATUS_IN_PROGRESS",
      processDate: { year: 2026, month: 7, day: 2 },
      tokenSymbol: "CRWD",
      deployments: [
        { contractAddress: "0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931", chainId: 4663 },
      ],
      details: { forwardSplit: { numerator: "4", denominator: "1" } },
    };
    const a = normalizeRobinhoodAction(raw, CTX);
    expect(a.actionType).toBe(ActionType.ForwardSplit);
    const p = a.params as SplitParams;
    expect(p.expectedMultiplier).toBe(4_000_000_000_000_000_000n);
  });

  it("throws on an economic action whose economics cannot be extracted", () => {
    const raw = {
      id: "0x" + "cd".repeat(32),
      type: "CORPORATE_ACTION_TYPE_FORWARD_SPLIT",
      status: "CORPORATE_ACTION_STATUS_IN_PROGRESS",
      processDate: { year: 2026, month: 7, day: 2 },
      deployments: [
        { contractAddress: "0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931", chainId: 4663 },
      ],
      details: { forwardSplit: { surpriseField: true } },
    };
    expect(() => normalizeRobinhoodAction(raw, CTX)).toThrow(UnnormalizableActionError);
  });
});

describe("normalizeRobinhoodActions", () => {
  it("collects successes and failures independently", () => {
    const { actions, failures } = normalizeRobinhoodActions(
      [
        GLW_CASH_DIVIDEND_RAW,
        { ...TSM_CASH_DIVIDEND_RAW, deployments: [] }, // no deployment → failure
        {
          id: "0x" + "00".repeat(32),
          type: "BOGUS",
          status: "X",
          processDate: { year: 2026, month: 1, day: 1 },
          deployments: [
            { contractAddress: "0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931", chainId: 4663 },
          ],
        },
      ],
      CTX,
    );
    expect(actions).toHaveLength(2); // GLW dividend + BOGUS→Unknown
    expect(failures).toHaveLength(1);
    expect(failures[0]?.sourceEventId).toBe(TSM_CASH_DIVIDEND_RAW.id);
  });
});
