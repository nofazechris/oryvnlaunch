"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { useWalletStore } from "@/lib/wallet-store";
import { useUiStore } from "@/lib/ui-store";
import { paletteFor } from "@/lib/art";
import { EXPLORER_URL } from "@/lib/config";
import { ago, amountLabel, compact, formatUnits, shortAddr, toNumber } from "@/lib/format";
import type { ApiAsset } from "@/lib/api";
import { useActivity, useLaunches, type Token } from "@/lib/useApi";
import { Contour } from "@/components/landing/Contour";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { AiOfflineNotice } from "@/components/ui/AiOfflineNotice";
import { ClaimFees } from "@/components/trade/ClaimFees";
import { explorerTx } from "@/lib/safe";

interface Position {
  addr: string;
  name: string;
  sym: string;
  quote: ApiAsset;
  /** Net tokens bought minus sold through the curve, in the token's smallest unit. */
  net: bigint;
  /** What the wallet paid in, and took out, in the quote asset's smallest unit. */
  spent: bigint;
  received: bigint;
  trades: number;
  token?: Token;
}

const mono = "var(--font-geist-mono),monospace";

export function Portfolio() {
  const w = useViewportWidth();
  const wallet = useWalletStore((s) => s.wallet);
  const hydrate = useWalletStore((s) => s.hydrate);
  const setPanel = useUiStore((s) => s.setPanel);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => hydrate(), [hydrate]);

  const connected = !!wallet;
  const wide = w >= 760;
  const feed = useActivity({ wallet: wallet ?? undefined, limit: 100 }, connected);
  const launches = useLaunches({ sort: "newest" }, 10_000);
  const events = useMemo(() => feed.data ?? [], [feed.data]);
  const byAddr = useMemo(() => new Map((launches.data?.tokens ?? []).map((t) => [t.addr, t])), [launches.data]);

  // Positions come from this wallet's own trades here. Tokens that arrived by a plain transfer are not
  // counted: that needs balance reads from the chain, which is a later step.
  const positions = useMemo(() => {
    const map = new Map<string, Position>();
    for (const e of events) {
      if (e.kind !== "buy" && e.kind !== "sell") continue;
      if (e.amount === null || e.tokenAmount === null) continue;
      const p = map.get(e.token) ?? { addr: e.token, name: e.name, sym: e.symbol, quote: e.quote, net: 0n, spent: 0n, received: 0n, trades: 0, token: byAddr.get(e.token) };
      if (e.kind === "buy") {
        p.net += BigInt(e.tokenAmount);
        p.spent += BigInt(e.amount);
      } else {
        p.net -= BigInt(e.tokenAmount);
        p.received += BigInt(e.amount);
      }
      p.trades += 1;
      map.set(e.token, p);
    }
    return [...map.values()].sort((a, b) => b.trades - a.trades);
  }, [events, byAddr]);

  const open = positions.filter((p) => p.net > 0n);
  const created = events.filter((e) => e.kind === "launch");
  const mine = useMemo(() => (launches.data?.tokens ?? []).filter((t) => !!wallet && t.creator.toLowerCase() === wallet.toLowerCase()), [launches.data, wallet]);
  const tradeCount = events.filter((e) => e.kind === "buy" || e.kind === "sell").length;

  // Totals are kept per quote asset: STRK and USDC are different units and are never added together.
  const totals = useMemo(() => {
    const m = new Map<string, { quote: ApiAsset; value: number; spent: bigint; received: bigint }>();
    for (const p of positions) {
      const key = p.quote.symbol ?? p.quote.address;
      const row = m.get(key) ?? { quote: p.quote, value: 0, spent: 0n, received: 0n };
      row.spent += p.spent;
      row.received += p.received;
      if (p.net > 0n && p.token) row.value += toNumber(p.net, 18) * p.token.price;
      m.set(key, row);
    }
    return [...m.values()];
  }, [positions]);

  async function summarise() {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/portfolio-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolio: {
            note: "Positions are derived from this wallet's trades on the platform only. Each token is valued in its own quote asset; do not add different assets together.",
            created: created.length,
            trades: tradeCount,
            positions: open.map((p) => ({ token: p.sym, asset: p.quote.symbol, tokensHeld: toNumber(p.net, 18), approxValue: p.token ? +(toNumber(p.net, 18) * p.token.price).toFixed(4) : null, bondingPct: p.token?.bond ?? null, change24hPct: p.token?.chg ?? null })),
          },
        }),
      });
      if (!res.ok) throw new Error("ai");
      const j = (await res.json()) as { text?: string };
      setAiText(j.text ?? "");
    } catch {
      setAiText("AI is unavailable right now.");
    } finally {
      setAiLoading(false);
    }
  }

  const hCols = wide ? "minmax(0,2fr) 1fr 1fr 1fr 1fr" : "minmax(0,1.6fr) 1fr 1fr";
  const down = !!feed.error && !feed.data;

  return (
    <main style={{ maxWidth: 1360, margin: "0 auto", padding: "clamp(36px,5vw,72px) clamp(18px,5vw,64px) 140px", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(44px,6vw,84px)", letterSpacing: "-0.045em", lineHeight: 0.95 }}>Your portfolio.</h1>
          <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16 }}>Your positions and activity on oryvnlaunch.</p>
        </div>
        {connected && <span style={{ fontSize: 12, color: "#696969", fontFamily: mono }}>{shortAddr(wallet!)}</span>}
      </div>

      {!connected ? (
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 32, border: "1px solid rgba(255,255,255,0.08)", background: "#090909", padding: "clamp(56px,9vw,120px) 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.7 }}>
            <Contour density={26} seed={31} opacity={0.09} />
          </div>
          <div style={{ position: "relative", display: "flex" }}>
            <span style={{ width: 64, height: 84, borderRadius: 18, background: "linear-gradient(150deg,#B7F0F5,#73D9E8)", transform: "rotate(-10deg)" }} />
            <span style={{ width: 64, height: 84, borderRadius: 18, background: "linear-gradient(150deg,#FFD2A8,#FF9865)", marginLeft: -18, transform: "translateY(-8px)" }} />
            <span style={{ width: 64, height: 84, borderRadius: 18, background: "linear-gradient(150deg,#F38FC4,#568BFF)", marginLeft: -18, transform: "rotate(10deg)" }} />
          </div>
          <span style={{ position: "relative", fontSize: "clamp(26px,3vw,36px)", letterSpacing: "-0.03em" }}>Connect to see your positions</span>
          <span style={{ position: "relative", color: "#A1A1A1", fontSize: 15, maxWidth: 400, lineHeight: 1.55 }}>We read your trades from Starknet. Nothing is stored until you choose to.</span>
          <button onClick={() => setPanel("wallet")} style={{ position: "relative", height: 50, padding: "0 26px", borderRadius: 999, border: 0, fontWeight: 600, fontSize: 15, color: "#1a0d05", background: "linear-gradient(90deg,#FF9865,#FFE3CF)", cursor: "pointer" }}>Connect Wallet</button>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 1, borderRadius: 28, overflow: "hidden", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {[{ k: "Open positions", v: String(open.length) }, { k: "Trades", v: String(tradeCount) }, { k: "Tokens launched", v: String(created.length) }].map((o) => (
              <div key={o.k} style={{ background: "#0b0b0b", padding: 22, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#696969" }}>{o.k}</span>
                <span style={{ fontFamily: mono, fontSize: 28, letterSpacing: "-0.02em" }}>{o.v}</span>
              </div>
            ))}
            {totals.map((row) => (
              <div key={row.quote.address} style={{ background: "#0b0b0b", padding: 22, display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#696969" }}>In {row.quote.symbol ?? "this asset"} (approx.)</span>
                <span style={{ fontFamily: mono, fontSize: 22, letterSpacing: "-0.02em" }}>{compact(row.value)} {row.quote.symbol}</span>
                <span style={{ fontSize: 11, color: "#5a5a5a" }}>
                  Paid in {row.quote.decimals === null ? "?" : formatUnits(row.spent, row.quote.decimals, 2)} · took out {row.quote.decimals === null ? "?" : formatUnits(row.received, row.quote.decimals, 2)}
                </span>
              </div>
            ))}
          </div>

          <div style={{ borderRadius: 28, border: "1px solid rgba(182,154,255,0.25)", background: "linear-gradient(160deg,rgba(182,154,255,0.1),rgba(5,5,5,0) 60%)", padding: "clamp(18px,2.5vw,26px)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 20, letterSpacing: "-0.02em" }}><span style={{ width: 30, height: 30, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />Your portfolio activity</span>
              <button onClick={summarise} disabled={open.length === 0} className="lp-send" style={{ height: 36, padding: "0 16px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: open.length === 0 ? "default" : "pointer", opacity: open.length === 0 ? 0.4 : 1, fontSize: 13 }}>{aiText ? "Refresh" : "Summarise"}</button>
            </div>
            <AiOfflineNotice />
            {aiLoading && (<div style={{ display: "flex", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B69AFF", animation: "oc-blink 1s infinite" }} /><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#73D9E8", animation: "oc-blink 1s .2s infinite" }} /><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F38FC4", animation: "oc-blink 1s .4s infinite" }} /></div>)}
            {aiText && !aiLoading && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "#e0e0e0", maxWidth: 880 }}>{aiText}</p>}
            {!aiText && !aiLoading && <span style={{ fontSize: 14, color: "#A1A1A1" }}>{open.length === 0 ? "Once you hold a token, the AI can summarise your positions in plain words." : "Ask for a plain-words summary of what you hold."}</span>}
            <span style={{ fontSize: 12, color: "#696969" }}>Observations only. Not investment advice.</span>
          </div>

          <div style={{ borderRadius: 28, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 22px 10px" }}><span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Holdings</span><span style={{ fontSize: 13, color: "#696969" }}>{open.length} tokens</span></div>
            <div style={{ display: "grid", gridTemplateColumns: hCols, gap: 12, padding: "10px 22px", fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span>Token</span><span style={{ textAlign: "right" }}>Balance</span><span style={{ textAlign: "right" }}>Value</span>
              {wide && <span style={{ textAlign: "right" }}>Paid in</span>}
              {wide && <span style={{ textAlign: "right" }}>Took out</span>}
            </div>
            {open.map((x) => {
              const [primary, light, ink] = paletteFor(x.addr);
              const dec = x.quote.decimals ?? 18;
              const value = x.token ? toNumber(x.net, 18) * x.token.price : null;
              return (
                <Link key={x.addr} href={`/token?t=${x.addr}`} className="lp-list-row" style={{ display: "grid", gridTemplateColumns: hCols, gap: 12, alignItems: "center", padding: "12px 22px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                    <TokenAvatar sym={x.addr} bg={`linear-gradient(150deg, ${light}, ${primary})`} ink={ink} size={44} src={byAddr.get(x.addr)?.imageUrl} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.name}</span><span style={{ fontSize: 12, color: "#696969" }}>${x.sym}</span></span>
                  </span>
                  <span style={{ textAlign: "right", fontFamily: mono, fontSize: 13 }}>{compact(toNumber(x.net, 18))}</span>
                  <span style={{ textAlign: "right", fontFamily: mono, fontSize: 13 }}>{value === null ? "—" : `${compact(value)} ${x.quote.symbol}`}</span>
                  {wide && <span style={{ textAlign: "right", fontFamily: mono, fontSize: 13, color: "#A1A1A1" }}>{formatUnits(x.spent, dec, 2)}</span>}
                  {wide && <span style={{ textAlign: "right", fontFamily: mono, fontSize: 13, color: "#A1A1A1" }}>{formatUnits(x.received, dec, 2)}</span>}
                </Link>
              );
            })}
            {open.length === 0 && (
              <div style={{ padding: "48px 22px", textAlign: "center", color: "#A1A1A1", fontSize: 14, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                {down ? "Can't reach the data service." : feed.loading ? "Loading…" : "No open positions yet. Buy a token from Explore and it shows up here."}
              </div>
            )}
            <div style={{ padding: "12px 22px 16px", fontSize: 11, color: "#5a5a5a", lineHeight: 1.5 }}>
              Built from your own buys and sells here. Tokens that reached your wallet by transfer are not counted until on-chain balance reads ship.
            </div>
          </div>

          {mine.length > 0 && (
            <div style={{ borderRadius: 28, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
              <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Tokens you launched</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 12 }}>
                {mine.map((t) => (
                  <div key={t.addr} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <Link href={t.href} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <TokenAvatar sym={t.addr} bg={t.bg} ink={t.ink} size={40} src={t.imageUrl} />
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontWeight: 600 }}>{t.name}</span><span style={{ fontSize: 12, color: "#696969" }}>${t.sym}</span></span>
                    </Link>
                    <ClaimFees t={t} compact />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderRadius: 28, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 12px 8px" }}><span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Recent activity</span><Link href="/activity" style={{ fontSize: 13, color: "#A1A1A1" }}>See all →</Link></div>
            {events.slice(0, 6).map((a, i) => {
              const [primary, light, ink] = paletteFor(a.token);
              const title = a.kind === "launch" ? `Created ${a.name}` : a.kind === "buy" ? `Bought ${a.symbol}` : a.kind === "sell" ? `Sold ${a.symbol}` : `${a.name} graduated`;
              const sign = a.kind === "buy" || a.kind === "launch" ? "−" : "+";
              const url = explorerTx(a.txHash) ?? undefined;
              return (
                <a key={`${a.txHash ?? a.kind}-${i}`} href={url} target={url ? "_blank" : undefined} rel="noreferrer" className="lp-list-row" style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 14 }}>
                  <TokenAvatar sym={a.token} bg={`linear-gradient(150deg, ${light}, ${primary})`} ink={ink} size={40} radius={12} src={byAddr.get(a.token)?.imageUrl} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}><span style={{ fontSize: 14 }}>{title}</span><span style={{ fontSize: 12, color: "#696969" }}>{ago(a.time)}</span></span>
                  <span style={{ fontFamily: mono, fontSize: 13, color: a.kind === "sell" ? "#55D69A" : "#A1A1A1" }}>{a.amount === null ? "" : `${sign}${amountLabel(a.amount, a.quote)}`}</span>
                </a>
              );
            })}
            {events.length === 0 && <div style={{ padding: "32px 12px", textAlign: "center", color: "#A1A1A1", fontSize: 14 }}>{down ? "Can't reach the data service." : feed.loading ? "Loading…" : "Nothing yet."}</div>}
          </div>
        </>
      )}
    </main>
  );
}
