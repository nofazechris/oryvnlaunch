"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { LAUNCH_TEMPLATES } from "@/lib/oryvn-data";
import { Icon, IconTile, type IconName } from "@/components/ui/Icons";
import { Reveal } from "./Reveal";

interface Detail {
  icon: IconName;
  curve: string;
  curveNote: string;
  ai: string;
  best: string;
}

const DETAILS: Record<string, Detail> = {
  meme: { icon: "smile", curve: "Steep curve", curveNote: "Price rises faster, and the curve fills on fewer trades.", ai: "Mascot ideas, punchy names and a launch post.", best: "Jokes, mascots and fast-moving communities." },
  community: { icon: "users", curve: "Gentle curve", curveNote: "A flatter early curve, with more room for early supporters.", ai: "Community description, tone and name ideas.", best: "Crews, DAOs, hackathons and groups." },
  art: { icon: "palette", curve: "Standard curve", curveNote: "Steady, predictable price movement as supply is bought.", ai: "Branding directions and a short artist bio.", best: "Artists, drops and collectibles." },
  utility: { icon: "bolt", curve: "Standard curve", curveNote: "Steady, predictable price movement as supply is bought.", ai: "Plain explanation of what the token does, with no value claims.", best: "Access, rewards and products." },
};

export function Templates() {
  const [sel, setSel] = useState(0);
  const t = LAUNCH_TEMPLATES[sel]!;
  const d = DETAILS[t.key]!;

  const rows: { icon: IconName; label: string; value: string; note?: string }[] = [
    { icon: "curve", label: "Starting curve", value: d.curve, note: d.curveNote },
    { icon: "sparkles", label: "AI helps with", value: d.ai },
    { icon: "eye", label: "Best for", value: d.best },
  ];

  return (
    <section id="templates" data-screen-label="What you can launch" style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(64px,8vw,120px) clamp(18px,5vw,72px) 0", scrollMarginTop: 24 }}>
      <Reveal style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        <h2 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(40px,5vw,64px)", letterSpacing: "-0.04em", lineHeight: 1 }}>What you can launch.</h2>
        <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, maxWidth: 560 }}>Start from a kind of token and shape it with AI. Every one deploys from an audited template on a bonding curve.</p>
      </Reveal>

      <Reveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: "clamp(20px,3vw,40px)", alignItems: "stretch" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {LAUNCH_TEMPLATES.map((tp, i) => {
            const on = i === sel;
            const dd = DETAILS[tp.key]!;
            return (
              <button
                key={tp.key}
                onClick={() => setSel(i)}
                onMouseEnter={() => setSel(i)}
                aria-pressed={on}
                style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, textAlign: "left", borderRadius: 22, cursor: "pointer", color: "#fff", background: on ? "#0f0f0f" : "transparent", border: `1px solid ${on ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.07)"}`, transition: "background .2s, border-color .2s, transform .2s", transform: on ? "translateX(6px)" : "none" }}
              >
                <IconTile name={dd.icon} from={tp.g[0]} to={tp.g[1]} size={54} />
                <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 19, letterSpacing: "-0.02em" }}>{tp.label}</span>
                  <span style={{ color: "#A1A1A1", fontSize: 14, lineHeight: 1.5 }}>{tp.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ position: "relative", borderRadius: 30, overflow: "hidden", minHeight: 380, background: `linear-gradient(160deg, ${t.g[1]} 0%, ${t.g[0]} 100%)`, color: t.ink, boxShadow: "0 30px 80px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.35)", transition: "background .4s" }}>
          <span style={{ position: "absolute", right: -50, top: -50, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.28)" }} />
          <AnimatePresence mode="wait">
            <motion.div key={t.key} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.28 }} style={{ position: "relative", padding: 28, display: "flex", flexDirection: "column", gap: 18, height: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ width: 62, height: 62, borderRadius: 20, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.5)", color: t.ink }}>
                  <Icon name={d.icon} size={32} stroke={1.9} />
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.7 }}>Template</span>
                  <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{t.label}</span>
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rows.map((r) => (
                  <div key={r.label} style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,0.5)" }}>
                    <Icon name={r.icon} size={20} style={{ marginTop: 1 }} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", opacity: 0.65 }}>{r.label}</span>
                      <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{r.value}</span>
                      {r.note && <span style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.4 }}>{r.note}</span>}
                    </span>
                  </div>
                ))}
              </div>

              <Link href="/login" style={{ marginTop: "auto", alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 8, height: 46, padding: "0 20px", borderRadius: 999, background: "#050505", color: "#fff", fontWeight: 600, fontSize: 14 }}>
                Get started
                <Icon name="arrow" size={16} />
              </Link>
            </motion.div>
          </AnimatePresence>
        </div>
      </Reveal>
    </section>
  );
}
