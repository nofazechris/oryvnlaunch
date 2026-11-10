"use client";

import { Reveal } from "./Reveal";

const STEPS = [
  { n: "01", title: "Create your token", body: "Add a name, ticker, image and links — or start from an AI draft.", color: "#73D9E8" },
  { n: "02", title: "Launch on Starknet", body: "Pick a tested bonding-curve template, pass Launch Guard and sign once.", color: "#FF9865" },
  { n: "03", title: "Build your community", body: "Share the token page, post updates and track holders from your dashboard.", color: "#F38FC4" },
];

export function HowItWorks() {
  return (
    <section
      id="how"
      data-screen-label="04 How it works"
      style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(72px,9vw,140px) clamp(18px,5vw,72px) 0" }}
    >
      <Reveal as="h2" style={{ margin: "0 0 40px", fontWeight: 400, fontSize: "clamp(40px,5vw,64px)", letterSpacing: "-0.04em", lineHeight: 1 }}>
        How it works.
      </Reveal>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 16 }}>
        {STEPS.map((s, i) => (
          <Reveal
            key={s.n}
            index={i}
            style={{
              position: "relative",
              borderRadius: 28,
              background: "#0d0d0d",
              border: "1px solid rgba(255,255,255,0.09)",
              padding: 28,
              minHeight: 300,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 40,
              overflow: "hidden",
            }}
          >
            <span style={{ position: "absolute", right: -20, top: -30, width: 150, height: 150, borderRadius: "50%", background: s.color, opacity: 0.9 }} />
            <span style={{ position: "relative", fontSize: 96, fontWeight: 300, letterSpacing: "-0.06em", lineHeight: 1, color: "#fff" }}>{s.n}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 24, letterSpacing: "-0.02em" }}>{s.title}</span>
              <span style={{ color: "#A1A1A1", fontSize: 15, lineHeight: 1.6 }}>{s.body}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
