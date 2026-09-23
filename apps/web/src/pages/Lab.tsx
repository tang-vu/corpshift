import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, type DemoState, type DemoStepResult, type PolicyResult } from "../lib/api";
import { Card, Empty, PageIntro, Partition, HexLink, StateBadge, Stat } from "../components/ui";
import { fmt18, fmtHf, fmtMult, fmtPrice8, fmtUsd6, shortHex, timeUntil } from "../lib/format";
import { ComparisonInstrument } from "../components/ComparisonInstrument";
import { DemoEvidenceAssembly } from "../components/DemoEvidenceAssembly";

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
  return b >= 15n * 10n ** 17n ? "text-green" : b >= 10n ** 18n ? "text-amber" : "text-red";
}

/** The demo scenario walks the canonical economic-action path. The final
 *  ACTIVE node lights once reconcile restores safe operation. */
const RAIL = ["ACTIVE", "ACTION_PENDING", "ADJUSTING", "ACTIVE"];
const POLICY_OPS = [
  "DEPOSIT",
  "WITHDRAW",
  "BORROW",
  "LIQUIDATE",
  "CREATE_ORDER",
  "SETTLE",
  "TRANSFER",
  "USE_AS_COLLATERAL",
  "PRICE_READ",
];

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
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[12px] font-semibold tracking-wide whitespace-nowrap ${
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
            <span className={`text-[12px] ${i < idx ? "text-green" : "text-fg-faint"}`}>→</span>
          )}
        </div>
      ))}
      {idx === -1 && <StateBadge state={assetState} />}
    </div>
  );
}

