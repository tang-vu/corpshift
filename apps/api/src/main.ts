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
// `reset` can revert cleanly between runs.
try {
  await conductor().prepare();
} catch {
  /* demo keys absent — demo endpoints will 503 */
}

serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  console.log(`corpshift-api listening on http://0.0.0.0:${info.port}`);
  console.log(`  chain ${cfg.chainId} · registry ${cfg.manifest.registry}`);
  console.log(`  db ${cfg.dbPath}`);
});
