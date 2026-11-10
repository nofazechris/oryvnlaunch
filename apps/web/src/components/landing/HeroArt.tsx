import type { CSSProperties, ReactNode } from "react";

/**
 * The three hero cards depict what the product does, not tokens. They keep the look of
 * the token cards (gradient, tilt, float) so nothing in the hero pretends to be a market.
 */
export interface ProductCard {
  key: string;
  kicker: string;
  title: string;
  sub: string;
  /** [dark, light] gradient stops, plus a high-contrast ink colour. */
  g: [string, string];
  mid: string;
  ink: string;
  art: ReactNode;
}

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.62)",
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

function CreateArt() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, height: "100%", justifyContent: "center" }}>
      <div style={row}>
        <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.6, width: 44 }}>Name</span>Cairo Builders
      </div>
      <div style={row}>
        <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.6, width: 44 }}>Ticker</span>
        <span style={{ fontFamily: "var(--font-geist-mono),monospace" }}>$CAIRO</span>
      </div>
      <div style={{ ...row, background: "rgba(5,5,5,0.78)", color: "#fff" }}>
        <span style={{ width: 18, height: 18, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)", flexShrink: 0 }} />
        AI drafted 3 ideas
      </div>
    </div>
  );
}

function LaunchArt() {
  const W = 240;
  const H = 120;
  let d = "";
  for (let i = 0; i <= 30; i++) {
    const u = i / 30;
    d += (i ? " L" : "M") + (u * W).toFixed(1) + "," + (H - 8 - Math.pow(u, 2) * (H - 24)).toFixed(1);
  }
  const fx = 0.68;
  const fy = H - 8 - Math.pow(fx, 2) * (H - 24);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, height: "100%", justifyContent: "space-between" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", flex: 1, minHeight: 0 }}>
        <path d={`${d} L${W},${H} L0,${H} Z`} fill="rgba(255,255,255,0.35)" />
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={fx * W} cy={fy} r={6} fill="currentColor" />
        <circle cx={fx * W} cy={fy} r={13} fill="currentColor" opacity={0.2} />
      </svg>
      <div style={{ ...row, justifyContent: "space-between", padding: "8px 12px" }}>
        <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.65 }}>Buy and sell from block one</span>
        <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 11 }}>1% fee</span>
      </div>
    </div>
  );
}

function ResearchArt() {
  const checks: [string, "ok" | "warn"][] = [
    ["No mint function", "ok"],
    ["Ownership renounced", "ok"],
    ["Top holders: check evidence", "warn"],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, height: "100%", justifyContent: "center" }}>
      {checks.map(([label, st]) => (
        <div key={label} style={row}>
          <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center", background: st === "ok" ? "#55D69A" : "#F3B65F", color: "#050505", fontSize: 11, fontWeight: 700 }}>
            {st === "ok" ? "✓" : "!"}
          </span>
          {label}
        </div>
      ))}
    </div>
  );
}

export const PRODUCT_CARDS: ProductCard[] = [
  { key: "create", kicker: "01 · Create", title: "Name it with AI", sub: "Names, tickers and a description. You edit everything.", g: ["#73D9E8", "#B7F0F5"], mid: "#73D9E8", ink: "#062A30", art: <CreateArt /> },
  { key: "launch", kicker: "02 · Launch", title: "Launch on a curve", sub: "Deterministic pricing, enforced on-chain.", g: ["#FF9865", "#FFD2A8"], mid: "#FF5E3A", ink: "#3A1404", art: <LaunchArt /> },
  { key: "research", kicker: "03 · Research", title: "See the evidence", sub: "Contract facts with sources. Never a safety score.", g: ["#B69AFF", "#F38FC4"], mid: "#F38FC4", ink: "#1E1240", art: <ResearchArt /> },
];
