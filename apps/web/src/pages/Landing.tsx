import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type SourceStatus } from "../lib/api";
import { Card, Stat, LiveDot } from "../components/ui";

const FLOW = [
  { label: "Stock Token", sub: "ERC-8056 · uiMultiplier()", tone: "cyan" },
  { label: "Corporate action", sub: "splits · dividends · halts", tone: "violet" },
  { label: "Normalizer", sub: "canonical schema", tone: "fg-dim" },
  { label: "Attested action", sub: "EIP-712 verified", tone: "amber" },
  { label: "ActionRegistry", sub: "state transitions", tone: "green" },
  { label: "Policy hooks", sub: "lending · vaults · agents", tone: "green" },
];

function FlowDiagram() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {FLOW.map((f, i) => (
        <div key={f.label} className="relative">
          <div
            className={`rounded-lg border border-edge bg-panel-2 px-3 py-3 text-center ${
              i === FLOW.length - 1 ? "border-green/40" : ""
            }`}
          >
            <div
              className={`text-[12px] font-semibold ${
                f.tone === "green"
                  ? "text-green"
                  : f.tone === "amber"
                    ? "text-amber"
                    : f.tone === "cyan"
                      ? "text-cyan"
                      : f.tone === "violet"
                        ? "text-violet"
                        : "text-fg"
              }`}
            >
              {f.label}
            </div>
            <div className="mt-1 font-mono text-[10px] text-fg-faint">{f.sub}</div>
          </div>
          {i < FLOW.length - 1 && (
            <div className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-fg-faint lg:block">
              →
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Landing() {
  const [src, setSrc] = useState<SourceStatus | null>(null);

  useEffect(() => {
    api
      .source()
      .then(setSrc)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-10">
      {/* hero */}
      <section className="pt-6">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-edge-2 bg-panel-2 px-3 py-1 font-mono text-[11px] text-fg-dim">
          <LiveDot /> corporate-action runtime · robinhood chain
        </div>
        <h1 className="max-w-5xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
          When the stock underneath changes,
          <br />
          <span className="text-green">DeFi must change with it.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-fg-dim">
          Stock Tokens are programmable — but splits, dividends, mergers, halts and redemptions
          change their economic meaning. Protocols that read raw ERC-20 balances misvalue
          collateral, execute unsafe operations, and keep stale assumptions forever.{" "}
          <strong className="text-fg">CorpShift keeps DeFi economically correct</strong> when the
          stock underneath a Stock Token changes.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            to="/lab"
            className="rounded-md bg-green px-5 py-2.5 text-[13px] font-bold text-ink transition hover:brightness-110"
          >
            Run the killer demo →
          </Link>
          <Link
            to="/actions"
            className="rounded-md border border-edge-2 bg-panel px-5 py-2.5 text-[13px] font-semibold text-fg transition hover:border-fg-faint"
          >
            Inspect canonical actions
          </Link>
        </div>
        <p className="mt-6 font-mono text-[11px] tracking-wide text-fg-faint">
          61 contract tests · 41 package tests · 13 acceptance checks · 3 browser e2e — all green ·
          every demo step is a real transaction
        </p>
      </section>

      {/* live pipeline */}
      <Card title="Live pipeline" sub="every layer is real — contracts, attestations, indexer, api">
        <FlowDiagram />
        <div className="mt-6 grid grid-cols-3 gap-4 border-t border-edge pt-4 sm:grid-cols-3">
          <Stat label="indexed actions" value={src ? String(src.counts.actions) : "—"} />
          <Stat label="indexed events" value={src ? String(src.counts.events) : "—"} />
          <Stat
            label="normalization failures"
            value={src ? String(src.counts.normalizationFailures) : "—"}
            tone={src && src.counts.normalizationFailures ? "text-amber" : "text-fg"}
          />
        </div>
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-fg-faint">
          normalization failures are mainnet fixture assets with no CorpShift deployment on this
          chain — counted openly, never hidden.
        </p>
      </Card>

      {/* the problem, concrete */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card title="A 4:1 split, through a naive lens" sub="what raw-balance protocols see">
          <div className="space-y-3 font-mono text-[13px]">
            <div className="flex justify-between border-b border-edge pb-2">
              <span className="text-fg-dim">position</span>
              <span>10 XYZT · debt $400</span>
            </div>
            <div className="flex justify-between border-b border-edge pb-2">
              <span className="text-fg-dim">pre-split value</span>
              <span className="text-green">$1,000 → HF 2.00</span>
            </div>
            <div className="flex justify-between border-b border-edge pb-2">
              <span className="text-fg-dim">after 4:1 split</span>
              <span>price $100 → $25 · raw balance still 10</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-dim">naive valuation</span>
              <span className="text-red">$250 → HF 0.50 → liquidatable</span>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-fg-faint">
            The position is perfectly healthy — the split is value-neutral. But a protocol reading
            raw balances sees collateral collapse and liquidates the user anyway. This happens
            onchain in the Protocol Lab.
          </p>
        </Card>
        <Card title="The same block, through CorpShift" sub="what normalized protocols see">
          <div className="space-y-3 font-mono text-[13px]">
            <div className="flex justify-between border-b border-edge pb-2">
              <span className="text-fg-dim">action detected</span>
              <span className="text-amber">FORWARD_SPLIT 4:1 attested</span>
            </div>
            <div className="flex justify-between border-b border-edge pb-2">
              <span className="text-fg-dim">risk ops</span>
              <span className="text-amber">gated while ACTION_PENDING</span>
            </div>
            <div className="flex justify-between border-b border-edge pb-2">
              <span className="text-fg-dim">verified factor</span>
              <span>uiMultiplier() = 4e18 onchain ✓</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-dim">normalized valuation</span>
              <span className="text-green">40 units × $25 = $1,000 → HF 2.00</span>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-fg-faint">
            Same inputs, same corporate action — the aware vault blocks unsafe operations during the
            transition, verifies the multiplier landed, and values the position correctly
            throughout.
          </p>
        </Card>
      </section>
    </div>
  );
}
