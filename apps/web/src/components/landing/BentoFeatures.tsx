"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useViewportWidth } from "@/lib/hooks";
import { useTypewriter } from "@/lib/useTypewriter";
import { Icon, IconTile, type IconName } from "@/components/ui/Icons";
import { Reveal } from "./Reveal";

const mono = "var(--font-geist-mono),monospace";

/* ---------- visuals (each animates only while its tile is on screen) ---------- */

function AIChatVisual({ play }: { play: boolean }) {
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (!play) return;
    const iv = setInterval(() => setCycle((c) => c + 1), 10000);
    return () => clearInterval(iv);
  }, [play]);
  return <ChatCycle key={cycle} play={play} />;
}

function ChatCycle({ play }: { play: boolean }) {
  const msg = useTypewriter("A community token for Starknet builders.", 400, 32, play);
  const ideas = ["Cairo Builders · $CAIRO", "Proof Club · $PROOF", "Shipwright · $SHIP"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ alignSelf: "flex-end", maxWidth: "88%", minHeight: 38, padding: "10px 14px", borderRadius: "16px 16px 4px 16px", background: "#1c1c1c", fontSize: 13, color: "#e4e4e4" }}>
        {msg}
        <span style={{ display: play && msg.length < 39 ? "inline-block" : "none", width: 1.5, height: 13, background: "#B69AFF", marginLeft: 2, verticalAlign: "middle", animation: "oc-blink 1s infinite" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: "16px 16px 16px 4px", background: "rgba(182,154,255,0.09)", border: "1px solid rgba(182,154,255,0.22)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#d9ccff" }}>
          <span style={{ width: 16, height: 16, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />Three directions
        </span>
        {ideas.map((t, i) => (
          <motion.div key={t} initial={play ? { opacity: 0, x: -10 } : false} animate={{ opacity: 1, x: 0 }} transition={{ delay: play ? 2 + i * 0.28 : 0, duration: 0.35 }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, background: "#141414", border: "1px solid rgba(255,255,255,0.07)", fontSize: 13 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: ["#73D9E8", "#B69AFF", "#FF9865"][i] }} />{t}
          </motion.div>
        ))}
      </div>
      <motion.div initial={play ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} transition={{ delay: play ? 3.1 : 0, duration: 0.4 }} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "#0b0b0b", border: "1px dashed rgba(255,255,255,0.14)" }}>
        <span style={{ fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>Description draft</span>
        <span style={{ fontSize: 13, lineHeight: 1.55, color: "#d0d0d0" }}>A community token for people building on Starknet. A shared badge for builders, hackers and everyone who shows up to help.</span>
        <span style={{ display: "flex", gap: 8 }}>
          <span style={{ padding: "5px 11px", borderRadius: 999, background: "#1d1d1d", fontSize: 12 }}>Use description</span>
          <span style={{ padding: "5px 11px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", fontSize: 12, color: "#A1A1A1" }}>Edit first</span>
        </span>
      </motion.div>
    </div>
  );
}

function IntelVisual({ play }: { play: boolean }) {
  const rows: [string, string, "ok" | "warn"][] = [
    ["Mint function", "None", "ok"],
    ["Ownership", "Renounced", "ok"],
    ["Upgradable", "No", "ok"],
    ["Top 10 holders", "48.2%", "warn"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {rows.map(([k, v, st], i) => (
        <motion.div key={k} initial={play ? { opacity: 0, y: 8 } : false} animate={play ? { opacity: 1, y: 0 } : { opacity: 0.5 }} transition={{ delay: i * 0.18, duration: 0.35 }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 12, background: "#101010", border: "1px solid rgba(255,255,255,0.06)", fontSize: 13 }}>
          <span style={{ width: 18, height: 18, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0, background: st === "ok" ? "#55D69A" : "#F3B65F", color: "#050505", fontSize: 11, fontWeight: 700 }}>{st === "ok" ? "✓" : "!"}</span>
          <span style={{ color: "#A1A1A1" }}>{k}</span>
          <span style={{ marginLeft: "auto", fontFamily: mono, color: st === "ok" ? "#e4e4e4" : "#F3B65F" }}>{v}</span>
        </motion.div>
      ))}
      <span style={{ fontSize: 11, color: "#696969", paddingTop: 2 }}>Evidence and timestamp on every line. Not an audit.</span>
    </div>
  );
}

