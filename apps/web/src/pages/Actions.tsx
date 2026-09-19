import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type ActionItem } from "../lib/api";
import { Card, Empty, StateBadge, TypeBadge, TrustBadge } from "../components/ui";
import { fmtTs, shortHex, timeUntil } from "../lib/format";

export function Actions() {
  const [rows, setRows] = useState<ActionItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .actions()
      .then((r) => setRows(r.actions))
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Canonical actions</h1>
        <p className="mt-1 text-sm text-fg-dim">
          Corporate actions normalized to <code className="text-cyan">corpshift.action.v1</code> —
          hashed, attested, and transitioned onchain.
        </p>
      </div>
      <Card>
        {err && <Empty>api error: {err}</Empty>}
        {!err && !rows && <div className="shimmer h-24 rounded" />}
        {rows && rows.length === 0 && (
          <Empty>No actions indexed yet — start the indexer or run the Protocol Lab demo.</Empty>
        )}
        {rows && rows.length > 0 && (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-edge text-[10px] uppercase tracking-widest text-fg-faint">
                <th className="pb-2 font-semibold">Action</th>
                <th className="pb-2 font-semibold">Type</th>
                <th className="pb-2 font-semibold">Status</th>
                <th className="pb-2 font-semibold">Asset</th>
                <th className="pb-2 font-semibold">Effective</th>
                <th className="pb-2 font-semibold">Trust</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.actionId} className="border-b border-edge/50 last:border-0">
                  <td className="py-3">
                    <Link
                      to={`/actions/${a.actionId}`}
                      className="font-mono text-cyan hover:underline"
                    >
                      {shortHex(a.actionId)}
                    </Link>
                  </td>
                  <td>
                    <TypeBadge type={a.actionType} />
                  </td>
                  <td>
                    <StateBadge state={a.status} />
                  </td>
                  <td>
                    <Link
                      to={`/assets/${a.asset}`}
                      className="font-mono text-[12px] text-fg-dim hover:text-cyan"
                    >
                      {shortHex(a.asset)}
                    </Link>
                  </td>
                  <td className="font-mono text-[11px] text-fg-dim">
                    {fmtTs(a.effectiveAt)}
                    <span className="ml-1 text-fg-faint">({timeUntil(a.effectiveAt)})</span>
                  </td>
                  <td>
                    <TrustBadge trust={a.trust} />
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
