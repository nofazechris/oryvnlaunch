import { useId } from "react";

/** Area + line price chart drawn from a series of prices (oldest first). Display only. */
export function AreaChart({ values, height, showAxis = false }: { values: number[]; height: number; showAxis?: boolean }) {
  const gid = useId();
  const W = 600;

  if (values.length < 2) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#696969", fontSize: 13, textAlign: "center" }}>
        {values.length === 0 ? "No trades yet. The chart starts with the first one." : "Waiting for a second price to draw a line."}
      </div>
    );
  }

  let hi = Math.max(...values);
  let lo = Math.min(...values);
  // A price that has not moved sits in the middle, not against the top edge.
  const flat = hi - lo < Math.abs(hi) * 0.001;
  const pad = flat ? Math.abs(hi) * 0.05 || 1 : (hi - lo) * 0.1;
  hi += pad;
  lo -= pad;
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, ((hi - v) / span) * (height - 10) + 5] as const);
  const up = values[values.length - 1]! >= values[0]!;
  const col = up ? "#55D69A" : "#FF6868";
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={col} stopOpacity={0.28} />
          <stop offset="1" stopColor={col} stopOpacity={0} />
        </linearGradient>
      </defs>
      {showAxis &&
        [0, 1, 2, 3].map((g) => (
          <line key={g} x1={0} x2={W} y1={(height * g) / 3} y2={(height * g) / 3} stroke="rgba(255,255,255,0.05)" vectorEffect="non-scaling-stroke" />
        ))}
      <path d={`${d} L${W},${height} L0,${height} Z`} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={col} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
