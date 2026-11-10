"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { useWalletStore } from "@/lib/wallet-store";
import { Contour } from "@/components/landing/Contour";

const WALLETS = [
  { name: "Argent X", color: "linear-gradient(135deg,#FF9865,#FF7777)", initial: "A" },
  { name: "Braavos", color: "linear-gradient(135deg,#F3B65F,#FFE6BD)", initial: "B" },
];

export default function LoginPage() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hydrate = useAuthStore((s) => s.hydrate);
  const signInGoogle = useAuthStore((s) => s.signInGoogle);
  const signInWallet = useAuthStore((s) => s.signInWallet);
  const connect = useWalletStore((s) => s.connect);
  const [showWallets, setShowWallets] = useState(false);

  useEffect(() => hydrate(), [hydrate]);
  useEffect(() => {
    if (hydrated && session) router.replace("/overview");
  }, [hydrated, session, router]);

  function google() {
    signInGoogle("you@gmail.com");
    router.push("/overview");
  }
  function wallet(name: string) {
    connect(name);
    signInWallet();
    router.push("/overview");
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
            <span style={{ fontSize: 14, color: "#A1A1A1", lineHeight: 1.5 }}>Create your account or sign in. It takes a few seconds.</span>
          </div>

          {!showWallets ? (
            <>
              <button onClick={google} className="lp-bright" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, height: 52, borderRadius: 16, border: 0, cursor: "pointer", fontWeight: 600, fontSize: 15, background: "#fff", color: "#1a1a1a" }}>
                <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.66z" /><path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.09A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.26A12 12 0 0 0 0 12c0 1.94.46 3.77 1.26 5.38l4.01-3.09z" /><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.26 6.62l4.01 3.09C6.22 6.86 8.87 4.75 12 4.75z" /></svg>
                Continue with Google
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#696969", fontSize: 12 }}>
                <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />or<span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
              </div>
              <button onClick={() => setShowWallets(true)} className="lp-walletopt" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, height: 52, borderRadius: 16, border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", fontWeight: 600, fontSize: 15, background: "#141414", color: "#fff" }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: "conic-gradient(from 200deg,#73D9E8,#B69AFF,#F38FC4,#FF9865,#73D9E8)" }} />
                Connect a wallet
              </button>
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#A1A1A1", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#55D69A" }} />Starknet Mainnet
              </span>
              {WALLETS.map((w) => (
                <button key={w.name} onClick={() => wallet(w.name)} className="lp-walletopt" style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,0.09)", background: "#141414", color: "#fff", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, background: w.color, display: "grid", placeItems: "center", fontWeight: 700, color: "#050505" }}>{w.initial}</span>
                  <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{w.name}</span>
                    <span style={{ fontSize: 12, color: "#A1A1A1" }}>Browser extension</span>
                  </span>
                </button>
              ))}
              <button onClick={() => setShowWallets(false)} style={{ alignSelf: "center", marginTop: 4, border: 0, background: "transparent", color: "#A1A1A1", cursor: "pointer", fontSize: 13 }}>← Back</button>
            </div>
          )}

          <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5, textAlign: "center" }}>
            Non-custodial — we never hold your funds or keys. Sign-in is simulated in this preview.
          </span>
        </div>

        <Link href="/" style={{ textAlign: "center", fontSize: 13, color: "#A1A1A1" }}>← Back to home</Link>
      </div>
    </main>
  );
}
