"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { useWalletStore } from "@/lib/wallet-store";
import { useUiStore } from "@/lib/ui-store";
import { ME, TOKENS, activity, ago, bySym, fmtK, fmtP, hash, rng, view } from "@/lib/oryvn-data";
import { Contour } from "@/components/landing/Contour";

const RANGES = ["24H", "7D", "30D", "ALL"];
const RANGE_N: Record<string, number> = { "24H": 24, "7D": 42, "30D": 60, ALL: 80 };
const RANGE_START: Record<string, number> = { "24H": 0.95, "7D": 0.82, "30D": 0.6, ALL: 0.35 };

function PortfolioChart({ series }: { series: number[] }) {
  const gid = useId();
  const line = `${gid}-l`;
  const fill = `${gid}-f`;
  const n = series.length;
  const lo = Math.min(...series) * 0.97;
  const hi = Math.max(...series) * 1.01;
  const span = hi - lo || 1;
  const W = 800;
  const CH = 220;
  const pts = series.map((y, i) => [(i / (n - 1)) * W, ((hi - y) / span) * CH] as const);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${CH}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <linearGradient id={line} x1="0" x2="1">
          <stop offset="0" stopColor="#73D9E8" />
          <stop offset="0.5" stopColor="#B69AFF" />
          <stop offset="1" stopColor="#F38FC4" />
        </linearGradient>
        <linearGradient id={fill} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#B69AFF" stopOpacity={0.22} />
          <stop offset="1" stopColor="#B69AFF" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${CH} L0,${CH} Z`} fill={`url(#${fill})`} />
      <path d={d} fill="none" stroke={`url(#${line})`} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Portfolio() {
  const w = useViewportWidth();
  const wallet = useWalletStore((s) => s.wallet);
  const hydrate = useWalletStore((s) => s.hydrate);
  const setPanel = useUiStore((s) => s.setPanel);
  const [range, setRange] = useState("7D");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => hydrate(), [hydrate]);

  const connected = !!wallet;
  const mono = "var(--font-geist-mono),monospace";
  const wide = w >= 760;

  // Positions (independent of range)
  const H = useMemo(
    () =>
      ME.holdings
        .map((x) => {
          const i = bySym(x.sym);
          const t = view(TOKENS[i]!, i);
          return { ...t, q: x.qty, value: x.qty * t.price, cost: x.qty * x.avg, avgP: x.avg };
        })
        .sort((a, b) => b.value - a.value),
    []
  );
  const tv = H.reduce((a, b) => a + b.value, 0) + ME.strk;
  const cost = H.reduce((a, b) => a + b.cost, 0);
  const upnl = H.reduce((a, b) => a + b.value - b.cost, 0);

  const series = useMemo(() => {
    const n = RANGE_N[range]!;
    const r = rng(hash(range));
    const arr: number[] = [];
    let v = tv * RANGE_START[range]!;
    for (let i = 0; i < n; i++) {
      v *= 1 + (r() - 0.45) * 0.06;
      arr.push(v);
    }
    const k = tv / arr[n - 1]!;
    return arr.map((x) => x * k);
  }, [range, tv]);
  const chg = ((tv - series[0]!) / series[0]!) * 100;

  const big = H[0]!;
  const conc = (big.value / (tv - ME.strk)) * 100;
  const mover = H.slice().sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))[0]!;

  const acts = useMemo(
    () =>
      activity(14, 77)
        .filter((a) => ME.holdings.some((x) => x.sym === a.sym) || a.kind === "Launch")
        .slice(0, 6)
        .map((a) => {
          const tk = TOKENS[bySym(a.sym)]!;
          return {
            bg: `linear-gradient(150deg, ${tk.g[1]}, ${tk.g[0]})`,
            title: a.kind === "Launch" ? `Created ${tk.name}` : `${a.kind === "Buy" ? "Bought" : "Sold"} ${tk.sym}`,
            time: ago(a.t * 30),
            amt: a.kind === "Launch" ? "−10 STRK" : `${a.kind === "Buy" ? "−" : "+"}${a.strk} STRK`,
            color: a.kind === "Sell" ? "#55D69A" : "#A1A1A1",
          };
        }),
    []
  );

  const overview = [
    { k: "Total invested", v: cost.toFixed(2), note: "STRK, from on-chain buys", color: "#fff" },
    { k: "Unrealised P/L", v: (upnl >= 0 ? "+" : "") + upnl.toFixed(2), note: "STRK at curve price", color: upnl >= 0 ? "#55D69A" : "#FF6868" },
    { k: "Realised P/L", v: "+4.82", note: "STRK, from 3 sells", color: "#55D69A" },
    { k: "Holdings", v: String(H.length), note: "+ " + ME.strk + " STRK idle", color: "#fff" },
  ];
  const insights = [
    { k: "Biggest position", v: `${big.name} · ${big.value.toFixed(1)} STRK` },
    { k: "Largest 24h move", v: `${mover.sym} ${mover.chgStr}` },
    { k: "Concentration", v: `${conc.toFixed(0)}% in one token` },
    { k: "Notable", v: `${big.sym} bonding at ${big.bond}%` },
  ];

  async function summarise() {
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/portfolio-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio: { totalSTRK: +tv.toFixed(2), idleSTRK: ME.strk, positions: H.map((x) => ({ t: x.sym, valueSTRK: +x.value.toFixed(2), costSTRK: +x.cost.toFixed(2), chg24h: x.chg, bonding: x.bond })) } }),
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
  const heroSpan = w >= 1100 ? "span 2" : "auto";

  return (
    <main style={{ maxWidth: 1360, margin: "0 auto", padding: "clamp(36px,5vw,72px) clamp(18px,5vw,64px) 140px", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(44px,6vw,84px)", letterSpacing: "-0.045em", lineHeight: 0.95 }}>Your portfolio.</h1>
          <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16 }}>Track your positions and activity across Starknet.</p>
        </div>
        {connected && <span style={{ fontSize: 11, color: "#F3B65F", letterSpacing: "0.06em", textTransform: "uppercase" }}>Preview wallet · {wallet}</span>}
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
          <span style={{ position: "relative", color: "#A1A1A1", fontSize: 15, maxWidth: 400, lineHeight: 1.55 }}>We read balances straight from Starknet. Nothing is stored until you choose to.</span>
          <button onClick={() => setPanel("wallet")} style={{ position: "relative", height: 50, padding: "0 26px", borderRadius: 999, border: 0, fontWeight: 600, fontSize: 15, color: "#1a0d05", background: "linear-gradient(90deg,#FF9865,#FFE3CF)", cursor: "pointer" }}>Connect Wallet</button>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))", gap: 16 }}>
            <div style={{ gridColumn: heroSpan, borderRadius: 28, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: "clamp(20px,2.5vw,28px)", display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 13, color: "#A1A1A1" }}>Total value</span>
                  <span style={{ fontFamily: mono, fontSize: "clamp(36px,4.6vw,60px)", letterSpacing: "-0.04em", lineHeight: 1 }}>{tv.toFixed(2)} STRK</span>
                  <span style={{ fontFamily: mono, fontSize: 14, color: chg >= 0 ? "#55D69A" : "#FF6868" }}>{chg >= 0 ? "+" : ""}{chg.toFixed(2)}% · {range}</span>
                </div>
                <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 12, background: "#141414" }}>
                  {RANGES.map((x) => (<button key={x} onClick={() => setRange(x)} style={{ height: 30, padding: "0 12px", borderRadius: 9, border: 0, cursor: "pointer", fontFamily: mono, fontSize: 12, background: range === x ? "#fff" : "transparent", color: range === x ? "#050505" : "#A1A1A1" }}>{x}</button>))}
                </div>
              </div>
              <div style={{ height: 220 }}><PortfolioChart series={series} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, borderRadius: 28, overflow: "hidden", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)", alignSelf: "stretch" }}>
              {overview.map((o) => (
                <div key={o.k} style={{ background: "#0b0b0b", padding: 20, display: "flex", flexDirection: "column", gap: 8, justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 12, color: "#696969" }}>{o.k}</span>
                  <span style={{ fontFamily: mono, fontSize: 22, letterSpacing: "-0.02em", color: o.color }}>{o.v}</span>
                  <span style={{ fontSize: 11, color: "#5a5a5a" }}>{o.note}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderRadius: 28, border: "1px solid rgba(182,154,255,0.25)", background: "linear-gradient(160deg,rgba(182,154,255,0.1),rgba(5,5,5,0) 60%)", padding: "clamp(18px,2.5vw,26px)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 20, letterSpacing: "-0.02em" }}><span style={{ width: 30, height: 30, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />Your portfolio activity</span>
              <button onClick={summarise} className="lp-send" style={{ height: 36, padding: "0 16px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>{aiText ? "Refresh" : "Summarise"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 10 }}>
              {insights.map((i) => (
                <div key={i.k} style={{ padding: 14, borderRadius: 18, background: "#0d0d0d", display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "#696969" }}>{i.k}</span>
                  <span style={{ fontSize: 15 }}>{i.v}</span>
                </div>
              ))}
            </div>
            {aiLoading && (<div style={{ display: "flex", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B69AFF", animation: "oc-blink 1s infinite" }} /><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#73D9E8", animation: "oc-blink 1s .2s infinite" }} /><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F38FC4", animation: "oc-blink 1s .4s infinite" }} /></div>)}
            {aiText && !aiLoading && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "#e0e0e0", maxWidth: 880 }}>{aiText}</p>}
            <span style={{ fontSize: 12, color: "#696969" }}>Observations only. Not investment advice.</span>
          </div>

          <div style={{ borderRadius: 28, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 22px 10px" }}><span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Holdings</span><span style={{ fontSize: 13, color: "#696969" }}>{H.length} tokens</span></div>
            <div style={{ display: "grid", gridTemplateColumns: hCols, gap: 12, padding: "10px 22px", fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span>Token</span><span style={{ textAlign: "right" }}>Balance</span><span style={{ textAlign: "right" }}>Value</span>
              {wide && <span style={{ textAlign: "right" }}>Avg. buy</span>}
              {wide && <span style={{ textAlign: "right" }}>P/L</span>}
            </div>
            {H.map((x) => {
              const p = ((x.value - x.cost) / x.cost) * 100;
              return (
                <Link key={x.sym} href={x.href} className="lp-list-row" style={{ display: "grid", gridTemplateColumns: hCols, gap: 12, alignItems: "center", padding: "12px 22px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                    <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 14, background: x.bg, color: x.ink, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{x.sym2}</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}><span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.name}</span><span style={{ fontSize: 12, color: "#696969" }}>${x.sym}</span></span>
                  </span>
                  <span style={{ textAlign: "right", fontFamily: mono, fontSize: 13 }}>{fmtK(x.q)}</span>
                  <span style={{ textAlign: "right", fontFamily: mono, fontSize: 13 }}>{x.value.toFixed(2)} STRK</span>
                  {wide && <span style={{ textAlign: "right", fontFamily: mono, fontSize: 13, color: "#A1A1A1" }}>{fmtP(x.avgP)}</span>}
                  {wide && <span style={{ textAlign: "right", fontFamily: mono, fontSize: 13, color: p >= 0 ? "#55D69A" : "#FF6868" }}>{p >= 0 ? "+" : ""}{p.toFixed(1)}%</span>}
                </Link>
              );
            })}
          </div>

          <div style={{ borderRadius: 28, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 12px 8px" }}><span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Recent activity</span><Link href="/activity" style={{ fontSize: 13, color: "#A1A1A1" }}>See all →</Link></div>
            {acts.map((a, i) => (
              <div key={i} className="lp-list-row" style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 14 }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: a.bg }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}><span style={{ fontSize: 14 }}>{a.title}</span><span style={{ fontSize: 12, color: "#696969" }}>{a.time}</span></span>
                <span style={{ fontFamily: mono, fontSize: 13, color: a.color }}>{a.amt}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
