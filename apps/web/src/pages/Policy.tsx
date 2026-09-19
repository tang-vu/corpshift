import { useEffect, useState } from "react";
import { api, type AssetRow, type PolicyResult } from "../lib/api";
import { Card, Empty, StateBadge } from "../components/ui";
import { shortHex } from "../lib/format";

const OPS = [
  { id: 0, name: "DEPOSIT", short: "DEP" },
  { id: 1, name: "WITHDRAW", short: "WDR" },
  { id: 2, name: "BORROW", short: "BRW" },
  { id: 3, name: "LIQUIDATE", short: "LIQ" },
  { id: 4, name: "CREATE_ORDER", short: "ORD" },
  { id: 5, name: "SETTLE", short: "STL" },
  { id: 6, name: "TRANSFER", short: "TRF" },
  { id: 7, name: "USE_AS_COLLATERAL", short: "COL" },
  { id: 8, name: "PRICE_READ", short: "PRC" },
];

/** Mirrors PolicyEngine._seedDefaults() — keep in sync with the contract. */
const MATRIX: Record<string, boolean[]> = {
  ACTIVE: [true, true, true, true, true, true, true, true, true],
  ACTION_PENDING: [true, true, false, false, false, false, true, false, true],
  ADJUSTING: [false, false, false, false, false, false, false, false, true],
  HALTED: [true, true, false, false, false, false, false, false, true],
  MIGRATING: [false, true, false, false, false, false, false, false, true],
  REDEEMING: [false, true, false, false, false, true, false, false, true],
  DEGRADED: [false, true, false, false, false, false, false, false, true],
  UNSUPPORTED: [false, true, false, false, false, false, false, false, true],
};

export function Policy() {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [asset, setAsset] = useState("");
  const [results, setResults] = useState<Record<number, PolicyResult>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .assets()
      .then((r) => {
        setAssets(r.assets);
        if (r.assets[0]) setAsset(r.assets[0].asset);
      })
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!asset) return;
    setResults({});
    Promise.all(
      OPS.map((op) =>
        api
          .policy(asset, op.id)
          .then((r) => [op.id, r] as const)
          .catch(() => null),
      ),
    ).then((rs) => {
      const m: Record<number, PolicyResult> = {};
      for (const r of rs) if (r) m[r[0]] = r[1];
      setResults(m);
    });
  }, [asset]);

  const sel = assets.find((a) => a.asset === asset);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Policy playground</h1>
        <p className="mt-1 text-sm text-fg-dim">
          Live <code className="text-cyan">checkPolicy(asset, op)</code> reads against the onchain
          PolicyEngine — what downstream protocols gate on before every risky operation.
        </p>
      </div>

      {err && <Empty>api error: {err}</Empty>}
      {assets.length === 0 && !err && <Empty>No registered assets on this deployment.</Empty>}

      {assets.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-fg-faint">
              asset
            </label>
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              className="rounded-md border border-edge-2 bg-panel-2 px-3 py-1.5 font-mono text-[12px] text-fg outline-none focus:border-green"
            >
              {assets.map((a) => (
                <option key={a.asset} value={a.asset}>
                  {shortHex(a.asset, 10)}
                </option>
              ))}
            </select>
            {sel && <StateBadge state={sel.state} />}
          </div>

          <Card>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {OPS.map((op) => {
                const r = results[op.id];
                return (
                  <div
                    key={op.id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2.5 ${
                      r === undefined
                        ? "border-edge bg-panel-2 opacity-60"
                        : r.allowed
                          ? "border-green/30 bg-green-dim/30"
                          : "border-red/30 bg-red-dim/40"
                    }`}
                  >
                    <span className="font-mono text-[12px] font-semibold">{op.name}</span>
                    <span
                      className={`font-mono text-[11px] font-bold ${r === undefined ? "text-fg-faint" : r.allowed ? "text-green" : "text-red"}`}
                    >
                      {r === undefined ? "…" : r.allowed ? "ALLOWED" : "BLOCKED"}
                    </span>
                  </div>
                );
              })}
            </div>
            {Object.values(results).some((r) => !r.allowed) && (
              <p className="mt-4 border-t border-edge pt-3 font-mono text-[11px] leading-relaxed text-fg-dim">
                blocked ops carry a reason code — e.g. ACTION_PENDING / ADJUSTING / HALTED /
                DEGRADED — decoded from the asset's runtime state. Protocols integrating CorpShift
                call this before every state-changing operation.
              </p>
            )}
          </Card>
        </>
      )}

      {/* seeded default matrix — the whole security surface, not just today */}
      <Card
        title="Default policy matrix"
        sub="seeded into PolicyEngine at deploy — governance-tunable; PRICE_READ stays open in every state so consumers can keep observing"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[11px]">
            <thead>
              <tr className="border-b border-edge text-[9px] uppercase tracking-widest text-fg-faint">
                <th className="pb-2 pr-3 font-semibold">state</th>
                {OPS.map((op) => (
                  <th key={op.id} className="pb-2 text-center font-semibold" title={op.name}>
                    {op.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(MATRIX).map(([stateName, row]) => (
                <tr
                  key={stateName}
                  className={`border-b border-edge/40 last:border-0 ${
                    sel?.state === stateName ? "bg-panel-2" : ""
                  }`}
                >
                  <td className="py-2 pr-3">
                    <span
                      className={sel?.state === stateName ? "font-bold text-amber" : "text-fg-dim"}
                    >
                      {stateName}
                    </span>
                  </td>
                  {row.map((allowed, i) => (
                    <td key={i} className="py-2 text-center">
                      <span className={allowed ? "text-green" : "text-red/60"}>
                        {allowed ? "✓" : "✗"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sel && (
          <p className="mt-3 border-t border-edge pt-3 font-mono text-[10px] text-fg-faint">
            highlighted row = selected asset's current runtime state
          </p>
        )}
      </Card>
    </div>
  );
}
