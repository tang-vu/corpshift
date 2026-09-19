/**
 * API runtime config — same env-var convention as the indexer so one
 * .env drives the whole stack.
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hex } from "viem";
import { parseManifest, type DeploymentManifest } from "@corpshift/shared";

/** apps/api/src → repo root. Relative env paths anchor here so the api can
 *  be started from any cwd and still find deployments/ and data/. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const repoPath = (p: string) => (isAbsolute(p) ? p : resolve(REPO_ROOT, p));

export interface ApiConfig {
  port: number;
  chainId: number;
  rpcUrl: string;
  manifestPath: string;
  manifest: DeploymentManifest;
  dbPath: string;
  /** Wallet keys — demo conductor only. Absent ⇒ /v1/demo endpoints 503. */
  demoUserKey: Hex | undefined;
  demoOperatorKey: Hex | undefined;
  demoLiquidatorKey: Hex | undefined;
  attesterKey: Hex | undefined;
  /** Seconds between attestation and effectiveness in the demo scenario. */
  demoPendingSeconds: number;
}

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing required env ${name}`);
  return v;
}

export function loadConfig(
  envOverrides: Record<string, string | undefined> = {},
): ApiConfig {
  const get = (n: string, f?: string) =>
    envOverrides[n] !== undefined ? (envOverrides[n] as string) : env(n, f);

  const chainId = Number(get("CORPSHIFT_CHAIN_ID", "31337"));
  const manifestPath = repoPath(
    get("CORPSHIFT_MANIFEST", `deployments/${chainId}.json`),
  );
  const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")));

  const dbPath = get("CORPSHIFT_DB", `data/indexer-${chainId}.sqlite`);
  return {
    port: Number(get("CORPSHIFT_API_PORT", "4000")),
    chainId,
    rpcUrl: get("CORPSHIFT_RPC_URL", "http://127.0.0.1:8545"),
    manifestPath,
    manifest,
    dbPath: dbPath === ":memory:" ? dbPath : repoPath(dbPath),
    demoUserKey: (get("CORPSHIFT_DEMO_USER_KEY", "") || undefined) as Hex | undefined,
    demoOperatorKey: (get("CORPSHIFT_OPERATOR_KEY", "") || undefined) as Hex | undefined,
    demoLiquidatorKey: (get("CORPSHIFT_LIQUIDATOR_KEY", "") || undefined) as Hex | undefined,
    attesterKey: (get("CORPSHIFT_ATTESTER_KEY", "") || undefined) as Hex | undefined,
    demoPendingSeconds: Number(get("CORPSHIFT_DEMO_PENDING_SECONDS", "12")),
  };
}
