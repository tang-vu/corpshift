/** Display formatting — chain values arrive as decimal strings. */

export function shortHex(hex: string, chars = 6): string {
  if (!hex || hex.length <= chars * 2 + 2) return hex;
  return `${hex.slice(0, chars + 2)}…${hex.slice(-chars)}`;
}

/** 18dp fixed-point → compact decimal string. */
export function fmt18(v: string | bigint, digits = 2): string {
  return fixed(v, 18, digits);
}

/** 8dp oracle price → dollars. */
export function fmtPrice8(v: string | bigint): string {
  return fixed(v, 8, 2);
}

/** 6dp debt token → dollars. */
export function fmtUsd6(v: string | bigint): string {
  return fixed(v, 6, 2);
}

export function fmt(n: number, digits = 2): string {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e9) return n.toExponential(2);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Health factor: bigint 18dp; huge = no debt. */
export function fmtHf(v: string | bigint): string {
  const b = BigInt(v);
  if (b > 1n * 10n ** 30n) return "∞";
  return fmt18(v, 2);
}

/** multiplier 18dp → "4.00×" */
export function fmtMult(v: string | bigint): string {
  return `${fixed(v, 18, 2)}×`;
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

/** Round only at the display boundary, retaining arbitrary integer precision. */
function fixed(value: string | bigint, decimals: number, digits: number): string {
  const n = BigInt(value);
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const divisor = 10n ** BigInt(decimals - digits);
  const rounded = (abs + divisor / 2n) / divisor;
  const text = rounded.toString().padStart(digits + 1, "0");
  const whole = (digits ? text.slice(0, -digits) : text).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${whole}${digits ? `.${text.slice(-digits)}` : ""}`;
}

/** PolicyEngine reasons are zero or right-padded ASCII bytes32, not hashes. */
export function fmtReason(reason: string): string {
  if (/^0x0{64}$/.test(reason)) return "OK (zero code)";
  if (!/^0x[0-9a-fA-F]{64}$/.test(reason)) return reason;
  const decoded = String.fromCharCode(
    ...reason
      .slice(2)
      .match(/../g)!
      .map((byte) => parseInt(byte, 16)),
  ).replace(/\0+$/, "");
  return /^[A-Z_]+$/.test(decoded) ? decoded : "Unrecognized code";
}