function ResearchVisual({ play }: { play: boolean }) {
  const a = useTypewriter("Buys outweigh sells over the last 30 trades: 31.4 STRK in, 20.9 STRK out.", 900, 20, play);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <span style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 999, background: "#1a1a1a", fontSize: 13, color: "#e4e4e4" }}>
        <Icon name="search" size={14} color="#C7EA83" />Summarise recent trades
      </span>
      <div style={{ padding: 12, borderRadius: 14, background: "#101010", border: "1px solid rgba(255,255,255,0.07)", minHeight: 66, fontSize: 13, lineHeight: 1.55, color: "#d8d8d8" }}>{a}</div>
      <motion.div initial={play ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: play ? 3 : 0 }} style={{ display: "flex", gap: 6 }}>
        {["Trades · last 30", "Bonding state"].map((s) => (
          <span key={s} style={{ padding: "3px 9px", borderRadius: 999, background: "#161616", border: "1px solid rgba(255,255,255,0.07)", fontSize: 11, color: "#A1A1A1" }}>{s}</span>
        ))}
      </motion.div>
    </div>
  );
}

function CustodyVisual({ play }: { play: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14, background: "#101010", border: "1px solid rgba(255,255,255,0.07)" }}>
      <span style={{ position: "relative", width: 34, height: 34, flexShrink: 0 }}>
        {play && <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#FF9865", opacity: 0.4, animation: "oc-ping 2s ease-out infinite" }} />}
        <span style={{ position: "relative", width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", background: "linear-gradient(135deg,#FF9865,#FFD2A8)", color: "#3A1404" }}>
          <Icon name="lock" size={16} />
        </span>
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>You approve</span>
        <span style={{ fontSize: 11, color: "#8a8a8a" }}>Every action, in your wallet</span>
      </span>
    </div>
  );
}

function ActivityVisual({ play }: { play: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {[0, 1, 2].map((i) => (
        <motion.div key={i} animate={play && !reduce ? { opacity: [0.35, 1, 0.35] } : { opacity: 0.6 }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.35 }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 11, background: "#101010", border: "1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ width: 22, height: 22, borderRadius: 7, border: "1px dashed rgba(255,255,255,0.2)" }} />
          <span style={{ height: 7, width: `${58 - i * 12}%`, borderRadius: 4, background: "rgba(255,255,255,0.09)" }} />
          <span style={{ marginLeft: "auto", width: 34, height: 14, borderRadius: 999, background: ["rgba(115,217,232,0.25)", "rgba(85,214,154,0.25)", "rgba(255,104,104,0.25)"][i] }} />
        </motion.div>
      ))}
    </div>
  );
}

function CurveVisual({ play }: { play: boolean }) {
  const reduce = useReducedMotion();
  const W = 320;
  const H = 110;
  const y = (u: number) => H - 8 - u * u * (H - 24);
  let d = "";
  for (let i = 0; i <= 30; i++) d += (i ? " L" : "M") + ((i / 30) * W).toFixed(1) + "," + y(i / 30).toFixed(1);
  const us = [0.05, 0.25, 0.45, 0.62, 0.75];
  const loop = play && !reduce;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 110 }}>
      <motion.path d={`${d} L${W},${H} L0,${H} Z`} fill="rgba(243,143,196,0.09)" />
      <motion.path d={d} fill="none" stroke="#F38FC4" strokeWidth={2.5} strokeLinecap="round" initial={loop ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={loop ? { duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 2 } : { duration: 0 }} />
      <motion.circle r={6} fill="#F38FC4" animate={{ cx: us.map((u) => u * W), cy: us.map(y) }} transition={loop ? { duration: 1.6, ease: "easeInOut", repeat: Infinity, repeatDelay: 2 } : { duration: 0 }} initial={{ cx: us[4]! * W, cy: y(us[4]!) }} />
    </svg>
  );
}

/* ---------- tiles ---------- */

