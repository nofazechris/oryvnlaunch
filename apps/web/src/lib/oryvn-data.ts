// PREVIEW DATA — development-only mock values, ported from the design PRD's oryvn-data.js.
// Replace with indexer/RPC-derived data in production. The UI labels this "Preview data · not live".

export interface Token {
  name: string;
  sym: string;
  g: [string, string];
  ink: string;
  price: number;
  mcap: number;
  vol: number;
  holders: number;
  chg: number;
  bond: number;
  age: string;
  trades: number;
  creator: string;
  addr: string;
}

export const TOKENS: Token[] = [
  { name: "Pixel Pals", sym: "PXP", g: ["#73D9E8", "#B7F0F5"], ink: "#062A30", price: 0.000482, mcap: 482000, vol: 128400, holders: 2841, chg: 18.4, bond: 72, age: "2h", trades: 6120, creator: "0x04a1…9c2e", addr: "0x05f3a1c8e9b4d27f61a0e3c5b8d9f2a4c6e1b7d3a9f0c2e4b6d8a1c3e5f7b9d2" },
  { name: "Sunny Bun", sym: "BUN", g: ["#FF9865", "#FFD2A8"], ink: "#3A1404", price: 0.000915, mcap: 915000, vol: 241900, holders: 4102, chg: 6.2, bond: 91, age: "5h", trades: 9874, creator: "0x07bd…31af", addr: "0x02b7e4f1a9c3d5e7f0a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5" },
  { name: "Neon Kid", sym: "NKID", g: ["#568BFF", "#F38FC4"], ink: "#140A2E", price: 0.000231, mcap: 231000, vol: 73200, holders: 1290, chg: -4.8, bond: 38, age: "41m", trades: 2210, creator: "0x01c9…e7d0", addr: "0x03c1d9e7f5a3b1c9d7e5f3a1b9c7d5e3f1a9b7c5d3e1f9a7b5c3d1e9f7a5b3c1" },
  { name: "Moss Club", sym: "MOSS", g: ["#C7EA83", "#EAF7C9"], ink: "#1C2A06", price: 0.000118, mcap: 118000, vol: 21700, holders: 612, chg: 2.1, bond: 19, age: "12m", trades: 488, creator: "0x06ee…a412", addr: "0x0618aa04e2c6f8a0b2d4e6f8a0c2e4a6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8" },
  { name: "Plum Ghost", sym: "BOO", g: ["#B69AFF", "#E6DCFF"], ink: "#1E1240", price: 0.000364, mcap: 364000, vol: 96300, holders: 1876, chg: 11.7, bond: 55, age: "3h", trades: 4011, creator: "0x02f0…5b8c", addr: "0x0742c0e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5c7" },
  { name: "Coral Cat", sym: "MEOW", g: ["#FF7777", "#FFC2B0"], ink: "#3A0A0A", price: 0.000702, mcap: 702000, vol: 188100, holders: 3390, chg: -9.3, bond: 83, age: "9h", trades: 7702, creator: "0x05aa…0f19", addr: "0x01d4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4" },
  { name: "Cairo Builders", sym: "CAIRO", g: ["#F38FC4", "#FFD9EC"], ink: "#3A0A24", price: 0.000159, mcap: 159000, vol: 34800, holders: 905, chg: 24.9, bond: 27, age: "26m", trades: 1033, creator: "0x03b2…77de", addr: "0x0499b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9" },
  { name: "Stark Frog", sym: "RIBBIT", g: ["#55D69A", "#C9F2DD"], ink: "#05301B", price: 0.000077, mcap: 77000, vol: 9800, holders: 344, chg: -1.6, bond: 11, age: "8m", trades: 197, creator: "0x00d7…c3a1", addr: "0x0233e5f7a9b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3" },
  { name: "Orbit Duck", sym: "QUAK", g: ["#72BFFF", "#D2EBFF"], ink: "#05223A", price: 0.000548, mcap: 548000, vol: 152600, holders: 2608, chg: 3.9, bond: 64, age: "6h", trades: 5530, creator: "0x04c4…8e2b", addr: "0x0577f9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7" },
  { name: "Honey Bot", sym: "HBOT", g: ["#F3B65F", "#FFE6BD"], ink: "#33200A", price: 0.000296, mcap: 296000, vol: 58900, holders: 1422, chg: 7.5, bond: 46, age: "1h", trades: 3104, creator: "0x01ab…d55e", addr: "0x0688a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f9" },
];

/**
 * The mock TOKENS above are ILLUSTRATIVE EXAMPLES — they show what a launch looks
 * like, not real markets. Real tokens launched from the platform live in LAUNCHED
 * (indexer-fed in production; empty until the first real launch). Discovery ranks
 * LAUNCHED by value and falls back to examples + a "be the first" state when empty.
 */
