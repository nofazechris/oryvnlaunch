import Link from "next/link";

/**
 * Public stand-in for legal pages. It deliberately contains no invented legal text:
 * the real documents must be written and reviewed before launch.
 */
export function LegalPlaceholder({ title }: { title: string }) {
  return (
    <main style={{ minHeight: "100vh", background: "#050505", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 18, textAlign: "center", alignItems: "center" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 17, letterSpacing: "-0.02em" }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)" }} />
          oryvnlaunch
        </Link>
        <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(36px,6vw,56px)", letterSpacing: "-0.04em", lineHeight: 1 }}>{title}</h1>
        <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, lineHeight: 1.6 }}>
          This document is being finalized and will be published before launch.
        </p>
        <Link href="/" className="lp-cta-ghost" style={{ display: "inline-flex", alignItems: "center", height: 46, padding: "0 22px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", fontSize: 14 }}>
          Back to home
        </Link>
      </div>
    </main>
  );
}
