/** Display formatting — chain values arrive as decimal strings. */

export function shortHex(hex: string, chars = 6): string {
  if (!hex || hex.length <= chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}

/** 18dp fixed-point → compact decimal string. */
export function fmt18(v: string | bigint, digits = 2): string {
  const n = Number(BigInt(v)) / 1e18;
  return fmt(n, digits);
}

/** 8dp oracle price → dollars. */
export function fmtPrice8(v: string | bigint): string {
  return fmt(Number(BigInt(v)) / 1e8, 2);
}

/** 6dp debt token → dollars. */
export function fmtUsd6(v: string | bigint): string {
  return fmt(Number(BigInt(v)) / 1e6, 2);
}

export function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return n.toExponential(2);
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Health factor: bigint 18dp; huge = no debt. */
export function fmtHf(v: string | bigint): string {
  const b = BigInt(v);
  if (b > 1n * 10n ** 30n) return "∞";
  return fmt18(v, 2);
}

/** multiplier 18dp → "4.00×" */
export function fmtMult(v: string | bigint): string {
  return `${fmt(Number(BigInt(v)) / 1e18, 2)}×`;
}

export function fmtTs(sec: number | bigint | null | undefined): string {
  if (!sec) return "—";
  return new Date(Number(sec) * 1000).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

export function timeUntil(sec: number | bigint): string {
  const d = Number(sec) - Math.floor(Date.now() / 1000);
  if (d <= 0) return "due";
  if (d < 120) return `${d}s`;
  if (d < 7200) return `${Math.floor(d / 60)}m`;
  return `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`;
}
