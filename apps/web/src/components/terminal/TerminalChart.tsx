"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { fmtP, type Candle } from "@/lib/oryvn-data";

interface TerminalChartProps {
  candles: Candle[];
  type: "candle" | "line";
  hover: number | null;
  setHover: (i: number | null) => void;
  height: number;
}

/** Candlestick / line price chart with volume bars, last-price tag and hover crosshair. */
export function TerminalChart({ candles: c, type, hover, setHover, height: H }: TerminalChartProps) {
  const lg = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(700);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const next = Math.round(el.clientWidth);
      if (next) setCw(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = cw;
  const padR = 78;
  const volH = 56;
  const top = 10;
  const plotW = Math.max(100, W - padR);
  const plotH = H - volH - top - 18;
  let hi = Math.max(...c.map((x) => x.h));
  let lo = Math.min(...c.map((x) => x.l));
  const padv = (hi - lo) * 0.08;
  hi += padv;
  lo -= padv;
  const span = hi - lo || 1;
  const y = (p: number) => top + ((hi - p) / span) * plotH;
  const step = plotW / c.length;
  const vmax = Math.max(...c.map((x) => x.v));
  const last = c[c.length - 1]!;
  const ly = y(last.c);

  const linePts = c.map((k, i) => `${(i * step + step / 2).toFixed(1)},${y(k.c).toFixed(1)}`);
  const lineUp = last.c >= c[0]!.o;
  const lineCol = lineUp ? "#55D69A" : "#FF6868";

  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left) / step);
    setHover(i >= 0 && i < c.length ? i : null);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: H }}>
      <svg width={W} height={H} style={{ display: "block", cursor: "crosshair" }} onMouseMove={move} onMouseLeave={() => setHover(null)}>
        {/* gridlines + axis labels */}
        {[0, 1, 2, 3, 4].map((g) => {
          const p = lo + (hi - lo) * (g / 4);
          const yy = y(p);
          return (
            <g key={"g" + g}>
              <line x1={0} x2={plotW} y1={yy} y2={yy} stroke="rgba(255,255,255,0.05)" />
              <text x={plotW + 10} y={yy + 4} fill="#696969" fontSize={10.5} fontFamily="var(--font-geist-mono), monospace">{fmtP(p)}</text>
            </g>
          );
        })}

        {/* volume bars + candles */}
        {c.map((k, i) => {
          const up = k.c >= k.o;
          const col = up ? "#55D69A" : "#FF6868";
          const x = i * step + step / 2;
          const vh = (k.v / vmax) * volH;
          return (
            <g key={"c" + i}>
              <rect x={x - step * 0.35} y={H - 18 - vh} width={step * 0.7} height={vh} fill={up ? "rgba(85,214,154,0.22)" : "rgba(255,104,104,0.22)"} rx={1.5} />
              {type === "candle" && (
                <>
                  <line x1={x} x2={x} y1={y(k.h)} y2={y(k.l)} stroke={col} strokeWidth={1} />
                  <rect x={x - step * 0.32} y={y(Math.max(k.o, k.c))} width={step * 0.64} height={Math.max(1, Math.abs(y(k.o) - y(k.c)))} fill={col} rx={1.5} />
                </>
              )}
            </g>
          );
        })}

        {/* line mode */}
        {type === "line" && (
          <>
            <defs>
              <linearGradient id={lg} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={lineCol} stopOpacity={0.25} />
                <stop offset="1" stopColor={lineCol} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={`M${linePts[0]} L${linePts.join(" L")} L${(plotW - step / 2).toFixed(1)},${H - volH - 18} L${(step / 2).toFixed(1)},${H - volH - 18} Z`} fill={`url(#${lg})`} />
            <polyline points={linePts.join(" ")} fill="none" stroke={lineCol} strokeWidth={1.8} strokeLinejoin="round" />
          </>
        )}

        {/* last price */}
        <line x1={0} x2={plotW} y1={ly} y2={ly} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 4" />
        <rect x={plotW + 4} y={ly - 10} width={padR - 6} height={20} rx={6} fill="#fff" />
        <text x={plotW + 10} y={ly + 4} fill="#050505" fontSize={10.5} fontWeight={600} fontFamily="var(--font-geist-mono), monospace">{fmtP(last.c)}</text>

        {/* hover crosshair */}
        {hover != null && c[hover] && (
          <>
            <line x1={hover * step + step / 2} x2={hover * step + step / 2} y1={0} y2={H - 18} stroke="rgba(255,255,255,0.35)" strokeDasharray="2 3" />
            <line x1={0} x2={plotW} y1={y(c[hover]!.c)} y2={y(c[hover]!.c)} stroke="rgba(255,255,255,0.35)" strokeDasharray="2 3" />
            <circle cx={hover * step + step / 2} cy={y(c[hover]!.c)} r={3.5} fill="#fff" />
          </>
        )}
      </svg>
    </div>
  );
}
