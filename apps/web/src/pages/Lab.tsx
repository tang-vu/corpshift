import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type DemoState, type DemoStepResult, type VaultView } from "../lib/api";
import { Card, Empty, HexLink, StateBadge, Stat } from "../components/ui";
import { fmt18, fmtHf, fmtMult, fmtPrice8, fmtUsd6, shortHex, timeUntil } from "../lib/format";

const STEPS = [
  {
    key: "seed",
    label: "Seed positions",
    desc: "deposit 10 stock tokens + borrow $400 in both vaults",
  },
  { key: "attest", label: "Attest 4:1 split", desc: "EIP-712 attested action lands onchain" },
  { key: "probe", label: "Probe the vaults", desc: "borrow attempt during ACTION_PENDING" },
  { key: "execute", label: "Execute split", desc: "multiplier 4e18 + price $100→$25" },
  { key: "reconcile", label: "Reconcile", desc: "registry verifies the onchain multiplier" },
  { key: "liquidate", label: "Liquidation test", desc: "the divergence becomes objective" },
];

function hfTone(v: string): string {
  const b = BigInt(v);
  if (b > 10n ** 30n) return "text-fg-faint";
  const n = Number(b) / 1e18;
  return n >= 1.5 ? "text-green" : n >= 1 ? "text-amber" : "text-red";
}

/** The demo scenario walks the canonical economic-action path. The final
 *  ACTIVE node lights once reconcile restores safe operation. */
const RAIL = ["ACTIVE", "ACTION_PENDING", "ADJUSTING", "ACTIVE"];

