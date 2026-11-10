import Link from "next/link";

export function ComingSoon({ name }: { name: string }) {
  const title = name ? name.charAt(0).toUpperCase() + name.slice(1) : "This page";
  return (
    <main style={{ maxWidth: 1360, margin: "0 auto", padding: "clamp(60px,10vw,140px) clamp(18px,5vw,64px)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 20 }}>
      <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#B69AFF" }}>Coming soon</span>
      <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(40px,6vw,80px)", letterSpacing: "-0.04em", lineHeight: 1 }}>{title}</h1>
      <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, maxWidth: 440, lineHeight: 1.6 }}>
        This screen is part of the launchpad and is being built. The Launch studio is ready to try now.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <Link href="/launch" className="lp-cta-primary" style={{ display: "inline-flex", alignItems: "center", height: 48, padding: "0 24px", borderRadius: 999, background: "#fff", color: "#050505", fontWeight: 600, fontSize: 15 }}>
          Launch a Token
        </Link>
        <Link href="/" className="lp-cta-ghost" style={{ display: "inline-flex", alignItems: "center", height: 48, padding: "0 24px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", fontWeight: 500, fontSize: 15 }}>
          Back to home
        </Link>
      </div>
    </main>
  );
}
