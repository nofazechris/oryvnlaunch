"use client";

import { useState } from "react";
import { FAUCET_URL } from "@/lib/mobile";
import { shortAddr } from "@/lib/format";

/**
 * Shown when a connected wallet is short of test STRK. Test tokens are free and worth nothing: the official
 * Starknet faucet sends them to an address. This puts the faucet one tap away, with the address to paste.
 */
export function FundsHelp({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the address is shown below, so it can still be copied by hand */
    }
  }

  return (
    <div role="note" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 16, background: "rgba(115,217,232,0.07)", border: "1px solid rgba(115,217,232,0.25)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 14, color: "#fff" }}>Need test STRK?</span>
        <span style={{ fontSize: 12, color: "#a8c8cf", lineHeight: 1.5 }}>It&apos;s free and has no real value: this is a test network. Open the faucet, paste your address, and it arrives within a minute or so.</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="lp-tap" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 42, padding: "0 16px", borderRadius: 999, background: "#fff", color: "#050505", fontWeight: 600, fontSize: 13 }}>Get free test STRK ↗</a>
        <button type="button" onClick={() => void copy()} className="lp-tap" style={{ height: 42, padding: "0 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "transparent", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{copied ? "Copied" : `Copy my address (${shortAddr(address)})`}</button>
      </div>
    </div>
  );
}
