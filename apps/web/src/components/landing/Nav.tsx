"use client";

interface NavProps {
  brand: string;
  showNavLinks: boolean;
  showBurger: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onGetStarted: () => void;
  ctaLabel: string;
}

/** Marketing-page nav: on-page anchors only. Only "Get started" leads into the app. */
const LINKS = [
  { label: "Launches", href: "#launches" },
  { label: "How it works", href: "#how" },
  { label: "AI", href: "#ai" },
  { label: "Activity", href: "#activity" },
];

const linkStyle: React.CSSProperties = { padding: "8px 14px", borderRadius: 999 };

export function Nav({ brand, showNavLinks, showBurger, menuOpen, onToggleMenu, onGetStarted, ctaLabel }: NavProps) {
  return (
    <header style={{ position: "relative", zIndex: 10, maxWidth: 1440, margin: "0 auto", padding: "22px clamp(18px,5vw,72px) 0" }}>
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "10px 10px 10px 22px", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 999, background: "rgba(5,5,5,0.55)", backdropFilter: "blur(14px)" }}>
        <a href="#" style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 17, letterSpacing: "-0.02em" }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)" }} />
          <span>{brand}</span>
        </a>

        {showNavLinks && (
          <div style={{ display: "flex", gap: 6, fontSize: 14, fontWeight: 500 }}>
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="lp-link" style={linkStyle}>{l.label}</a>
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {showNavLinks && (
            <span style={{ display: "flex", alignItems: "center", gap: 7, height: 40, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.09)", fontSize: 13, color: "#A1A1A1" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#55D69A" }} />
              Starknet
            </span>
          )}

          {showBurger && (
            <button onClick={onToggleMenu} aria-label="Menu" className="lp-iconbtn" style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M4 8h16M4 16h16" /></svg>
            </button>
          )}

          <button onClick={onGetStarted} className="lp-wallet" style={{ height: 40, padding: "0 20px", borderRadius: 999, border: 0, cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", flexShrink: 0, color: "#1a0d05", background: "linear-gradient(90deg,#FF9865,#FFE3CF)" }}>
            {ctaLabel}
          </button>
        </div>
      </nav>

      {showBurger && menuOpen && (
        <div style={{ marginTop: 8, padding: 8, borderRadius: 24, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(10,10,10,0.95)", backdropFilter: "blur(14px)", display: "flex", flexDirection: "column" }}>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={onToggleMenu} style={{ padding: "14px 16px", borderRadius: 16, fontSize: 17 }}>{l.label}</a>
          ))}
        </div>
      )}
    </header>
  );
}
