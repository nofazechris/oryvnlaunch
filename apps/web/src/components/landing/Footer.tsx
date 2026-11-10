interface FooterProps {
  brand: string;
}

const COLS: { head: string; links: string[] }[] = [
  { head: "Product", links: ["Explore", "Launch", "Intelligence", "Terminal"] },
  { head: "Resources", links: ["Documentation", "Components", "Starknet explorer", "Contact"] },
  { head: "Social", links: ["X", "Telegram", "Discord"] },
];

export function Footer({ brand }: FooterProps) {
  return (
    <footer
      style={{
        maxWidth: 1440,
        margin: "0 auto",
        padding: "clamp(56px,7vw,96px) clamp(18px,5vw,72px) 40px",
        display: "flex",
        flexDirection: "column",
        gap: 40,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 32 }}>
        <a href="#" style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 20, letterSpacing: "-0.02em" }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)" }} />
          {brand}
        </a>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(32px,6vw,96px)", fontSize: 14 }}>
          {COLS.map((col) => (
            <div key={col.head} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ color: "#696969", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>{col.head}</span>
              {col.links.map((l) => (
                <a key={l} href="#">{l}</a>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 12,
          paddingTop: 24,
          borderTop: "1px solid rgba(255,255,255,0.09)",
          fontSize: 13,
          color: "#696969",
        }}
      >
        <span>Built on Starknet. Tokens are experimental and can lose all value.</span>
        <div style={{ display: "flex", gap: 20 }}>
          <a href="#" style={{ color: "#A1A1A1" }}>Terms</a>
          <a href="#" style={{ color: "#A1A1A1" }}>Privacy</a>
        </div>
      </div>
    </footer>
  );
}
