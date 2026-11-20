"use client";

import Link from "next/link";
import { useAuthStore } from "@/lib/auth-store";
import { useWalletStore } from "@/lib/wallet-store";
import { useUiStore } from "@/lib/ui-store";
import { useActivity, useFeeAssets, useLaunches, usePolled, useStats, useStrkUsd, type Token } from "@/lib/useApi";
import { RPC_URL } from "@/lib/config";
import { balanceOf } from "@/lib/rpc";
import { STARTER_STRK } from "@/lib/mobile";
import { onboardingSteps } from "@/lib/onboarding";
import { usdOr } from "@/lib/format";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { Icon, IconTile, type IconName } from "@/components/ui/Icons";

const ACTIONS: { href: string; title: string; body: string; icon: IconName; from: string; to: string }[] = [
  { href: "/launch", title: "Launch a token", body: "Create and deploy on a bonding curve with AI help.", icon: "rocket", from: "#FF9865", to: "#FF5E3A" },
  { href: "/explore", title: "Explore tokens", body: "Discover launches ranked by real value.", icon: "search", from: "#73D9E8", to: "#568BFF" },
  { href: "/intelligence", title: "Research with AI", body: "Ask anything about a token, from on-chain data.", icon: "sparkles", from: "#B69AFF", to: "#F38FC4" },
  { href: "/terminal", title: "Open the terminal", body: "Trade on the curve with a live chart and order form.", icon: "curve", from: "#C7EA83", to: "#55D69A" },
];

function LaunchCard({ t, usd }: { t: Token; usd: number | null }) {
  const mono = "var(--font-geist-mono),monospace";
  return (
    <Link href={t.href} className="lp-explore-card" style={{ borderRadius: 20, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", padding: 16, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
        <TokenAvatar sym={t.addr} bg={t.bg} ink={t.ink} size={44} src={t.imageUrl} />
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
          <span style={{ fontSize: 12, color: "#696969" }}>${t.sym} · {t.age} ago</span>
        </span>
        <span style={{ fontFamily: mono, fontSize: 12, color: t.chgColor }}>{t.chgStr}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12 }}>
        <span style={{ color: "#696969" }}>Market cap</span>
        <span style={{ fontFamily: mono, fontSize: 13 }} title={`${t.mcapStr} ${t.quote.symbol}`}>{usdOr(t.mcap, t.quote.symbol, usd, `${t.mcapStr} ${t.quote.symbol}`)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ height: 6, borderRadius: 99, background: "#151515", overflow: "hidden" }}><div style={{ height: "100%", width: `${t.bond}%`, background: t.barBg, borderRadius: 99 }} /></div>
        <span style={{ fontSize: 11, color: "#696969" }}>{t.graduated ? "Graduated" : `${t.bond}% to graduation`}</span>
      </div>
    </Link>
  );
}

