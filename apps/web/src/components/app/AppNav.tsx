"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { useWalletStore } from "@/lib/wallet-store";
import { useUiStore } from "@/lib/ui-store";
import { SearchModal } from "./SearchModal";
import { AiAssistant } from "./AiAssistant";

const BRAND = "oryvnlaunch";

type LinkDef = { key: string; label: string; href: string };

const NOTIFS = [
  { text: "Buy of 182K BUN confirmed", time: "2m ago", bg: "linear-gradient(150deg,#FFD2A8,#FF9865)" },
  { text: "Sunny Bun reached 90% bonding", time: "14m ago", bg: "linear-gradient(150deg,#FFD2A8,#FF9865)" },
  { text: "Cairo Builders: new project update", time: "1h ago", bg: "linear-gradient(150deg,#FFD9EC,#F38FC4)" },
  { text: "Creator fees available on MOSS", time: "3h ago", bg: "linear-gradient(150deg,#EAF7C9,#C7EA83)" },
];

const MENU: LinkDef[] = [
  { key: "created", label: "My created tokens", href: "/dashboard" },
  { key: "portfolio", label: "Portfolio", href: "/portfolio" },
  { key: "activity", label: "Activity", href: "/activity" },
  { key: "referrals", label: "Referrals", href: "/settings" },
  { key: "settings", label: "Settings", href: "/settings" },
];

const MOBILE: { key: string; label: string; href: string; dot: string }[] = [
  { key: "explore", label: "Explore", href: "/explore", dot: "#73D9E8" },
  { key: "terminal", label: "Trade", href: "/terminal", dot: "#55D69A" },
  { key: "launch", label: "Launch", href: "/launch", dot: "#FF9865" },
  { key: "portfolio", label: "Portfolio", href: "/portfolio", dot: "#F38FC4" },
  { key: "intelligence", label: "AI", href: "/intelligence", dot: "#B69AFF" },
];

