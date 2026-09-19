/**
 * CorpShift REST API — every endpoint the web app consumes.
 * Reads combine indexed state (sqlite, fast) with live onchain reads
 * (registry + adapters) so responses are never stale vs. the chain.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Address } from "viem";
import { getAddress } from "viem";
import {
  ACTION_TYPE_NAMES,
  ASSET_STATE_NAMES,
  ActionStatus,
  type AssetState,
  type ActionType,
} from "@corpshift/core";
import { chainInfo, explorerAddressUrl, explorerTxUrl } from "@corpshift/shared";
import { Store } from "@corpshift/indexer/db";
import type { ApiConfig } from "./config.ts";
import type { ChainClients } from "./clients.ts";
import { DemoConductor } from "./demo.ts";

const __dir = dirname(fileURLToPath(import.meta.url));

const STATUS_NAMES: Record<number, string> = {
  [ActionStatus.Scheduled]: "SCHEDULED",
  [ActionStatus.Active]: "ACTIVE",
  [ActionStatus.Resolved]: "RESOLVED",
  [ActionStatus.Invalidated]: "INVALIDATED",
  [ActionStatus.Unsupported]: "UNSUPPORTED",
};

function addr(p: string): Address {
  return getAddress(p as Address);
}

function actionJson(row: ReturnType<Store["listActions"]>[number], chainId: number) {
  return {
    actionId: row.action_id,
    asset: row.asset,
    actionType: ACTION_TYPE_NAMES[row.action_type as ActionType] ?? "UNKNOWN",
    status: row.status < 0 ? "UNSUBMITTED" : (STATUS_NAMES[row.status] ?? "?"),
    announcedAt: row.announced_at,
    effectiveAt: row.effective_at,
    observedAt: row.observed_at,
    submittedAt: row.submitted_at,
    params: row.params,
    paramsHash: row.params_hash,
    evidenceHash: row.evidence_hash,
    evidence: JSON.parse(row.evidence_json) as unknown,
    attestedBy: row.attested_by,
    txHash: row.tx_hash,
    txUrl: row.tx_hash ? explorerTxUrl(chainId, row.tx_hash) : undefined,
    trust: row.trust,
    error: row.error,
  };
}

export function buildApp(cfg: ApiConfig, clients: ChainClients) {
  const app = new Hono();
  const cs = clients.corpshift;
  let store: Store | undefined;
  const db = (): Store => {
    store ??= new Store(cfg.dbPath);
    return store;
  };
  let demo: DemoConductor | undefined;
  const conductor = (): DemoConductor => {
    if (!demo) demo = new DemoConductor(cfg, clients, db());
    return demo;
  };

  app.use("*", cors());
  app.use("*", logger());

  /* ------------------------- meta ------------------------- */

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "corpshift-api",
      chainId: cfg.chainId,
      chain: chainInfo(cfg.chainId).name,
      registry: cfg.manifest.registry,
      demoMode: cfg.manifest.demoMode,
      demoEnabled: !!(
        cfg.demoUserKey &&
        cfg.demoOperatorKey &&
        cfg.demoLiquidatorKey &&
        cfg.attesterKey
      ),
    }),
  );

  app.get("/v1/source", (c) => {
    const s = db();
    return c.json({
      lastTick: s.getMeta("last_tick"),
      lastBlock: s.getMeta("last_block"),
      counts: {
        actions: s.listActions({ limit: 10000 }).length,
        events: s.listEvents({ limit: 10000 }).length,
        normalizationFailures: s.listNormalizationFailures(1000).length,
      },
      normalizationFailures: s.listNormalizationFailures(25).map((f) => ({
        sourceEventId: f.source_event_id,
        reason: f.reason,
        observedAt: f.observed_at,
      })),
    });
  });

  /* ------------------------- assets ------------------------- */

  app.get("/v1/assets", async (c) => {
    const assets = await cs.listAssets();
    const rows = await Promise.all(
      assets.map(async (a) => {
        const [state, factor, verified, pending] = await Promise.all([
          cs.assetState(a),
          cs.normalizationFactor(a),
          cs.verifiedFactor(a),
          cs.pendingAction(a),
        ]);
        return {
          asset: a,
          state: ASSET_STATE_NAMES[state as AssetState],
          normalizationFactor: factor.toString(),
          verifiedFactor: verified.toString(),
          pendingActionId: pending,
          explorerUrl: explorerAddressUrl(cfg.chainId, a),
        };
      }),
    );
    return c.json({ assets: rows });
  });

  app.get("/v1/assets/:asset", async (c) => {
    let asset: Address;
    try {
      asset = addr(c.req.param("asset"));
    } catch {
      return c.json({ error: "invalid asset address" }, 400);
    }
    // registry reads revert for assets that were never registered on this
    // chain (e.g. fixture actions referencing mainnet tokens) — report it
    // as a clean 404 rather than an opaque 500
    let state: AssetState, factor: bigint, verified: bigint, pending: string;
    try {
      [state, factor, verified, pending] = (await Promise.all([
        cs.assetState(asset),
        cs.normalizationFactor(asset),
        cs.verifiedFactor(asset),
        cs.pendingAction(asset),
      ])) as [AssetState, bigint, bigint, string];
    } catch {
      return c.json({ error: "asset is not registered on this chain" }, 404);
    }
    const history = db()
      .listActions({ asset })
      .map((r) => actionJson(r, cfg.chainId));
    return c.json({
      asset,
      state: ASSET_STATE_NAMES[state as AssetState],
      normalizationFactor: factor.toString(),
      verifiedFactor: verified.toString(),
      pendingActionId: pending,
      actions: history,
      explorerUrl: explorerAddressUrl(cfg.chainId, asset),
    });
  });

  app.get("/v1/assets/:asset/actions", (c) =>
    c.json({
      actions: db()
        .listActions({ asset: addr(c.req.param("asset")) })
        .map((r) => actionJson(r, cfg.chainId)),
    }),
  );

  /* ------------------------- actions ------------------------- */

  app.get("/v1/actions", (c) => {
    const q = c.req.query();
    return c.json({
      actions: db()
        .listActions({
          ...(q.asset ? { asset: q.asset } : {}),
          ...(q.status !== undefined ? { status: Number(q.status) } : {}),
          limit: q.limit ? Number(q.limit) : 500,
        })
        .map((r) => actionJson(r, cfg.chainId)),
    });
  });

  app.get("/v1/actions/:id", (c) => {
    const row = db().getAction(c.req.param("id"));
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({
      ...actionJson(row, cfg.chainId),
      sourceHash: row.source_hash,
      sourceEventId: row.source_event_id,
      chainId: row.chain_id,
      events: db().listEvents({ actionId: row.action_id }),
    });
  });

  /* ------------------------- policy & exposure ------------------------- */

  app.get("/v1/policy/:asset/:op", async (c) => {
    const d = await cs.checkPolicy(addr(c.req.param("asset")), Number(c.req.param("op")) as never);
    return c.json({ allowed: d.allowed, reason: d.reason });
  });

  app.get("/v1/exposure/:asset/:account", async (c) => {
    const e = await cs.exposureOf(addr(c.req.param("asset")), addr(c.req.param("account")));
    return c.json({
      units: e.units.toString(),
      normalizationFactor: e.normalizationFactor.toString(),
      verifiedFactor: e.verifiedFactor.toString(),
      state: ASSET_STATE_NAMES[e.state as AssetState],
      pendingActionId: e.pendingActionId,
    });
  });

  /* ------------------------- events ------------------------- */

  app.get("/v1/events", (c) => {
    const q = c.req.query();
    const rows = db().listEvents({
      ...(q.asset ? { asset: q.asset } : {}),
      ...(q.actionId ? { actionId: q.actionId } : {}),
      limit: q.limit ? Number(q.limit) : 200,
    });
    return c.json({
      events: rows.map((e) => ({
        ...e,
        txUrl: explorerTxUrl(cfg.chainId, e.tx_hash),
      })),
    });
  });

  /* ------------------------- demo ------------------------- */

  app.get("/v1/demo/state", async (c) => {
    try {
      return c.json(await conductor().state());
    } catch (e) {
      return c.json({ error: (e as Error).message }, 503);
    }
  });

  app.post("/v1/demo/reset", async (c) => {
    try {
      return c.json(await conductor().reset());
    } catch (e) {
      return c.json({ error: (e as Error).message }, 503);
    }
  });

  app.post("/v1/demo/step", async (c) => {
    try {
      return c.json(await conductor().step());
    } catch (e) {
      return c.json({ error: (e as Error).message }, 503);
    }
  });

  /* ------------------------- openapi ------------------------- */

  app.get("/openapi.yaml", (c) => {
    try {
      return c.text(readFileSync(join(__dir, "..", "openapi.yaml"), "utf8"));
    } catch {
      return c.text("openapi.yaml not found", 404);
    }
  });

  return { app, conductor };
}
