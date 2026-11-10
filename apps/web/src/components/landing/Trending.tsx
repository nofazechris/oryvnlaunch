"use client";

import { TOKENS, fmtK, fmtP } from "@/lib/oryvn-data";
import { Reveal } from "./Reveal";

const REASONS = ["Unique buyers ↑ 1h", "Volume ↑ 24h", "Holder growth", "Trades ↑ 15m", "New · fast fill"];

const CELL = (label: string, value: string) => ({ label, value });

export function Trending() {
  const trending = TOKENS.slice()
    .sort((a, b) => b.vol - a.vol)
    .map((t, i) => ({
      t,
      i,
      bg: `linear-gradient(150deg, ${t.g[1]}, ${t.g[0]})`,
      chgStr: `${t.chg > 0 ? "+" : ""}${t.chg}%`,
      chgColor: t.chg >= 0 ? "#55D69A" : "#FF6868",
      reason: REASONS[i % 5]!,
      cells: [
        CELL("Price", fmtP(t.price)),
        CELL("Market cap", `${fmtK(t.mcap)} STRK`),
        CELL("Volume 24h", `${fmtK(t.vol)} STRK`),
        CELL("Holders", t.holders.toLocaleString()),
      ],
    }));

  return (
    <section
      data-screen-label="03 Trending"
      style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(64px,8vw,120px) clamp(18px,5vw,72px) 0" }}
    >
      <Reveal
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 20,
          marginBottom: 32,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(40px,5vw,64px)", letterSpacing: "-0.04em", lineHeight: 1 }}>
            What&apos;s moving?
          </h2>
          <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16 }}>Discover tokens attracting attention.</p>
        </div>
        <a
          href="#"
          className="lp-viewall"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 44,
            padding: "0 20px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.15)",
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          View all in Explore
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>
      </Reveal>

      <div
        className="lp-noscroll"
        style={{
          display: "flex",
          gap: 16,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          paddingBottom: 16,
          margin: "0 calc(-1 * clamp(18px,5vw,72px))",
          paddingLeft: "clamp(18px,5vw,72px)",
          paddingRight: "clamp(18px,5vw,72px)",
        }}
      >
        {trending.map((x) => (
          <Reveal
            key={x.t.sym}
            as="a"
            href="#"
            index={x.i}
            className="lp-trend"
            style={{
              flex: "0 0 290px",
              scrollSnapAlign: "start",
              borderRadius: 26,
              background: "#101010",
              border: "1px solid rgba(255,255,255,0.09)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ position: "relative", height: 190, margin: 8, borderRadius: 20, background: x.bg, color: x.t.ink, overflow: "hidden", display: "grid", placeItems: "center" }}>
              <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: "-0.06em", opacity: 0.22 }}>{x.t.sym}</span>
              <span style={{ position: "absolute", left: 12, top: 12, padding: "5px 10px", borderRadius: 999, background: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600 }}>
                {x.reason}
              </span>
              <span style={{ position: "absolute", right: 12, top: 12, padding: "5px 10px", borderRadius: 999, background: "rgba(0,0,0,0.75)", color: x.chgColor, fontFamily: "var(--font-geist-mono),monospace", fontSize: 12, fontWeight: 600 }}>
                {x.chgStr}
              </span>
            </div>
            <div style={{ padding: "14px 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>{x.t.name}</span>
                <span style={{ fontSize: 13, color: "#A1A1A1" }}>${x.t.sym}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px", fontSize: 12 }}>
                {x.cells.map((c) => (
                  <div key={c.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ color: "#696969" }}>{c.label}</span>
                    <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 13 }}>{c.value}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#696969" }}>Bonding</span>
                  <span style={{ fontFamily: "var(--font-geist-mono),monospace" }}>{x.t.bond}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${x.t.bond}%`, background: x.t.g[0], borderRadius: 99 }} />
                </div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
