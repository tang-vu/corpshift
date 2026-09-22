import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type ActionItem, type AssetRow } from "../lib/api";
import {
  Card,
  Empty,
  PageIntro,
  Partition,
  HexLink,
  StateBadge,
  Stat,
  TypeBadge,
  TrustBadge,
} from "../components/ui";
import { fmtMult, fmtTs, shortHex, timeUntil } from "../lib/format";

export function AssetDetail() {
  const { asset = "" } = useParams();
  const [data, setData] = useState<(AssetRow & { actions: ActionItem[] }) | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    let active = true;
    api
      .asset(asset)
      .then((r) => active && setData(r))
      .catch((e) => active && setErr(e.message));
    return () => {
      active = false;
    };
  }, [asset]);

  return (
    <div className="space-y-6">
      <PageIntro
        index="02 / ASSET DOSSIER"
        title="Continuity, examined."
        description="The token can change its representation. Verification establishes whether the observed change matches the attested action."
      >
        <div className="full-identifier">{asset}</div>
        <HexLink hex={asset} url={data?.explorerUrl} />
      </PageIntro>
      {!data && !err && <Empty>Loading asset condition…</Empty>}
      {err && <Empty>api error: {err}</Empty>}
      {data && (
        <>
          <section className="condition-study">
            <Partition mismatch={data.normalizationFactor !== data.verifiedFactor} />
            <div>
              <span className="eyebrow">OBSERVED / VERIFIED</span>
              <h2>
                {data.normalizationFactor === data.verifiedFactor
                  ? "Factors agree."
                  : "A change awaits agreement."}
              </h2>
              <p>
                Live adapter: {fmtMult(data.normalizationFactor)} · Last verified:{" "}
                {fmtMult(data.verifiedFactor)}. Valuation uses live units. Current policy determines
                which operations are permitted.
              </p>
              <Link className="text-link" to="/policy">
                Inspect operation policy →
              </Link>
            </div>
          </section>
          <Card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
                  state
                </div>
                <div className="mt-1">
                  <StateBadge state={data.state} />
                </div>
              </div>
              <Stat label="observed live factor" value={fmtMult(data.normalizationFactor)} />
              <Stat label="verified factor" value={fmtMult(data.verifiedFactor)} />
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
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
          <p className="register-note">
            This timeline contains indexed actions, not a complete history of all factor changes.
            Factor observation timestamps are unavailable.
          </p>
          <Card title="Causal action history" sub={`${data.actions.length} indexed`}>
            {data.actions.length === 0 && <Empty>No indexed actions for this asset yet.</Empty>}
            <div className="causal-timeline">
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
