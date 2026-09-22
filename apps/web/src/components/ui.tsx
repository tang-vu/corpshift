/** Shared UI primitives — badges, cards, hex links, stat blocks. */
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
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide ${tone}`}>
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
          {title && <h3 className="text-[13px] font-semibold tracking-wide text-fg">{title}</h3>}
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
  const label = shortHex(hex);
  const cls = "font-mono text-[12px] text-cyan hover:underline";
  if (to)
    return (
      <Link to={to} className={cls}>
        {label}
      </Link>
    );
  if (url)
    return (
      <a href={url} target="_blank" rel="noreferrer" className={cls}>
        {label} ↗
      </a>
    );
  return <span className="font-mono text-[12px] text-fg-dim">{label}</span>;
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
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-faint">
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
