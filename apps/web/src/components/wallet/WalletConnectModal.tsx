"use client";

import { useEffect, useRef, useState } from "react";
import { NETWORK, NETWORK_LABEL } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import { installedWallets, useWalletStore } from "@/lib/wallet-store";
import { WalletLogo } from "@/components/ui/WalletLogo";
import { looksLikePhone, walletPath } from "@/lib/mobile";
import { walletLabel, walletNote } from "@/lib/wallet-label";
import { PhoneWalletGuide } from "./PhoneWalletGuide";

const WALLETS = [
  { name: "Argent X", color: "linear-gradient(135deg,#FF9865,#FF7777)", initial: "A" },
  { name: "Braavos", color: "linear-gradient(135deg,#F3B65F,#FFE6BD)", initial: "B" },
];

const mono = "var(--font-geist-mono),monospace";

function Spinner({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <circle cx="22" cy="22" r="18" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
      <path d="M22 4a18 18 0 0 1 18 18" stroke="#fff" strokeWidth="4" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 22 22" to="360 22 22" dur="0.9s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

/**
 * Connect a wallet. While the extension is being asked it shows a loading state; the moment it answers it
 * shows a short "Connected" and closes by itself, so whatever the user was doing carries straight on.
 * If the wallet was already connected when this opened, it shows the account and a disconnect button instead.
 */
export function WalletConnectModal({ onClose }: { onClose: () => void }) {
  const wallet = useWalletStore((s) => s.wallet);
  const provider = useWalletStore((s) => s.provider);
  const connecting = useWalletStore((s) => s.connecting);
  const error = useWalletStore((s) => s.error);
  const connect = useWalletStore((s) => s.connect);
  const disconnect = useWalletStore((s) => s.disconnect);

  const wasConnected = useRef(!!wallet);
  const autoTried = useRef(false);
  const [done, setDone] = useState(false);

  // If only one wallet is installed there is nothing to choose: ask it straight away, so its window opens
  // the moment the user clicks "connect", like everywhere else. With two (or none), show the list.
  useEffect(() => {
    if (autoTried.current || wallet || connecting) return;
    autoTried.current = true;
    const installed = installedWallets();
    if (installed.length === 1) void connect(installed[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connected just now: show it for a beat, then get out of the way.
  useEffect(() => {
    if (!wallet || wasConnected.current) return;
    setDone(true);
    const id = setTimeout(onClose, 800);
    return () => clearTimeout(id);
  }, [wallet, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const showConnected = done || (!!wallet && wasConnected.current);
  // What this device can do: a phone with no wallet on the page cannot install an extension.
  const path = typeof window === "undefined" ? "choose" : walletPath({ phone: looksLikePhone(navigator.userAgent, navigator.maxTouchPoints ?? 0), installed: installedWallets() });
  const phone = typeof window !== "undefined" && looksLikePhone(navigator.userAgent, navigator.maxTouchPoints ?? 0);

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Connect wallet" style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, minHeight: 300, borderRadius: 28, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{showConnected ? (done ? "Connected" : "Wallet") : connecting ? "Connecting…" : "Connect wallet"}</span>
          <button onClick={onClose} aria-label="Close" className="lp-close" style={{ width: 34, height: 34, borderRadius: "50%", border: 0, background: "#191919", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>

        {done ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "20px 0" }}>
            <span style={{ width: 56, height: 56, borderRadius: "50%", background: "#55D69A", color: "#050505", display: "grid", placeItems: "center", fontSize: 28, fontWeight: 700 }}>✓</span>
            <span style={{ fontFamily: mono, fontSize: 14, color: "#d8d8d8" }}>{wallet ? shortAddr(wallet) : ""}</span>
          </div>
        ) : connecting ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "10px 0", textAlign: "center" }}>
            <Spinner />
            <span style={{ fontSize: 17 }}>Waiting for {walletLabel(connecting)}</span>
            <span style={{ fontSize: 13, color: "#A1A1A1", lineHeight: 1.6, maxWidth: 300 }}>Approve the connection in the {walletLabel(connecting)} window. If nothing opened, click the {walletLabel(connecting)} icon in your browser&apos;s toolbar.</span>
            <button onClick={onClose} style={{ marginTop: 4, border: 0, background: "transparent", color: "#A1A1A1", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
        ) : showConnected ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 13, color: "#A1A1A1", display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#55D69A" }} />{provider ? walletLabel(provider) : "Wallet"} · {NETWORK_LABEL[NETWORK]}</span>
            <div style={{ padding: 14, borderRadius: 18, background: "#0a0a0a", fontFamily: mono, fontSize: 13, wordBreak: "break-all" }}>{wallet}</div>
            <button onClick={() => { disconnect(); onClose(); }} className="lp-disconnect" style={{ height: 48, borderRadius: 14, border: "1px solid rgba(255,104,104,0.4)", background: "transparent", color: "#FF6868", cursor: "pointer", fontWeight: 600 }}>Disconnect wallet</button>
          </div>
        ) : (
          path === "open-in-wallet-app" ? (
            <PhoneWalletGuide />
          ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#A1A1A1", display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#55D69A" }} />{NETWORK_LABEL[NETWORK]}</span>
            {WALLETS.map((wl) => (
              <button key={wl.name} onClick={() => void connect(wl.name)} className="lp-walletopt" style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, border: "1px solid rgba(255,255,255,0.09)", background: "#141414", color: "#fff", cursor: "pointer", textAlign: "left" }}>
                <WalletLogo name={wl.name} color={wl.color} initial={wl.initial} />
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{walletLabel(wl.name)}</span>
                  <span style={{ fontSize: 12, color: "#A1A1A1" }}>{walletNote(wl.name, phone)}</span>
                </span>
              </button>
            ))}
            {error && <span style={{ fontSize: 13, color: "#FF6868", lineHeight: 1.5 }}>{error}</span>}
            {installedWallets().length === 0 && <span style={{ fontSize: 13, color: "#F3B65F", lineHeight: 1.5 }}>No wallet was found in this browser. Install Ready Wallet or Braavos, then reload this page.</span>}
          </div>
          )
        )}

        <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5, marginTop: "auto" }}>We only ever see your address. Every transaction needs your approval in the wallet.</span>
      </div>
    </div>
  );
}
