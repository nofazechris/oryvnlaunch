"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { Icon, IconTile, type IconName } from "@/components/ui/Icons";
import { useTypewriter } from "@/lib/useTypewriter";
import { Reveal } from "./Reveal";

const DURATION = 7000; // ms each step stays active before auto-advancing
const mono = "var(--font-geist-mono),monospace";

interface Step {
  key: string;
  icon: IconName;
  from: string;
  to: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  { key: "create", icon: "sparkles", from: "#73D9E8", to: "#568BFF", title: "Create with AI", body: "Describe your idea. AI drafts names, tickers and a description, and you edit everything before it goes anywhere." },
  { key: "guard", icon: "shield", from: "#B69AFF", to: "#F38FC4", title: "Pass Launch Guard", body: "Every launch runs against a tested template first. Supply, allocation and curve settings are validated before you can deploy." },
  { key: "launch", icon: "rocket", from: "#FF9865", to: "#FF5E3A", title: "Launch on Starknet", body: "Sign once in your own wallet. Your token deploys and trading opens on a bonding curve straight away." },
  { key: "trade", icon: "curve", from: "#C7EA83", to: "#55D69A", title: "Trade and research", body: "Buy and sell on the curve. Ask AI about any token and get answers with sources, never a safety score." },
];

/* ---------- small helpers ---------- */

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ borderRadius: 22, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#101010" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#FF6868" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#F3B65F" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#55D69A" }} />
        <span style={{ marginLeft: 10, fontSize: 12, color: "#8a8a8a" }}>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "#5a5a5a" }}>Preview</span>
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
    </div>
  );
}

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const label: React.CSSProperties = { fontSize: 12, color: "#8a8a8a" };
const input: React.CSSProperties = { height: 42, padding: "0 14px", borderRadius: 12, background: "#050505", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", fontSize: 14 };

/* ---------- step demos ---------- */

function CreateDemo({ anim }: { anim: boolean }) {
  const name = useTypewriter("Cairo Builders", 300, 55, anim);
  const tick = useTypewriter("CAIRO", 1250, 70, anim);
  const ideas = ["Cairo Builders · $CAIRO", "Proof Club · $PROOF", "Shipwright · $SHIP"];
  return (
    <Frame title="Launch Studio · Token details">
      <div style={field}>
        <span style={label}>Token name</span>
        <div style={input}>{name}<span style={{ width: 1.5, height: 16, background: "#73D9E8", marginLeft: 2, animation: "oc-blink 1s infinite" }} /></div>
      </div>
      <div style={field}>
        <span style={label}>Ticker</span>
        <div style={{ ...input, fontFamily: mono, letterSpacing: "0.04em" }}><span style={{ color: "#696969" }}>$</span>{tick}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "rgba(182,154,255,0.07)", border: "1px solid rgba(182,154,255,0.2)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#d9ccff" }}>
          <span style={{ width: 16, height: 16, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />AI ideas
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ideas.map((t, i) => (
            <motion.span key={t} initial={anim ? { opacity: 0, y: 8, scale: 0.94 } : false} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: anim ? 1.9 + i * 0.25 : 0, duration: 0.35 }} style={{ padding: "6px 11px", borderRadius: 999, background: "#161616", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12, color: "#e4e4e4" }}>{t}</motion.span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function GuardDemo({ anim }: { anim: boolean }) {
  const checks = ["Required metadata", "Supply: 1B fixed, no mint", "Creator allocation within 5% cap", "Contract template verified", "Curve inside tested bounds", "Wallet connected"];
  const [done, setDone] = useState(anim ? 0 : checks.length);
  useEffect(() => {
    if (!anim) return;
    const iv = setInterval(() => setDone((v) => (v >= checks.length ? v : v + 1)), 480);
    return () => clearInterval(iv);
  }, [anim, checks.length]);
  const ready = done >= checks.length;
  return (
    <Frame title="Launch Guard">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15 }}><Icon name="shield" size={18} />Checks</span>
        <span style={{ padding: "4px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: ready ? "rgba(85,214,154,0.15)" : "rgba(243,182,95,0.12)", color: ready ? "#55D69A" : "#F3B65F", transition: "all .3s" }}>{ready ? "Ready" : "Checking…"}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {checks.map((c, i) => {
          const on = i < done;
          return (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 14, color: on ? "#e8e8e8" : "#5a5a5a", transition: "color .3s" }}>
              <motion.span animate={{ scale: on ? [0.6, 1.15, 1] : 1 }} transition={{ duration: 0.35 }} style={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", background: on ? "#55D69A" : "transparent", border: on ? "0" : "1px solid rgba(255,255,255,0.18)", color: "#050505", fontSize: 11, fontWeight: 700 }}>{on ? "✓" : ""}</motion.span>
              {c}
            </div>
          );
        })}
      </div>
      <motion.div animate={{ opacity: ready ? 1 : 0.35, boxShadow: ready ? "0 0 0 6px rgba(255,152,101,0.14)" : "0 0 0 0 rgba(0,0,0,0)" }} style={{ height: 46, borderRadius: 14, display: "grid", placeItems: "center", fontWeight: 600, fontSize: 14, color: "#1a0d05", background: "linear-gradient(90deg,#FF9865,#FFE3CF)" }}>Deploy token</motion.div>
    </Frame>
  );
}

