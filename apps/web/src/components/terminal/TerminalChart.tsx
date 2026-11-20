"use client";

import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { fmtSmall as fmtP } from "@/lib/format";

/** One drawn candle: open, high, low, close prices and traded volume, as display numbers. */
export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  /** Start of the candle, unix seconds. Used for the time labels. */
  t?: number;
}

interface TerminalChartProps {
  candles: Candle[];
  type: "candle" | "line";
  hover: number | null;
  setHover: (i: number | null) => void;
  height: number;
  /** Seconds per candle, so the time labels show the right amount of detail. */
  intervalSeconds?: number;
}

/** The chart always has room for at least this many candles, so a young token grows left to right
 * instead of one or two candles being stretched across the whole width. */
const MIN_SLOTS = 48;

function timeLabel(t: number, intervalSeconds: number): string {
  const d = new Date(t * 1000);
  if (intervalSeconds >= 86_400) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  if (intervalSeconds >= 14_400) return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Candlestick / line price chart with volume bars, last-price tag, time labels and hover crosshair. */
export function TerminalChart({ candles: c, type, hover, setHover, height: H, intervalSeconds = 900 }: TerminalChartProps) {
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

  if (c.length === 0) {
    return (
      <div ref={wrapRef} style={{ height: H, display: "grid", placeItems: "center", color: "#696969", fontSize: 13 }}>
        No trades yet. The chart starts with the first one.
      </div>
    );
  }

  const W = cw;
  const padR = 78;
  const volH = 56;
  const timeH = 18;
  const top = 10;
  const plotW = Math.max(100, W - padR);
  const plotH = H - volH - top - timeH - 8;

  let hi = Math.max(...c.map((x) => x.h));
  let lo = Math.min(...c.map((x) => x.l));
  // A price that has not moved must sit in the middle of the chart, not stuck against the top edge.
  const flat = hi - lo < Math.abs(hi) * 0.001;
  const padv = flat ? Math.abs(hi) * 0.05 || 1 : (hi - lo) * 0.1;
  hi += padv;
  lo -= padv;
  const span = hi - lo || 1;
  const y = (p: number) => top + ((hi - p) / span) * plotH;

  const slots = Math.max(c.length, MIN_SLOTS);
  const step = plotW / slots;
  const vmax = Math.max(...c.map((x) => x.v), 1e-18);
  const last = c[c.length - 1]!;
  const ly = y(last.c);
  const x = (i: number) => i * step + step / 2;

  const linePts = c.map((k, i) => `${x(i).toFixed(1)},${y(k.c).toFixed(1)}`);
  const lineUp = last.c >= c[0]!.o;
  const lineCol = lineUp ? "#55D69A" : "#FF6868";
  const baseY = top + plotH;

  const move = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left) / step);
    setHover(i >= 0 && i < c.length ? i : null);
  };

  // Time labels, but never two on top of each other: a young token has only a few candles close together.
  const wanted = c.length > 1 ? [0, Math.floor((c.length - 1) / 2), c.length - 1] : [0];
  const labelIdx: number[] = [];
  for (const i of wanted) {
    const prev = labelIdx[labelIdx.length - 1];
    if (prev === undefined || x(i) - x(prev) >= 84) labelIdx.push(i);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", minWidth: 0, height: H, overflow: "hidden" }}>
      <svg width={W} height={H} style={{ display: "block", cursor: "crosshair" }} onMouseMove={move} onMouseLeave={() => setHover(null)}>
        {/* gridlines + price axis */}
        {[0, 1, 2, 3, 4].map((g) => {
          const p = lo + (hi - lo) * (g / 4);
          const yy = y(p);
          return (
            <g key={"g" + g}>
              <line x1={0} x2={plotW} y1={yy} y2={yy} stroke="rgba(255,255,255,0.05)" />
              <text x={plotW + 10} y={yy + 4} fill="#696969" fontSize={11} fontFamily="var(--font-geist-mono), monospace">{fmtP(p)}</text>
            </g>
          );
        })}

        {/* where the chart has not happened yet */}
        {c.length < slots && <rect x={c.length * step} y={top} width={plotW - c.length * step} height={plotH} fill="rgba(255,255,255,0.015)" />}

        {/* volume bars + candles */}
        {c.map((k, i) => {
          const up = k.c >= k.o;
          const col = up ? "#55D69A" : "#FF6868";
          const cx = x(i);
          const vh = (k.v / vmax) * volH;
          const bw = Math.max(2, Math.min(step * 0.7, 18));
          return (
            <g key={"c" + i}>
              <rect x={cx - bw / 2} y={baseY + volH - vh} width={bw} height={vh} fill={up ? "rgba(85,214,154,0.22)" : "rgba(255,104,104,0.22)"} rx={1.5} />
              {type === "candle" && (
                <>
                  <line x1={cx} x2={cx} y1={y(k.h)} y2={y(k.l)} stroke={col} strokeWidth={1} />
                  <rect x={cx - bw * 0.46} y={y(Math.max(k.o, k.c))} width={bw * 0.92} height={Math.max(1.5, Math.abs(y(k.o) - y(k.c)))} fill={col} rx={1.5} />
                </>
              )}
            </g>
          );
        })}

        {/* line mode: the price path so far, with the area under it */}
        {type === "line" && (
          <>
            <defs>
              <linearGradient id={lg} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={lineCol} stopOpacity={0.25} />
                <stop offset="1" stopColor={lineCol} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={`M${x(0).toFixed(1)},${baseY} L${linePts.join(" L")} L${x(c.length - 1).toFixed(1)},${baseY} Z`} fill={`url(#${lg})`} />
            <polyline points={linePts.join(" ")} fill="none" stroke={lineCol} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(c.length - 1)} cy={ly} r={4} fill={lineCol} />
          </>
        )}

        {/* last price */}
        <line x1={x(c.length - 1)} x2={plotW} y1={ly} y2={ly} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 4" />
        <rect x={plotW + 4} y={ly - 10} width={padR - 6} height={20} rx={6} fill="#fff" />
        <text x={plotW + 10} y={ly + 4} fill="#050505" fontSize={11} fontWeight={600} fontFamily="var(--font-geist-mono), monospace">{fmtP(last.c)}</text>

        {/* time axis */}
        {labelIdx.map((i, n) => {
          const t = c[i]?.t;
          if (!t) return null;
          return (
            <text key={"t" + n} x={Math.min(Math.max(x(i), 24), plotW - 24)} y={H - 4} fill="#696969" fontSize={11} textAnchor="middle" fontFamily="var(--font-geist-mono), monospace">
              {timeLabel(t, intervalSeconds)}
            </text>
          );
        })}

        {/* hover crosshair */}
        {hover != null && c[hover] && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={0} y2={H - timeH} stroke="rgba(255,255,255,0.35)" strokeDasharray="2 3" />
            <line x1={0} x2={plotW} y1={y(c[hover]!.c)} y2={y(c[hover]!.c)} stroke="rgba(255,255,255,0.35)" strokeDasharray="2 3" />
            <circle cx={x(hover)} cy={y(c[hover]!.c)} r={3.5} fill="#fff" />
          </>
        )}
      </svg>
    </div>
  );
}
