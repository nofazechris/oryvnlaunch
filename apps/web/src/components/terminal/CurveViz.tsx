import { useId } from "react";
import type { Token } from "@/lib/oryvn-data";

/** Bonding-curve supply→price visualization with the current fill marker. */
export function CurveViz({ token }: { token: Token }) {
  const cg = useId();
  const W = 300;
  const H = 200;
  const f = token.bond / 100;
  const px = (u: number) => 20 + u * (W - 40);
  const py = (u: number) => H - 24 - u * u * (H - 50);

  let d = "";
  let fill = `M${px(0)},${H - 24}`;
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    d += (i ? " L" : "M") + px(u).toFixed(1) + "," + py(u).toFixed(1);
    if (u <= f) fill += ` L${px(u).toFixed(1)},${py(u).toFixed(1)}`;
  }
  fill += ` L${px(f).toFixed(1)},${py(f).toFixed(1)} L${px(f).toFixed(1)},${H - 24} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id={cg} x1="0" x2="1">
          <stop offset="0" stopColor={token.g[0]} stopOpacity={0.05} />
          <stop offset="1" stopColor={token.g[0]} stopOpacity={0.5} />
        </linearGradient>
      </defs>
      <line x1={20} x2={W - 20} y1={H - 24} y2={H - 24} stroke="rgba(255,255,255,0.1)" />
      <path d={fill} fill={`url(#${cg})`} />
      <path d={d} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="3 4" />
      <circle cx={px(f)} cy={py(f)} r={12} fill={token.g[0]} opacity={0.25} />
      <circle cx={px(f)} cy={py(f)} r={5} fill={token.g[0]} />
      <text x={20} y={H - 6} fill="#696969" fontSize={10} fontFamily="var(--font-geist-sans), sans-serif">Supply sold →</text>
      <text x={W - 20} y={18} fill="#696969" fontSize={10} textAnchor="end" fontFamily="var(--font-geist-sans), sans-serif">Graduation</text>
    </svg>
  );
}
