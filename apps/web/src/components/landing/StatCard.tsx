"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

export interface Stat {
  label: string;
  value: string;
  num: number;
  suffix: string;
  dec: number;
  delta: string;
  color: string;
  fill: string;
  line: string;
  area: string;
}

export function StatCard({ stat, index }: { stat: Stat; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.12, margin: "0px 0px -6% 0px" });
  const [display, setDisplay] = useState(stat.value);

  const fmt = (v: number) =>
    v.toLocaleString("en-US", { minimumFractionDigits: stat.dec, maximumFractionDigits: stat.dec }) + stat.suffix;

  useEffect(() => {
    if (!inView || reduce) return;
    const delay = Math.min(index, 6) * 90;
    const dur = 1700;
    let raf = 0;
    const t0 = performance.now() + delay;
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - t0) / dur));
      const e = 1 - Math.pow(1 - p, 4);
      setDisplay(p >= 1 ? stat.value : fmt(stat.num * e));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    setDisplay(fmt(0));
    raf = requestAnimationFrame(step);
    const settle = window.setTimeout(() => setDisplay(stat.value), delay + dur + 400);

    const path = pathRef.current;
    let anim: Animation | undefined;
    if (path) {
      const L = path.getTotalLength ? path.getTotalLength() : 300;
      anim = path.animate(
        [
          { strokeDasharray: L, strokeDashoffset: L },
          { strokeDasharray: L, strokeDashoffset: 0 },
        ],
        { duration: 1600, delay: delay + 200, easing: "cubic-bezier(.4,0,.2,1)", fill: "backwards" }
      );
    }
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      anim?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce]);

  return (
    <div
      ref={ref}
      className="lp-stat"
      style={{
        position: "relative",
        borderRadius: 24,
        background: "#0b0b0b",
        border: "1px solid rgba(255,255,255,0.09)",
        padding: "22px 22px 0",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8a8a8a" }}>{stat.label}</span>
        <span
          style={{
            padding: "3px 8px",
            borderRadius: 999,
            background: "rgba(85,214,154,0.12)",
            color: "#55D69A",
            fontFamily: "var(--font-geist-mono),monospace",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {stat.delta}
        </span>
      </div>
      <span
        style={{
          fontFamily: "var(--font-geist-mono),monospace",
          fontSize: "clamp(26px,2.6vw,36px)",
          fontWeight: 500,
          letterSpacing: "-0.03em",
        }}
      >
        {display}
      </span>
      <svg viewBox="0 0 200 56" preserveAspectRatio="none" style={{ display: "block", width: "calc(100% + 44px)", height: 56, margin: "0 -22px" }}>
        <path d={stat.area} fill={stat.fill} />
        <path ref={pathRef} d={stat.line} fill="none" stroke={stat.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
