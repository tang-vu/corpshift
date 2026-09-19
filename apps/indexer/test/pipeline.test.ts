import { describe, expect, it } from "vitest";
import { Store } from "../src/db.ts";
import { tick } from "../src/pipeline.ts";
import type { IndexerConfig } from "../src/config.ts";
import { ActionType } from "@corpshift/core";

// NOTE: tests use :memory: — file-backed sqlite under vitest's file watcher
// costs ~160ms/write on Windows; in-memory is identical logic, no IO.
function cfg(dbPath: string): IndexerConfig {
  return {
    chainId: 31337,
    rpcUrl: "http://127.0.0.1:8545",
    manifestPath: "unused",
    manifest: {
      chainId: 31337,
      deployedAt: 0,
      deployer: "0x0000000000000000000000000000000000000000",
      attester: "0x0000000000000000000000000000000000000000",
      demoMode: true,
      gitCommit: "test",
      policyEngine: "0x0000000000000000000000000000000000000001",
      registry: "0x0000000000000000000000000000000000000002",
      stockTokenAdapter: "0x0000000000000000000000000000000000000003",
      erc20Adapter: "0x0000000000000000000000000000000000000004",
      settlementVault: "0x0000000000000000000000000000000000000005",
      mockStockToken: "0x0000000000000000000000000000000000000006",
      mockUSDG: "0x0000000000000000000000000000000000000007",
    },
    attesterKey: undefined,
    operatorKey: undefined,
    dbPath,
    sourceMode: "fixture",
    rhApiBase: "https://api.robinhood.com/rhj",
    paymentToken: "0x0000000000000000000000000000000000000007",
    paymentTokenDecimals: 6,
    pollMs: 1000,
    fromBlock: 0n,
    dryRun: true, // observation only — no chain writes needed for this test
    symbolFilter: undefined,
  };
}

describe("pipeline tick (fixture, dry-run)", () => {
  it("records the CRWD fixture + replayed feed actions with trust labels", async () => {
    const store = new Store(":memory:");
    const res = await tick({ cfg: cfg(":memory:"), store }, 0);
    expect(res.mode).toBe("fixture");
    expect(res.seen).toBeGreaterThanOrEqual(1);
    expect(res.newActions).toBeGreaterThanOrEqual(1);

    const actions = store.listActions();
    const crwd = actions.find(
      (a) => a.asset === "0xea72ecca2d0f6bfa1394dbbcff85b52cd4233931",
    );
    expect(crwd).toBeDefined();
    expect(crwd?.action_type).toBe(ActionType.ForwardSplit);
    expect(crwd?.trust).toBe("fixture-replay");
    // dry-run: never submitted, but still recorded as observed.
    expect(crwd?.tx_hash).toBeNull();
    store.close();
  });

  it("is idempotent — second tick sees zero new actions", async () => {
    const store = new Store(":memory:");
    const deps = { cfg: cfg(":memory:"), store };
    await tick(deps, 0);
    const second = await tick(deps, 0);
    expect(second.newActions).toBe(0);
    store.close();
  });
});