function PairedMeasurements({
  state,
  history,
  log,
}: {
  state: DemoState;
  history: DemoState[];
  log: DemoStepResult[];
}) {
  const [replay, setReplay] = useState(0);
  const [policy, setPolicy] = useState<PolicyResult[] | null>(null);
  useEffect(() => {
    if (state.assetState !== "ADJUSTING") return;
    let active = true;
    setPolicy(null);
    Promise.all(POLICY_OPS.map((_, i) => api.policy(state.asset, i)))
      .then((values) => {
        if (active) setPolicy(values);
      })
      .catch(() => {
        if (active) setPolicy(null);
      });
    return () => {
      active = false;
    };
  }, [state.asset, state.assetState, state.step, state.runId]);
  const previous = history.length > 1 ? (history[history.length - 2] ?? null) : null;
  const { naive, aware } = state.vaults;
  const units = (raw: string) =>
    fmt18((BigInt(raw) * BigInt(state.normalizationFactor)) / 10n ** 18n, 2);
  const rows = [
    ["Raw collateral · stock tokens", fmt18(naive.collateralRaw), fmt18(aware.collateralRaw)],
    ["Economic shares · live adapter", units(naive.collateralRaw), units(aware.collateralRaw)],
    ["Debt · mUSDG", fmtUsd6(naive.debt), fmtUsd6(aware.debt)],
  ];
  const scale =
    BigInt(naive.collateralValue) > BigInt(aware.collateralValue)
      ? BigInt(naive.collateralValue)
      : BigInt(aware.collateralValue);
  const width = (v: string) => (scale === 0n ? 0 : Number((BigInt(v) * 1000n) / scale) / 10);
  return (
    <section className="paired-measurements" aria-label="Synchronized vault comparison">
      <div className="comparison-top">
        <span className="eyebrow">SAME POSITION / TWO ACCOUNTING SYSTEMS</span>
        <button onClick={() => setReplay(replay + 1)}>Replay visual ↻</button>
      </div>
      <ComparisonInstrument state={state} previous={previous} log={log} replay={replay} />
      {state.assetState === "ADJUSTING" && (
        <div className="comparison-policy">
          <strong>Live operation policy / ADJUSTING</strong>
          <div>
            {POLICY_OPS.map((name, i) => (
              <span key={name} data-allowed={policy?.[i]?.allowed ? "true" : "false"}>
                {name} · {policy ? (policy[i]?.allowed ? "allowed" : "blocked") : "reading…"}
              </span>
            ))}
          </div>
          <p>
            Decisions shown above are read from the current policy endpoint. PRICE_READ is permitted
            by the reviewed default while the other operations are blocked.
          </p>
        </div>
      )}
      <div className="pair-heading">
        <span>Current API observation</span>
        <h2>
          NaiveVault<small>Raw balance accounting</small>
        </h2>
        <h2>
          CorpShiftAwareVault<small>Live units + policy gates</small>
        </h2>
      </div>
      <div className="pair-row pair-value">
        <span>Collateral valuation · USD</span>
        <strong>${fmt18(naive.collateralValue, 0)}</strong>
        <strong>${fmt18(aware.collateralValue, 0)}</strong>
      </div>
      <div className="pair-row pair-bars" key={`${state.step}-${replay}`} aria-hidden="true">
        <span>Shared relative scale</span>
        {[naive, aware].map((v, i) => (
          <div key={i}>
            <i style={{ width: `${width(v.collateralValue)}%` }} />
          </div>
        ))}
      </div>
      {rows.map(([label, n, a]) => (
        <div className="pair-row" key={label}>
          <span>{label}</span>
          <b>{n}</b>
          <b>{a}</b>
        </div>
      ))}
      <div className="pair-row">
        <span>Health factor · ratio</span>
        <b data-testid="hf-naive" className={hfTone(naive.healthFactor)}>
          {fmtHf(naive.healthFactor)}
        </b>
        <b data-testid="hf-aware" className={hfTone(aware.healthFactor)}>
          {fmtHf(aware.healthFactor)}
        </b>
      </div>
      <div className="pair-row">
        <span>Position condition</span>
        <b>
          {state.step === 6 && naive.collateralRaw === "0"
            ? "LIQUIDATED"
            : naive.collateralRaw === "0"
              ? "No position"
              : "Deposited"}
        </b>
        <b>{aware.collateralRaw === "0" ? "No position" : "Position retained"}</b>
      </div>
      <div className="causal-note">
        <span>↳</span>
        <p>
          {state.uiMultiplier !== state.verifiedFactor
            ? "The live multiplier changed before verification. Aware valuation already uses live adapter units; policy gates restrict operations while the registry is ADJUSTING."
            : state.step >= 5
              ? "Reconciliation aligns the last verified factor with the observed multiplier. Valuation and permission are separate decisions; inspect the evidence below."
              : "Both lanes use the same per-economic-share price. The naive vault ignores the multiplier; the aware vault values the deposited raw amount in live economic units."}
          <small>
            Price basis: ${fmtPrice8(state.price)} per economic share. Raw ERC-20 balances do not
            multiply. A quote already normalized per raw token must not be multiplied again. Replay
            changes presentation only.
          </small>
        </p>
      </div>
    </section>
  );
}

