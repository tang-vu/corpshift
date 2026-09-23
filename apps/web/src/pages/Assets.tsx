import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AssetRow } from "../lib/api";
import { Card, Empty, PageIntro, HexLink, StateBadge } from "../components/ui";
import { fmtMult, shortHex } from "../lib/format";

export function Assets() {
  const [rows, setRows] = useState<AssetRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [condition, setCondition] = useState("all");
  const filtered = rows?.filter(
    (a) =>
      `${a.asset} ${a.pendingActionId}`.toLowerCase().includes(query.toLowerCase()) &&
      (condition === "all" || a.state === condition),
  );

  useEffect(() => {
    api
      .assets()
      .then((r) => setRows(r.assets))
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <PageIntro
        index="02 / ASSET REGISTER"
        title="Registered assets"
        description="Every position starts with a condition. Inspect live units, the last verified factor, and the action that connects them."
      />
      <div className="register-tools">
        <label>
          Find an asset or pending action
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Address or action identifier"
          />
        </label>
        <label>
          Condition
          <select value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="all">All conditions</option>
            {[...new Set(rows?.map((a) => a.state))].map((state) => (
              <option key={state}>{state}</option>
            ))}
          </select>
        </label>
        <span>{filtered?.length ?? "—"} records</span>
      </div>
      {rows && !filtered?.length && rows.length > 0 && (
        <Empty>No matching assets. Clear the search or change the condition.</Empty>
      )}
      <Card>
        {err && <Empty>api error: {err}</Empty>}
        {!err && !rows && <div className="shimmer h-24 rounded" />}
        {rows && rows.length === 0 && <Empty>No assets registered on this deployment.</Empty>}
        {rows && rows.length > 0 && (
          <table className="record-table w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-edge text-[12px] uppercase tracking-widest text-fg-faint">
                <th className="pb-2 font-semibold">Asset</th>
                <th className="pb-2 font-semibold">State</th>
                <th className="pb-2 font-semibold">Observed factor</th>
                <th className="pb-2 font-semibold">Last verified</th>
                <th className="pb-2 font-semibold">Pending action</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.map((a) => (
                <tr key={a.asset} className="border-b border-edge/50 last:border-0">
                  <td data-label="Asset" className="py-3">
                    <Link to={`/assets/${a.asset}`} className="font-mono text-cyan hover:underline">
                      {shortHex(a.asset, 8)}
                    </Link>
                  </td>
                  <td data-label="Condition">
                    <StateBadge state={a.state} />
                  </td>
                  <td data-label="Observed factor" className="font-mono">
                    {fmtMult(a.normalizationFactor)}
                  </td>
                  <td data-label="Last verified" className="font-mono text-fg-dim">
                    {fmtMult(a.verifiedFactor)}
                  </td>
                  <td data-label="Pending action">
                    {a.pendingActionId &&
                    a.pendingActionId !==
                      "0x0000000000000000000000000000000000000000000000000000000000000000" ? (
                      <HexLink hex={a.pendingActionId} to={`/actions/${a.pendingActionId}`} />
                    ) : (
                      <span className="text-fg-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
