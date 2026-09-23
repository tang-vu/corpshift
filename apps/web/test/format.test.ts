import { describe, expect, it } from "vitest";
import { fmt18, fmtHf, fmtReason, fmtMult, fmtPrice8, fmtUsd6 } from "../src/lib/format";

describe("financial display precision", () => {
  it("retains integer digits beyond Number.MAX_SAFE_INTEGER", () => {
    expect(fmt18("900719925474099312340000000000000000", 2)).toBe("900,719,925,474,099,312.34");
  });
  it("rounds once at the requested display boundary, including carries", () => {
    expect(fmt18("999999000000000000", 2)).toBe("1.00");
    expect(fmtUsd6("400000001")).toBe("400.00");
  });
  it("keeps the scenario's distinct decimal scales", () => {
    expect(fmt18("10000000000000000000")).toBe("10.00");
    expect(fmtPrice8("2500000000")).toBe("25.00");
    expect(fmtMult("4000000000000000000")).toBe("4.00×");
    expect(fmtHf("2000000000000000000")).toBe("2.00");
  });
});

it("decodes returned bytes32 policy reasons without deriving permission", () => {
  expect(fmtReason("0x" + "0".repeat(64))).toBe("OK (zero code)");
  expect(fmtReason("0x" + Buffer.from("ADJUSTING").toString("hex").padEnd(64, "0"))).toBe(
    "ADJUSTING",
  );
  expect(fmtReason("0x" + "ff".repeat(32))).toBe("Unrecognized code");
});
