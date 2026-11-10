"use client";

import type { CSSProperties, ReactNode } from "react";
import { useViewportWidth } from "@/lib/hooks";
import { Reveal } from "./Reveal";

interface Tile {
  key: string;
  col: number;
  row: number;
  accent: string;
  title: string;
  body: string;
  icon: ReactNode;
  big?: boolean;
}

const stroke = (d: ReactNode, color: string, size = 22): ReactNode => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

const TILES: Tile[] = [
  { key: "ai", col: 2, row: 2, accent: "#B69AFF", big: true, title: "AI Launch Studio", body: "Describe an idea and get names, tickers and a first description. AI explains every launch setting in plain words — and never changes them or signs anything on its own.", icon: null },
  { key: "intel", col: 2, row: 1, accent: "#73D9E8", title: "Contract intelligence", body: "Mint rights, ownership, upgradability and holder concentration — each with its evidence and timestamp. Never a safety score.", icon: stroke(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4" />, "#73D9E8") },
  { key: "research", col: 2, row: 1, accent: "#C7EA83", title: "AI token research", body: "Ask anything about a token. Answered only from indexed on-chain data, with sources — no price predictions.", icon: stroke(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, "#C7EA83") },
  { key: "custody", col: 1, row: 1, accent: "#FF9865", title: "Non-custodial", body: "Your keys, always. We never hold funds.", icon: stroke(<><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.2-8.2M17 4l3 3M15 6l2 2" /></>, "#FF9865") },
  { key: "live", col: 1, row: 1, accent: "#55D69A", title: "Live activity", body: "Every launch and trade, as it lands.", icon: stroke(<path d="M3 12h4l3 8 4-16 3 8h4" />, "#55D69A") },
  { key: "curve", col: 2, row: 1, accent: "#F38FC4", title: "Bonding-curve launches", body: "Deterministic, on-chain pricing. Buy and sell from the moment it launches, straight on the curve.", icon: stroke(<path d="M3 20c6 0 12-2 18-16" />, "#F38FC4") },
];

export function BentoFeatures() {
  const w = useViewportWidth();
  const wide = w >= 900;

  return (
    <section data-screen-label="Features" style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(72px,9vw,140px) clamp(18px,5vw,72px) 0" }}>
      <Reveal style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 36 }}>
        <h2 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(40px,5vw,64px)", letterSpacing: "-0.04em", lineHeight: 1 }}>Everything to launch smarter.</h2>
        <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, maxWidth: 520, lineHeight: 1.6 }}>One place to create a token, launch it on a bonding curve and check what you&apos;re buying.</p>
      </Reveal>

      <div style={{ display: "grid", gridTemplateColumns: wide ? "repeat(4,1fr)" : "1fr", gridAutoRows: wide ? "minmax(158px,auto)" : "auto", gridAutoFlow: wide ? "dense" : "row", gap: 14 }}>
        {TILES.map((t, i) => {
          const span: CSSProperties = wide ? { gridColumn: `span ${t.col}`, gridRow: `span ${t.row}` } : {};
          return (
            <Reveal
              key={t.key}
              index={i}
              style={{ ...span, position: "relative", overflow: "hidden", borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: t.big ? 28 : 22, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: t.big ? 24 : 14, minHeight: t.big ? 300 : 158 }}
            >
              <span style={{ position: "absolute", right: -40, top: -40, width: 160, height: 160, borderRadius: "50%", background: t.accent, opacity: 0.06, filter: "blur(4px)" }} />
              <span style={{ position: "relative", width: 44, height: 44, borderRadius: 13, display: "grid", placeItems: "center", background: "rgba(255,255,255,0.04)", border: `1px solid ${t.accent}33` }}>
                {t.big ? (
                  <span style={{ width: 28, height: 28, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />
                ) : (
                  t.icon
                )}
              </span>
              <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: t.big ? 26 : 19, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{t.title}</span>
                <span style={{ color: "#A1A1A1", fontSize: t.big ? 15 : 14, lineHeight: 1.6 }}>{t.body}</span>
                {t.big && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ alignSelf: "flex-start", maxWidth: "90%", padding: "9px 13px", borderRadius: "14px 14px 4px 14px", background: "#1a1a1a", fontSize: 13, color: "#d8d8d8" }}>A community token for Starknet builders.</span>
                    <span style={{ alignSelf: "flex-end", maxWidth: "90%", padding: "9px 13px", borderRadius: "14px 14px 14px 4px", background: "rgba(182,154,255,0.12)", border: "1px solid rgba(182,154,255,0.25)", fontSize: 13, color: "#e4e4e4" }}>Cairo Builders · $CAIRO — named after the language every builder shares.</span>
                  </div>
                )}
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