function StateRail({ assetState, step }: { assetState: string; step: number }) {
  const idx =
    assetState === "ACTION_PENDING"
      ? 1
      : assetState === "ADJUSTING"
        ? 2
        : assetState === "ACTIVE" && step >= 5
          ? 3
          : assetState === "ACTIVE"
            ? 0
            : -1; // HALTED etc. — off the canonical path
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {RAIL.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wide whitespace-nowrap ${
              i === idx
                ? "border-amber/50 bg-amber-dim/50 text-amber"
                : i < idx
                  ? "border-green/40 bg-green-dim/40 text-green"
                  : "border-edge bg-panel text-fg-faint"
            }`}
          >
            {i < idx && <span>✓</span>}
            {i === idx && <span className="live-dot inline-block h-1 w-1 rounded-full bg-amber" />}
            {s}
            {i === 3 && idx === 3 && <span className="text-green">restored</span>}
          </div>
          {i < RAIL.length - 1 && (
            <span className={`text-[10px] ${i < idx ? "text-green" : "text-fg-faint"}`}>→</span>
          )}
        </div>
      ))}
      {idx === -1 && <StateBadge state={assetState} />}
    </div>
  );
}

function VaultPanel({
  name,
  tag,
  tone,
  v,
  liquidated,
}: {
  name: string;
  tag: string;
  tone: "naive" | "aware";
  v: VaultView;
  liquidated?: boolean;
}) {
  const accent = tone === "naive" ? "border-red/30" : "border-green/30";
  const hf = fmtHf(v.healthFactor);
  const empty = v.collateralRaw === "0";
  return (
    <div
      className={`relative rounded-lg border ${accent} bg-panel-2 p-4 ${liquidated ? "opacity-70" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[14px] font-bold">{name}</div>
          <div className="font-mono text-[10px] tracking-wide text-fg-faint">{tag}</div>
        </div>
        {liquidated && (
          <span className="rounded border border-red/40 bg-red-dim px-2 py-0.5 font-mono text-[10px] font-bold text-red">
            LIQUIDATED
          </span>
        )}
        {!liquidated && empty && (
          <span className="rounded border border-edge-2 bg-panel px-2 py-0.5 font-mono text-[10px] tracking-wide text-fg-faint">
            no position
          </span>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="collateral (raw)" value={`${fmt18(v.collateralRaw, 1)} stk`} />
        <Stat label="collateral value" value={`$${fmt18(v.collateralValue, 0)}`} />
        <Stat label="debt" value={`$${fmtUsd6(v.debt)}`} />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
            health factor
          </div>
          <div
            data-testid={`hf-${tone}`}
            className={`mt-1 font-mono text-2xl font-bold ${hfTone(v.healthFactor)}`}
          >
            {hf}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Lab() {
  const [state, setState] = useState<DemoState | null>(null);
  const [log, setLog] = useState<DemoStepResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(() => {
    api
      .demoState()
      .then((s) => mounted.current && (setState(s), setErr(null)))
      .catch((e) => mounted.current && setErr(e.message));
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const t = setInterval(refresh, 2000);
    return () => ((mounted.current = false), clearInterval(t));
  }, [refresh]);

  const act = async (fn: () => Promise<DemoStepResult>) => {
    setBusy(true);
    try {
      const r = await fn();
      setLog((l) => [...l, r]);
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (err && !state) {
    return <Empty>demo unavailable: {err} — start the api with demo keys configured.</Empty>;
  }
  if (!state) return <div className="shimmer h-64 rounded-lg" />;

  const nextLabel = STEPS[state.step]?.label ?? "done";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Protocol Lab</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-dim">
            Two identical lending vaults. One reads raw balances. One reads CorpShift. Same user,
            same collateral, same 4:1 split —{" "}
            <strong className="text-fg">diametrically opposed outcomes</strong>, proven with real
            transactions.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => act(api.demoStep)}
            disabled={busy || state.step >= STEPS.length}
            className="rounded-md bg-green px-4 py-2 text-[13px] font-bold text-ink transition hover:brightness-110 disabled:opacity-40"
          >
            {busy
              ? "executing…"
              : state.step >= STEPS.length
                ? "scenario complete"
                : `▶ ${nextLabel}`}
          </button>
          <button
            onClick={() => act(api.demoReset)}
            disabled={busy}
            className="rounded-md border border-edge-2 bg-panel px-4 py-2 text-[13px] font-semibold text-fg transition hover:border-fg-faint disabled:opacity-40"
          >
            reset
          </button>
        </div>
      </div>

      {/* step tracker */}
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`rounded border px-2 py-2 text-center ${
              i < state.step
                ? "border-green/40 bg-green-dim/40 text-green"
                : i === state.step
                  ? "border-amber/50 bg-amber-dim/40 text-amber"
                  : "border-edge bg-panel text-fg-faint"
            }`}
            title={s.desc}
          >
            <div className="font-mono text-[9px] uppercase tracking-widest opacity-70">{i + 1}</div>
            <div className="text-[11px] font-semibold leading-tight">{s.label}</div>
          </div>
        ))}
      </div>
      {state.step < STEPS.length && (
        <p className="-mt-3 text-center font-mono text-[11px] text-fg-faint">
          next: <span className="text-amber">{STEPS[state.step]?.label}</span> —{" "}
          {STEPS[state.step]?.desc}
        </p>
      )}

      {/* asset state strip */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-edge pb-4">
          <StateRail assetState={state.assetState} step={state.step} />
          <div className="flex items-center gap-3">
            {state.assetState === "ACTION_PENDING" && state.pendingEffectiveAt && (
              <span className="rounded border border-amber/40 bg-amber-dim/40 px-2 py-1 font-mono text-[11px] text-amber">
                effective in {timeUntil(state.pendingEffectiveAt)}
              </span>
            )}
            {state.demoActionId && (
              <Link
                to={`/actions/${state.demoActionId}`}
                className="font-mono text-[11px] text-cyan hover:underline"
              >
                attested action {shortHex(state.demoActionId)} →
              </Link>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
              asset state
            </div>
            <div className="mt-1">
              <StateBadge state={state.assetState} />
            </div>
          </div>
          <Stat label="uiMultiplier (onchain)" value={fmtMult(state.uiMultiplier)} />
          <Stat label="verified factor" value={fmtMult(state.verifiedFactor)} />
          <Stat label="oracle price" value={`$${fmtPrice8(state.price)}`} />
          <Stat label="user stock bal" value={fmt18(state.userStockBalance, 1)} />
        </div>
      </Card>

      {/* the two vaults */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <VaultPanel
            name="NaiveVault"
            tag="reads raw ERC-20 balances"
            tone="naive"
            v={state.vaults.naive}
            liquidated={state.step >= 6 && state.vaults.naive.collateralRaw === "0"}
          />
          <p className="mt-2 px-1 font-mono text-[11px] leading-relaxed text-fg-faint">
            collateralValue = rawBalance × price — blind to the multiplier
          </p>
        </div>
        <div>
          <VaultPanel
            name="CorpShiftAwareVault"
            tag="reads CorpShift economic units"
            tone="aware"
            v={state.vaults.aware}
            liquidated={state.step >= 6 && state.vaults.aware.collateralRaw === "0"}
          />
          <p className="mt-2 px-1 font-mono text-[11px] leading-relaxed text-fg-faint">
            collateralValue = economicUnits(raw × factor) × price — plus policy gates on every op
          </p>
        </div>
      </div>

      {/* verdict — the money shot once the scenario completes */}
      {state.step >= 6 && (
        <Card className="border-green/25">
          <div className="text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">
              verdict — same chain · same user · same action
            </div>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <div className="font-mono text-4xl font-extrabold text-red">$0</div>
                <div className="mt-1 text-[12px] text-fg-dim">
                  naive vault seized a healthy <strong className="text-fg">$1,000</strong> position
                </div>
                <div className="mt-1 font-mono text-[10px] text-red/80">
                  wrongful liquidation — raw-balance math
                </div>
              </div>
              <div>
                <div className="font-mono text-4xl font-extrabold text-green">
                  ${fmt18(state.vaults.aware.collateralValue, 0)}
                </div>
                <div className="mt-1 text-[12px] text-fg-dim">
                  aware vault kept the position at{" "}
                  <strong className="text-fg">HF {fmtHf(state.vaults.aware.healthFactor)}</strong>
                </div>
                <div className="mt-1 font-mono text-[10px] text-green/80">
                  protected — normalized units + policy gates
                </div>
              </div>
            </div>
            <p className="mx-auto mt-5 max-w-xl border-t border-edge pt-4 text-[12px] leading-relaxed text-fg-dim">
              The 4:1 split was value-neutral — the only variable was whether the protocol asked
              CorpShift what the collateral <em>means</em>. Every step above is a real transaction
              against the deployed registry; reset and run it again.
            </p>
          </div>
        </Card>
      )}

      {/* execution log */}
      {log.length > 0 && (
        <Card title="Execution log" sub="every step is real transactions — verify them onchain">
          <div className="space-y-4">
            {log.map((r, i) => (
              <div key={i} className="rounded-md border border-edge bg-panel-2 p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-[11px] font-bold ${r.ok ? "text-green" : "text-amber"}`}
                  >
                    {r.ok ? "✓" : "!"}
                  </span>
                  <span className="font-mono text-[12px] font-semibold uppercase tracking-wide">
                    {r.step}
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] text-fg-dim">{r.detail}</p>
                {r.txs.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {r.txs.map((t, j) => (
                      <div key={j} className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="text-fg-faint">{t.label}</span>
                        <span className="ml-auto">
                          <HexLink hex={t.hash} url={t.url} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {r.reverts?.map((rv, j) => (
                  <div key={j} className="mt-1.5 flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-red">✗ {rv.label}</span>
                    <span className="text-amber">{rv.error}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}
      {err && state && <p className="font-mono text-xs text-red">{err}</p>}
    </div>
  );
}
