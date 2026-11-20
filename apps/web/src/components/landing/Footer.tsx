import Link from "next/link";

interface FooterProps {
  brand: string;
}

const PRODUCT = [
  { label: "Top launches", href: "#launches" },
  { label: "What you can launch", href: "#templates" },
  { label: "How it works", href: "#how" },
  { label: "AI & intelligence", href: "#ai" },
  { label: "Live activity", href: "#activity" },
];
const LEGAL = [
  { label: "Terms of use", href: "/terms" },
  { label: "Privacy policy", href: "/privacy" },
  { label: "Risk disclosure", href: "/risk" },
];

const COMMUNITY = [
  { label: "Telegram", href: "https://t.me/+_OTqwusKFXgyZjNk" },
  { label: "X (Twitter)", href: "https://x.com/oryvnlaunch" },
];

const head: React.CSSProperties = { color: "#696969", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" };

export function Footer({ brand }: FooterProps) {
  return (
    <footer style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(56px,7vw,96px) clamp(18px,5vw,72px) 40px", display: "flex", flexDirection: "column", gap: 40 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 40 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 320 }}>
          <a href="#" style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 20, letterSpacing: "-0.02em" }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)" }} />
            {brand}
          </a>
          <span style={{ color: "#A1A1A1", fontSize: 14, lineHeight: 1.6 }}>
            An AI-powered, non-custodial token launchpad on Starknet. Create, launch on a bonding curve and research with evidence.
          </span>
          <Link href="/login" className="lp-cta-primary" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", height: 44, padding: "0 20px", borderRadius: 999, background: "#fff", color: "#050505", fontWeight: 600, fontSize: 14 }}>
            Get started
          </Link>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(32px,6vw,96px)", fontSize: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={head}>Product</span>
            {PRODUCT.map((l) => (<a key={l.href} href={l.href}>{l.label}</a>))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={head}>Community</span>
            {COMMUNITY.map((l) => (<a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a>))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={head}>Legal</span>
            {LEGAL.map((l) => (<Link key={l.href} href={l.href}>{l.label}</Link>))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.09)", fontSize: 13, color: "#696969", lineHeight: 1.6 }}>
        <span style={{ maxWidth: 760 }}>
          Tokens are experimental and can lose all value. Nothing on this site is financial advice. oryvnlaunch is non-custodial and never holds your funds or keys.
        </span>
        <span>© {new Date().getFullYear()} {brand}</span>
      </div>
    </footer>
  );
}
