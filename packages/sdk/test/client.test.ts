import { describe, expect, it } from "vitest";
import { createPublicClient, custom, type PublicClient } from "viem";
import { CorpShiftClient } from "../src/client.js";
import { CorpShiftRegistryAbi } from "../src/abi/index.js";

const REGISTRY = "0x1000000000000000000000000000000000000001" as const;

/** A public client whose transport serves canned readContract responses. */
function fakeClient(result: unknown): PublicClient {
  return createPublicClient({
    transport: custom({
      async request({ method }) {
        if (method === "eth_chainId") return "0xb646"; // 46630
        // Return a pre-encoded word the ABI decoder can read.
        return result;
      },
    }),
  });
}

describe("CorpShiftClient", () => {
  it("binds the EIP-712 domain to the configured chain + registry", () => {
    const client = new CorpShiftClient({
      publicClient: fakeClient("0x0"),
      registry: REGISTRY,
      chainId: 46630,
    });
    expect(client.registry).toBe(REGISTRY);
    expect(client.chainId).toBe(46630n);
  });

  it("registry ABI exports the attestation surface", () => {
    const names = CorpShiftRegistryAbi.map((e) => ("name" in e ? e.name : "")).filter(Boolean);
    for (const fn of [
      "submitAction",
      "activateAction",
      "applyAction",
      "invalidateAction",
      "economicExposureOf",
      "checkPolicy",
      "attestDigest",
      "domainSeparator",
      "assetRuntimeState",
      "pendingCorporateAction",
    ]) {
      expect(names).toContain(fn);
    }
  });
});