function LaunchDemo({ anim }: { anim: boolean }) {
  const steps = ["Preparing deployment", "Awaiting wallet signature", "Transaction submitted", "Confirmed on Starknet"];
  const [at, setAt] = useState(anim ? 0 : steps.length);
  useEffect(() => {
    if (!anim) return;
    const iv = setInterval(() => setAt((v) => (v >= steps.length ? v : v + 1)), 900);
    return () => clearInterval(iv);
  }, [anim, steps.length]);
  const live = at >= steps.length;
  return (
    <Frame title="Deploy">
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        {steps.map((s, i) => {
          const done = i < at;
          const active = i === at;
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: done || active ? "#fff" : "#5a5a5a" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", border: done ? "0" : active ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)", background: done ? "#55D69A" : "transparent", animation: active ? "oc-blink 1.1s infinite" : "none", fontSize: 12, color: "#050505", fontWeight: 700 }}>{done ? "✓" : ""}</span>
              {s}
            </div>
          );
        })}
      </div>
      <motion.div animate={{ opacity: live ? 1 : 0.3, y: live ? 0 : 6 }} style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, background: "#050505", border: "1px solid rgba(255,255,255,0.08)" }}>
        <IconTile name="rocket" from="#FF9865" to="#FF5E3A" size={44} />
        <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontWeight: 600 }}>Your token is live</span>
          <span style={{ fontSize: 12, color: "#8a8a8a" }}>Bonding curve open. Buy and sell from block one.</span>
        </span>
      </motion.div>
    </Frame>
  );
}

function TradeDemo({ anim }: { anim: boolean }) {
  const W = 300;
  const H = 130;
  const y = (u: number) => H - 8 - u * u * (H - 26);
  let d = "";
  for (let i = 0; i <= 30; i++) d += (i ? " L" : "M") + ((i / 30) * W).toFixed(1) + "," + y(i / 30).toFixed(1);
  const us = [0.04, 0.2, 0.36, 0.52, 0.64];
  const answer = useTypewriter("The top 10 wallets hold 48.2% of supply. The creator holds 2.8%.", 1700, 22, anim);
  return (
    <Frame title="Trade and research">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 130 }}>
        <motion.path d={`${d} L${W},${H} L0,${H} Z`} fill="rgba(199,234,131,0.1)" initial={anim ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.8 }} />
        <motion.path d={d} fill="none" stroke="#C7EA83" strokeWidth={2.5} strokeLinecap="round" initial={anim ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: "easeInOut" }} />
        <motion.circle r={6} fill="#C7EA83" initial={anim ? { cx: us[0]! * W, cy: y(us[0]!) } : { cx: us[4]! * W, cy: y(us[4]!) }} animate={{ cx: us.map((u) => u * W), cy: us.map(y) }} transition={{ duration: 1.8, ease: "easeInOut" }} />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "10px 12px", borderRadius: 12, background: "#050505", border: "1px solid rgba(255,255,255,0.08)" }}>
        <span style={{ color: "#8a8a8a" }}>You pay</span><span style={{ fontFamily: mono }}>10 STRK → 10.8K tokens</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, background: "rgba(182,154,255,0.07)", border: "1px solid rgba(182,154,255,0.2)", minHeight: 92 }}>
        <span style={{ fontSize: 12, color: "#d9ccff" }}>Ask AI: is ownership concentrated?</span>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: "#e4e4e4" }}>{answer}</span>
        <motion.span initial={anim ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: anim ? 3.2 : 0 }} style={{ alignSelf: "flex-start", padding: "3px 9px", borderRadius: 999, background: "#1a1a1a", fontSize: 11, color: "#A1A1A1" }}>Source: holder snapshot</motion.span>
      </div>
    </Frame>
  );
}

