import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
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
    <NavLink to="/" className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 16 L10 8 L14 12 L20 4"
          stroke="var(--color-green)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 4 H20 V10"
          stroke="var(--color-green)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[15px] font-bold tracking-tight">
        Corp<span className="text-green">Shift</span>
      </span>
      <span className="hidden rounded border border-edge-2 bg-panel-2 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-widest text-fg-faint sm:inline">
        RUNTIME
      </span>
    </NavLink>
  );
}

export function App() {
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
      <header className="sticky top-0 z-20 border-b border-edge bg-ink/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Wordmark />
          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end === true}
                className={({ isActive }) =>
                  `rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    isActive ? "bg-panel-2 text-green" : "text-fg-dim hover:text-fg"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2 font-mono text-[11px] text-fg-dim">
            {down ? (
              <>
                <LiveDot tone="bg-red" /> <span className="text-red">api offline</span>
              </>
            ) : health ? (
              <>
                <LiveDot /> {health.chain} · {health.chainId}
              </>
            ) : (
              "…"
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
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

      <footer className="border-t border-edge py-5 text-center font-mono text-[11px] text-fg-faint">
        CorpShift — the corporate-action runtime for onchain finance · built for Robinhood Chain
      </footer>
    </div>
  );
}