interface Tile {
  key: string;
  col: number;
  row: number;
  icon: IconName;
  from: string;
  to: string;
  title: string;
  body: string;
  visual: (play: boolean) => ReactNode;
}

const TILES: Tile[] = [
  { key: "ai", col: 2, row: 2, icon: "sparkles", from: "#B69AFF", to: "#F38FC4", title: "AI Launch Studio", body: "Describe an idea and get names, tickers and a first description. AI explains every launch setting in plain words, and never changes them or signs anything itself.", visual: (p) => <AIChatVisual play={p} /> },
  { key: "intel", col: 2, row: 1, icon: "shield", from: "#73D9E8", to: "#568BFF", title: "Contract intelligence", body: "Mint rights, ownership, upgradability and holder concentration. Each with evidence. Never a safety score.", visual: (p) => <IntelVisual play={p} /> },
  { key: "research", col: 2, row: 1, icon: "search", from: "#C7EA83", to: "#55D69A", title: "AI token research", body: "Ask anything about a token. Answered only from indexed on-chain data, with sources and no price predictions.", visual: (p) => <ResearchVisual play={p} /> },
  { key: "custody", col: 1, row: 1, icon: "key", from: "#FF9865", to: "#FF5E3A", title: "Non-custodial", body: "Your keys, always. We never hold funds.", visual: (p) => <CustodyVisual play={p} /> },
  { key: "live", col: 1, row: 1, icon: "pulse", from: "#55D69A", to: "#73D9E8", title: "Live activity", body: "Every launch and trade, as it lands.", visual: (p) => <ActivityVisual play={p} /> },
  { key: "curve", col: 2, row: 1, icon: "curve", from: "#F38FC4", to: "#B69AFF", title: "Bonding-curve launches", body: "Deterministic, on-chain pricing. Buy and sell from the moment it launches, straight on the curve.", visual: (p) => <CurveVisual play={p} /> },
];

function FeatureTile({ t, index, wide }: { t: Tile; index: number; wide: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.3 });
  const reduce = !!useReducedMotion();
  const play = inView && !reduce;
  const span: CSSProperties = wide ? { gridColumn: `span ${t.col}`, gridRow: `span ${t.row}` } : {};
  const big = t.row === 2;

  const move = (e: MouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <Reveal index={index} style={{ ...span, display: "flex" }}>
      <div
        ref={ref}
        onMouseMove={move}
        className="lp-bento"
        style={{ position: "relative", flex: 1, overflow: "hidden", borderRadius: 26, border: "1px solid rgba(255,255,255,0.08)", background: `radial-gradient(380px circle at var(--mx, 85%) var(--my, 0%), ${t.from}1c, transparent 60%), #0b0b0b`, padding: big ? 28 : 22, display: "flex", flexDirection: "column", gap: 18 }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <IconTile name={t.icon} from={t.from} to={t.to} size={big ? 52 : 46} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: big ? 24 : 19, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{t.title}</span>
            <span style={{ color: "#A1A1A1", fontSize: 14, lineHeight: 1.55 }}>{t.body}</span>
          </div>
        </div>
        <div style={{ marginTop: "auto" }}>{t.visual(play)}</div>
      </div>
    </Reveal>
  );
}

export function BentoFeatures() {
  const w = useViewportWidth();
  const wide = w >= 900;

  return (
    <section id="features" data-screen-label="Features" style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(72px,9vw,140px) clamp(18px,5vw,72px) 0", scrollMarginTop: 24 }}>
      <Reveal style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 36 }}>
        <h2 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(40px,5vw,64px)", letterSpacing: "-0.04em", lineHeight: 1 }}>Everything to launch smarter.</h2>
        <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, maxWidth: 520, lineHeight: 1.6 }}>One place to create a token, launch it on a bonding curve and check what you&apos;re buying.</p>
      </Reveal>

      <div style={{ display: "grid", gridTemplateColumns: wide ? "repeat(4,1fr)" : "1fr", gridAutoRows: wide ? "minmax(200px,auto)" : "auto", gridAutoFlow: wide ? "dense" : "row", gap: 14 }}>
        {TILES.map((t, i) => (
          <FeatureTile key={t.key} t={t} index={i} wide={wide} />
        ))}
      </div>
    </section>
  );
}
