"use client";

import { useEffect } from "react";

interface WalletModalProps {
  connecting: string | null;
  onClose: () => void;
  onConnect: (name: string) => void;
}

const WALLETS = [
  { name: "Argent X", color: "linear-gradient(135deg,#FF9865,#FF7777)", initial: "A" },
  { name: "Braavos", color: "linear-gradient(135deg,#F3B65F,#FFE6BD)", initial: "B" },
];

export function WalletModal({ connecting, onClose, onConnect }: WalletModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Connect wallet"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 28,
          background: "#101010",
          border: "1px solid rgba(255,255,255,0.1)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          boxShadow: "0 40px 120px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Connect wallet</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="lp-close"
            style={{ width: 34, height: 34, borderRadius: "50%", border: 0, background: "#191919", color: "#fff", cursor: "pointer", fontSize: 16 }}
          >
            ✕
          </button>
        </div>
        <span style={{ fontSize: 13, color: "#A1A1A1", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#55D69A" }} />
          Starknet Mainnet
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {WALLETS.map((w) => (
            <button
              key={w.name}
              onClick={() => onConnect(w.name)}
              className="lp-walletopt"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: 14,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.09)",
                background: "#141414",
                color: "#fff",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ width: 40, height: 40, borderRadius: 12, background: w.color, display: "grid", placeItems: "center", fontWeight: 700, color: "#050505" }}>
                {w.initial}
              </span>
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{w.name}</span>
                <span style={{ fontSize: 12, color: "#A1A1A1" }}>
                  {connecting === w.name ? "Approve the connection in your wallet…" : "Browser extension"}
                </span>
              </span>
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5 }}>
          Preview: connection is simulated. You&apos;ll approve every transaction in your wallet.
        </span>
      </div>
    </div>
  );
}
