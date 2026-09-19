import { describe, expect, it } from "vitest";
import { buildApp } from "../src/server.ts";
import { buildClients } from "../src/clients.ts";
import type { ApiConfig } from "../src/config.ts";

const cfg: ApiConfig = {
  port: 0,
  chainId: 31337,
  rpcUrl: "http://127.0.0.1:8545",
  manifestPath: "x",
  manifest: {
    chainId: 31337,
    deployedAt: 0,
    deployer: "0x0000000000000000000000000000000000000001",
    attester: "0x0000000000000000000000000000000000000002",
    demoMode: true,
    gitCommit: "test",
    policyEngine: "0x0000000000000000000000000000000000000003",
    registry: "0x0000000000000000000000000000000000000004",
    stockTokenAdapter: "0x0000000000000000000000000000000000000005",
    erc20Adapter: "0x0000000000000000000000000000000000000006",
    settlementVault: "0x0000000000000000000000000000000000000007",
    mockStockToken: "0x0000000000000000000000000000000000000008",
    mockUSDG: "0x0000000000000000000000000000000000000009",
    priceOracle: "0x000000000000000000000000000000000000000a",
    naiveVault: "0x000000000000000000000000000000000000000b",
    awareVault: "0x000000000000000000000000000000000000000c",
  },
  dbPath: ":memory:",
  demoUserKey: undefined,
  demoOperatorKey: undefined,
  demoLiquidatorKey: undefined,
  attesterKey: undefined,
  demoPendingSeconds: 12,
};

const { app } = buildApp(cfg, buildClients(cfg));

describe("api", () => {
  it("health responds with chain + registry binding", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.chainId).toBe(31337);
    expect(body.registry).toBe(cfg.manifest.registry);
    expect(body.demoEnabled).toBe(false);
  });

  it("openapi.yaml is served", async () => {
    const res = await app.request("/openapi.yaml");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("CorpShift API");
  });

  it("actions endpoint returns indexed rows (empty db)", async () => {
    const res = await app.request("/v1/actions");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ actions: [] });
  });

  it("demo state 503s without demo keys", async () => {
    const res = await app.request("/v1/demo/state");
    expect(res.status).toBe(503);
  });
});
