"use client";

import { useState } from "react";
import { siteAddress } from "@/lib/mobile";

const mono = "var(--font-geist-mono),monospace";

/**
 * What to do on a phone, where a wallet extension cannot be installed. A normal phone browser has no wallet; the
 * wallet apps each have their own built-in browser that does. So: open this site in there.
 */
export function PhoneWalletGuide() {
  const [copied, setCopied] = useState(false);
  const address = typeof window === "undefined" ? "" : siteAddress(window.location.origin);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the address is shown and selectable, so it can still be copied by hand */
    }
  }

  const step = (n: number, body: React.ReactNode) => (
    <li style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ width: 24, height: 24, flexShrink: 0, borderRadius: "50%", background: "#1b1b1b", color: "#d8d8d8", fontSize: 12, fontWeight: 600, display: "grid", placeItems: "center", marginTop: 1 }}>{n}</span>
      <span style={{ fontSize: 14, lineHeight: 1.5, color: "#d8d8d8" }}>{body}</span>
    </li>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 16 }}>Open this site in your wallet app</span>
        <span style={{ fontSize: 13, color: "#A1A1A1", lineHeight: 1.5 }}>A phone&apos;s normal browser can&apos;t talk to a Starknet wallet. Your wallet app has its own browser that can.</span>
      </div>

      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
        {step(1, <>Install a Starknet wallet app, such as <b>Ready</b> (formerly Argent) or <b>Braavos</b>, and switch it to <b>Sepolia testnet</b>.</>)}
        {step(2, <>Open the app&apos;s built-in browser. Look for <b>Browser</b>, <b>Discover</b> or <b>dApps</b>.</>)}
        {step(3, <>Paste this address there and open it:</>)}
      </ol>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ padding: "12px 14px", borderRadius: 14, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)", fontFamily: mono, fontSize: 14, wordBreak: "break-all", userSelect: "all" }}>{address}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => void copy()} className="lp-tap" style={{ flex: 1, height: 44, borderRadius: 14, border: 0, background: "#fff", color: "#050505", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{copied ? "Copied" : "Copy address"}</button>
          {canShare && (
            <button type="button" onClick={() => void navigator.share({ title: "oryvnlaunch", url: address }).catch(() => undefined)} className="lp-tap" style={{ flex: 1, height: 44, borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Share</button>
          )}
        </div>
      </div>

      <span style={{ fontSize: 12, color: "#8a8a8a", lineHeight: 1.5 }}>
        Wallet apps differ, and not every one has a browser. If yours doesn&apos;t, use a computer for now.
      </span>
    </div>
  );
}
