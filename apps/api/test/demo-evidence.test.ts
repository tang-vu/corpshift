import { describe, expect, it } from "vitest";
import { BaseError, ContractFunctionRevertedError, toFunctionSelector } from "viem";
import { assertSuccessfulReceipt, expectedRevert } from "../src/demo-evidence.ts";

describe("demo evidence", () => {
  it("does not count an RPC outage or an unrelated revert as protection", () => {
    expect(expectedRevert(new Error("fetch failed"), "NotLiquidatable")).toBe(false);
    expect(expectedRevert(new Error("NotLiquidatable"), "NotLiquidatable")).toBe(false);
    const unrelated = new ContractFunctionRevertedError({
      abi: [{ type: "error", name: "Unauthorized", inputs: [] }],
      functionName: "liquidate",
      data: toFunctionSelector("Unauthorized()"),
    });
    expect(expectedRevert(unrelated, "NotLiquidatable")).toBe(false);
  });

  it("accepts only the decoded expected contract error, including wrapped errors", () => {
    const revert = new ContractFunctionRevertedError({
      abi: [{ type: "error", name: "NotLiquidatable", inputs: [] }],
      functionName: "liquidate",
      data: toFunctionSelector("NotLiquidatable()"),
    });
    expect(
      expectedRevert(new BaseError("simulation failed", { cause: revert }), "NotLiquidatable"),
    ).toBe(true);
  });

  it("rejects a mined but reverted transaction", () => {
    expect(() => assertSuccessfulReceipt({ status: "reverted", transactionHash: "0x123" })).toThrow(
      "reverted",
    );
    expect(() =>
      assertSuccessfulReceipt({ status: "success", transactionHash: "0x123" }),
    ).not.toThrow();
  });
});
