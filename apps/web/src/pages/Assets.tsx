import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AssetRow } from "../lib/api";
import { Card, Empty, HexLink, StateBadge } from "../components/ui";
import { fmtMult, shortHex } from "../lib/format";

export function Assets() {
  const [rows, setRows] = useState<AssetRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.assets().then((r) => setRows(r.assets)).catch((e) => setErr(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Registered assets</h1>
        <p className="mt-1 text-sm text-fg-dim">
          Assets under CorpShift supervision — live state, normalization factor, and pending actions.
        </p>
      </div>
      <Card>
        {err && <Empty>api error: {err}</Empty>}
        {!err && !rows && <div className="shimmer h-24 rounded" />}
        {rows && rows.length === 0 && <Empty>No assets registered on this deployment.</Empty>}
        {rows && rows.length > 0 && (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-edge text-[10px] uppercase tracking-widest text-fg-faint">
                <th className="pb-2 font-semibold">Asset</th>
                <th className="pb-2 font-semibold">State</th>
                <th className="pb-2 font-semibold">Factor</th>
                <th className="pb-2 font-semibold">Verified</th>
                <th className="pb-2 font-semibold">Pending action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.asset} className="border-b border-edge/50 last:border-0">
                  <td className="py-3">
                    <Link to={`/assets/${a.asset}`} className="font-mono text-cyan hover:underline">
                      {shortHex(a.asset, 8)}
                    </Link>
                  </td>
                  <td><StateBadge state={a.state} /></td>
                  <td className="font-mono">{fmtMult(a.normalizationFactor)}</td>
                  <td className="font-mono text-fg-dim">{fmtMult(a.verifiedFactor)}</td>
                  <td>
                    {a.pendingActionId && a.pendingActionId !== "0x0000000000000000000000000000000000000000000000000000000000000000" ? (
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
