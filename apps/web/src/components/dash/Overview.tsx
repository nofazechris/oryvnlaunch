"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { useWalletStore } from "@/lib/wallet-store";

const ACTIONS = [
  { href: "/launch", title: "Launch a token", body: "Create and deploy on a bonding curve with AI help.", g: "linear-gradient(135deg,#FF9865,#FFD2A8)" },
  { href: "/explore", title: "Explore tokens", body: "Discover launches ranked by real value.", g: "linear-gradient(135deg,#73D9E8,#B7F0F5)" },
  { href: "/intelligence", title: "Research with AI", body: "Ask anything about a token, from on-chain data.", g: "linear-gradient(135deg,#B69AFF,#E6DCFF)" },
];

export function Overview() {
  const session = useAuthStore((s) => s.session);
  const wallet = useWalletStore((s) => s.wallet);
  const connected = !!wallet;
  const who = session?.method === "google" ? session.email : "there";

  const steps = [
    { label: "Account created", done: true, href: null },
    { label: connected ? "Wallet connected" : "Connect your wallet", done: connected, href: connected ? null : "/overview" },
    { label: "Launch your first token", done: false, href: "/launch" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(28px,4vw,48px) clamp(18px,5vw,48px) 120px", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(34px,4.5vw,52px)", letterSpacing: "-0.04em", lineHeight: 1 }}>Welcome{session?.method === "google" ? "" : " back"}.</h1>
        <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16 }}>Signed in as {who}. Here&apos;s where you launch, trade and research.</p>
      </div>

      {/* Getting started */}
      <div style={{ borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: "clamp(18px,2.5vw,26px)", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Get set up</span>
          <span style={{ fontSize: 13, color: "#A1A1A1", fontFamily: "var(--font-geist-mono),monospace" }}>{doneCount}/3</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 12 }}>
          {steps.map((s) => {
            const inner = (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, borderRadius: 16, background: "#0d0d0d", border: `1px solid ${s.done ? "rgba(85,214,154,0.3)" : "rgba(255,255,255,0.08)"}`, height: "100%" }}>
                <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: "50%", background: s.done ? "#55D69A" : "transparent", border: s.done ? "0" : "1px solid rgba(255,255,255,0.25)", color: "#050505", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700 }}>{s.done ? "✓" : ""}</span>
                <span style={{ fontSize: 14, color: s.done ? "#e4e4e4" : "#fff" }}>{s.label}</span>
              </div>
            );
            return s.href ? <Link key={s.label} href={s.href} style={{ display: "block" }}>{inner}</Link> : <div key={s.label}>{inner}</div>;
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Quick actions</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 14 }}>
          {ACTIONS.map((a) => (
            <Link key={a.href} href={a.href} className="lp-explore-card" style={{ borderRadius: 22, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", padding: 20, display: "flex", flexDirection: "column", gap: 14, minHeight: 150, justifyContent: "space-between" }}>
              <span style={{ width: 46, height: 46, borderRadius: 14, background: a.g }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 18, letterSpacing: "-0.02em" }}>{a.title}</span>
                <span style={{ color: "#A1A1A1", fontSize: 14, lineHeight: 1.5 }}>{a.body}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <span style={{ fontSize: 12, color: "#F3B65F" }}>Preview · simulated account and data.</span>
    </main>
  );
}
