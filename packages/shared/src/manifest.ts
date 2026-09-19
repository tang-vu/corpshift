/**
 * Deployment manifest — the artifact `Deploy.s.sol` writes to
 * deployments/<chainId>.json. Single source of truth for "where is
 * CorpShift deployed on this chain" across indexer, API, SDK, and web.
 */
import type { Address } from "viem";

export interface DeploymentManifest {
  chainId: number;
  deployedAt: number;
  deployer: Address;
  attester: Address;
  demoMode: boolean;
  gitCommit: string;
  policyEngine: Address;
  registry: Address;
  stockTokenAdapter: Address;
  erc20Adapter: Address;
  settlementVault: Address;
  /** Present only when deployed with DEMO_MODE=true. */
  mockStockToken?: Address;
  mockUSDG?: Address;
  priceOracle?: Address;
  naiveVault?: Address;
  awareVault?: Address;
}

export function isDemoManifest(m: DeploymentManifest): boolean {
  return m.demoMode && !!m.mockStockToken;
}

/** Narrow an unknown JSON blob into a manifest (throws on missing fields). */
export function parseManifest(json: unknown): DeploymentManifest {
  const m = json as DeploymentManifest;
  if (!m || typeof m.chainId !== "number" || typeof m.registry !== "string") {
    throw new Error("invalid deployment manifest");
  }
  return m;
}
