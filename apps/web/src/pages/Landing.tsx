import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type SourceStatus } from "../lib/api";
import testnet from "../../../../deployments/46630.json";

function SplitInstrument() {
  const [split, setSplit] = useState(false);
  return (
    <div className={`split-instrument ${split ? "is-split" : ""}`}>
      <div className="instrument-top">
        <span>FIG. 01 / ECONOMIC CONTINUITY</span>
        <span className="instrument-cross">+</span>
      </div>
      <div className="instrument-stage" aria-hidden="true">
        <div className="instrument-grid" />
        <div className="axis-label axis-top">CORPORATE ACTION</div>
        <div className="share-stack">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`share-sheet share-${i}`}>
              <span>XYZT</span>
              <div className="sheet-mark">{split ? "¼" : "1"}</div>
              <div className="sheet-foot">
                <span>ECONOMIC UNIT</span>
                <span>{String(i + 1).padStart(2, "0")}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="axis-label axis-bottom">
          <span>10 RAW TOKENS</span>
          <span>{split ? "40 ECONOMIC UNITS" : "10 ECONOMIC UNITS"}</span>
        </div>
        <span className="coordinate coordinate-left">Y / VALUE</span>
        <span className="coordinate coordinate-right">X / TIME</span>
      </div>
      <div className="instrument-readout">
        <div>
          <span className="micro-label">Collateral value</span>
          <strong aria-live="polite">
            $1,000<span>.00</span>
          </strong>
        </div>
        <span className="preserved-label">
          <span /> VALUE PRESERVED
        </span>
      </div>
      <div className="instrument-control">
        <div className="split-switch" role="group" aria-label="Illustrate a stock split">
          <button aria-pressed={!split} onClick={() => setSplit(false)}>
            Before split <span>1:1</span>
          </button>
          <button aria-pressed={split} onClick={() => setSplit(true)}>
            After split <span>4:1</span>
          </button>
        </div>
        <span className="instrument-equation" aria-live="polite">
          {split ? "40 × $25" : "10 × $100"}
        </span>
      </div>
      <div className="instrument-disclaimer">
        Interactive illustration · explore real transactions in Protocol Lab
      </div>
    </div>
  );
}

const FLOW = [
  ["Observe", "A corporate action arrives.", "Source evidence"],
  ["Attest", "The event becomes verifiable.", "EIP-712 signature"],
  ["Reconcile", "Onchain units catch up.", "Verified multiplier"],
  ["Protect", "Protocols act on the right value.", "Policy + accounting"],
];

