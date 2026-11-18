"use client";

import { useEffect, useState } from "react";
import { walletIcon } from "@/lib/wallet-store";

/** The wallets' own logos, kept with the app so they show even when the extension is not installed. */
const LOGOS: Record<string, string> = {
  "Argent X": "/wallets/argent-x.png",
  Braavos: "/wallets/braavos.png",
};

/**
 * A wallet's logo for the connect buttons. A wallet we have the official logo for always shows it. For
 * any other wallet, the installed extension's own logo is used (extensions inject themselves a moment after
 * the page loads, so this looks again a few times). With nothing to draw it shows the lettered tile.
 */
export function WalletLogo({ name, color, initial, size = 40 }: { name: string; color: string; initial: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(LOGOS[name] ?? null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (LOGOS[name]) return;
    const look = () => setSrc((prev) => walletIcon(name) ?? prev);
    look();
    const timers = [400, 1200, 3000].map((ms) => setTimeout(look, ms));
    return () => timers.forEach(clearTimeout);
  }, [name]);

  const box = { width: size, height: size, borderRadius: size * 0.3, flexShrink: 0 } as const;
  if (src && !broken) {
    return (
      <span style={{ ...box, background: "#fff", display: "grid", placeItems: "center", overflow: "hidden", padding: size * 0.08, boxSizing: "border-box" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${name} logo`} width={size} height={size} onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      </span>
    );
  }
  return (
    <span style={{ ...box, background: color, display: "grid", placeItems: "center", fontWeight: 700, color: "#050505" }} aria-hidden="true">
      {initial}
    </span>
  );
}