export function Lab() {
  const [state, setState] = useState<DemoState | null>(null);
  const [history, setHistory] = useState<DemoState[]>([]);
  const [log, setLog] = useState<DemoStepResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const mounted = useRef(true);
  const lock = useRef(false);
  const generation = useRef(0);
  const reading = useRef(false);
  const latest = useRef<DemoState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [uncertain, setUncertain] = useState(false);

  const refresh = useCallback(async (owned = false) => {
    const ticket = ++generation.current;
    reading.current = true;
    try {
      const s = await api.demoState();
      if (!mounted.current || ticket !== generation.current) return;
      const prev = latest.current;
      if (
        prev &&
        !owned &&
        (prev.step !== s.step || prev.runId !== s.runId || prev.demoActionId !== s.demoActionId)
      ) {
        setLog([]);
        setHistory([s]);
        setNotice(
          "Shared lab changed outside this page. Session evidence was cleared; missing execution history cannot be recovered. Reset the shared lab to capture a complete run.",
        );
      }
      latest.current = s;
      setState(s);
      if (!prev) setHistory([s]);
      else if (owned)
        setHistory((items) =>
          prev.runId !== s.runId ? [s] : [...items.filter((item) => item.step !== s.step), s],
        );
      setReadAt(new Date().toISOString());
      setReadError(null);
      setUncertain(false);
    } catch (e) {
      if (mounted.current && ticket === generation.current) setReadError((e as Error).message);
    } finally {
      if (ticket === generation.current) reading.current = false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const t = setInterval(() => {
      setNow(Date.now());
      if (!lock.current && !reading.current && document.visibilityState === "visible")
        void refresh();
    }, 2000);
    return () => {
      mounted.current = false;
      generation.current++;
      clearInterval(t);
    };
  }, [refresh]);

  const act = async (fn: () => Promise<DemoStepResult>) => {
    if (lock.current || Date.now() < retryAt || uncertain || readError || state?.busy) return;
    lock.current = true;
    generation.current++;
    setBusy(true);
    setErr(null);
    const before = latest.current;
    try {
      const r = await fn();
      const expected = fn === api.demoReset ? "reset" : STEPS[before?.step ?? 0]?.key;
      if (
        r.step !== expected ||
        (r.step !== "reset" && before?.runId && r.runId && before.runId !== r.runId)
      ) {
        setLog([]);
        setHistory([]);
        setNotice(
          "Another visitor advanced the shared lab before this request. Execution evidence cannot be associated confidently; reset for a complete report.",
        );
      } else {
        setLog((l) => (r.step === "reset" && r.ok ? [r] : [...l, r]));
        if (r.step === "reset" && r.ok) setNotice(null);
      }
      if (!r.ok) setErr(r.detail);
      await refresh(true);
      const after = latest.current;
      if (
        after &&
        ((r.runId && r.runId !== after.runId) ||
          (r.ok && after.step !== (r.step === "reset" ? 0 : (before?.step ?? 0) + 1)))
      ) {
        setLog([]);
        setHistory([after]);
        setNotice(
          "Shared progress changed during execution. Session evidence was cleared because the response does not match the current run.",
        );
      }
    } catch (e) {
      setErr((e as Error).message);
      if (e instanceof ApiError && e.status === 429) {
        setRetryAt(e.retryAt);
      } else {
        setLog([]);
        setUncertain(true);
        setNotice(
          "Request outcome uncertain. Refreshing authoritative state before another action; a retry advances the current shared step and may not repeat the previous request.",
        );
      }
      await refresh();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  if (readError && !state) {
    return (
      <div className="space-y-6">
        <PageIntro
          index="01 / SHARED SANDBOX"
          title="Protocol Lab"
          description="The experiment requires authoritative API reads."
        />
        <Empty>Demo unavailable: {readError}. No verified protection result is available.</Empty>
      </div>
    );
  }
  if (!state)
    return (
      <div className="space-y-6">
        <h1>Protocol Lab</h1>
        <Empty>Loading authoritative sandbox state…</Empty>
      </div>
    );

  const nextLabel = STEPS[state.step]?.label ?? "done";
  const checks = [
    { label: "Scenario completed", pass: state.step === STEPS.length },
    {
      label: "Borrow blocked by policy",
      pass: log.some(
        (entry) =>
          entry.step === "probe" &&
          entry.ok &&
          entry.reverts?.some((revert) => revert.error.startsWith("UnsafeAssetState")),
      ),
    },
    {
      label: "Healthy liquidation rejected",
      pass: log.some(
        (entry) =>
          entry.step === "liquidate" &&
          entry.ok &&
          entry.reverts?.some((revert) => revert.error.startsWith("NotLiquidatable")),
      ),
    },
    { label: "Asset restored to ACTIVE", pass: state.assetState === "ACTIVE" },
    {
      label: "4:1 multiplier verified",
      pass:
        state.uiMultiplier === "4000000000000000000" && state.verifiedFactor === state.uiMultiplier,
    },
    {
      label: "Naive collateral seized",
      pass:
        state.step === STEPS.length &&
        state.vaults.naive.collateralRaw === "0" &&
        state.vaults.naive.collateralValue === "0" &&
        state.vaults.naive.debt === "0",
    },
    {
      label: "Aware position retained",
      pass:
        state.vaults.aware.collateralRaw === "10000000000000000000" &&
        state.vaults.aware.debt === "400000000",
    },
    {
      label: "$1,000 value and HF 2.00 preserved",
      pass:
        state.vaults.aware.collateralValue === "1000000000000000000000" &&
        state.vaults.aware.healthFactor === "2000000000000000000",
    },
  ];
  const verified =
    !busy && !state.busy && !uncertain && !readError && !err && checks.every((check) => check.pass);
  const exportEvidence = () => {
    const report = {
      schema: "corpshift.demo-evidence.v1",
      capturedAt: new Date().toISOString(),
      verified,
      error: readError ?? err,
      checks,
      state,
      executionLog: log,
      scope:
        "Unsigned browser-observed API snapshot; reads are not pinned to one block; independently verify transaction receipts. Log contains only this page session. Stock and debt tokens are demo mocks; rejected calls are simulations.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "corpshift-demo-evidence.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lab-workspace space-y-6">
      <div className="lab-heading flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Protocol Lab</h1>
          <p className="mt-1 max-w-2xl text-sm text-fg-dim">
            Two identical lending vaults. One reads raw balances. One reads CorpShift. Same user,
            same collateral, same 4:1 split —{" "}
            <strong className="text-fg">diametrically opposed outcomes</strong>, proven with real
            transactions.
          </p>
          <p className="mt-2 text-xs text-fg-faint">
            Shared Anvil sandbox · mock stock and mUSDG · reset affects all visitors. Public
            Robinhood testnet deployment is linked from Overview.
          </p>
        </div>
      </div>

      <div className="shared-notice" role="status">
        <strong>One shared lab.</strong> Executing changes the scenario for all visitors. Reset
        affects everyone.
        {state.busy && <p>Another operation is running. Waiting for authoritative state.</p>}
        {now < retryAt && (
          <p>
            Rate limited · retry available in {Math.ceil((retryAt - now) / 1000)}s. No request will
            be sent automatically.
          </p>
        )}
        {notice && <p>{notice}</p>}
      </div>
      <p className="text-xs text-fg-dim">
        Last successful API read: {readAt ?? "unavailable"}.{" "}
        {readError ? "Retained values are stale." : "Reads are not pinned to one block."}
      </p>
      {/* step tracker */}
      {(readError || err) && (
        <div
          role="alert"
          className="rounded-lg border border-red/40 bg-red-dim p-3 text-sm text-red"
        >
          {readError ? `Live reads unavailable. Displayed values may be stale: ${readError}` : err}
        </div>
      )}
      <div
        className="step-track grid grid-cols-3 gap-1.5 sm:grid-cols-6"
        aria-label="Scenario progress"
      >
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
            <div className="font-mono text-[12px] uppercase tracking-widest opacity-70">
              {i + 1}
            </div>
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

      <div className="lab-action-dock">
        <p>
          <strong>
            {state.step < STEPS.length
              ? `Step ${state.step + 1} of 6`
              : "Six-step scenario complete"}
          </strong>
          <span>Shared Anvil sandbox · mock stock and mUSDG. Reset affects every visitor.</span>
        </p>{" "}
        <div className="flex gap-2">
          <button
            onClick={() => act(api.demoStep)}
            disabled={
              busy ||
              !!readError ||
              uncertain ||
              !!state.busy ||
              now < retryAt ||
              state.step >= STEPS.length
            }
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
            disabled={busy || !!readError || uncertain || !!state.busy || now < retryAt}
            className="rounded-md border border-edge-2 bg-panel px-4 py-2 text-[13px] font-semibold text-fg transition hover:border-fg-faint disabled:opacity-40"
          >
            Reset shared lab
          </button>
        </div>
      </div>
      <PairedMeasurements state={state} history={history} log={log} />
      <DemoEvidenceAssembly state={state} log={log} />
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
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
              asset state
            </div>
            <div className="mt-1">
              <StateBadge state={state.assetState} />
            </div>
          </div>
          <Stat label="observed multiplier" value={fmtMult(state.uiMultiplier)} />
          <Stat label="last verified factor" value={fmtMult(state.verifiedFactor)} />
          <Stat label="USD / economic share" value={`$${fmtPrice8(state.price)}`} />
          <Stat label="wallet raw stock" value={fmt18(state.userStockBalance, 1)} />
        </div>
      </Card>

      {/* verdict — the money shot once the scenario completes */}
      {verified && (
        <Card className="reconciliation-result border-green/25">
          <Partition />
          <div className="text-center">
            <div className="font-mono text-[12px] uppercase tracking-[0.2em] text-fg-faint">
              verdict — same chain · same user · same action
            </div>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <div className="font-mono text-4xl font-extrabold text-red">
                  ${fmt18(state.vaults.naive.collateralValue, 0)}
                </div>
                <div className="mt-1 text-[12px] text-fg-dim">
                  naive vault seized a healthy <strong className="text-fg">$1,000</strong> position
                </div>
                <div className="mt-1 font-mono text-[12px] text-red/80">
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
                <div className="mt-1 font-mono text-[12px] text-green/80">
                  protected — normalized units + policy gates
                </div>
              </div>
            </div>
            <p className="mx-auto mt-5 max-w-xl border-t border-edge pt-4 text-[12px] leading-relaxed text-fg-dim">
              The 4:1 split was value-neutral — the only variable was whether the protocol asked
              CorpShift what the collateral <em>means</em>. Accepted writes have mined receipts;
              expected rejections are decoded contract simulations.
            </p>
          </div>
        </Card>
      )}

      <Card
        title="Verify the outcome"
        sub="Checks against the latest API state; export the inputs and transaction references."
      >
        <p
          className="evidence-status"
          data-condition={readError ? "stale" : err ? "failed" : verified ? "complete" : "partial"}
          role="status"
        >
          {readError
            ? "Stale evidence — restore live reads before export."
            : err
              ? "Failed action — protection is not verified."
              : verified
                ? "Complete evidence — all eight checks passed."
                : "Partial evidence — all eight checks and a clean read are required."}
        </p>
        {state.step === 6 && !log.length && (
          <p className="mb-4 text-sm">
            This shared scenario is complete, but this page has no execution history. Final balances
            cannot establish protection. Reset shared lab to capture a complete session.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {checks.map((check) => (
            <div
              key={check.label}
              className="flex items-center gap-2 rounded border border-edge bg-panel-2 p-3 text-xs"
            >
              <span className={check.pass && !readError ? "text-green" : "text-fg-faint"}>
                {readError ? "STALE" : check.pass ? "PASS" : "WAIT"}
              </span>
              <span>
                {check.label}
                {!check.pass && (
                  <small className="block">
                    {state.step === 6
                      ? "Required evidence missing from this session or current state."
                      : "Awaiting scenario result and supporting evidence."}
                  </small>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-xs leading-relaxed text-fg-dim">
            Demo uses mock stock and mUSDG tokens. Accepted operations have transaction hashes;
            rejected operations are contract simulations. Reads are not pinned to one block. The
            report is an unsigned browser-observed API snapshot, not an independent audit or proof
            of production readiness.
          </p>
          <button
            onClick={exportEvidence}
            disabled={busy || !!state.busy || uncertain || !!readError}
            className="rounded-md border border-edge-2 px-4 py-2 text-xs font-semibold hover:border-green disabled:opacity-40"
          >
            Export evidence
          </button>
        </div>
      </Card>

      <details className="raw-disclosure">
        <summary>Inspect current API state, chain and contracts</summary>
        <pre>{JSON.stringify(state, null, 2)}</pre>
      </details>
      {/* execution log */}
      {log.length > 0 && (
        <Card
          title="Execution log"
          sub="Mined writes and expected rejected simulations captured by this page."
        >
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
                <details className="raw-disclosure mt-3">
                  <summary>Raw step response</summary>
                  <pre>{JSON.stringify(r, null, 2)}</pre>
                </details>
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
    </div>
  );
}
