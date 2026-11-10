"use client";

import { Reveal } from "./Reveal";

const FEATURES = [
  { n: "01", title: "Instant token creation", body: "Name, ticker, image. Deploy from audited templates with no contract code to write.", color: "linear-gradient(135deg,#73D9E8,#B7F0F5)" },
  { n: "02", title: "AI launch assistance", body: "Shape the idea, draft the copy and get each launch setting explained in plain language.", color: "linear-gradient(135deg,#B69AFF,#F38FC4)" },
  { n: "03", title: "Transparent contract intelligence", body: "Mint rights, ownership, supply and holder concentration — each with its evidence and timestamp.", color: "linear-gradient(135deg,#FF9865,#FFD2A8)" },
  { n: "04", title: "Live token discovery", body: "Trending is ranked by volume, unique buyers and holder growth. Never by paid placement.", color: "linear-gradient(135deg,#C7EA83,#55D69A)" },
];

export function Features() {
  return (
    <section
      data-screen-label="06 Features"
      style={{
        maxWidth: 1440,
        margin: "0 auto",
        padding: "clamp(72px,9vw,140px) clamp(18px,5vw,72px) 0",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))",
        gap: "clamp(32px,5vw,80px)",
      }}
    >
      <Reveal style={{ display: "flex", flexDirection: "column", gap: 20, alignSelf: "start", position: "sticky", top: 40 }}>
        <h2 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(40px,5vw,64px)", letterSpacing: "-0.04em", lineHeight: 1, maxWidth: 520 }}>
          Everything to launch smarter.
        </h2>
        <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, lineHeight: 1.6, maxWidth: 420 }}>
          One place to create a token, launch it on a bonding curve and check what you&apos;re buying.
        </p>
      </Reveal>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {FEATURES.map((f, i) => (
          <Reveal
            key={f.n}
            index={i}
            style={{
              display: "grid",
              gridTemplateColumns: "56px 1fr auto",
              gap: 18,
              alignItems: "start",
              padding: "28px 0",
              borderTop: "1px solid rgba(255,255,255,0.09)",
            }}
          >
            <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 13, color: "#696969", paddingTop: 10 }}>{f.n}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: "clamp(24px,2.6vw,34px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>{f.title}</span>
              <span style={{ color: "#A1A1A1", fontSize: 15, lineHeight: 1.6, maxWidth: 440 }}>{f.body}</span>
            </div>
            <span style={{ width: 46, height: 46, borderRadius: "50%", background: f.color, marginTop: 4 }} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
