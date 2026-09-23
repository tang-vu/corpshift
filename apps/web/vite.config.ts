import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const frontendBuild = {
  sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  builtAt: new Date().toISOString(),
};

const apiTarget =
  process.env.CORPSHIFT_API ?? `http://localhost:${process.env.CORPSHIFT_PORT_API ?? 4000}`;

export default defineConfig({
  define: {
    __FRONTEND_BUILD_SHA__: JSON.stringify(frontendBuild.sourceSha),
    __FRONTEND_BUILD_TIME__: JSON.stringify(frontendBuild.builtAt),
  },
  plugins: [
    {
      name: "frontend-build-stamp",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "build-stamp.json",
          source: JSON.stringify(frontendBuild, null, 2),
        });
      },
    },
    react(),
    tailwindcss(),
    {
      name: "public-deployment-records",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const proofs: Record<string, string> = {
            "/proof/deployment.json": "46630-evidence.json",
            "/proof/manifest.json": "46630.json",
          };
          const file = proofs[(req.url ?? "").split("?")[0]!];
          if (!file || !["GET", "HEAD"].includes(req.method ?? "")) return next();
          void readFile(new URL(`../../deployments/${file}`, import.meta.url))
            .then((body) => {
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-cache");
              res.end(req.method === "HEAD" ? undefined : body);
            })
            .catch(() => {
              res.statusCode = 404;
              res.end("Deployment record unavailable");
            });
        });
      },
    },
  ],
  server: {
    port: 8056,
    proxy: {
      "/v1": apiTarget,
      "/health": apiTarget,
      "/openapi.yaml": apiTarget,
    },
  },
});
