"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { useWalletStore } from "@/lib/wallet-store";
import { useUiStore } from "@/lib/ui-store";
import { Icon, IconTile, type IconName } from "@/components/ui/Icons";

const ACTIONS: { href: string; title: string; body: string; icon: IconName; from: string; to: string }[] = [
  { href: "/launch", title: "Launch a token", body: "Create and deploy on a bonding curve with AI help.", icon: "rocket", from: "#FF9865", to: "#FF5E3A" },
  { href: "/explore", title: "Explore tokens", body: "Discover launches ranked by real value.", icon: "search", from: "#73D9E8", to: "#568BFF" },
  { href: "/intelligence", title: "Research with AI", body: "Ask anything about a token, from on-chain data.", icon: "sparkles", from: "#B69AFF", to: "#F38FC4" },
  { href: "/terminal", title: "Open the terminal", body: "Trade on the curve with a live chart and order form.", icon: "curve", from: "#C7EA83", to: "#55D69A" },
];

export function Overview() {
  const session = useAuthStore((s) => s.session);
  const wallet = useWalletStore((s) => s.wallet);
  const setPanel = useUiStore((s) => s.setPanel);
  const connected = !!wallet;
  const who = session?.method === "google" ? session.email : "there";

  const steps: { label: string; hint: string; done: boolean; href?: string; action?: () => void; icon: IconName }[] = [
    { label: "Account created", hint: "You're signed in", done: true, icon: "check" },
    { label: connected ? "Wallet connected" : "Connect your wallet", hint: connected ? "Ready to launch and trade" : "Needed to launch and trade", done: connected, action: connected ? undefined : () => setPanel("wallet"), icon: "wallet" },
    { label: "Launch your first token", hint: "Takes a few minutes with AI", done: false, href: "/launch", icon: "rocket" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(28px,4vw,48px) clamp(18px,5vw,48px) 120px", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(34px,4.5vw,52px)", letterSpacing: "-0.04em", lineHeight: 1 }}>Welcome{session?.method === "google" ? "" : " back"}.</h1>
        <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, overflowWrap: "anywhere" }}>Signed in as {who}. Here&apos;s where you launch, trade and research.</p>
      </div>

      <div style={{ borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: "clamp(18px,2.5vw,26px)", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Get set up</span>
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#A1A1A1", fontFamily: "var(--font-geist-mono),monospace" }}>
            <span style={{ width: 80, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${(doneCount / steps.length) * 100}%`, background: "linear-gradient(90deg,#73D9E8,#B69AFF)", transition: "width .4s" }} />
            </span>
            {doneCount}/{steps.length}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 12 }}>
          {steps.map((s) => {
            const inner = (
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, background: "#0d0d0d", border: `1px solid ${s.done ? "rgba(85,214,154,0.3)" : "rgba(255,255,255,0.08)"}`, height: "100%", textAlign: "left", width: "100%" }}>
                <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 12, display: "grid", placeItems: "center", background: s.done ? "rgba(85,214,154,0.14)" : "rgba(255,255,255,0.05)", color: s.done ? "#55D69A" : "#d0d0d0" }}>
                  <Icon name={s.icon} size={20} />
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 14, color: "#fff" }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: "#8a8a8a" }}>{s.hint}</span>
                </span>
              </div>
            );
            if (s.href) return <Link key={s.label} href={s.href} className="lp-explore-card" style={{ display: "block", borderRadius: 16 }}>{inner}</Link>;
            if (s.action) return <button key={s.label} onClick={s.action} className="lp-explore-card" style={{ display: "block", padding: 0, border: 0, background: "transparent", color: "inherit", cursor: "pointer", borderRadius: 16 }}>{inner}</button>;
            return <div key={s.label}>{inner}</div>;
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Quick actions</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,250px),1fr))", gap: 14 }}>
          {ACTIONS.map((a) => (
            <Link key={a.href} href={a.href} className="lp-explore-card" style={{ borderRadius: 22, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", padding: 20, display: "flex", flexDirection: "column", gap: 18, minHeight: 170, justifyContent: "space-between" }}>
              <IconTile name={a.icon} from={a.from} to={a.to} size={50} />
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