export function Landing() {
  const [src, setSrc] = useState<SourceStatus | null>(null);
  const [sourceError, setSourceError] = useState(false);
  useEffect(() => {
    api
      .source()
      .then(setSrc)
      .catch(() => setSourceError(true));
  }, []);
  return (
    <div className="editorial-home">
      <div className="edition-line">
        <span>INFRASTRUCTURE FOR TOKENIZED EQUITIES</span>
        <span>RESEARCH → RUNTIME / 001</span>
      </div>
      <section className="editorial-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="small-square" /> THE CORPORATE-ACTION RUNTIME
          </div>
          <h1>
            Change happens.
            <br />
            Value <em>stays.</em>
          </h1>
          <p className="hero-description">
            Stocks split. Companies merge. Markets pause. Keep onchain collateral in proportion with
            the asset underneath.
          </p>
          <div className="hero-actions">
            <Link to="/lab" className="primary-link">
              Enter Protocol Lab <span aria-hidden="true">↗</span>
            </Link>
            <a href="#mechanism" className="text-link">
              See how it works <span aria-hidden="true">↓</span>
            </a>
          </div>
          <div className="hero-footnote">
            <span className="tiny-rule" />
            <p>
              Built for lending protocols.
              <br />
              <strong>Designed around economic correctness.</strong>
            </p>
          </div>
        </div>
        <SplitInstrument />
      </section>

      <section className="deployment-band" aria-label="Testnet deployment">
        <div className="deployment-title">
          <span className="micro-label">PUBLIC DEPLOYMENT / 46630</span>
          <h2>
            On Robinhood Chain.
            <br />
            <em>Open to inspection.</em>
          </h2>
        </div>
        <div className="deployment-number">
          <strong>
            10<span>↗</span>
          </strong>
          <span>DEPLOYED CONTRACTS</span>
        </div>
        <div className="deployment-number">
          <strong>
            17<span>✓</span>
          </strong>
          <span>SUCCESSFUL RECEIPTS</span>
        </div>
        <div className="deployment-links">
          <a
            href={`https://explorer.testnet.chain.robinhood.com/address/${testnet.registry}`}
            target="_blank"
            rel="noreferrer"
          >
            View testnet registry <span>↗</span>
          </a>
          <a href="/proof/deployment.json" target="_blank" rel="noreferrer">
            Deployment receipts <span>↗</span>
          </a>
          <p>
            Testnet · mock stock & mUSDG
            <br />
            Verified September 22, 2026
          </p>
        </div>
      </section>

      <section className="mechanism-section" id="mechanism">
        <div className="section-heading">
          <div>
            <span className="eyebrow">01 / THE MECHANISM</span>
            <h2>
              A change in the company.
              <br />
              <em>A precise response onchain.</em>
            </h2>
          </div>
          <p>One canonical event connects source evidence to the decisions a protocol makes.</p>
        </div>
        <div className="mechanism-flow">
          {FLOW.map(([title, description, detail], i) => (
            <div className="mechanism-step" key={title}>
              <div className="step-index">
                <span>0{i + 1}</span>
                <span aria-hidden="true">{i === 3 ? "↗" : "→"}</span>
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
              <span className="mechanism-detail">{detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="case-study">
        <div className="case-intro">
          <span className="eyebrow">02 / THE CONTROLLED EXPERIMENT</span>
          <h2>
            Same split.
            <br />
            <em>Different endings.</em>
          </h2>
          <p>
            Two vaults. Identical collateral. A 4:1 stock split reveals what happens when raw token
            balances meet per-share prices.
          </p>
          <Link to="/lab" className="text-link">
            Run the comparison <span>↗</span>
          </Link>
          <span className="case-scope">REPEATABLE ANVIL SANDBOX · MOCK TOKENS</span>
        </div>
        <div className="comparison-ledger">
          <div className="ledger-heading">
            <span>POSITION / 10 XYZT</span>
            <span>DEBT / $400</span>
          </div>
          <div className="ledger-row">
            <div>
              <span className="ledger-tag">01 / RAW BALANCE</span>
              <h3>Naive vault</h3>
              <p>10 tokens × $25 per share</p>
            </div>
            <div className="ledger-value is-loss">
              $250<span>HF 0.50 / LIQUIDATABLE</span>
            </div>
          </div>
          <div className="ledger-row">
            <div>
              <span className="ledger-tag">02 / ECONOMIC UNITS</span>
              <h3>CorpShift-aware</h3>
              <p>40 units × $25 per share</p>
            </div>
            <div className="ledger-value is-safe">
              $1,000<span>HF 2.00 / PRESERVED</span>
            </div>
          </div>
          <div className="ledger-note">
            <span>↳</span> FORWARD_SPLIT 4:1 attested
          </div>
        </div>
      </section>

      <section className="telemetry-section" aria-label="Live pipeline">
        <div className="telemetry-title">
          <span className={`status-point ${sourceError ? "offline" : ""}`} />
          <h2>Live pipeline</h2>
          <span>
            {sourceError ? "API UNAVAILABLE" : src ? "SANDBOX OBSERVATION" : "CONNECTING"}
          </span>
        </div>
        <div className="telemetry-values">
          {[
            ["indexed actions", src?.counts.actions],
            ["indexed events", src?.counts.events],
            ["normalization failures", src?.counts.normalizationFailures],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value ?? "—"}</strong>
            </div>
          ))}
        </div>
        <p>
          Fixture assets without a deployment on this sandbox appear as normalization failures.
          Public testnet receipts are provided separately above.
        </p>
      </section>
      <section className="closing-line">
        <span className="eyebrow">BUILT FOR THE NEXT LAYER OF FINANCE</span>
        <h2>
          Let the asset change.
          <br />
          <em>Keep the accounting sound.</em>
        </h2>
        <Link to="/lab" className="primary-link">
          Inspect. Execute. Verify. <span>↗</span>
        </Link>
      </section>
    </div>
  );
}
