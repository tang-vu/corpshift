/**
 * CorpShift API entrypoint.
 */
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.ts";
import { buildClients } from "./clients.ts";
import { buildApp } from "./server.ts";

const cfg = loadConfig();
const clients = buildClients(cfg);
const { app, conductor } = buildApp(cfg, clients);

// On local chains the demo conductor snapshots the post-deploy state so
// `reset` can revert cleanly between runs. Retry once — boot can race the
// indexer's first SQLite write.
for (let i = 0; i < 2; i++) {
  try {
    await conductor().prepare();
    break;
  } catch (e) {
    if (i === 1) console.warn(`demo snapshot unavailable: ${(e as Error).message} — /v1/demo/reset will report it honestly`);
    else await new Promise((r) => setTimeout(r, 750));
  }
}

serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  console.log(`corpshift-api listening on http://0.0.0.0:${info.port}`);
  console.log(`  chain ${cfg.chainId} · registry ${cfg.manifest.registry}`);
  console.log(`  db ${cfg.dbPath}`);
});
