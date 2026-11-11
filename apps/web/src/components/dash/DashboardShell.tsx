"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useViewportWidth } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { useWalletStore } from "@/lib/wallet-store";
import { useUiStore } from "@/lib/ui-store";
import { SearchModal } from "@/components/app/SearchModal";
import { Icon } from "@/components/ui/Icons";

const ic = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const NAV = [
  { key: "overview", label: "Overview", href: "/overview", icon: ic(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>) },
  { key: "explore", label: "Explore", href: "/explore", icon: ic(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>) },
  { key: "launch", label: "Launch", href: "/launch", icon: ic(<path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z M12 7v6M9 10h6" />) },
  { key: "terminal", label: "Terminal", href: "/terminal", icon: ic(<path d="M4 17V7l6 5-6 5M12 19h8" />) },
  { key: "portfolio", label: "Portfolio", href: "/portfolio", icon: ic(<path d="M3 20V10M9 20V4M15 20v-7M21 20V8" />) },
  { key: "intelligence", label: "Intelligence", href: "/intelligence", icon: ic(<path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2zM9 21h6" />) },
  { key: "activity", label: "Activity", href: "/activity", icon: ic(<path d="M3 12h4l2 7 4-14 2 7h6" />) },
];
const BOTTOM = [{ key: "settings", label: "Settings", href: "/settings", icon: ic(<><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.3 1a7 7 0 0 0-1.7-1L14.5 2h-5l-.4 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.5L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7 7 0 0 0 1.7 1l.4 2.5h5l.4-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5a7 7 0 0 0 .1-1z" /></>) }];

const WALLETS = [
  { name: "Argent X", color: "linear-gradient(135deg,#FF9865,#FF7777)", initial: "A" },
  { name: "Braavos", color: "linear-gradient(135deg,#F3B65F,#FFE6BD)", initial: "B" },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const w = useViewportWidth();
  const router = useRouter();
  const pathname = usePathname();
  const authHydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const signOut = useAuthStore((s) => s.signOut);
  const wallet = useWalletStore((s) => s.wallet);
  const connecting = useWalletStore((s) => s.connecting);
  const connect = useWalletStore((s) => s.connect);
  const disconnect = useWalletStore((s) => s.disconnect);
  const hydrateWallet = useWalletStore((s) => s.hydrate);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState(false);
  // The wallet modal is driven by the shared UI store so any screen (Launch, Portfolio,
  // Token, Overview) can open it with setPanel("wallet").
  const panel = useUiStore((s) => s.panel);
  const setPanel = useUiStore((s) => s.setPanel);
  const walletModal = panel === "wallet";
  const setWalletModal = (open: boolean) => setPanel(open ? "wallet" : null);
  const [account, setAccount] = useState(false);
  const mounted = useRef(false);

  const isMobile = w < 900;

  useEffect(() => {
    hydrateAuth();
    hydrateWallet();
    try {
      setCollapsed(localStorage.getItem("oryvn.sidebar") === "1");
    } catch {
      /* ignore */
    }
    // Lets the Settings page change the sidebar preference live.
    const onSidebar = (e: Event) => setCollapsed(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener("oryvn-sidebar", onSidebar);
    mounted.current = true;
    return () => window.removeEventListener("oryvn-sidebar", onSidebar);
  }, [hydrateAuth, hydrateWallet]);

  useEffect(() => {
    if (authHydrated && !session) router.replace("/login");
  }, [authHydrated, session, router]);

  useEffect(() => {
    if (wallet && walletModal) setWalletModal(false);
  }, [wallet, walletModal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setSearch(true); }
      if (e.key === "Escape") { setSearch(false); setAccount(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleCollapse() {
    setCollapsed((c) => {
      try { localStorage.setItem("oryvn.sidebar", c ? "0" : "1"); } catch { /* ignore */ }
      return !c;
    });
  }

  if (!authHydrated || !session) {
    return (
      <div style={{ minHeight: "100vh", background: "#050505", display: "grid", placeItems: "center" }}>
        <span style={{ width: 34, height: 34, borderRadius: "50%", background: "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)", animation: "oc-spin 1.2s linear infinite" }} />
      </div>
    );
  }

  const connected = !!wallet;
  const needsWallet = session.method === "google" && !connected;
  const sidebarW = collapsed ? 74 : 236;
  const active = (href: string) => (href === "/overview" ? pathname === href : pathname === href || pathname.startsWith(href + "/"));
  const current = [...NAV, ...BOTTOM].find((n) => active(n.href));

  const navLink = (n: (typeof NAV)[number]) => {
    const on = active(n.href);
    return (
      <Link key={n.key} href={n.href} onClick={() => setMobileOpen(false)} title={n.label}
        style={{ display: "flex", alignItems: "center", gap: 12, height: 42, padding: collapsed && !isMobile ? "0" : "0 12px", justifyContent: collapsed && !isMobile ? "center" : "flex-start", borderRadius: 12, color: on ? "#fff" : "#8a8a8a", background: on ? "rgba(255,255,255,0.08)" : "transparent", fontSize: 14, fontWeight: 500 }}>
        <span style={{ flexShrink: 0, display: "grid", placeItems: "center", color: on ? "#fff" : "#8a8a8a" }}>{n.icon}</span>
        {(!collapsed || isMobile) && <span>{n.label}</span>}
      </Link>
    );
  };

  const sidebar = (
    <aside style={{ width: isMobile ? 236 : sidebarW, flexShrink: 0, background: "#070707", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", gap: 4, padding: "16px 12px", height: isMobile ? "100%" : "100vh", position: isMobile ? "fixed" : "sticky", top: 0, left: 0, zIndex: 60, transform: isMobile ? `translateX(${mobileOpen ? "0" : "-110%"})` : "none", transition: "transform .25s ease" }}>
      <Link href="/overview" onClick={() => setMobileOpen(false)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 14px", fontWeight: 600, fontSize: 16, letterSpacing: "-0.02em", justifyContent: collapsed && !isMobile ? "center" : "flex-start" }}>
        <span style={{ width: 24, height: 24, flexShrink: 0, borderRadius: "50%", background: "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)" }} />
        {(!collapsed || isMobile) && <span>oryvnlaunch</span>}
      </Link>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>{NAV.map(navLink)}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {BOTTOM.map(navLink)}
        {!isMobile && (
          <button onClick={toggleCollapse} title={collapsed ? "Expand" : "Collapse"} style={{ display: "flex", alignItems: "center", gap: 12, height: 42, padding: collapsed ? 0 : "0 12px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 12, border: 0, background: "transparent", color: "#8a8a8a", cursor: "pointer", fontSize: 14 }}>
            <span style={{ display: "grid", placeItems: "center" }}>{ic(<path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />)}</span>
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#050505", display: "flex" }}>
      {sidebar}
      {isMobile && mobileOpen && <div onClick={() => setMobileOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 55, background: "rgba(0,0,0,0.6)" }} />}

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <header style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", alignItems: "center", gap: 14, height: 64, padding: "0 clamp(14px,3vw,28px)", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(5,5,5,0.86)", backdropFilter: "blur(16px)" }}>
          {isMobile && (
            <button onClick={() => setMobileOpen(true)} aria-label="Menu" className="lp-iconbtn" style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}>{ic(<path d="M4 7h16M4 12h16M4 17h16" />)}</button>
          )}
          <span style={{ fontSize: 18, letterSpacing: "-0.02em", fontWeight: 500 }}>{current?.label ?? ""}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setSearch(true)} aria-label="Search" className="lp-searchbtn" style={{ display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.09)", background: "#0d0d0d", color: "#A1A1A1", cursor: "pointer", fontSize: 13 }}>
            {ic(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>)}
            {w >= 640 && <span style={{ display: "flex", gap: 16, alignItems: "center" }}>Search<span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 11, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "2px 6px" }}>⌘K</span></span>}
          </button>
          {connected ? (
            <span title={wallet ?? ""} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, height: 40, minWidth: 40, padding: w < 520 ? 0 : "0 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, fontFamily: "var(--font-geist-mono),monospace", whiteSpace: "nowrap", flexShrink: 0 }}>
              {w < 520 ? (
                <>
                  <Icon name="wallet" size={18} />
                  <span style={{ position: "absolute", top: 7, right: 7, width: 8, height: 8, borderRadius: "50%", background: "#55D69A", boxShadow: "0 0 0 2px #050505" }} />
                </>
              ) : (
                <>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#55D69A" }} />{wallet}
                </>
              )}
            </span>
          ) : (
            <button onClick={() => setWalletModal(true)} aria-label="Connect wallet" className="lp-bright" style={{ height: 40, minWidth: 40, padding: w < 520 ? 0 : "0 16px", borderRadius: 999, border: 0, cursor: "pointer", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", flexShrink: 0, color: "#1a0d05", background: "linear-gradient(90deg,#FF9865,#FFE3CF)", display: "grid", placeItems: "center" }}>
              {w < 520 ? <Icon name="wallet" size={18} /> : "Connect wallet"}
            </button>
          )}
          <div style={{ position: "relative" }}>
            <button onClick={() => setAccount((v) => !v)} aria-label="Account" style={{ width: 40, height: 40, borderRadius: "50%", border: 0, cursor: "pointer", background: session.method === "google" ? "linear-gradient(135deg,#73D9E8,#B69AFF)" : "linear-gradient(135deg,#F38FC4,#FF9865)", color: "#050505", fontWeight: 700, fontSize: 14, display: "grid", placeItems: "center" }}>
              {(session.email?.[0] ?? "W").toUpperCase()}
            </button>
            {account && (
              <div style={{ position: "absolute", right: 0, top: 50, width: 240, borderRadius: 18, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)", padding: 8, zIndex: 70 }}>
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 3, borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 6 }}>
                  <span style={{ fontSize: 13 }}>{session.method === "google" ? session.email : "Wallet account"}</span>
                  <span style={{ fontSize: 12, color: "#A1A1A1" }}>{connected ? wallet : "No wallet connected"}</span>
                </div>
                <Link href="/settings" onClick={() => setAccount(false)} className="lp-menu-item" style={{ display: "block", padding: "10px 12px", borderRadius: 12, fontSize: 14, color: "#e4e4e4" }}>Settings</Link>
                {connected && <button onClick={() => { disconnect(); setAccount(false); }} className="lp-menu-item" style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 12, border: 0, background: "transparent", color: "#e4e4e4", fontSize: 14, cursor: "pointer" }}>Disconnect wallet</button>}
                <button onClick={() => { signOut(); router.push("/login"); }} className="lp-disconnect" style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 12, border: 0, background: "transparent", color: "#FF6868", fontSize: 14, cursor: "pointer" }}>Sign out</button>
              </div>
            )}
          </div>
        </header>

        {needsWallet && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 14, padding: "10px 16px", background: "rgba(182,154,255,0.08)", borderBottom: "1px solid rgba(182,154,255,0.2)", fontSize: 13, color: "#d9ccff" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B69AFF" }} />Connect your wallet to launch and trade. Browsing and research don&apos;t need one.</span>
            <button onClick={() => setWalletModal(true)} style={{ height: 30, padding: "0 14px", borderRadius: 999, border: 0, background: "#B69AFF", color: "#1a0d05", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Connect wallet</button>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>

      {search && <SearchModal onClose={() => setSearch(false)} />}

      {walletModal && (
        <div onClick={() => setWalletModal(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 18 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, borderRadius: 28, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Connect wallet</span>
              <button onClick={() => setWalletModal(false)} aria-label="Close" className="lp-close" style={{ width: 34, height: 34, borderRadius: "50%", border: 0, background: "#191919", color: "#fff", cursor: "pointer" }}>✕</button>
            </div>
            <span style={{ fontSize: 13, color: "#A1A1A1", display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#55D69A" }} />Starknet Mainnet</span>
            {WALLETS.map((wl) => (
              <button key={wl.name} onClick={() => connect(wl.name)} className="lp-walletopt" style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, border: "1px solid rgba(255,255,255,0.09)", background: "#141414", color: "#fff", cursor: "pointer", textAlign: "left" }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: wl.color, display: "grid", placeItems: "center", fontWeight: 700, color: "#050505" }}>{wl.initial}</span>
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontWeight: 600, fontSize: 15 }}>{wl.name}</span><span style={{ fontSize: 12, color: "#A1A1A1" }}>{connecting === wl.name ? "Approve the connection in your wallet…" : "Browser extension"}</span></span>
              </button>
            ))}
            <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5 }}>Preview: connection is simulated. Every transaction needs your approval in the wallet.</span>
          </div>
        </div>
      )}
    </div>
  );
}