export const EXAMPLES: Token[] = TOKENS;
export const LAUNCHED: Token[] = [];
export const HAS_LAUNCHES = LAUNCHED.length > 0;

/** Real platform launches, ranked by market cap (most valuable first). Empty pre-launch. */
export function topLaunched(): Token[] {
  return LAUNCHED.slice().sort((a, b) => b.mcap - a.mcap);
}

export interface LaunchTemplate {
  key: string;
  label: string;
  blurb: string;
  g: [string, string];
  ink: string;
}

/** The kinds of token a creator can actually launch (real choices, not markets). */
export const LAUNCH_TEMPLATES: LaunchTemplate[] = [
  { key: "meme", label: "Meme coin", blurb: "A community meme with a mascot and a bonding-curve launch.", g: ["#FF9865", "#FFD2A8"], ink: "#3A1404" },
  { key: "community", label: "Community token", blurb: "A shared token for a group, project or crew.", g: ["#73D9E8", "#B7F0F5"], ink: "#062A30" },
  { key: "art", label: "Art / collectible", blurb: "A token around an artist, a drop or a collectible.", g: ["#F38FC4", "#FFD9EC"], ink: "#3A0A24" },
  { key: "utility", label: "Utility token", blurb: "A token that powers access, rewards or a product.", g: ["#B69AFF", "#E6DCFF"], ink: "#1E1240" },
];

/** STRK reserve at graduation. */
export const GRAD_TARGET = 69000;

/** Preview wallet (dev only). */
export const ME = {
  addr: "0x04f2…b21a",
  strk: 248.5,
  holdings: [
    { sym: "BUN", qty: 182000, avg: 0.000612 },
    { sym: "PXP", qty: 240000, avg: 0.000301 },
    { sym: "BOO", qty: 96000, avg: 0.000402 },
    { sym: "QUAK", qty: 51000, avg: 0.000488 },
    { sym: "NKID", qty: 120000, avg: 0.000255 },
  ],
  created: ["CAIRO", "MOSS"],
};

