"use client";

import Link from "next/link";
import { EXAMPLES, topLaunched, view } from "@/lib/oryvn-data";
import { Reveal } from "./Reveal";
import { Contour } from "./Contour";

export function TopLaunches() {
  const launched = topLaunched(); // real platform launches, ranked by market cap (empty pre-launch)
  const hasLaunches = launched.length > 0;
  const ranked = (hasLaunches ? launched : EXAMPLES).slice().sort((a, b) => b.mcap - a.mcap).slice(0, 3).map((t, i) => view(t, i));

  return (
    <section data-screen-label="Top launches" style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(64px,8vw,120px) clamp(18px,5vw,72px) 0" }}>
      <Reveal style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(40px,5vw,64px)", letterSpacing: "-0.04em", lineHeight: 1 }}>Top launches.</h2>
          <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, maxWidth: 560 }}>
            The most valuable tokens launched on oryvnlaunch, ranked by market cap. {hasLaunches ? "Updated from on-chain data." : "The board is open — nothing has launched yet."}
          </p>
        </div>
        <Link href="/explore" className="lp-viewall" style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", fontSize: 14, fontWeight: 500 }}>
          View the board
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      </Reveal>

      <Reveal style={{ position: "relative", overflow: "hidden", borderRadius: "clamp(28px,3vw,40px)", background: "#090909", border: "1px solid rgba(255,255,255,0.09)", padding: "clamp(24px,4vw,48px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: "clamp(28px,4vw,56px)", alignItems: "center" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.6 }}>
          <Contour density={30} seed={11} opacity={0.09} />
        </div>

        {/* Spotlight / #1 */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ width: 84, height: 84, flexShrink: 0, borderRadius: 26, display: "grid", placeItems: "center", background: "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)", color: "#050505", fontFamily: "var(--font-geist-mono),monospace", fontWeight: 600, fontSize: 34, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>#1</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: "clamp(26px,3vw,36px)", letterSpacing: "-0.03em", lineHeight: 1.05 }}>{hasLaunches ? ranked[0]!.name : "The #1 spot is open."}</span>
              <span style={{ fontSize: 14, color: "#A1A1A1" }}>{hasLaunches ? `$${ranked[0]!.sym} · ${ranked[0]!.mcapStr} STRK market cap` : "Launch the first token and top the board."}</span>
            </div>
          </div>
          <p style={{ margin: 0, color: "#cfcfcf", fontSize: 15, lineHeight: 1.6, maxWidth: 460 }}>
            Every token launched here is ranked by real market cap and bonding volume. No paid placement, no fake volume. The most valuable launches rise to the top.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/launch" className="lp-cta-primary" style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 52, padding: "0 26px", borderRadius: 999, background: "#fff", color: "#050505", fontWeight: 600, fontSize: 15 }}>
              Launch a Token
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          </div>
        </div>

        {/* Example board preview */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>How the board will look</span>
            {!hasLaunches && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#F3B65F", padding: "3px 9px", borderRadius: 999, background: "rgba(243,182,95,0.1)" }}>Example</span>}
          </div>
          {ranked.map((t, i) => (
            <div key={t.sym} style={{ display: "grid", gridTemplateColumns: "28px 44px 1fr auto", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 16, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)", opacity: hasLaunches ? 1 : 0.9 }}>
              <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 14, color: i === 0 ? "#fff" : "#696969" }}>{i + 1}</span>
              <span style={{ width: 44, height: 44, borderRadius: 14, background: t.bg, color: t.ink, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{t.sym2}</span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                <span style={{ fontSize: 12, color: "#696969" }}>${t.sym}</span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 13 }}>{t.mcapStr} STRK</span>
                <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 12, color: t.chgColor }}>{t.chgStr}</span>
              </span>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
