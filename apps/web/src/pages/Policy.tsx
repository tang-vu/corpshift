import { useEffect, useState } from "react";
import { api, type AssetRow, type PolicyResult } from "../lib/api";
import { Card, Empty, PageIntro, StateBadge, HexLink } from "../components/ui";
import { shortHex, fmtReason } from "../lib/format";

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
  const [unknowns, setUnknowns] = useState<Record<number, boolean>>({});
  const [failures, setFailures] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .assets()
      .then((r) => {
        setAssets(r.assets);
        if (r.assets[0]) setAsset(r.assets[0].asset);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!asset) return;
    let active = true;
    setResults({});
    setUnknowns({});
    setFailures({});
    setReading(true);
    setCapturedAt(null);
    void Promise.all(
      OPS.map(async (op) => {
        try {
          const r = await api.policy(asset, op.id);
          if (active) {
            if (
              typeof r?.allowed === "boolean" &&
              typeof r?.reason === "string" &&
              r.reason.length > 0
            )
              setResults((prev) => ({ ...prev, [op.id]: r }));
            else setUnknowns((prev) => ({ ...prev, [op.id]: true }));
          }
        } catch (e) {
          if (active) setFailures((prev) => ({ ...prev, [op.id]: (e as Error).message }));
        }
      }),
    ).then(() => {
      if (active) {
        setReading(false);
        setCapturedAt(new Date().toISOString());
      }
    });
    return () => {
      active = false;
    };
  }, [asset, revision]);

  const sel = assets.find((a) => a.asset === asset);

  return (
    <div className="space-y-6">
      <PageIntro
        index="04 / OPERATION INSPECTOR"
        title="Policy playground"
        description="Can this operation proceed? Read the contract decision and its returned reason. Permission and correct valuation are separate requirements."
      />
      <p className="register-note">
        Read-only inspector · no transactions. Defaults allow only PRICE_READ during ADJUSTING.
        Current governance settings may differ.
      </p>
      {loading && <Empty>Loading registered assets…</Empty>}
      {err && <Empty>api error: {err}</Empty>}
      {assets.length === 0 && !err && !loading && (
        <Empty>No registered assets on this deployment.</Empty>
      )}

      {assets.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="policy-asset"
              className="text-[11px] font-semibold uppercase tracking-widest text-fg-faint"
            >
              asset
            </label>
            <select
              id="policy-asset"
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
            {sel && (
              <span>
                Asset condition at page load: <StateBadge state={sel.state} />
              </span>
            )}
            <button
              className="inspector-refresh"
              disabled={reading}
              onClick={() => setRevision((r) => r + 1)}
            >
              Refresh policy reads
            </button>
          </div>

          <Card
            title="Current contract decisions"
            sub={
              capturedAt
                ? `Read completed ${capturedAt} · separate calls, not pinned to one block`
                : "Reading each operation independently"
            }
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {OPS.map((op) => {
                const r = results[op.id];
                return (
                  <div
                    key={op.id}
                    className={`flex items-center justify-between rounded-md border px-3 py-2.5 ${
                      r === undefined
                        ? "border-edge bg-panel-2"
                        : r.allowed
                          ? "border-green/30 bg-green-dim/30"
                          : "border-red/30 bg-red-dim/40"
                    }`}
                  >
                    <div className="policy-operation">
                      <span className="font-mono text-[12px] font-semibold">{op.name}</span>
                      <small>
                        {failures[op.id]
                          ? `Read failed: ${failures[op.id]}`
                          : r
                            ? `Returned reason: ${fmtReason(r.reason)}`
                            : unknowns[op.id]
                              ? "Response did not include a valid decision and reason."
                              : "Waiting for this contract read."}
                      </small>
                      {r && (
                        <details className="policy-code">
                          <summary>Inspect exact code</summary>
                          <code>{r.reason}</code>
                          <HexLink hex={r.reason} />
                        </details>
                      )}
                    </div>
                    <span
                      className={`font-mono text-[11px] font-bold ${failures[op.id] ? "text-red" : r === undefined ? "text-fg-faint" : r.allowed ? "text-green" : "text-red"}`}
                    >
                      {failures[op.id]
                        ? "FAILED"
                        : unknowns[op.id]
                          ? "UNKNOWN"
                          : r === undefined
                            ? reading
                              ? "LOADING"
                              : "UNKNOWN"
                            : r.allowed
                              ? "ALLOWED"
                              : "BLOCKED"}
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
              <tr className="border-b border-edge text-[12px] uppercase tracking-widest text-fg-faint">
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
          <p className="mt-3 border-t border-edge pt-3 font-mono text-[12px] text-fg-faint">
            highlighted row = asset state when the register loaded; these are seeded defaults, not
            current decisions
          </p>
        )}
      </Card>
    </div>
  );
}
