"use client";

import Link from "next/link";

interface NavProps {
  brand: string;
  showNavLinks: boolean;
  showBurger: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSearch: () => void;
  onOpenWallet: () => void;
  walletLabel: string;
}

const linkStyle: React.CSSProperties = { padding: "8px 14px", borderRadius: 999 };

export function Nav({
  brand,
  showNavLinks,
  showBurger,
  menuOpen,
  onToggleMenu,
  onSearch,
  onOpenWallet,
  walletLabel,
}: NavProps) {
  return (
    <header
      style={{
        position: "relative",
        zIndex: 10,
        maxWidth: 1440,
        margin: "0 auto",
        padding: "22px clamp(18px,5vw,72px) 0",
      }}
    >
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          padding: "10px 10px 10px 22px",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 999,
          background: "rgba(5,5,5,0.55)",
          backdropFilter: "blur(14px)",
        }}
      >
        <a
          href="#"
          style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 17, letterSpacing: "-0.02em" }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)",
            }}
          />
          <span>{brand}</span>
        </a>

        {showNavLinks && (
          <div style={{ display: "flex", gap: 6, fontSize: 14, fontWeight: 500 }}>
            <Link href="/explore" className="lp-link" style={linkStyle}>Explore</Link>
            <Link href="/launch" className="lp-link" style={linkStyle}>Launch</Link>
            <a href="#ai" className="lp-link" style={linkStyle}>Intelligence</a>
            <Link href="/activity" className="lp-link" style={linkStyle}>Activity</Link>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={onSearch}
            aria-label="Search"
            className="lp-iconbtn"
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.09)",
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>

          {showNavLinks && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 40,
                padding: "0 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.09)",
                fontSize: 13,
                color: "#A1A1A1",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#55D69A" }} />
              Starknet
            </span>
          )}

          {showBurger && (
            <button
              onClick={onToggleMenu}
              aria-label="Menu"
              className="lp-iconbtn"
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.09)",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M4 8h16M4 16h16" />
              </svg>
            </button>
          )}

          <button
            onClick={onOpenWallet}
            className="lp-wallet"
            style={{
              height: 40,
              padding: "0 20px",
              borderRadius: 999,
              border: 0,
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
              color: "#1a0d05",
              background: "linear-gradient(90deg,#FF9865,#FFE3CF)",
            }}
          >
            {walletLabel}
          </button>
        </div>
      </nav>

      {showBurger && menuOpen && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.09)",
            background: "rgba(10,10,10,0.95)",
            backdropFilter: "blur(14px)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {[
            { label: "Explore", href: "/explore" },
            { label: "Launch", href: "/launch" },
            { label: "Terminal", href: "/terminal" },
            { label: "Intelligence", href: "#ai" },
            { label: "Activity", href: "/activity" },
          ].map((l) =>
            l.href.startsWith("/") ? (
              <Link key={l.label} href={l.href} style={{ padding: "14px 16px", borderRadius: 16, fontSize: 17 }}>
                {l.label}
              </Link>
            ) : (
              <a key={l.label} href={l.href} style={{ padding: "14px 16px", borderRadius: 16, fontSize: 17 }}>
                {l.label}
              </a>
            )
          )}
        </div>
      )}
    </header>
  );
}
