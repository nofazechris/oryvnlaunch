"use client";

import { useState } from "react";
import { siteAddress, walletAppLinks } from "@/lib/mobile";

const mono = "var(--font-geist-mono),monospace";

/**
 * Shown on a phone with no wallet on the page. A normal phone browser has none; the Starknet wallet apps each
 * have a built-in browser that does. So this gets the wallet app (two taps), then carries this site into it
 * (copy or share the link), rather than reporting that nothing was found.
 */
export function PhoneWalletGuide() {
  const [copied, setCopied] = useState(false);
  const address = typeof window === "undefined" ? "" : siteAddress(window.location.origin);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const apps = walletAppLinks(typeof navigator === "undefined" ? "" : navigator.userAgent);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the address is shown and selectable, so it can still be copied by hand */
    }
  }

  const label = (n: number, title: string) => (
    <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#d8d8d8", fontWeight: 600 }}>
      <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: "50%", background: "#1b1b1b", fontSize: 12, display: "grid", placeItems: "center" }}>{n}</span>
      {title}
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <span style={{ fontSize: 13, color: "#A1A1A1", lineHeight: 1.5 }}>
        On a phone, your wallet app is what connects. Get one, then open this site from inside it.
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {label(1, "Get a wallet app")}
        <div style={{ display: "flex", gap: 8 }}>
          {apps.map((a) => (
            <a key={a.name} href={a.href} target="_blank" rel="noopener noreferrer" className="lp-tap" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", height: 44, borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)", background: "#141414", color: "#fff", fontWeight: 600, fontSize: 14 }}>
              Get {a.name}
            </a>
          ))}
        </div>
        <span style={{ fontSize: 12, color: "#8a8a8a", lineHeight: 1.5 }}>Then switch it to Sepolia testnet in its settings.</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {label(2, "Take this site into the app")}
        <div style={{ padding: "12px 14px", borderRadius: 14, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)", fontFamily: mono, fontSize: 14, wordBreak: "break-all", userSelect: "all" }}>{address}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => void copy()} className="lp-tap" style={{ flex: 1, height: 44, borderRadius: 14, border: 0, background: "#fff", color: "#050505", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{copied ? "Copied" : "Copy link"}</button>
          {canShare && (
            <button type="button" onClick={() => void navigator.share({ title: "oryvnlaunch", url: address }).catch(() => undefined)} className="lp-tap" style={{ flex: 1, height: 44, borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Share</button>
          )}
        </div>
        <span style={{ fontSize: 12, color: "#8a8a8a", lineHeight: 1.5 }}>
          Open the wallet, go to its <b>Browser</b>, <b>Discover</b> or <b>dApps</b> tab, paste the link and go. Tap connect there and your wallet answers straight away.
        </span>
      </div>
    </div>
  );
}
