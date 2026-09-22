import { createServer, request as proxyRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(root, "apps/web/dist");
const apiPort = Number(process.env.CORPSHIFT_PORT_API ?? 14000);
const port = Number(process.env.CORPSHIFT_PORT_WEB ?? 18056);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};
let windowStart = 0;
let writes = 0;

const server = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const isRead = req.method === "GET" || req.method === "HEAD";
  const isWrite = req.method === "POST" && ["/v1/demo/step", "/v1/demo/reset"].includes(path);
  if (!isRead && !isWrite) {
    res.writeHead(405).end();
    return;
  }
  if (path.startsWith("/v1/") || path === "/health" || path === "/openapi.yaml") {
    if (isWrite) {
      if (Date.now() - windowStart > 60000) {
        windowStart = Date.now();
        writes = 0;
      }
      if (++writes > 30) {
        res
          .writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" })
          .end(JSON.stringify({ error: "Shared demo is busy. Please retry in a minute." }));
        return;
      }
    }
    const upstream = proxyRequest(
      {
        hostname: "127.0.0.1",
        port: apiPort,
        path: req.url,
        method: req.method,
        headers: { accept: "application/json" },
        timeout: 60000,
      },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, {
          "Content-Type": reply.headers["content-type"] ?? "application/json",
          "Cache-Control": "no-store",
        });
        reply.pipe(res);
      },
    );
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Demo service temporarily unavailable" }));
    });
    req.resume();
    upstream.end();
    return;
  }
  const proof = {
    "/proof/deployment.json": "deployments/46630-evidence.json",
    "/proof/manifest.json": "deployments/46630.json",
  };
  const spa =
    ["/", "/lab", "/assets", "/actions", "/policy"].includes(path) ||
    /^\/(assets|actions)\/0x[0-9a-fA-F]+$/.test(path);
  const file = proof[path]
    ? resolve(root, proof[path])
    : spa
      ? resolve(dist, "index.html")
      : resolve(dist, "." + path);
  if (
    !proof[path] &&
    (!file.startsWith(dist + sep) || path.split("/").some((p) => p.startsWith(".")))
  ) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cache-Control":
        path.startsWith("/assets/") && !spa ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`CorpShift public origin: http://127.0.0.1:${server.address().port}`),
);
