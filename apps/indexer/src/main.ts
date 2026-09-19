/**
 * CorpShift ingestion daemon.
 *   CORPSHIFT_SOURCE=live    → poll api.robinhood.com/rhj/ (real data)
 *   CORPSHIFT_SOURCE=fixture → replay captured real feed + CRWD fixture
 *   CORPSHIFT_SOURCE=mock    → synthesize demo actions on MockStockToken
 * Env: see config.ts. Ctrl-C exits cleanly.
 */
import { createPublicClient, http } from "viem";
import { loadConfig } from "./config.ts";
import { Store } from "./db.ts";
import { Attester } from "./attester.ts";
import { Submitter } from "./submitter.ts";
import { EventIndexer } from "./eventlog.ts";
import { Reconciler } from "./reconciler.ts";
import { tick } from "./pipeline.ts";

async function main() {
  const cfg = loadConfig();
  const store = new Store(cfg.dbPath);
  const publicClient = createPublicClient({ transport: http(cfg.rpcUrl) });

  // Sanity: is the RPC actually the chain we think it is?
  const chainId = await publicClient.getChainId();
  if (chainId !== cfg.chainId) {
    console.warn(`[indexer] WARNING: RPC chainId ${chainId} != CORPSHIFT_CHAIN_ID ${cfg.chainId}`);
  }

  const attester = cfg.attesterKey
    ? new Attester(cfg.attesterKey, BigInt(cfg.chainId), cfg.manifest.registry)
    : undefined;
  const submitter = cfg.operatorKey
    ? new Submitter(cfg.rpcUrl, cfg.operatorKey, cfg.manifest.registry)
    : undefined;
  const events = new EventIndexer(publicClient, cfg.manifest.registry, store, cfg.fromBlock);
  const reconciler = new Reconciler(publicClient, cfg.manifest.registry, store, submitter);

  if (!cfg.dryRun && (!attester || !submitter)) {
    console.warn(
      "[indexer] no ATTESTER/OPERATOR key — running in observation mode (no submissions)",
    );
  }
  console.log(
    `[indexer] mode=${cfg.sourceMode} chain=${cfg.chainId} registry=${cfg.manifest.registry} db=${cfg.dbPath} poll=${cfg.pollMs}ms${cfg.dryRun ? " DRY-RUN" : ""}`,
  );
  if (attester) console.log(`[indexer] attester=${attester.address}`);

  let mockNonce = Number(store.getMeta("mockNonce") ?? "0");
  let running = true;
  process.on("SIGINT", () => (running = false));
  process.on("SIGTERM", () => (running = false));

  while (running) {
    try {
      const res = await tick({ cfg, store, attester, submitter, events, reconciler }, mockNonce);
      if (cfg.sourceMode === "mock" && res.newActions > 0) {
        mockNonce++;
        store.setMeta("mockNonce", String(mockNonce));
      }
      console.log(
        `[indexer] tick mode=${res.mode} seen=${res.seen} new=${res.newActions} submitted=${res.submitted} normFailures=${res.failures} block=${res.block ?? "-"}`,
      );
    } catch (e) {
      // Source/RPC failures must not kill the daemon — log and retry.
      console.error(`[indexer] tick error: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, cfg.pollMs));
  }
  store.close();
  console.log("[indexer] stopped");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
