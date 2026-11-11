"use client";

import Link from "next/link";
import { topLaunched, view } from "@/lib/oryvn-data";
import { Reveal } from "./Reveal";
import { Contour } from "./Contour";
import { TokenAvatar } from "@/components/ui/TokenAvatar";

const SLOT_GRADS = [
  "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)",
  "linear-gradient(150deg,#2a2a2a,#161616)",
  "linear-gradient(150deg,#2a2a2a,#161616)",
];

export function TopLaunches() {
  const launched = topLaunched(); // real platform launches, ranked by market cap (empty pre-launch)
  const hasLaunches = launched.length > 0;
  const ranked = launched.slice(0, 3).map((t, i) => view(t, i));
  const lead = ranked[0];

  return (
    <section id="launches" data-screen-label="Top launches" style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(64px,8vw,120px) clamp(18px,5vw,72px) 0", scrollMarginTop: 24 }}>
      <Reveal style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(40px,5vw,64px)", letterSpacing: "-0.04em", lineHeight: 1 }}>Top launches.</h2>
        <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, maxWidth: 560 }}>
          The most valuable tokens launched on oryvnlaunch, ranked by market cap. {hasLaunches ? "Updated from on-chain data." : "The board is open. Nothing has launched yet."}
        </p>
      </Reveal>

      <Reveal style={{ position: "relative", overflow: "hidden", borderRadius: "clamp(28px,3vw,40px)", background: "#090909", border: "1px solid rgba(255,255,255,0.09)", padding: "clamp(24px,4vw,48px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: "clamp(28px,4vw,56px)", alignItems: "center" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.6 }}>
          <Contour density={30} seed={11} opacity={0.09} />
        </div>

        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ width: 84, height: 84, flexShrink: 0, borderRadius: 26, display: "grid", placeItems: "center", background: "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)", color: "#050505", fontFamily: "var(--font-geist-mono),monospace", fontWeight: 600, fontSize: 34, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>#1</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: "clamp(26px,3vw,36px)", letterSpacing: "-0.03em", lineHeight: 1.05 }}>{lead ? lead.name : "The #1 spot is open."}</span>
              <span style={{ fontSize: 14, color: "#A1A1A1" }}>{lead ? `$${lead.sym} · ${lead.mcapStr} STRK market cap` : "Launch the first token and top the board."}</span>
            </div>
          </div>
          <p style={{ margin: 0, color: "#cfcfcf", fontSize: 15, lineHeight: 1.6, maxWidth: 460 }}>
            Every token launched here is ranked by real market cap and bonding volume. No paid placement, no fake volume. The most valuable launches rise to the top.
          </p>
          <div>
            <Link href="/login" className="lp-cta-primary" style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 52, padding: "0 26px", borderRadius: 999, background: "#fff", color: "#050505", fontWeight: 600, fontSize: 15 }}>
              Get started
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          </div>
        </div>

        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>The board</span>
          {[0, 1, 2].map((i) => {
            const t = ranked[i];
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 44px 1fr auto", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 16, background: "#0d0d0d", border: t ? "1px solid rgba(255,255,255,0.06)" : "1px dashed rgba(255,255,255,0.14)" }}>
                <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 14, color: i === 0 ? "#fff" : "#696969" }}>{i + 1}</span>
                {t ? (
                  <TokenAvatar sym={t.sym} bg={t.bg} ink={t.ink} size={44} />
                ) : (
                  <span style={{ width: 44, height: 44, borderRadius: 14, background: SLOT_GRADS[i], opacity: i === 0 ? 0.5 : 1, border: i === 0 ? "0" : "1px dashed rgba(255,255,255,0.14)" }} />
                )}
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t ? "#fff" : "#9a9a9a" }}>{t ? t.name : "Open spot"}</span>
                  <span style={{ fontSize: 12, color: "#696969" }}>{t ? `$${t.sym}` : "Your token could be here"}</span>
                </span>
                {t ? (
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 13 }}>{t.mcapStr} STRK</span>
                    <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 12, color: t.chgColor }}>{t.chgStr}</span>
                  </span>
                ) : (
                  <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 12, color: "#4a4a4a" }}>— STRK</span>
                )}
              </div>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}
