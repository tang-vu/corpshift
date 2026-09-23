import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { type DemoState, type DemoStepResult } from "../lib/api";
import { fmt18, fmtMult, fmtPrice8, shortHex } from "../lib/format";
import { createSceneController } from "../lib/scene";

function ratio(value: string, max: bigint) {
  return max === 0n ? 0 : Number((BigInt(value) * 1000n) / max) / 10;
}

/** Geometry changes only between captured API observations; numbers never interpolate. */
export function ComparisonInstrument({
  state,
  previous,
  log,
  replay,
}: {
  state: DemoState;
  previous: DemoState | null;
  log: DemoStepResult[];
  replay: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const max = [state, previous]
    .filter((item): item is DemoState => !!item)
    .reduce((m, item) => {
      const values = [
        BigInt(item.vaults.naive.collateralValue),
        BigInt(item.vaults.aware.collateralValue),
      ];
      return values.reduce((n, value) => (value > n ? value : n), m);
    }, 0n);
  const naive = ratio(state.vaults.naive.collateralValue, max);
  const aware = ratio(state.vaults.aware.collateralValue, max);
  const naiveFrom = previous ? ratio(previous.vaults.naive.collateralValue, max) : naive;
  const awareFrom = previous ? ratio(previous.vaults.aware.collateralValue, max) : aware;
  const mismatch = state.uiMultiplier !== state.verifiedFactor;
  const liquidation = log.find((entry) => entry.step === "liquidate" && entry.ok);
  const naiveReceipt = liquidation?.txs.find((tx) => /naive|liquidat/i.test(tx.label));
  const awareRejection = liquidation?.reverts?.find((entry) => /NotLiquidatable/.test(entry.error));

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const controller = createSceneController(
      element,
      (p) => {
        const branch = Math.max(0, Math.min(1, (p - 0.12) / 0.22));
        const count = Math.max(0, Math.min(1, (p - 0.3) / 0.35));
        const settle = Math.max(0, Math.min(1, (p - 0.65) / 0.35));
        element.style.setProperty("--event-progress", String(p));
        element.style.setProperty("--branch-progress", String(branch));
        element.style.setProperty("--count-progress", String(count));
        element.style.setProperty("--settle-progress", String(settle));
        element.style.setProperty("--naive-width", `${naiveFrom + (naive - naiveFrom) * count}%`);
        element.style.setProperty("--aware-width", `${awareFrom + (aware - awareFrom) * count}%`);
      },
      { intro: 1 },
    );
    return () => controller.destroy();
  }, [
    state.step,
    state.runId,
    state.vaults.naive.collateralValue,
    state.vaults.aware.collateralValue,
    previous,
    replay,
    naive,
    aware,
    naiveFrom,
    awareFrom,
  ]);

  return (
    <div
      ref={root}
      className="comparison-instrument"
      data-state={state.assetState}
      data-testid="comparison-instrument"
    >
      <div className="comparison-event">
        <span className="comparison-event-dot" />
        <span>
          ONE EVENT / {state.demoActionId ? shortHex(state.demoActionId) : "NOT YET ATTESTED"}
        </span>
      </div>
      <svg
        className="comparison-forks"
        viewBox="0 0 800 70"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M400 0V18C400 43 207 30 207 70M400 18C400 43 593 30 593 70" />
      </svg>
      <div className="comparison-lanes">
        <div className="comparison-lane is-naive">
          <div className="comparison-lane-heading">
            <span>01 / NAIVE</span>
            <strong>{fmt18(state.vaults.naive.collateralRaw, 2)} raw tokens</strong>
          </div>
          <div className="comparison-unit-track">
            <i style={{ width: "100%" }} />
          </div>
          <p>Raw count × ${fmtPrice8(state.price)} per economic share</p>
          <div className="comparison-value-track">
            <i />
          </div>
          <b>${fmt18(state.vaults.naive.collateralValue, 0)} observed</b>
          {naiveReceipt && (
            <span className="comparison-outcome">
              Collateral left this lane ·{" "}
              <a href={naiveReceipt.url} target="_blank" rel="noreferrer">
                receipt {shortHex(naiveReceipt.hash)}
              </a>
            </span>
          )}
        </div>
        <div className="comparison-lane is-aware">
          <div className="comparison-lane-heading">
            <span>02 / AWARE</span>
            <strong>
              {fmt18(
                (
                  (BigInt(state.vaults.aware.collateralRaw) * BigInt(state.normalizationFactor)) /
                  10n ** 18n
                ).toString(),
                2,
              )}{" "}
              economic shares
            </strong>
          </div>
          <div className="comparison-unit-track">
            <i style={{ width: state.step >= 4 ? "100%" : "25%" }} />
          </div>
          <p>Live units × ${fmtPrice8(state.price)} per economic share</p>
          <div className="comparison-value-track">
            <i />
          </div>
          <b>${fmt18(state.vaults.aware.collateralValue, 0)} observed</b>
          {awareRejection && (
            <span className="comparison-outcome">
              Healthy liquidation rejected · {awareRejection.error}
            </span>
          )}
        </div>
      </div>
      <div className="comparison-causality">
        <span>UNIT COUNT</span>
        <span>× PRICE BASIS</span>
        <span>= OBSERVED VALUE</span>
      </div>
      {mismatch && (
        <div className="comparison-factor-gap">
          <span>OBSERVED {fmtMult(state.uiMultiplier)}</span>
          <i />
          <span>LAST VERIFIED {fmtMult(state.verifiedFactor)}</span>
        </div>
      )}
      {!mismatch && state.step >= 5 && (
        <div className="comparison-factor-aligned">
          Observed and last verified factors align at {fmtMult(state.verifiedFactor)}.
        </div>
      )}
      {state.demoActionId && (
        <Link className="comparison-dossier-link" to={`/actions/${state.demoActionId}`}>
          Follow the attested action into its evidence dossier →
        </Link>
      )}
    </div>
  );
}
