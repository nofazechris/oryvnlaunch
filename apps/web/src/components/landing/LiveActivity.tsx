"use client";

import { LAUNCHED, PLATFORM_ACTIVITY, ago, bySym, view } from "@/lib/oryvn-data";
import { Reveal } from "./Reveal";

const KINDS: { kind: string; color: string; bg: string; blurb: string }[] = [
  { kind: "Launch", color: "#73D9E8", bg: "rgba(115,217,232,0.12)", blurb: "A new token deploys and opens its bonding curve." },
  { kind: "Buy", color: "#55D69A", bg: "rgba(85,214,154,0.12)", blurb: "Someone buys from the curve." },
  { kind: "Sell", color: "#FF6868", bg: "rgba(255,104,104,0.12)", blurb: "Someone sells back to the curve." },
  { kind: "Graduation", color: "#B69AFF", bg: "rgba(182,154,255,0.12)", blurb: "A curve fills and the token graduates." },
];
const KMAP = Object.fromEntries(KINDS.map((k) => [k.kind, k]));
const mono = "var(--font-geist-mono),monospace";

export function LiveActivity() {
  const events = PLATFORM_ACTIVITY.slice(0, 6); // real, indexer-fed events (empty pre-launch)
  const live = events.length > 0;

  return (
    <section id="activity" data-screen-label="Live activity" style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(72px,9vw,140px) clamp(18px,5vw,72px) 0", scrollMarginTop: 24 }}>
      <Reveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))", gap: "clamp(28px,5vw,72px)", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#55D69A" }}>
            <span style={{ position: "relative", width: 8, height: 8 }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#55D69A", animation: "oc-ping 1.8s ease-out infinite" }} />
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#55D69A" }} />
            </span>
            Live activity
          </span>
          <h2 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(40px,5vw,64px)", letterSpacing: "-0.04em", lineHeight: 1 }}>Every launch, as it lands.</h2>
          <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, lineHeight: 1.6, maxWidth: 460 }}>
            Launches, buys, sells and graduations appear here the moment they confirm on Starknet. Straight from the chain, nothing staged.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
            {KINDS.map((k) => (
              <div key={k.kind} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: "#cfcfcf" }}>
                <span style={{ minWidth: 92, textAlign: "center", padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: k.bg, color: k.color }}>{k.kind}</span>
                {k.blurb}
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderRadius: 28, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.09)", padding: 10, boxShadow: "0 40px 100px rgba(0,0,0,0.5)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px 10px" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Platform feed</span>
            <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: live ? "#55D69A" : "#A1A1A1" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: live ? "#55D69A" : "#696969", animation: "oc-blink 1.6s infinite" }} />
              {live ? "Live" : "Listening to Starknet"}
            </span>
          </div>

          {live ? (
            events.map((e, i) => {
              const k = KMAP[e.kind]!;
              const known = LAUNCHED.some((t) => t.sym === e.sym);
              const t = known ? view(LAUNCHED[bySym(e.sym)]!, 0) : null;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto auto", gap: 12, alignItems: "center", padding: "10px 14px", borderRadius: 14 }}>
                  <span style={{ width: 44, height: 44, borderRadius: 14, background: t ? t.bg : "#1a1a1a", color: t ? t.ink : "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{e.sym.slice(0, 4)}</span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>${e.sym}</span>
                    <span style={{ fontFamily: mono, fontSize: 12, color: "#696969" }}>{e.wallet}</span>
                  </span>
                  <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: k.bg, color: k.color }}>{e.kind}</span>
                  <span style={{ fontFamily: mono, fontSize: 12, color: "#A1A1A1", textAlign: "right" }}>{e.strk ? `${e.strk} STRK · ` : ""}{ago(e.t)}</span>
                </div>
              );
            })
          ) : (
            <>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) 72px", gap: 12, alignItems: "center", padding: "10px 14px", borderRadius: 14, opacity: 1 - i * 0.2 }}>
                  <span style={{ width: 44, height: 44, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.16)" }} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={{ height: 10, width: `${62 - i * 8}%`, borderRadius: 6, background: "rgba(255,255,255,0.07)" }} />
                    <span style={{ height: 8, width: `${38 - i * 4}%`, borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />
                  </span>
                  <span style={{ height: 22, borderRadius: 999, background: "rgba(255,255,255,0.05)" }} />
                </div>
              ))}
              <div style={{ padding: "18px 14px 14px", display: "flex", flexDirection: "column", gap: 4, textAlign: "center" }}>
                <span style={{ fontSize: 15 }}>Waiting for the first launch</span>
                <span style={{ fontSize: 13, color: "#A1A1A1" }}>The first event will show up here as soon as it confirms on-chain.</span>
              </div>
            </>
          )}
        </div>
      </Reveal>
    </section>
  );
}
