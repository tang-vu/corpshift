/** Shared UI primitives — badges, cards, hex links, stat blocks. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { shortHex } from "../lib/format";

export function StateBadge({ state }: { state: string }) {
  const tone =
    state === "ACTIVE" || state === "RESOLVED"
      ? "text-green border-green/40 bg-green-dim/60"
      : state === "ACTION_PENDING" || state === "SCHEDULED" || state === "ADJUSTING"
        ? "text-amber border-amber/40 bg-amber-dim/60"
        : state === "UNSUBMITTED"
          ? "text-cyan border-cyan/40 bg-cyan/10"
          : "text-red border-red/40 bg-red-dim/60";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide ${tone}`}
    >
      {state}
    </span>
  );
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="rounded border border-violet/40 bg-violet/10 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-violet">
      {type}
    </span>
  );
}

export function TrustBadge({ trust }: { trust: string }) {
  const tone =
    trust === "attested"
      ? "text-green border-green/40 bg-green-dim/60"
      : trust === "submitted"
        ? "text-cyan border-cyan/40 bg-cyan/10"
        : "text-fg-dim border-edge-2 bg-panel-2";
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[12px] tracking-wide ${tone}`}>
      {trust.toUpperCase()}
    </span>
  );
}

export function Card({
  title,
  sub,
  children,
  className = "",
}: {
  title?: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`data-card ${className}`}>
      {(title || sub) && (
        <header>
          {title && <h2 className="text-[13px] font-semibold tracking-wide text-fg">{title}</h2>}
          {sub && <p className="mt-0.5 text-xs text-fg-faint">{sub}</p>}
        </header>
      )}
      <div className="data-card-body">{children}</div>
    </section>
  );
}

export function HexLink({
  hex,
  url,
  to,
}: {
  hex: string;
  url?: string | undefined;
  to?: string | undefined;
}) {
  const [copied, setCopied] = useState(false);
  const label = shortHex(hex);
  const copy = (
    <button
      className="copy-id"
      aria-label={`Copy ${hex}`}
      title={hex}
      onClick={() => {
        void navigator.clipboard
          .writeText(hex)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
  const cls = "font-mono text-[12px] text-cyan hover:underline";
  return (
    <span className="hex-control">
      {to ? (
        <Link to={to} className={cls} title={hex}>
          {label}
        </Link>
      ) : url ? (
        <a href={url} target="_blank" rel="noreferrer" className={cls} title={hex}>
          {label} ↗
        </a>
      ) : (
        <span className="font-mono text-xs" title={hex}>
          {label}
        </span>
      )}
      {copy}
    </span>
  );
}

export function Stat({
  label,
  value,
  tone = "text-fg",
  mono = true,
}: {
  label: string;
  value: string;
  tone?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
        {label}
      </div>
      <div className={`mt-1 text-[15px] font-semibold ${tone} ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}

export function LiveDot({ tone = "bg-green" }: { tone?: string }) {
  return <span className={`live-dot inline-block h-1.5 w-1.5 rounded-full ${tone}`} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-edge-2 bg-panel/50 px-4 py-10 text-center text-sm text-fg-faint">
      {children}
    </div>
  );
}

export function Partition({ mismatch = false }: { mismatch?: boolean }) {
  return (
    <svg
      className={`partition-graphic ${mismatch ? "partition-mismatch" : ""}`}
      viewBox="0 0 300 160"
      aria-hidden="true"
    >
      <path d="M0 135H300M15 0V160M285 0V160" fill="none" stroke="currentColor" opacity=".2" />
      <rect x="30" y="24" width="90" height="90" fill="currentColor" />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={160 + (i % 2) * 49}
          y={24 + Math.floor(i / 2) * 49 + (mismatch && i === 3 ? 15 : 0)}
          width="45"
          height="45"
          fill="currentColor"
          opacity={mismatch && i === 3 ? 0.3 : 1}
        />
      ))}
      <path d="M129 69H150m-6-6 6 6-6 6" fill="none" stroke="currentColor" />
      <path d="M30 144H120m40 0h90" fill="none" stroke="currentColor" />
    </svg>
  );
}

export function PageIntro({
  index,
  title,
  description,
  children,
}: {
  index: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="operational-intro">
      <div>
        <span className="eyebrow">CONTINUITY ENGINE / {index}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
      </div>
      <Partition />
    </header>
  );
}
