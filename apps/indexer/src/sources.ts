/**
 * Source adapters — three modes with explicit trust labels:
 *   live    → poll Robinhood /rhj/ API (real, unauthenticated public data)
 *   fixture → replay captured API responses + live-verified fixtures
 *   mock    → synthesize actions for locally deployed MockStockToken (demo)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Address } from "viem";
import {
  ActionType,
  CRWD_FORWARD_SPLIT,
  ROBINHOOD_SOURCE_ID,
  normalizeRobinhoodActions,
  type CanonicalAction,
  type NormalizeContext,
  type RhCorporateAction,
} from "@corpshift/core";
import type { IndexerConfig } from "./config.ts";

export interface SourceBatch {
  mode: IndexerConfig["sourceMode"];
  fetchedAt: bigint;
  actions: CanonicalAction[];
  /** Normalization failures — recorded for reconciliation, never submitted. */
  failures: { sourceEventId: string; reason: string; raw: unknown }[];
  /** Trust label surfaced in API + UI: what the user is actually looking at. */
  trust: "live-api" | "fixture-replay" | "local-mock";
}

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

/* --------------------------------- live --------------------------------- */

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

export async function fetchLiveBatch(cfg: IndexerConfig): Promise<SourceBatch> {
  const ctx: NormalizeContext = {
    chainId: cfg.chainId,
    paymentToken: cfg.paymentToken ?? ("0x0000000000000000000000000000000000000000" as Address),
    paymentTokenDecimals: cfg.paymentTokenDecimals,
    observedAt: nowSeconds(),
  };
  const raw = (await fetchJson(`${cfg.rhApiBase}/corporate-actions`)) as {
    corpActions?: RhCorporateAction[];
  };
  let items = raw.corpActions ?? [];
  if (cfg.symbolFilter?.length) {
    const wanted = new Set(cfg.symbolFilter);
    items = items.filter((i) => i.tokenSymbol && wanted.has(i.tokenSymbol.toUpperCase()));
  }
  const { actions, failures } = normalizeRobinhoodActions(items, ctx);
  return {
    mode: "live",
    fetchedAt: ctx.observedAt,
    actions,
    failures: failures.map((f) => ({ ...f, raw: null })),
    trust: "live-api",
  };
}

/* -------------------------------- fixture -------------------------------- */

export function fetchFixtureBatch(cfg: IndexerConfig): SourceBatch {
  const ctx: NormalizeContext = {
    chainId: cfg.chainId,
    paymentToken: cfg.paymentToken ?? ("0x0000000000000000000000000000000000000000" as Address),
    paymentTokenDecimals: cfg.paymentTokenDecimals,
    observedAt: nowSeconds(),
  };

  // 1. The real CRWD split — canonical fixture with live-verified multiplier.
  const actions: CanonicalAction[] = [CRWD_FORWARD_SPLIT];
  const failures: SourceBatch["failures"] = [];

  // 2. The captured corporate-actions feed — real wire records replayed
  //    through the same normalizer live mode uses.
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  try {
    const captured = JSON.parse(
      readFileSync(join(repoRoot, "docs/research/raw/rh_corp_actions_2026-09-19.json"), "utf8"),
    ) as { corpActions?: RhCorporateAction[] };
    const { actions: replayed, failures: f } = normalizeRobinhoodActions(
      captured.corpActions ?? [],
      ctx,
    );
    actions.push(...replayed);
    failures.push(...f.map((x) => ({ ...x, raw: null })));
  } catch {
    // Fixture file absent (e.g. minimal checkout): the CRWD fixture alone
    // still exercises the pipeline end-to-end.
  }

  return { mode: "fixture", fetchedAt: ctx.observedAt, actions, failures, trust: "fixture-replay" };
}

/* --------------------------------- mock --------------------------------- */

/** The demo scenario: a 4-for-1 split on the locally deployed MockStockToken,
 *  mirroring CRWD's real economics. `mockNonce` shifts the event id so the
 *  demo can be re-run without tripping DuplicateAction. */
export function mockBatch(cfg: IndexerConfig, mockNonce: number): SourceBatch {
  const stock = cfg.manifest.mockStockToken;
  if (!stock) throw new Error("mock source requires a demo deployment (mockStockToken missing)");
  const t = nowSeconds();
  const action: CanonicalAction = {
    schema: "corpshift.action.v1",
    source: ROBINHOOD_SOURCE_ID,
    sourceEventId: `mock.xyxt.forward-split.4for1.${mockNonce}`,
    asset: stock,
    actionType: ActionType.ForwardSplit,
    announcedAt: t - 3600n,
    effectiveAt: t + BigInt(cfg.pollMs > 5000 ? 10 : 5), // near-future → exercises PENDING
    observedAt: t,
    params: { numerator: 4n, denominator: 1n, expectedMultiplier: 4_000_000_000_000_000_000n },
    evidence: {
      fixture: false,
      mock: true,
      scenario: "killer-demo-split",
      note: "Locally synthesized action on MockStockToken — mirrors the real CRWD 4:1 split economics (uiMultiplier 1e18 → 4e18).",
      mockNonce,
    },
  };
  return { mode: "mock", fetchedAt: t, actions: [action], failures: [], trust: "local-mock" };
}

export async function fetchBatch(cfg: IndexerConfig, mockNonce: number): Promise<SourceBatch> {
  if (cfg.sourceMode === "live") return fetchLiveBatch(cfg);
  if (cfg.sourceMode === "mock") return mockBatch(cfg, mockNonce);
  return fetchFixtureBatch(cfg);
}
