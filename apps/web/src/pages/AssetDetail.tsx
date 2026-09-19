import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type ActionItem, type AssetRow } from "../lib/api";
import { Card, Empty, HexLink, StateBadge, Stat, TypeBadge, TrustBadge } from "../components/ui";
import { fmtMult, fmtTs, shortHex, timeUntil } from "../lib/format";

export function AssetDetail() {
  const { asset = "" } = useParams();
  const [data, setData] = useState<(AssetRow & { actions: ActionItem[] }) | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .asset(asset)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [asset]);

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs text-fg-faint">asset</div>
        <h1 className="mt-1 font-mono text-xl font-bold tracking-tight text-cyan">{asset}</h1>
      </div>
      {err && <Empty>api error: {err}</Empty>}
      {data && (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                  state
                </div>
                <div className="mt-1">
                  <StateBadge state={data.state} />
                </div>
              </div>
              <Stat label="normalization factor" value={fmtMult(data.normalizationFactor)} />
              <Stat label="verified factor" value={fmtMult(data.verifiedFactor)} />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                  pending action
                </div>
                <div className="mt-1">
                  {data.pendingActionId &&
                  data.pendingActionId !==
                    "0x0000000000000000000000000000000000000000000000000000000000000000" ? (
                    <HexLink hex={data.pendingActionId} to={`/actions/${data.pendingActionId}`} />
                  ) : (
                    <span className="text-fg-faint">—</span>
                  )}
                </div>
              </div>
            </div>
          </Card>
          <Card title="Action history" sub={`${data.actions.length} indexed`}>
            {data.actions.length === 0 && <Empty>No indexed actions for this asset yet.</Empty>}
            <div className="space-y-2">
              {data.actions.map((a) => (
                <Link
                  key={a.actionId}
                  to={`/actions/${a.actionId}`}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-edge bg-panel-2 px-3 py-2.5 transition hover:border-edge-2"
                >
                  <TypeBadge type={a.actionType} />
                  <StateBadge state={a.status} />
                  <span className="font-mono text-[11px] text-fg-faint">
                    {shortHex(a.actionId)}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-fg-dim">
                    eff {fmtTs(a.effectiveAt)} · {timeUntil(a.effectiveAt)}
                  </span>
                  <TrustBadge trust={a.trust} />
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
