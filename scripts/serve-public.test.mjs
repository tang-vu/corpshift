import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("public origin exposes only built assets, explicit proof and application routes", async () => {
  const backend = createServer((req, res) =>
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ path: req.url, method: req.method })),
  );
  backend.listen(0, "127.0.0.1");
  await once(backend, "listening");
  const child = spawn(process.execPath, ["scripts/serve-public.mjs"], {
    env: {
      ...process.env,
      CORPSHIFT_PORT_WEB: "0",
      CORPSHIFT_PORT_API: String(backend.address().port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const origin = await new Promise((resolve, reject) => {
      child.stdout.on("data", (d) => {
        const match = d.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) resolve(match[0]);
      });
      child.on("error", reject);
      child.on("exit", (code) => reject(new Error(`Origin exited: ${code}`)));
    });
    for (const path of [
      "/.env.robinhood-testnet",
      "/scripts/demo.mjs",
      "/packages/contracts/cache/run-latest.json",
      "/proof/private.json",
      "/%2eenv",
    ]) {
      assert.equal((await fetch(origin + path)).status, 404, path);
    }
    const proof = await fetch(origin + "/proof/deployment.json");
    assert.equal(proof.status, 200);
    assert.equal((await proof.json()).chainId, 46630);
    assert.equal((await fetch(origin + "/v1/demo/step", { method: "DELETE" })).status, 405);
    assert.equal((await fetch(origin + "/v1/unknown", { method: "POST" })).status, 405);
    const response = await fetch(origin + "/v1/demo/step", { method: "POST" });
    assert.deepEqual(await response.json(), { path: "/v1/demo/step", method: "POST" });
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally {
    child.kill();
    backend.closeAllConnections();
    await new Promise((resolve) => backend.close(resolve));
  }
});
