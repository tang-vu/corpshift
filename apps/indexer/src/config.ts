/**
 * Runtime configuration — every knob is an env var so the same binary runs
 * against anvil, Robinhood testnet, or mainnet with zero code changes.
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Address, Hex } from "viem";
import { parseManifest, type DeploymentManifest } from "@corpshift/shared";

/** apps/indexer/src → repo root. Relative env paths anchor here so the
 *  daemon can be started from any cwd and still find deployments/, data/,
 *  and the research fixtures. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const repoPath = (p: string) => (isAbsolute(p) ? p : resolve(REPO_ROOT, p));

export type SourceMode = "live" | "fixture" | "mock";

export interface IndexerConfig {
  chainId: number;
  rpcUrl: string;
  manifestPath: string;
  manifest: DeploymentManifest;
  attesterKey: Hex | undefined;
  operatorKey: Hex | undefined;
  dbPath: string;
  sourceMode: SourceMode;
  rhApiBase: string;
  paymentToken: Address | undefined;
  paymentTokenDecimals: number;
  pollMs: number;
  fromBlock: bigint;
  dryRun: boolean;
  symbolFilter: string[] | undefined;
}

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing required env ${name}`);
  return v;
}

export function loadConfig(envOverrides: Record<string, string | undefined> = {}): IndexerConfig {
  const get = (n: string, f?: string) =>
    envOverrides[n] !== undefined ? (envOverrides[n] as string) : env(n, f);

  const chainId = Number(get("CORPSHIFT_CHAIN_ID", "31337"));
  const manifestPath = repoPath(
    get("CORPSHIFT_MANIFEST", `deployments/${chainId}.json`),
  );
  const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")));

  const sourceMode = get("CORPSHIFT_SOURCE", "fixture") as SourceMode;
  if (!["live", "fixture", "mock"].includes(sourceMode)) {
    throw new Error(`invalid CORPSHIFT_SOURCE ${sourceMode}`);
  }

  return {
    chainId,
    rpcUrl: get("CORPSHIFT_RPC_URL", "http://127.0.0.1:8545"),
    manifestPath,
    manifest,
    attesterKey: (get("CORPSHIFT_ATTESTER_KEY", "") || undefined) as Hex | undefined,
    operatorKey: (get("CORPSHIFT_OPERATOR_KEY", "") || undefined) as Hex | undefined,
    dbPath: (() => {
      const p = get("CORPSHIFT_DB", `data/indexer-${chainId}.sqlite`);
      return p === ":memory:" ? p : repoPath(p);
    })(),
    sourceMode,
    rhApiBase: get("CORPSHIFT_RH_API", "https://api.robinhood.com/rhj"),
    paymentToken: (get("CORPSHIFT_PAYMENT_TOKEN", manifest.mockUSDG ?? "") ||
      undefined) as Address | undefined,
    paymentTokenDecimals: Number(get("CORPSHIFT_PAYMENT_DECIMALS", "6")),
    pollMs: Number(get("CORPSHIFT_POLL_MS", "15000")),
    fromBlock: BigInt(get("CORPSHIFT_FROM_BLOCK", "0")),
    dryRun: get("CORPSHIFT_DRY_RUN", "false") === "true",
    symbolFilter: get("CORPSHIFT_SYMBOLS", "")
      ? get("CORPSHIFT_SYMBOLS")!.split(",").map((s) => s.trim().toUpperCase())
      : undefined,
  };
}