export function AppNav({ active = "", hideAi = false }: { active?: string; hideAi?: boolean }) {
  const w = useViewportWidth();
  const { panel, setPanel, toggle, close } = useUiStore();
  const wallet = useWalletStore((s) => s.wallet);
  const connecting = useWalletStore((s) => s.connecting);
  const connect = useWalletStore((s) => s.connect);
  const disconnect = useWalletStore((s) => s.disconnect);
  const hydrate = useWalletStore((s) => s.hydrate);
  const [wrong, setWrong] = useState(false);

  useEffect(() => hydrate(), [hydrate]);

  useEffect(() => {
    const readNet = () => {
      try {
        return localStorage.getItem("oryvn.net") === "sepolia";
      } catch {
        return false;
      }
    };
    setWrong(readNet());
    const onNet = () => setWrong(readNet());
    window.addEventListener("oryvn-net", onNet);
    return () => window.removeEventListener("oryvn-net", onNet);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = ((e.target as HTMLElement)?.tagName || "").toLowerCase();
      if (((e.metaKey || e.ctrlKey) && e.key === "k") || (e.key === "/" && tag !== "input" && tag !== "textarea")) {
        e.preventDefault();
        setPanel("search");
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPanel, close]);

  // Close the wallet modal once a (simulated) connection completes.
  useEffect(() => {
    if (wallet && panel === "wallet") close();
  }, [wallet, panel, close]);

  const connected = !!wallet;
  const wide = w >= 1080;
  const tablet = w >= 760 && w < 1080;
  const mid = w >= 1240;
  const narrow = w < 760;

  const links: LinkDef[] = [
    ...(connected ? [{ key: "overview", label: "Overview", href: "/overview" }] : []),
    { key: "explore", label: "Explore", href: "/explore" },
    { key: "terminal", label: "Terminal", href: "/terminal" },
    { key: "launch", label: "Launch", href: "/launch" },
    { key: "portfolio", label: "Portfolio", href: "/portfolio" },
    { key: "intelligence", label: "Intelligence", href: "/intelligence" },
    { key: "activity", label: "Activity", href: "/activity" },
  ];

  const wLabel = connected ? (w < 520 ? "" : wallet) : w < 520 ? "Connect" : "Connect Wallet";
  const wPad = connected && w < 520 ? 8 : 16;

  const iconBtn: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.09)",
    background: "transparent",
    color: "#fff",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
  };

  return (
    <div style={{ fontFamily: "var(--font-geist-sans),system-ui,sans-serif", color: "#fff" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px clamp(14px,3vw,40px)", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(5,5,5,0.86)", backdropFilter: "blur(16px)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 600, fontSize: 16, letterSpacing: "-0.02em", flexShrink: 0, color: "#fff" }}>
          <span style={{ width: 20, height: 20, borderRadius: "50%", background: "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)" }} />
          <span>{BRAND}</span>
        </Link>

        {wide && (
          <nav style={{ display: "flex", gap: 2, fontSize: 14, fontWeight: 500, marginLeft: 12 }}>
            {links.map((l) => (
              <Link key={l.key} href={l.href} className="lp-navlink" style={{ padding: "8px 12px", borderRadius: 999, color: active === l.key ? "#fff" : "#A1A1A1", background: active === l.key ? "rgba(255,255,255,0.08)" : "transparent" }}>
                {l.label}
              </Link>
            ))}
          </nav>
        )}

        <div style={{ flex: 1 }} />

        <button onClick={() => setPanel("search")} aria-label="Search" className="lp-searchbtn" style={{ display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.09)", background: "#0d0d0d", color: "#A1A1A1", cursor: "pointer", fontSize: 13 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          {wide && (
            <span style={{ display: "flex", gap: 18, alignItems: "center" }}>
              Search
              <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 11, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "2px 6px" }}>⌘K</span>
            </span>
          )}
        </button>

        {tablet && (
          <div style={{ position: "relative" }}>
            <button onClick={() => toggle("links")} aria-label="Menu" className="lp-iconbtn" style={iconBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M4 8h16M4 16h16" />
              </svg>
            </button>
            {panel === "links" && (
              <div style={{ position: "absolute", right: 0, top: 50, width: 240, borderRadius: 22, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)", padding: 8, zIndex: 70, display: "flex", flexDirection: "column" }}>
                {links.map((l) => (
                  <Link key={l.key} href={l.href} onClick={close} className="lp-menu-item" style={{ padding: "12px 14px", borderRadius: 12, fontSize: 15, color: active === l.key ? "#fff" : "#A1A1A1", background: active === l.key ? "rgba(255,255,255,0.08)" : "transparent" }}>
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {mid && (
          <span style={{ display: "flex", alignItems: "center", gap: 7, height: 40, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.09)", fontSize: 13, color: "#A1A1A1", flexShrink: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#55D69A" }} />
            Starknet
          </span>
        )}

        <div style={{ position: "relative" }}>
          <button onClick={() => toggle("notif")} aria-label="Notifications" className="lp-iconbtn" style={{ ...iconBtn, position: "relative" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <span style={{ position: "absolute", top: 8, right: 9, width: 7, height: 7, borderRadius: "50%", background: "#FF9865" }} />
          </button>
          {panel === "notif" && (
            <div style={{ position: "absolute", right: 0, top: 50, width: "min(360px,calc(100vw - 28px))", borderRadius: 22, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)", padding: 10, zIndex: 70 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px 10px" }}>
                <span style={{ fontWeight: 600 }}>Notifications</span>
                <span style={{ fontSize: 11, color: "#F3B65F", textTransform: "uppercase", letterSpacing: "0.06em" }}>Preview</span>
              </div>
              {NOTIFS.map((n, i) => (
                <div key={i} className="lp-notif-item" style={{ display: "flex", gap: 12, padding: 10, borderRadius: 14 }}>
                  <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 11, background: n.bg }} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 13 }}>
                    <span>{n.text}</span>
                    <span style={{ color: "#696969", fontSize: 12 }}>{n.time}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: "relative" }}>
          <button onClick={() => (connected ? toggle("menu") : setPanel("wallet"))} className="lp-pressable" style={{ height: 40, padding: `0 ${wPad}px`, borderRadius: 999, border: connected ? "1px solid rgba(255,255,255,0.12)" : "0", cursor: "pointer", fontWeight: 600, fontSize: 14, color: connected ? "#fff" : "#1a0d05", background: connected ? "#101010" : "linear-gradient(90deg,#FF9865,#FFE3CF)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
            {connected && <span style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg,#F38FC4,#FF9865)" }} />}
            {wLabel}
          </button>
          {panel === "menu" && connected && (
            <div style={{ position: "absolute", right: 0, top: 50, width: 250, borderRadius: 22, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)", padding: 8, zIndex: 70, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 6 }}>
                <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 13 }}>{wallet}</span>
                <span style={{ fontSize: 12, color: "#A1A1A1" }}>248.50 STRK · preview</span>
              </div>
              {MENU.map((m) => (
                <Link key={m.key} href={m.href} onClick={close} className="lp-menu-item" style={{ padding: "10px 12px", borderRadius: 12, fontSize: 14, color: "#e4e4e4" }}>
                  {m.label}
                </Link>
              ))}
              <button onClick={() => setPanel("confirm")} className="lp-disconnect" style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, border: 0, background: "transparent", color: "#FF6868", fontSize: 14, cursor: "pointer" }}>
                Disconnect wallet
              </button>
            </div>
          )}
        </div>
      </header>

      {wrong && connected && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap", padding: "10px 16px", background: "#2a1a08", borderBottom: "1px solid rgba(243,182,95,0.35)", fontSize: 13, color: "#F3B65F" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F3B65F" }} />
            Your wallet is on Starknet Sepolia. Trading and launching need Starknet Mainnet.
          </span>
          <button
            onClick={() => {
              try {
                localStorage.removeItem("oryvn.net");
              } catch {
                /* ignore */
              }
              window.dispatchEvent(new Event("oryvn-net"));
            }}
            style={{ height: 30, padding: "0 14px", borderRadius: 999, border: 0, background: "#F3B65F", color: "#2a1a08", fontWeight: 600, cursor: "pointer", fontSize: 12 }}
          >
            Switch network
          </button>
        </div>
      )}

      {!hideAi && panel !== "ai" && (
        <button onClick={() => setPanel("ai")} aria-label="Ask AI" className="lp-aibtn" style={{ position: "fixed", right: 18, bottom: narrow ? 92 : 22, zIndex: 44, display: "flex", alignItems: "center", gap: 10, height: 50, padding: "0 18px 0 8px", borderRadius: 999, border: "1px solid rgba(182,154,255,0.4)", background: "rgba(16,16,16,0.92)", backdropFilter: "blur(12px)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />
          Ask AI
        </button>
      )}

      {panel === "ai" && <AiAssistant active={active} pad={narrow ? "0" : "18px"} onClose={close} />}

      {narrow && (
        <nav style={{ position: "fixed", left: 10, right: 10, bottom: 10, zIndex: 45, display: "grid", gridTemplateColumns: "repeat(5,1fr)", padding: 6, borderRadius: 24, background: "rgba(16,16,16,0.92)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.09)" }}>
          {MOBILE.map((l) => (
            <Link key={l.key} href={l.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 0", borderRadius: 18, fontSize: 11, color: active === l.key ? "#fff" : "#8a8a8a", background: active === l.key ? "rgba(255,255,255,0.07)" : "transparent" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: active === l.key ? l.dot : "#333" }} />
              {l.label}
            </Link>
          ))}
        </nav>
      )}

      {panel === "search" && <SearchModal onClose={close} />}

      {panel === "wallet" && (
        <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 14 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, borderRadius: 28, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Connect wallet</span>
              <button onClick={close} aria-label="Close" className="lp-close" style={{ width: 34, height: 34, borderRadius: "50%", border: 0, background: "#191919", color: "#fff", cursor: "pointer" }}>✕</button>
            </div>
            <span style={{ fontSize: 13, color: "#A1A1A1", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#55D69A" }} />
              Starknet Mainnet
            </span>
            {[
              { name: "Argent X", color: "linear-gradient(135deg,#FF9865,#FF7777)", initial: "A" },
              { name: "Braavos", color: "linear-gradient(135deg,#F3B65F,#FFE6BD)", initial: "B" },
            ].map((wlt) => (
              <button key={wlt.name} onClick={() => connect(wlt.name)} className="lp-walletopt" style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, border: "1px solid rgba(255,255,255,0.09)", background: "#141414", color: "#fff", cursor: "pointer", textAlign: "left" }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: wlt.color, display: "grid", placeItems: "center", fontWeight: 700, color: "#050505" }}>{wlt.initial}</span>
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{wlt.name}</span>
                  <span style={{ fontSize: 12, color: "#A1A1A1" }}>{connecting === wlt.name ? "Approve the connection in your wallet…" : "Browser extension"}</span>
                </span>
              </button>
            ))}
            <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5 }}>Preview: connection is simulated. Every transaction needs your approval in the wallet.</span>
          </div>
        </div>
      )}

      {panel === "confirm" && (
        <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 14 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, borderRadius: 26, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontSize: 20 }}>Disconnect wallet?</span>
            <span style={{ fontSize: 14, color: "#A1A1A1", lineHeight: 1.5 }}>You can keep browsing. Trading and launching need a connected wallet.</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button onClick={close} style={{ height: 46, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              <button onClick={() => { disconnect(); close(); }} style={{ height: 46, borderRadius: 14, border: 0, background: "#FF6868", color: "#050505", cursor: "pointer", fontWeight: 600 }}>Disconnect</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
