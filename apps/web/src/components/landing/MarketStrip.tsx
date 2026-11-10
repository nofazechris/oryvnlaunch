"use client";

import { spark } from "@/lib/oryvn-data";
import { Reveal } from "./Reveal";
import { StatCard, type Stat } from "./StatCard";
import { Ticker } from "./Ticker";

const BASE: Omit<Stat, "fill" | "line" | "area">[] = [
  { label: "Tokens launched", value: "12,408", num: 12408, suffix: "", dec: 0, delta: "+214 today", color: "#73D9E8" },
  { label: "Bonding volume", value: "3.42M STRK", num: 3.42, suffix: "M STRK", dec: 2, delta: "+8.1%", color: "#B69AFF" },
  { label: "Active launches", value: "318", num: 318, suffix: "", dec: 0, delta: "+27", color: "#FF9865" },
  { label: "Participating wallets", value: "41,920", num: 41920, suffix: "", dec: 0, delta: "+3.4%", color: "#C7EA83" },
];

const STATS: Stat[] = BASE.map((s, i) => ({ ...s, ...spark(i + 3, true), fill: s.color + "14" }));

export function MarketStrip() {
  return (
    <section
      data-screen-label="02 Market strip"
      style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(40px,5vw,64px) clamp(18px,5vw,72px) 0" }}
    >
      <Reveal
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#d8d8d8" }}>
          <span style={{ position: "relative", width: 8, height: 8 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#55D69A", animation: "oc-ping 1.8s ease-out infinite" }} />
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#55D69A" }} />
          </span>
          Starknet right now
        </span>
        <span style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "#F3B65F" }}>
          Preview data · not live
        </span>
      </Reveal>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 12 }}>
        {STATS.map((s, i) => (
          <StatCard key={s.label} stat={s} index={i} />
        ))}
      </div>

      <Ticker />
    </section>
  );
}
