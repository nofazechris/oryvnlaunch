// Turning the API's exact values into text for people.
//
// Amounts arrive as decimal strings in an asset's smallest unit (STRK has 18 decimals, USDC has 6).
// `formatUnits` is exact: it works on the digits, never on a float, so it is safe for anything a user
// might act on. `toNumber` and the helpers built on it are for DISPLAY ONLY (a chart axis, a compact
// "1.2K"): never compare, add or sort money with them.

import type { ApiAsset } from "./api";

/** Exact decimal text for `value` (smallest units) at `decimals`, trimmed to at most `maxFraction` places. */
export function formatUnits(value: string | bigint, decimals: number, maxFraction = 4): string {
  const v = BigInt(value);
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let fraction = (abs % base).toString().padStart(decimals, "0");
  fraction = fraction.slice(0, maxFraction).replace(/0+$/, "");
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${wholeText}${fraction ? "." + fraction : ""}`;
}

/** Exact plain decimal text (no thousands commas), suitable for putting back into an input. */
export function plainUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${value / base}${fraction ? "." + fraction : ""}`;
}

/** Approximate number for display (axes, compact labels). Not for comparing or summing money. */
export function toNumber(value: string | bigint, decimals: number): number {
  return Number(value) / 10 ** decimals;
}

/** 1,234 -> "1.23K", 2,500,000 -> "2.5M". For labels only. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return trim((n / 1e9).toFixed(2)) + "B";
  if (abs >= 1e6) return trim((n / 1e6).toFixed(2)) + "M";
  if (abs >= 1e3) return trim((n / 1e3).toFixed(2)) + "K";
  if (abs >= 1) return trim(n.toFixed(2));
  return fmtSmall(n);
}

const trim = (s: string) => (s.includes(".") ? s.replace(/\.?0+$/, "") : s);

/** A small price with enough significant digits to be useful, never in exponent form. */
export function fmtSmall(n: number): string {
  if (n === 0) return "0";
  if (n < 1e-12) return "<0.000000000001";
  const digits = Math.min(12, Math.max(2, 3 - Math.floor(Math.log10(Math.abs(n)))));
  return trim(n.toFixed(digits));
}

/**
 * A dollar amount for display: "$12.3K", "$34.10", "$0.0000021". Null (no price known) shows a dash,
 * never a guess. Approximate by nature, so it is only ever shown next to the exact figure.
 */
export function fmtUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  return "$" + (Math.abs(n) >= 1 ? compact(n) : fmtSmall(n));
}

/** An amount in a quote asset converted to dollars. STRK uses the live rate, USDC is a dollar, anything else is unknown. */
export function toUsd(amount: number, symbol: string | null, strkUsd: number | null): number | null {
  if (symbol === "STRK") return strkUsd === null ? null : amount * strkUsd;
  if (symbol === "USDC") return amount;
  return null;
}

/** Dollars when a rate is known, otherwise the given fallback text (the exact quote-asset figure). */
export function usdOr(amount: number, symbol: string | null, strkUsd: number | null, fallback: string): string {
  const usd = toUsd(amount, symbol, strkUsd);
  return usd === null ? fallback : fmtUsd(usd);
}

/** The price of one whole token in whole quote units, as a number for display. */
export function priceNumber(priceScaled: string, quote: ApiAsset): number {
  return Number(priceScaled) / 1e18 / 10 ** (quote.decimals ?? 18);
}

/** "12.5K STRK". When the asset is not one we recognise, the unit is left off rather than guessed. */
export function amountLabel(value: string | null, asset: ApiAsset): string {
  if (value === null) return "—";
  const text = asset.decimals === null ? compact(Number(value)) : compact(toNumber(value, asset.decimals));
  return asset.symbol ? `${text} ${asset.symbol}` : text;
}

export function pctFromBps(bps: number | null): string {
  if (bps === null) return "—";
  const p = bps / 100;
  return `${p > 0 ? "+" : ""}${Math.abs(p) >= 100 ? p.toFixed(0) : p.toFixed(1)}%`;
}

export function shortAddr(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3_600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3_600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

/** A compact age, without "ago": "5m", "3h", "2d". */
export function age(iso: string, now = Date.now()): string {
  return ago(iso, now).replace(" ago", "");
}

export function ageMinutes(iso: string, now = Date.now()): number {
  return Math.max(0, (now - new Date(iso).getTime()) / 60_000);
}
