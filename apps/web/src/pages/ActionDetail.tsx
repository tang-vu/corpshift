import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type ActionItem, type EventItem } from "../lib/api";
import { Card, Empty, HexLink, StateBadge, TypeBadge, TrustBadge } from "../components/ui";
import { fmtTs, shortHex, timeUntil } from "../lib/format";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-b border-edge/50 py-2 last:border-0">
      <span className="w-32 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
        {label}
      </span>
      <span className="font-mono text-[12px] text-fg">{children}</span>
    </div>
  );
}

export function ActionDetail() {
  const { id = "" } = useParams();
  const [data, setData] = useState<(ActionItem & { events: EventItem[] }) | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .action(id)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [id]);

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-xs text-fg-faint">canonical action</div>
        <h1 className="mt-1 break-all font-mono text-lg font-bold tracking-tight text-cyan">
          {id}
        </h1>
      </div>
      {err && <Empty>{err === "not found" ? "action not indexed" : `api error: ${err}`}</Empty>}
      {data && (
        <>
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <TypeBadge type={data.actionType} />
              <StateBadge state={data.status} />
              <TrustBadge trust={data.trust} />
            </div>
            <Row label="asset">
              <Link to={`/assets/${data.asset}`} className="text-cyan hover:underline">
                {data.asset}
              </Link>
            </Row>
            <Row label="announced">{fmtTs(data.announcedAt)}</Row>
            <Row label="effective">
              {fmtTs(data.effectiveAt)}{" "}
              <span className="text-fg-faint">({timeUntil(data.effectiveAt)})</span>
            </Row>
            <Row label="observed">{fmtTs(data.observedAt)}</Row>
            <Row label="submitted">{fmtTs(data.submittedAt)}</Row>
            <Row label="attested by">
              {data.attestedBy ? <HexLink hex={data.attestedBy} /> : "—"}
            </Row>
            <Row label="submit tx">
              {data.txHash ? <HexLink hex={data.txHash} url={data.txUrl} /> : "—"}
            </Row>
            <Row label="params hash">{shortHex(data.paramsHash, 12)}</Row>
            <Row label="evidence hash">{shortHex(data.evidenceHash, 12)}</Row>
            {data.error && (
              <Row label="error">
                <span className="text-red">{data.error}</span>
              </Row>
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Evidence" sub="canonical JSON — hashed into evidenceHash">
              <pre className="max-h-72 overflow-auto rounded bg-ink p-3 font-mono text-[11px] leading-relaxed text-fg-dim">
                {JSON.stringify(data.evidence, null, 2)}
              </pre>
            </Card>
            <Card title="ABI params" sub="encoded exactly as submitted onchain">
              <pre className="break-all whitespace-pre-wrap rounded bg-ink p-3 font-mono text-[11px] leading-relaxed text-fg-dim">
                {data.params}
              </pre>
            </Card>
          </div>

          {data.events.length > 0 && (
            <Card title="Registry events" sub="indexed logs referencing this action">
              <div className="space-y-1.5">
                {data.events.map((e) => (
                  <div
                    key={e.id}
                    className="flex flex-wrap items-center gap-3 rounded border border-edge bg-panel-2 px-3 py-2 font-mono text-[11px]"
                  >
                    <span className="text-violet">{e.event_name}</span>
                    <span className="text-fg-faint">block {e.block_number}</span>
                    <span className="ml-auto">
                      <HexLink hex={e.tx_hash} url={e.txUrl} />
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
