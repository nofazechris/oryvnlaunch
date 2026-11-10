"use client";

import { LAUNCH_TEMPLATES } from "@/lib/oryvn-data";
import { Reveal } from "./Reveal";

export function Templates() {
  return (
    <section id="templates" data-screen-label="What you can launch" style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(64px,8vw,120px) clamp(18px,5vw,72px) 0", scrollMarginTop: 24 }}>
      <Reveal style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        <h2 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(40px,5vw,64px)", letterSpacing: "-0.04em", lineHeight: 1 }}>What you can launch.</h2>
        <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, maxWidth: 560 }}>Start from a kind of token and shape it with AI. Every one deploys from an audited template on a bonding curve.</p>
      </Reveal>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,250px),1fr))", gap: 16 }}>
        {LAUNCH_TEMPLATES.map((t, i) => (
          <Reveal
            key={t.key}
            index={i}
            style={{ position: "relative", borderRadius: 26, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", padding: 22, display: "flex", flexDirection: "column", gap: 16, minHeight: 190 }}
          >
            <span style={{ width: 52, height: 52, borderRadius: 16, background: `linear-gradient(150deg, ${t.g[1]}, ${t.g[0]})`, color: t.ink, display: "grid", placeItems: "center", fontSize: 22, fontWeight: 700 }}>{t.label.charAt(0)}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>{t.label}</span>
              <span style={{ color: "#A1A1A1", fontSize: 14, lineHeight: 1.55 }}>{t.blurb}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
