#!/usr/bin/env node
/**
 * pnpm demo — one-command CorpShift demo stack.
 *
 *   1. anvil (local chain, if port 8545 free)
 *   2. forge script Deploy.s.sol → deployments/31337.json
 *   3. indexer (fixture + dry-run: real Robinhood data indexed, no onchain writes)
 *   4. api    (demo conductor keys wired to anvil accounts)
 *   5. web    (vite dev server)
 *
 * Everything is real: the Protocol Lab drives actual transactions through
 * the deployed registry, adapters, and both demo vaults.
 *
 * Env overrides: CORPSHIFT_PORT_API, CORPSHIFT_PORT_WEB, ANVIL_PORT,
 *                SKIP_ANVIL=1 (attach to a running chain), SKIP_DEPLOY=1.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const ANVIL_PORT = Number(process.env.ANVIL_PORT ?? 8545);
const API_PORT = Number(process.env.CORPSHIFT_PORT_API ?? 4000);
const WEB_PORT = Number(process.env.CORPSHIFT_PORT_WEB ?? 3000);
const RPC = `http://127.0.0.1:${ANVIL_PORT}`;

// anvil/hardhat well-known keys
const K0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // deployer/operator/attester
const K1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // demo user
const K2 = "0x5de4111ada6486d9cbbcb99a5f0a4ac1cb78a16501405a1c60b51d1b206f9e9c"; // liquidator

const FOUNDRY_BIN = join(homedir(), ".foundry", "bin");
const EXE = process.platform === "win32" ? ".exe" : "";
const bin = (name) => {
  const local = join(FOUNDRY_BIN, name + EXE);
  return existsSync(local) ? local : name;
};

const kids = [];
const logDir = join(ROOT, "data", "demo-logs");
mkdirSync(logDir, { recursive: true });

function log(name, ...args) {
  console.log(`\x1b[36m[demo]\x1b[0m ${name}`, ...args);
}

function run(name, cmd, args, opts = {}) {
  log(`${name}:`, cmd, args.join(" "));
  const out = createWriteStream(join(logDir, `${name}.log`), { flags: "a" });
  const p = spawn(cmd, args, {
    cwd: ROOT,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  p.stdout.pipe(out);
  p.stderr.pipe(out);
  kids.push(p);
  return p;
}

async function waitFor(url, tries = 60, what = url) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (r.ok || r.status === 404 || r.status === 405) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function rpcReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        signal: AbortSignal.timeout(1500),
      });
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("anvil did not come up");
}

async function portFree(port) {
  try {
    await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(600) });
    return false;
  } catch {
    return true;
  }
}

function shutdown() {
  for (const p of kids) {
    try {
      p.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  log("root:", ROOT);

  // 1. anvil
  if (process.env.SKIP_ANVIL !== "1" && (await portFree(ANVIL_PORT))) {
    run("anvil", bin("anvil"), ["--port", String(ANVIL_PORT), "--silent"]);
    await rpcReady();
    log(`anvil up on ${RPC}`);
  } else {
    log(`anvil: attaching to ${RPC}`);
    await rpcReady();
  }

  // 2. deploy
  if (process.env.SKIP_DEPLOY !== "1" || !existsSync(join(ROOT, "deployments", "31337.json"))) {
    const env = { ...process.env, PRIVATE_KEY: K0, DEMO_MODE: "true" };
    const r = spawnSync(
      bin("forge"),
      ["script", "script/Deploy.s.sol", "--rpc-url", RPC, "--broadcast"],
      {
        cwd: join(ROOT, "packages", "contracts"),
        env,
        stdio: "inherit",
        shell: process.platform === "win32",
      },
    );
    if (r.status !== 0) throw new Error("deploy failed — see forge output above");
    log("deployed → deployments/31337.json");
  } else {
    log("deploy: reusing deployments/31337.json (SKIP_DEPLOY=1)");
  }

  const sharedEnv = {
    ...process.env,
    CORPSHIFT_CHAIN_ID: "31337",
    CORPSHIFT_RPC_URL: RPC,
    CORPSHIFT_DB: join(ROOT, "data", "indexer-31337.sqlite"),
    CORPSHIFT_OPERATOR_KEY: K0,
    CORPSHIFT_ATTESTER_KEY: K0,
  };

  // 3. indexer — fixture + dry-run: indexes real Robinhood wire data and
  //    chain events without writing demo actions onchain (the conductor
  //    owns the scenario's actions).
  run(
    "indexer",
    process.execPath,
    ["--disable-warning=ExperimentalWarning", "apps/indexer/src/main.ts"],
    {
      env: {
        ...sharedEnv,
        CORPSHIFT_SOURCE: "fixture",
        CORPSHIFT_DRY_RUN: "true",
        CORPSHIFT_POLL_MS: "8000",
      },
    },
  );

  // 4. api
  run("api", process.execPath, ["--disable-warning=ExperimentalWarning", "apps/api/src/main.ts"], {
    env: {
      ...sharedEnv,
      CORPSHIFT_API_PORT: String(API_PORT),
      CORPSHIFT_DEMO_USER_KEY: K1,
      CORPSHIFT_LIQUIDATOR_KEY: K2,
    },
  });
  await waitFor(`http://127.0.0.1:${API_PORT}/health`, 60, "api");
  log(`api up on http://localhost:${API_PORT}`);

  // 5. web
  const vite = join(
    ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vite.cmd" : "vite",
  );
  run("web", vite, ["--port", String(WEB_PORT), "--strictPort"], {
    cwd: join(ROOT, "apps", "web"),
  });
  await waitFor(`http://127.0.0.1:${WEB_PORT}/`, 90, "web");

  console.log();
  console.log("  \x1b[32m✓ CorpShift demo stack is live\x1b[0m");
  console.log(`    web     → http://localhost:${WEB_PORT}/lab   (the killer demo)`);
  console.log(`    api     → http://localhost:${API_PORT}     (openapi: /openapi.yaml)`);
  console.log(`    indexer → fixture mode, dry-run (logs: data/demo-logs/)`);
  console.log(`    verify  → pnpm demo:check`);
  console.log();
  log("ctrl-c to stop all services");

  // keep alive
  await new Promise(() => {});
}

main().catch((e) => {
  console.error(`\x1b[31m[demo] ${e.message}\x1b[0m`);
  shutdown();
});
