import { useId } from "react";
import type { Candle } from "@/lib/oryvn-data";

/** Area + line price chart, deterministic from candle closes (ported from Token.dc.html's area()). */
export function AreaChart({ candles, height, showAxis = false }: { candles: Candle[]; height: number; showAxis?: boolean }) {
  const gid = useId();
  const W = 600;
  const closes = candles.map((x) => x.c);
  let hi = Math.max(...closes);
  let lo = Math.min(...closes);
  const pad = (hi - lo) * 0.1;
  hi += pad;
  lo -= pad;
  const span = hi - lo || 1;
  const pts = candles.map((k, i) => [(i / (candles.length - 1)) * W, ((hi - k.c) / span) * (height - 10) + 5] as const);
  const up = candles[candles.length - 1]!.c >= candles[0]!.c;
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