function Demo({ k, anim }: { k: string; anim: boolean }) {
  if (k === "create") return <CreateDemo anim={anim} />;
  if (k === "guard") return <GuardDemo anim={anim} />;
  if (k === "launch") return <LaunchDemo anim={anim} />;
  return <TradeDemo anim={anim} />;
}

/* ---------- section ---------- */

export function HowItWorks() {
  const reduce = !!useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (reduce || !inView || hover) return;
    const tick = 60;
    const iv = setInterval(() => {
      setProgress((p) => {
        const next = p + tick / DURATION;
        if (next >= 1) {
          setActive((a) => (a + 1) % STEPS.length);
          return 0;
        }
        return next;
      });
    }, tick);
    return () => clearInterval(iv);
  }, [reduce, inView, hover]);

  const pick = (i: number) => {
    setActive(i);
    setProgress(0);
  };
  const cur = STEPS[active]!;

  return (
    <section id="how" data-screen-label="How it works" style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(72px,9vw,140px) clamp(18px,5vw,72px) 0", scrollMarginTop: 24 }}>
      <Reveal style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 40 }}>
        <h2 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(40px,5vw,64px)", letterSpacing: "-0.04em", lineHeight: 1 }}>How it works.</h2>
        <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, maxWidth: 520 }}>From idea to live token in four steps. Pick one to see it.</p>
      </Reveal>

      <div ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))", gap: "clamp(24px,4vw,56px)", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {STEPS.map((s, i) => {
            const on = i === active;
            return (
              <button
                key={s.key}
                onClick={() => pick(i)}
                aria-pressed={on}
                style={{ position: "relative", overflow: "hidden", textAlign: "left", display: "flex", gap: 16, alignItems: "flex-start", padding: 18, borderRadius: 22, cursor: "pointer", color: "#fff", background: on ? "#0d0d0d" : "transparent", border: `1px solid ${on ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)"}`, transition: "background .25s, border-color .25s" }}
              >
                <span style={{ opacity: on ? 1 : 0.55, transition: "opacity .25s", transform: on ? "scale(1)" : "scale(0.92)" }}>
                  <IconTile name={s.icon} from={s.from} to={s.to} size={52} />
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontFamily: mono, fontSize: 12, color: on ? s.from : "#5a5a5a" }}>0{i + 1}</span>
                    <span style={{ fontSize: 21, letterSpacing: "-0.02em", color: on ? "#fff" : "#9a9a9a" }}>{s.title}</span>
                  </span>
                  <AnimatePresence initial={false}>
                    {on && (
                      <motion.span key="b" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} style={{ overflow: "hidden", color: "#A1A1A1", fontSize: 15, lineHeight: 1.6, display: "block" }}>
                        {s.body}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                {on && !reduce && (
                  <span style={{ position: "absolute", left: 0, bottom: 0, height: 2, width: `${progress * 100}%`, background: `linear-gradient(90deg, ${s.from}, ${s.to})`, transition: "width .06s linear" }} />
                )}
              </button>
            );
          })}
        </div>

        <div style={{ position: "relative", minHeight: 440 }}>
          <div style={{ position: "absolute", inset: "-8% -6%", borderRadius: 40, background: `radial-gradient(60% 60% at 50% 40%, ${cur.from}22, transparent 70%)`, transition: "background .5s", pointerEvents: "none" }} />
          <AnimatePresence mode="wait">
            <motion.div key={cur.key} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }} style={{ position: "relative" }}>
              <Demo k={cur.key} anim={!reduce} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
