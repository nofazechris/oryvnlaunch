// Pure helpers for the decorative parts of the design: a seeded random generator, a string hash, the
// flowing contour backgrounds and sparklines. Nothing here is data. It is artwork, kept apart from
// anything that describes a market.

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

/** Deterministic decorative sparkline (line + filled area) path pair. Illustration only, not a price history. */
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

/** Card palettes: [primary, light, ink]. A token's colours come from its address, so they never change. */
export const PALETTES: [string, string, string][] = [
  ["#73D9E8", "#B7F0F5", "#062A30"],
  ["#FF9865", "#FFD2A8", "#3A1404"],
  ["#568BFF", "#F38FC4", "#140A2E"],
  ["#C7EA83", "#EAF7C9", "#1C2A06"],
  ["#B69AFF", "#E6DCFF", "#1E1240"],
  ["#F38FC4", "#FFD9EC", "#3A0A24"],
  ["#FF7777", "#FFC2B0", "#3A0A0A"],
];

export function paletteFor(seed: string): [string, string, string] {
  return PALETTES[hash(seed) % PALETTES.length] as [string, string, string];
}
