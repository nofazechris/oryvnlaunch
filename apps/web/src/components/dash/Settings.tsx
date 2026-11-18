"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { useWalletStore } from "@/lib/wallet-store";
import { useUiStore } from "@/lib/ui-store";
import { Icon, IconTile, type IconName } from "@/components/ui/Icons";

const mono = "var(--font-geist-mono),monospace";

function Section({ icon, from, to, title, children }: { icon: IconName; from: string; to: string; title: string; children: ReactNode }) {
  return (
    <section style={{ borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: "clamp(18px,2.5vw,26px)", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <IconTile name={icon} from={from} to={to} size={42} />
        <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>{title}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 14 }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: "#8a8a8a", lineHeight: 1.5, maxWidth: 440 }}>{hint}</span>}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#d0d0d0", minWidth: 0 }}>{children}</span>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} style={{ position: "relative", width: 46, height: 26, borderRadius: 999, border: 0, cursor: "pointer", background: on ? "linear-gradient(90deg,#73D9E8,#B69AFF)" : "#2a2a2a", transition: "background .2s", padding: 0, flexShrink: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left .2s", boxShadow: "0 2px 6px rgba(0,0,0,0.4)" }} />
    </button>
  );
}

const btn: React.CSSProperties = { height: 36, padding: "0 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#fff", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" };

export function Settings() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const wallet = useWalletStore((s) => s.wallet);
  const disconnect = useWalletStore((s) => s.disconnect);
  const setPanel = useUiStore((s) => s.setPanel);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("oryvn.sidebar") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const setSidebar = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem("oryvn.sidebar", v ? "1" : "0");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent("oryvn-sidebar", { detail: v }));
  };

  const connected = !!wallet;

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "clamp(28px,4vw,48px) clamp(18px,5vw,48px) 120px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 6 }}>
        <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(34px,4.5vw,52px)", letterSpacing: "-0.04em", lineHeight: 1 }}>Settings.</h1>
        <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16 }}>Your account, wallet and preferences.</p>
      </div>

      <Section icon="users" from="#73D9E8" to="#568BFF" title="Account">
        <Row label="Signed in with" hint={session?.method === "google" ? "Your Google account identifies you. A wallet is still needed to launch and trade." : "Your wallet is your account."}>
          <span style={{ overflowWrap: "anywhere" }}>{session?.method === "google" ? session.email : "Wallet"}</span>
        </Row>
        <Row label="Sign out" hint="You can sign back in any time. Nothing is stored on your behalf.">
          <button onClick={() => { signOut(); router.push("/login"); }} style={{ ...btn, color: "#FF6868", borderColor: "rgba(255,104,104,0.35)" }}>Sign out</button>
        </Row>
      </Section>

      <Section icon="wallet" from="#FF9865" to="#FF5E3A" title="Wallet">
        <Row label="Status" hint="Connect an Argent X or Braavos wallet. Every transaction still needs your approval in the wallet.">
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#55D69A" : "#696969" }} />
            {connected ? "Connected" : "Not connected"}
          </span>
        </Row>
        {connected && <Row label="Address"><span style={{ fontFamily: mono }}>{wallet}</span></Row>}
        <Row label="Network" hint="Starknet Sepolia testnet comes first, then mainnet."><span style={{ fontFamily: mono }}>Starknet</span></Row>
        <Row label={connected ? "Disconnect wallet" : "Connect wallet"}>
          {connected ? <button onClick={disconnect} style={btn}>Disconnect</button> : <button onClick={() => setPanel("wallet")} style={{ ...btn, background: "#fff", color: "#050505", border: 0, fontWeight: 600 }}>Connect</button>}
        </Row>
      </Section>

      <Section icon="layers" from="#B69AFF" to="#F38FC4" title="Preferences">
        <Row label="Collapse the sidebar" hint="Show icons only and give pages more room. Applies right away.">
          <Toggle on={collapsed} onChange={setSidebar} label="Collapse the sidebar" />
        </Row>
        <Row label="Animations" hint="oryvnlaunch follows your device's reduced-motion setting automatically.">
          <span style={{ color: "#8a8a8a" }}>Automatic</span>
        </Row>
      </Section>

      <Section icon="shield" from="#C7EA83" to="#55D69A" title="Safety">
        <Row label="Non-custodial" hint="We never hold your funds or keys, and we never ask for a seed phrase."><Icon name="check" size={18} color="#55D69A" /></Row>
        <Row label="AI can't act for you" hint="AI explains and researches from indexed data. It can't sign, trade or move funds, and it never gives a safety score."><Icon name="check" size={18} color="#55D69A" /></Row>
      </Section>

    </main>
  );
}
