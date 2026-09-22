import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { api, type Health } from "./lib/api";
import { LiveDot } from "./components/ui";
import { Landing } from "./pages/Landing";
import { Assets } from "./pages/Assets";
import { AssetDetail } from "./pages/AssetDetail";
import { Actions } from "./pages/Actions";
import { ActionDetail } from "./pages/ActionDetail";
import { Lab } from "./pages/Lab";
import { Policy } from "./pages/Policy";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/assets", label: "Assets" },
  { to: "/actions", label: "Actions" },
  { to: "/lab", label: "Protocol Lab" },
  { to: "/policy", label: "Policy" },
];

function Wordmark() {
  return (
    <NavLink to="/" className="wordmark" aria-label="CorpShift overview">
      <span className="brand-symbol">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 4H20L16 10H1L5 4ZM8 14H23L19 20H4L8 14Z" fill="#fff4e3" />
        </svg>
      </span>
      <span>
        CorpShift<span className="text-accent">.</span>
      </span>
    </NavLink>
  );
}

export function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let live = true;
    const poll = () =>
      api
        .health()
        .then((h) => live && (setHealth(h), setDown(false)))
        .catch(() => live && setDown(true));
    poll();
    const t = setInterval(poll, 8000);
    return () => ((live = false), clearInterval(t));
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="app-header">
        <div className="header-inner">
          <Wordmark />
          <nav className="app-nav" aria-label="Main navigation">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end === true}
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div
            className="header-status"
            title="API connectivity and configured chain identity. Health does not test RPC connectivity or data freshness."
          >
            {down ? (
              <>
                <LiveDot tone="bg-red" /> <span className="text-red">api offline</span>
              </>
            ) : health ? (
              <>
                <LiveDot /> API online · {health.chain} / {health.chainId}
              </>
            ) : (
              "Connecting"
            )}
          </div>
        </div>
      </header>

      <main className="app-main" id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/assets/:asset" element={<AssetDetail />} />
          <Route path="/actions" element={<Actions />} />
          <Route path="/actions/:id" element={<ActionDetail />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/policy" element={<Policy />} />
        </Routes>
      </main>

      <footer className="app-footer">
        <strong>CorpShift.</strong>
        <span>CORPORATE ACTIONS. ECONOMIC CONTINUITY.</span>
        <span>BUILT FOR ROBINHOOD CHAIN ↗</span>
      </footer>
    </div>
  );
}