export function Overview() {
  const session = useAuthStore((s) => s.session);
  const wallet = useWalletStore((s) => s.wallet);
  const setPanel = useUiStore((s) => s.setPanel);
  const restoring = useWalletStore((s) => s.restoring);
  const connected = !!wallet;
  const stats = useStats();
  const launches = useLaunches({ sort: "newest" }, 10_000);
  const strkUsd = useStrkUsd();
  const everyone = launches.data?.tokens ?? [];
  const latest = everyone.slice(0, 6);
  // Asked of the API by wallet, not picked out of the newest list, so an older launch is never missed.
  const mineQ = useLaunches({ creator: wallet ?? undefined }, 10_000, !!wallet);
  const mine = wallet ? mineQ.data?.tokens ?? [] : [];
  // Does the wallet hold any test STRK yet? Read from the chain, so the step ticks itself after the faucet pays out.
  const feeAssets = useFeeAssets();
  const strkAddress = feeAssets.data?.find((a) => a.symbol === "STRK")?.address;
  const strk = usePolled((signal) => balanceOf(strkAddress!, wallet!, signal), wallet && strkAddress && RPC_URL ? `${wallet}:${strkAddress}` : null, 15_000);
  const myActivity = useActivity({ wallet: wallet ?? undefined, limit: 50 }, !!wallet, 10_000);
  const who = session?.method === "google" ? session.email : "there";

  const ICONS: Record<string, IconName> = { account: "check", wallet: "wallet", funds: "sparkles", launch: "rocket", trade: "curve" };
  const steps = onboardingSteps({
    connected,
    restoring,
    funded: connected ? (RPC_URL ? (strk.data !== undefined ? strk.data >= STARTER_STRK : null) : false) : null,
    launched: connected && mineQ.data ? mine.map((t) => ({ name: t.name, href: t.href })) : null,
    traded: connected && myActivity.data ? myActivity.data.some((e) => e.kind === "buy" || e.kind === "sell") : null,
  }).map((s) => ({ ...s, icon: ICONS[s.key] as IconName, action: s.connect ? () => setPanel("wallet") : undefined }));
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(28px,4vw,48px) clamp(18px,5vw,48px) 120px", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(34px,4.5vw,52px)", letterSpacing: "-0.04em", lineHeight: 1 }}>Welcome{session?.method === "google" ? "" : " back"}.</h1>
        <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, overflowWrap: "anywhere" }}>Signed in as {who}. Here&apos;s where you launch, trade and research.</p>
      </div>

      <div style={{ borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: "clamp(18px,2.5vw,26px)", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Get set up</span>
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#A1A1A1", fontFamily: "var(--font-geist-mono),monospace" }}>
            <span style={{ width: 80, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${(doneCount / steps.length) * 100}%`, background: "linear-gradient(90deg,#73D9E8,#B69AFF)", transition: "width .4s" }} />
            </span>
            {doneCount}/{steps.length}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 12 }}>
          {steps.map((s) => {
            const inner = (
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, borderRadius: 16, background: "#0d0d0d", border: `1px solid ${s.done ? "rgba(85,214,154,0.3)" : "rgba(255,255,255,0.08)"}`, height: "100%", textAlign: "left", width: "100%" }}>
                <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 12, display: "grid", placeItems: "center", background: s.done ? "rgba(85,214,154,0.14)" : "rgba(255,255,255,0.05)", color: s.done ? "#55D69A" : "#d0d0d0" }}>
                  <Icon name={s.icon} size={20} />
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span style={{ fontSize: 14, color: "#fff" }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: "#8a8a8a" }}>{s.hint}</span>
                </span>
              </div>
            );
            if (s.href && s.external) return <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="lp-explore-card" style={{ display: "block", borderRadius: 16 }}>{inner}</a>;
            if (s.href) return <Link key={s.label} href={s.href} className="lp-explore-card" style={{ display: "block", borderRadius: 16 }}>{inner}</Link>;
            if (s.action) return <button key={s.label} onClick={s.action} className="lp-explore-card" style={{ display: "block", padding: 0, border: 0, background: "transparent", color: "inherit", cursor: "pointer", borderRadius: 16 }}>{inner}</button>;
            return <div key={s.label}>{inner}</div>;
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Latest launches</span>
          {everyone.length > 0 && <Link href="/explore" className="lp-tap-link" style={{ fontSize: 13, color: "#A1A1A1" }}>See all {launches.data?.total ?? everyone.length} →</Link>}
        </div>
        {latest.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,260px),1fr))", gap: 14 }}>
            {latest.map((t) => <LaunchCard key={t.addr} t={t} usd={strkUsd} />)}
          </div>
        ) : (
          <div style={{ borderRadius: 22, border: "1px dashed rgba(255,255,255,0.14)", padding: "36px 20px", display: "flex", flexDirection: "column", gap: 10, alignItems: "center", textAlign: "center" }}>
            <span style={{ fontSize: 18 }}>{launches.error && !launches.data ? "Can't reach the data service" : launches.loading ? "Loading…" : "Nothing has launched yet"}</span>
            <span style={{ fontSize: 14, color: "#A1A1A1" }}>{launches.error && !launches.data ? "Launches will show here as soon as it is back." : "Be the first: launch a token and it appears here the moment it confirms."}</span>
            {!launches.loading && !launches.error && <Link href="/launch" style={{ marginTop: 4, height: 42, padding: "0 20px", borderRadius: 999, background: "#fff", color: "#050505", fontWeight: 600, display: "inline-flex", alignItems: "center" }}>Launch a token</Link>}
          </div>
        )}
      </div>

      {mine.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Your launches</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,260px),1fr))", gap: 14 }}>
            {mine.map((t) => <LaunchCard key={t.addr} t={t} usd={strkUsd} />)}
          </div>
          <span style={{ fontSize: 12, color: "#696969" }}>Open one to see your creator fees and claim them.</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Quick actions</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,250px),1fr))", gap: 14 }}>
          {ACTIONS.map((a) => (
            <Link key={a.href} href={a.href} className="lp-explore-card" style={{ borderRadius: 22, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", padding: 20, display: "flex", flexDirection: "column", gap: 18, minHeight: 170, justifyContent: "space-between" }}>
              <IconTile name={a.icon} from={a.from} to={a.to} size={50} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 18, letterSpacing: "-0.02em" }}>{a.title}</span>
                <span style={{ color: "#A1A1A1", fontSize: 14, lineHeight: 1.5 }}>{a.body}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>On the platform</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 1, borderRadius: 22, overflow: "hidden", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {[
            { k: "Launches", v: stats.data ? stats.data.launches.toLocaleString() : "—" },
            { k: "Graduated", v: stats.data ? stats.data.graduated.toLocaleString() : "—" },
            { k: "Trades", v: stats.data ? stats.data.trades.toLocaleString() : "—" },
            { k: "Wallets", v: stats.data ? stats.data.wallets.toLocaleString() : "—" },
          ].map((s) => (
            <div key={s.k} style={{ background: "#0b0b0b", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.k}</span>
              <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 22, letterSpacing: "-0.02em" }}>{s.v}</span>
            </div>
          ))}
        </div>
        {stats.error && !stats.data && <span style={{ fontSize: 12, color: "#F3B65F" }}>Can&apos;t reach the data service right now.</span>}
      </div>
    </main>
  );
}
