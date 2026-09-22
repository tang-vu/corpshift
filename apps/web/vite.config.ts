import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFile } from "node:fs/promises";

const apiTarget =
  process.env.CORPSHIFT_API ?? `http://localhost:${process.env.CORPSHIFT_PORT_API ?? 4000}`;

export default defineConfig({
  plugins: [
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
