import { describe, expect, it } from "vitest";
import {
  CHAINS,
  LOCAL_CHAIN_ID,
  ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_TESTNET_CHAIN_ID,
  chainInfo,
  explorerAddressUrl,
  explorerTxUrl,
  isDemoManifest,
  parseManifest,
} from "../src/index.js";

describe("chains", () => {
  it("Robinhood chain ids match the published networks", () => {
    expect(ROBINHOOD_MAINNET_CHAIN_ID).toBe(4663);
    expect(ROBINHOOD_TESTNET_CHAIN_ID).toBe(46630);
    expect(CHAINS[ROBINHOOD_MAINNET_CHAIN_ID]?.rpcUrl).toContain("mainnet");
    expect(CHAINS[ROBINHOOD_TESTNET_CHAIN_ID]?.rpcUrl).toContain("testnet");
  });

  it("chainInfo throws on unsupported chains", () => {
    expect(() => chainInfo(1)).toThrow(/unsupported chainId 1/);
    expect(chainInfo(LOCAL_CHAIN_ID).name).toBe("Anvil (local)");
  });

  it("explorer urls are generated only where an explorer exists", () => {
    const tx = "0x" + "ab".repeat(32);
    expect(explorerTxUrl(ROBINHOOD_TESTNET_CHAIN_ID, tx)).toBe(
      `https://explorer.testnet.chain.robinhood.com/tx/${tx}`,
    );
    expect(explorerTxUrl(LOCAL_CHAIN_ID, tx)).toBeUndefined();
    expect(explorerAddressUrl(ROBINHOOD_MAINNET_CHAIN_ID, "0x1234")).toBe(
      "https://robinhoodchain.blockscout.com/address/0x1234",
    );
  });
});

describe("manifest", () => {
  it("parses a well-formed manifest and detects demo mode", () => {
    const m = parseManifest({
      chainId: LOCAL_CHAIN_ID,
      deployedAt: 1,
      deployer: "0x0000000000000000000000000000000000000001",
      attester: "0x0000000000000000000000000000000000000001",
      demoMode: true,
      gitCommit: "deadbeef",
      policyEngine: "0x0000000000000000000000000000000000000001",
      registry: "0x0000000000000000000000000000000000000002",
      stockTokenAdapter: "0x0000000000000000000000000000000000000003",
      erc20Adapter: "0x0000000000000000000000000000000000000004",
      settlementVault: "0x0000000000000000000000000000000000000005",
      mockStockToken: "0x0000000000000000000000000000000000000006",
    });
    expect(isDemoManifest(m)).toBe(true);
    expect(isDemoManifest({ ...m, demoMode: false })).toBe(false);
  });

  it("rejects blobs missing the core fields", () => {
    expect(() => parseManifest({})).toThrow(/invalid deployment manifest/);
    expect(() => parseManifest(null)).toThrow(/invalid deployment manifest/);
    expect(() => parseManifest({ chainId: "31337" })).toThrow(/invalid deployment manifest/);
  });
});
