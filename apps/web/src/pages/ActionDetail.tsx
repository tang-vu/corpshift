import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type ActionItem, type EventItem } from "../lib/api";
import {
  Card,
  Empty,
  PageIntro,
  HexLink,
  StateBadge,
  TypeBadge,
  TrustBadge,
} from "../components/ui";
import { fmtTs, fmtMult, timeUntil } from "../lib/format";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2 border-b border-edge/50 py-2 last:border-0">
      <span className="w-32 shrink-0 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
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
    setData(null);
    setErr(null);
    let active = true;
    api
      .action(id)
      .then((r) => active && setData(r))
      .catch((e) => active && setErr(e.message));
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="space-y-6">
      <PageIntro
        index="03 / EVIDENCE DOSSIER"
        title="A change, on record."
        description="Inspect the event, its signer and the results actually indexed onchain."
      >
        <div className="full-identifier">{id}</div>
        <HexLink hex={id} />
      </PageIntro>
      {!data && !err && <Empty>Loading action dossier…</Empty>}
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
            <Row label="submitted">
              {data.submittedAt ? fmtTs(data.submittedAt) : "Unavailable"}
            </Row>
            <Row label="attested by">
              {data.attestedBy ? <HexLink hex={data.attestedBy} /> : "Unavailable"}
            </Row>
            <Row label="submit tx">
              {data.txHash ? <HexLink hex={data.txHash} url={data.txUrl} /> : "Unavailable"}
            </Row>
            <Row label="params hash">
              <HexLink hex={data.paramsHash} />
            </Row>
            <Row label="evidence hash">
              <HexLink hex={data.evidenceHash} />
            </Row>
            {data.error && (
              <Row label="error">
                <span className="text-red">{data.error}</span>
              </Row>
            )}
          </Card>

          <Card
            title="Readable parameters"
            sub="Decoded from canonical ABI parameters; source claims remain separate from verification."
          >
            <ReadableParams action={data} />
            <p className="mt-4 text-sm">
              Trust context: {data.trust}. An authorized signature proves who attested the payload,
              not the truth of its external source.
            </p>
          </Card>
          <details className="raw-disclosure">
            <summary>Advanced evidence · raw JSON and ABI</summary>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Evidence" sub="canonical JSON — hashed into evidenceHash">
                <pre className="max-h-72 overflow-auto rounded bg-ink p-3 font-mono text-[11px] leading-relaxed text-fg-dim">
                  {JSON.stringify(data.evidence, null, 2)}
                </pre>
              </Card>
              <Card title="ABI params" sub="encoded for registry submission">
                <pre className="break-all whitespace-pre-wrap rounded bg-ink p-3 font-mono text-[11px] leading-relaxed text-fg-dim">
                  {data.params}
                </pre>
              </Card>
            </div>
          </details>
          {data.events.length === 0 && (
            <Empty>
              No registry events indexed for this action. Execution results are unavailable.
            </Empty>
          )}
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

function ReadableParams({ action }: { action: ActionItem }) {
  const split = ["FORWARD_SPLIT", "REVERSE_SPLIT", "STOCK_DIVIDEND"].includes(action.actionType);
  if (split && /^0x[0-9a-fA-F]{192}$/.test(action.params)) {
    const words = action.params.slice(2).match(/.{64}/g)!;
    return (
      <dl className="parameter-register">
        <div>
          <dt>Ratio ? new : old shares</dt>
          <dd>
            {BigInt(`0x${words[0]}`).toString()} : {BigInt(`0x${words[1]}`).toString()}
          </dd>
        </div>
        <div>
          <dt>Expected multiplier</dt>
          <dd>{fmtMult(BigInt(`0x${words[2]}`))}</dd>
        </div>
      </dl>
    );
  }
  if (action.actionType === "MULTIPLIER_CHANGE" && /^0x[0-9a-fA-F]{64}$/.test(action.params))
    return <p>Expected multiplier: {fmtMult(BigInt(action.params))}</p>;
  return (
    <p>
      Readable decoding unavailable for this action type or payload. Inspect the exact ABI bytes
      below.
    </p>
  );
}
