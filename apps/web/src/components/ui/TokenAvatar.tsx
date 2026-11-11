import { hash, rng } from "@/lib/oryvn-data";

/**
 * Generated token avatar: a symmetric 5x5 pixel pattern seeded by the ticker, drawn in
 * the token's ink colour over its gradient. Stands in for token artwork until creators
 * upload an image, and is far more distinctive than a text label.
 */
export function TokenAvatar({ sym, bg, ink, size = 44, radius }: { sym: string; bg: string; ink: string; size?: number; radius?: number }) {
  const r = rng(hash(sym));
  const cells: [number, number][] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (r() > 0.46) {
        cells.push([x, y]);
        if (x < 2) cells.push([4 - x, y]);
      }
    }
  }
  if (cells.length < 8) cells.push([2, 1], [2, 2], [2, 3], [1, 2], [3, 2]); // never render a near-empty avatar

  return (
    <span style={{ width: size, height: size, flexShrink: 0, borderRadius: radius ?? size * 0.3, background: bg, display: "grid", placeItems: "center", overflow: "hidden", position: "relative" }}>
      <span style={{ position: "absolute", left: "-25%", top: "-35%", width: "95%", height: "75%", borderRadius: "50%", background: "radial-gradient(closest-side, rgba(255,255,255,0.4), rgba(255,255,255,0))" }} />
      <svg viewBox="-1 -1 7 7" width={size * 0.72} height={size * 0.72} aria-hidden="true" style={{ position: "relative" }}>
        {cells.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={0.9} height={0.9} rx={0.22} fill={ink} opacity={0.86} />
        ))}
      </svg>
    </span>
  );
}