/** Mulberry32-style seeded RNG (matches the design's rng). */
export function rng(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash (matches the design's hash). */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Flowing contour line paths for the decorative backgrounds. */
export function contours(w: number, h: number, n: number, seed: number): string[] {
  const r = rng(seed || 7);
  const a1 = 0.6 + r() * 0.4;
  const ph = r() * 6;
  const paths: string[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / n;
    let d = "";
    const steps = 36;
    for (let s = 0; s <= steps; s++) {
      const x = -100 + ((w + 200) * s) / steps;
      const u = s / steps;
      const y =
        h * 0.12 +
        (f - 0.25) * h * (0.3 + 1.1 * u) +
        Math.sin(u * Math.PI * 1.4 * a1 + 0.5 + ph * 0.2) * h * (0.24 - f * 0.08) +
        Math.sin(u * 6 + f * 3) * h * 0.012 * f;
      d += (s ? " L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }
    paths.push(d);
  }
  return paths;
}

/** Deterministic sparkline (line + filled area) path pair. */
export function spark(seed: number, up: boolean): { line: string; area: string } {
  let v = 30;
  const pts: [number, number][] = [];
  let r = seed * 9301 + 49297;
  for (let i = 0; i < 24; i++) {
    r = (r * 9301 + 49297) % 233280;
    v += (r / 233280 - (up ? 0.38 : 0.5)) * 9;
    v = Math.max(6, Math.min(50, v));
    pts.push([i * (200 / 23), 56 - v]);
  }
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return { line, area: line + " L200 56 L0 56 Z" };
}

export function fmtP(p: number): string {
  return p < 0.001 ? p.toFixed(7) : p.toFixed(5);
}

export function fmtK(n: number): string {
  return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n));
}

export interface TokenView extends Token {
  idx: number;
  bg: string;
  g0: string;
  g1: string;
  sym2: string;
  priceStr: string;
  mcapStr: string;
  volStr: string;
  chgStr: string;
  chgColor: string;
  addrShort: string;
  holdersStr: string;
  href: string;
  barBg: string;
}

/** Derived view-model for a token (gradients, formatted values, short address). */
export function view(t: Token, i: number): TokenView {
  return {
    ...t,
    idx: i,
    bg: `linear-gradient(150deg, ${t.g[1]}, ${t.g[0]})`,
    g0: t.g[0],
    g1: t.g[1],
    sym2: t.sym.slice(0, 4),
    priceStr: fmtP(t.price),
    mcapStr: fmtK(t.mcap),
    volStr: fmtK(t.vol),
    chgStr: `${t.chg > 0 ? "+" : ""}${t.chg}%`,
    chgColor: t.chg >= 0 ? "#55D69A" : "#FF6868",
    addrShort: t.addr.slice(0, 8) + "…" + t.addr.slice(-6),
    holdersStr: t.holders.toLocaleString(),
    href: "/token?t=" + t.sym,
    barBg: `linear-gradient(90deg, ${t.g[0]}, ${t.g[1]})`,
  };
}

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const TF_VOL: Record<string, number> = { "1m": 0.012, "5m": 0.02, "15m": 0.03, "1h": 0.045, "4h": 0.07, "24h": 0.11 };

/** Deterministic OHLC candles for a token/timeframe, ending at `endPrice`. */
export function candles(sym: string, tf: string, n: number, endPrice: number): Candle[] {
  const r = rng(hash(sym + tf));
  const vol = TF_VOL[tf] ?? 0.03;
  const out: Candle[] = [];
  let p = endPrice * (0.45 + r() * 0.3);
  const drift = Math.log(endPrice / p) / n;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = o * Math.exp(drift + (r() - 0.5) * vol * 2);
    const h = Math.max(o, c) * (1 + r() * vol * 0.7);
    const l = Math.min(o, c) * (1 - r() * vol * 0.7);
    out.push({ o, h, l, c, v: 200 + r() * 2400 * (1 + (Math.abs(c - o) / o) * 30) });
    p = c;
  }
  const k = endPrice / out[n - 1]!.c;
  out.forEach((x) => {
    x.o *= k;
    x.h *= k;
    x.l *= k;
    x.c *= k;
  });
  return out;
}

function walletShort(r: () => number): string {
  return "0x0" + Math.floor(r() * 0xfff).toString(16).padStart(3, "0") + "…" + Math.floor(r() * 0xffff).toString(16).padStart(4, "0");
}

export interface Trade {
  buy: boolean;
  strk: number;
  wallet: string;
  t: number;
}

/** Deterministic recent trades for a token. */
export function trades(sym: string, n: number): Trade[] {
  const r = rng(hash(sym + "tr"));
  const out: Trade[] = [];
  let t = 4;
  for (let i = 0; i < n; i++) {
    const buy = r() > 0.38;
    const strk = +(r() < 0.2 ? 1 + r() * 9 : 0.02 + r() * 0.9).toFixed(3);
    out.push({ buy, strk, wallet: walletShort(r), t });
    t += Math.floor(2 + r() * 40);
  }
  return out;
}

export interface Holder {
  label: string;
  pct: number;
  creator?: boolean;
}

/** Deterministic holder distribution: curve contract, creator, then top wallets. */
export function holders(sym: string): Holder[] {
  const r = rng(hash(sym + "h"));
  const list: Holder[] = [
    { label: "Bonding curve", pct: 0 },
    { label: "Creator", pct: +(2 + r() * 3).toFixed(1), creator: true },
  ];
  let rest = 100 - list[1]!.pct;
  for (let i = 0; i < 8; i++) {
    const p = +(rest * (0.04 + r() * 0.1)).toFixed(1);
    list.push({ label: walletShort(r), pct: p });
    rest -= p;
  }
  list[0]!.pct = +(rest * 0.7).toFixed(1);
  return list;
}

export interface ActivityItem {
  kind: "Buy" | "Sell" | "Launch";
  sym: string;
  strk: number;
  wallet: string;
  t: number;
  status: "pending" | "confirmed";
}

/** Deterministic recent account activity across the platform. */
export function activity(n: number, seed: number): ActivityItem[] {
  const r = rng(seed || 11);
  const kinds: ActivityItem["kind"][] = ["Buy", "Buy", "Buy", "Sell", "Sell", "Launch"];
  const out: ActivityItem[] = [];
  let t = 3;
  for (let i = 0; i < n; i++) {
    const tk = TOKENS[Math.floor(r() * TOKENS.length)]!;
    const k = kinds[Math.floor(r() * kinds.length)]!;
    out.push({
      kind: k,
      sym: tk.sym,
      strk: k === "Launch" ? 0 : +(0.05 + r() * (r() < 0.15 ? 40 : 3)).toFixed(3),
      wallet: walletShort(r),
      t,
      status: i === 0 ? "pending" : "confirmed",
    });
    t += Math.floor(4 + r() * 50);
  }
  return out;
}

export function ago(sec: number): string {
  return sec < 60 ? sec + "s ago" : sec < 3600 ? Math.floor(sec / 60) + "m ago" : Math.floor(sec / 3600) + "h ago";
}

export function bySym(s: string): number {
  const i = TOKENS.findIndex((t) => t.sym === s);
  return i < 0 ? 0 : i;
}

/** Reads a ?t=SYM token symbol from the URL hash or query (client-only). */
export function urlSym(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = (
      new URLSearchParams(window.location.hash.slice(1)).get("t") ||
      new URLSearchParams(window.location.search).get("t") ||
      ""
    ).toUpperCase();
    return TOKENS.some((t) => t.sym === v) ? v : null;
  } catch {
    return null;
  }
}
