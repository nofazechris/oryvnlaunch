"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { useWalletStore } from "@/lib/wallet-store";
import { NETWORK, NETWORK_LABEL } from "@/lib/config";
import { Contour } from "@/components/landing/Contour";
import { WalletLogo } from "@/components/ui/WalletLogo";

const WALLETS = [
  { name: "Argent X", color: "linear-gradient(135deg,#FF9865,#FF7777)", initial: "A" },
  { name: "Braavos", color: "linear-gradient(135deg,#F3B65F,#FFE6BD)", initial: "B" },
];

export default function LoginPage() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const signInWallet = useAuthStore((s) => s.signInWallet);
  const connect = useWalletStore((s) => s.connect);
  const connecting = useWalletStore((s) => s.connecting);
  const error = useWalletStore((s) => s.error);

  useEffect(() => hydrate(), [hydrate]);
  useEffect(() => {
    if (hydrated && session) router.replace("/overview");
  }, [hydrated, session, router]);

  async function wallet(name: string) {
    await connect(name);
    if (useWalletStore.getState().wallet) {
      signInWallet();
      router.push("/overview");
    }
  }

  return (
    <main style={{ position: "relative", minHeight: "100vh", background: "#050505", display: "grid", placeItems: "center", padding: 20, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.6 }}>
        <Contour density={40} seed={3} opacity={0.12} />
      </div>

      <div style={{ position: "relative", width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 24 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 17, letterSpacing: "-0.02em", justifyContent: "center" }}>
          <span style={{ width: 24, height: 24, borderRadius: "50%", background: "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)" }} />
          oryvnlaunch
        </Link>

        <div style={{ borderRadius: 28, background: "rgba(16,16,16,0.85)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.1)", padding: 28, display: "flex", flexDirection: "column", gap: 18, boxShadow: "0 40px 120px rgba(0,0,0,0.6)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "center" }}>
            <span style={{ fontSize: "clamp(26px,4vw,32px)", letterSpacing: "-0.03em" }}>Get started</span>
            <span style={{ fontSize: 14, color: "#A1A1A1", lineHeight: 1.5 }}>Connect your Starknet wallet to launch, trade and research.</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#A1A1A1", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#55D69A" }} />{NETWORK_LABEL[NETWORK]}
            </span>
            {WALLETS.map((w) => (
              <button key={w.name} onClick={() => void wallet(w.name)} disabled={!!connecting} className="lp-walletopt" style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,0.09)", background: "#141414", color: "#fff", cursor: connecting ? "default" : "pointer", textAlign: "left", opacity: connecting && connecting !== w.name ? 0.5 : 1 }}>
                <WalletLogo name={w.name} color={w.color} initial={w.initial} />
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{w.name}</span>
                  <span style={{ fontSize: 12, color: "#A1A1A1" }}>{connecting === w.name ? "Approve the connection in your wallet…" : "Browser extension"}</span>
                </span>
                {connecting === w.name && (
                  <svg width="22" height="22" viewBox="0 0 44 44" fill="none" aria-hidden="true">
                    <circle cx="22" cy="22" r="18" stroke="rgba(255,255,255,0.12)" strokeWidth="4" />
                    <path d="M22 4a18 18 0 0 1 18 18" stroke="#fff" strokeWidth="4" strokeLinecap="round">
                      <animateTransform attributeName="transform" type="rotate" from="0 22 22" to="360 22 22" dur="0.9s" repeatCount="indefinite" />
                    </path>
                  </svg>
                )}
              </button>
            ))}
            {error && <span style={{ fontSize: 13, color: "#FF6868", lineHeight: 1.5 }}>{error}</span>}
          </div>

          <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5, textAlign: "center" }}>
            Non-custodial: we only ever see your address, never your keys. Your wallet is your account.
          </span>
        </div>

        <Link href="/" style={{ textAlign: "center", fontSize: 13, color: "#A1A1A1" }}>← Back to home</Link>
      </div>
    </main>
  );
}
