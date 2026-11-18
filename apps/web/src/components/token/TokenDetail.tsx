"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { useWalletStore } from "@/lib/wallet-store";
import { useUiStore } from "@/lib/ui-store";
import { paletteFor } from "@/lib/art";
import { EXPLORER_URL, NETWORK, NETWORK_LABEL } from "@/lib/config";
import { ago, compact, fmtUsd, formatUnits, priceNumber, shortAddr, toNumber, toUsd } from "@/lib/format";
import type { CandleInterval } from "@/lib/api";
import { useCandles, useHolders, useStrkUsd, useToken, useTrades } from "@/lib/useApi";
import { autoInterval } from "@/lib/intervals";
import { Contour } from "@/components/landing/Contour";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { AreaChart } from "./AreaChart";
import { AiOfflineNotice } from "@/components/ui/AiOfflineNotice";
import { TradePanel } from "@/components/trade/TradePanel";
import { ClaimFees } from "@/components/trade/ClaimFees";
import { explorerTx, explorerContract } from "@/lib/safe";

const TABS: [string, string][] = [
  ["overview", "Overview"],
  ["chart", "Chart"],
  ["trades", "Trades"],
  ["holders", "Holders"],
  ["security", "Facts"],
  ["ai", "AI Insights"],
];
const TFS: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
const CARD: React.CSSProperties = { borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.07)", padding: 22, display: "flex", flexDirection: "column" };
const mono = "var(--font-geist-mono),monospace";

interface Msg { role: "user" | "ai"; text: string; sources: string[] }

function Empty({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center", maxWidth: 420 }}>
        <span style={{ width: 64, height: 64, borderRadius: "50%", border: "1px dashed rgba(255,255,255,0.25)" }} />
        <span style={{ fontSize: 22 }}>{title}</span>
        <span style={{ color: "#A1A1A1", fontSize: 14, lineHeight: 1.6 }}>{body}</span>
        {href && cta && <Link href={href} style={{ marginTop: 6, height: 44, padding: "0 22px", borderRadius: 999, background: "#fff", color: "#050505", fontWeight: 600, display: "inline-flex", alignItems: "center" }}>{cta}</Link>}
      </div>
    </div>
  );
}

export function TokenDetail({ address }: { address: string | null }) {
  const token = useToken(address);
  if (!address) return <Empty title="Pick a token" body="Open a token from Explore to see its price, curve progress and trades." href="/explore" cta="Explore tokens" />;
  if (token.loading) return <Empty title="Loading…" body="Reading the token from the chain index." />;
  if (token.error && token.data === undefined) return <Empty title="Can't reach the data service" body={token.error} />;
  if (token.data === null || token.data === undefined) return <Empty title="Token not found" body="Nothing has been indexed at this address. It may not be an oryvnlaunch token, or the indexer has not seen it yet." href="/explore" cta="Explore tokens" />;
  return <TokenView t={token.data} />;
}

function TokenView({ t }: { t: NonNullable<ReturnType<typeof useToken>["data"]> }) {
  const w = useViewportWidth();
  const wallet = useWalletStore((s) => s.wallet);
  const setPanel = useUiStore((s) => s.setPanel);

  const [tab, setTab] = useState("overview");
  // Start on a time frame that suits the token's age, so a young token is not one or two stretched candles.
  const [tf, setTf] = useState<CandleInterval>(() => autoInterval(t.ageMins));
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const [aiMsgs, setAiMsgs] = useState<Msg[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { launch } = t;
  const unit = t.quote.symbol;
  const connected = !!wallet;
  const termHref = `/terminal?t=${t.addr}`;
  const strkUsd = useStrkUsd();
  const tradesQ = useTrades(t.addr, 30);
  const holdersQ = useHolders(t.addr, 25);
  const holders = holdersQ.data;
  const candlesQ = useCandles(t.addr, tf, tab === "overview" ? 48 : 120);
  const trades = tradesQ.data?.items ?? [];
  const series = useMemo(() => (candlesQ.data ?? []).map((c) => priceNumber(c.close, launch.quote)), [candlesQ.data, launch.quote]);
  const [, light] = paletteFor(t.curve);

  const target = BigInt(launch.graduationRaise);
  const raised = (target * BigInt(launch.market.progressBps)) / 10_000n;
  const dec = t.quote.decimals;
  const creatorPct = launch.creatorBps / 100;
  const curvePct = 80;
  const reservedPct = Math.max(0, 100 - curvePct - creatorPct);
  const stateLabel = t.graduated ? "Graduated" : "Bonding";

  function flash(n: string) {
    setNote(n);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(""), 2200);
  }

  async function ask(q: string) {
    const question = q.trim();
    if (!question || aiLoading) return;
    setAiMsgs((m) => [...m, { role: "user", text: question, sources: [] }]);
    setAiInput("");
    setAiLoading(true);
    const ctx = {
      token: { name: t.name, ticker: t.sym, quoteAsset: unit, price: t.price, change24hPct: t.chg, marketCap: t.mcap, volume: t.vol, trades: t.trades, age: t.age },
      bonding: { progressPct: t.bond, graduationRaise: toNumber(launch.graduationRaise, dec), graduated: t.graduated },
      recentTrades: { buys: trades.filter((x) => x.side === "buy").length, sells: trades.filter((x) => x.side === "sell").length },
      launch: { preset: launch.preset.name, creatorAllocationPct: creatorPct, tradeFeePct: launch.tradeFee.bps / 100 },
      contract: { fixedSupply: true, audited: false },
    };
    try {
      const res = await fetch("/api/ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: question }], context: ctx }) });
      if (!res.ok) throw new Error("ai");
      const j = (await res.json()) as { text?: string };
      const text = j.text ?? "";
      const l = (question + text).toLowerCase();
      const src: string[] = [];
      if (/bond|gradu/.test(l)) src.push("Bonding state");
      if (/trade|buy|sell|volume/.test(l)) src.push("Trades · last 30");
      if (/contract|mint|owner|permission|fee/.test(l)) src.push("Launch parameters");
      if (!src.length) src.push("Token stats");
      setAiMsgs((m) => [...m, { role: "ai", text, sources: src }]);
    } catch {
      setAiMsgs((m) => [...m, { role: "ai", text: "AI is unavailable right now.", sources: [] }]);
    } finally {
      setAiLoading(false);
    }
  }

  // Dollar values are approximate (an outside STRK quote) and always shown next to the exact STRK figure.
  const mcapUsd = toUsd(t.mcap, unit, strkUsd);
  const volUsd = toUsd(t.vol, unit, strkUsd);
  const priceUsd = toUsd(t.price, unit, strkUsd);
  const stats: { k: string; v: string; sub?: string; color: string }[] = [
    { k: "Price", v: `${t.priceStr} ${unit}`, sub: priceUsd === null ? undefined : `about ${fmtUsd(priceUsd)}`, color: "#fff" },
    { k: "24h", v: t.chgStr, color: t.chgColor },
    { k: "Market cap", v: mcapUsd === null ? `${t.mcapStr} ${unit}` : fmtUsd(mcapUsd), sub: mcapUsd === null ? undefined : `${t.mcapStr} ${unit}`, color: "#fff" },
    { k: "Volume", v: volUsd === null ? `${t.volStr} ${unit}` : fmtUsd(volUsd), sub: volUsd === null ? undefined : `${t.volStr} ${unit}`, color: "#fff" },
    { k: "Trades", v: t.trades.toLocaleString(), color: "#fff" },
    { k: "Holders", v: holders ? holders.wallets.toLocaleString() : "—", color: "#fff" },
    { k: "Curve", v: t.graduated ? "Graduated" : `${t.bond}% filled`, color: "#fff" },
  ];
  const bondRows = [
    { k: "Raised (approx.)", v: `${formatUnits(raised, dec, 2)} ${unit}` },
    { k: "Graduation raise", v: `${formatUnits(target, dec, 2)} ${unit}${toUsd(toNumber(target, dec), unit, strkUsd) === null ? "" : ` · ${fmtUsd(toUsd(toNumber(target, dec), unit, strkUsd))}`}` },
    { k: "Remaining", v: `${formatUnits(target - raised, dec, 2)} ${unit}` },
    { k: "Curve price", v: `${t.priceStr} ${unit}` },
  ];
  const launchRows = [
    { k: "Launched", v: `${t.age} ago` },
    { k: "Curve preset", v: launch.preset.name ?? `#${launch.preset.id}` },
    { k: "Quote asset", v: unit },
    { k: "Network", v: NETWORK_LABEL[NETWORK] },
    { k: "Trade fee", v: `${launch.tradeFee.bps / 100}% (${launch.tradeFee.creatorShareBps / 100}% of it to the creator)` },
    { k: "Deploy fee paid", v: `${formatUnits(launch.deployFee, launch.feeAsset.decimals ?? 18, 2)} ${launch.feeAsset.symbol ?? ""}`.trim() },
  ];
  const palette = { ok: "#55D69A", warn: "#F3B65F", info: "#72BFFF" } as const;
  const icons = { ok: "✓", warn: "!", info: "i" } as const;
  const facts: { label: string; result: string; st: keyof typeof palette; evidence: string }[] = [
    { label: "Supply", result: "Fixed at 1,000,000,000", st: "ok", evidence: "Every token is created with a fixed supply in the factory. The token contract has no mint function." },
    { label: "Creator allocation", result: `${creatorPct}%`, st: creatorPct > 4 ? "warn" : "ok", evidence: `The creator ${shortAddr(t.creator)} set aside ${creatorPct}% at launch. The platform cap is 5%.` },
    { label: "Trade fee", result: `${launch.tradeFee.bps / 100}%`, st: "info", evidence: `Collected on the curve and split ${(10_000 - launch.tradeFee.creatorShareBps) / 100}% platform, ${launch.tradeFee.creatorShareBps / 100}% creator. The contract caps it at 3%.` },
    ...(holders && holders.wallets > 0
      ? [{ label: "Holder concentration", result: `Top 10 wallets hold ${(holders.top10ShareBps / 100).toFixed(1)}%`, st: (holders.top10ShareBps > 4000 ? "warn" : "ok") as "warn" | "ok", evidence: `Of ${holders.wallets.toLocaleString()} wallets holding the token. The bonding curve and the reserved share are not counted as holders.` }]
      : []),
    { label: "Liquidity", result: `Held by the bonding curve`, st: "info", evidence: "Liquidity sits in the curve contract. Graduation is a milestone, not a lock, and no DEX pool exists yet." },
    { label: "Audit", result: "Not audited", st: "warn", evidence: "These contracts have tests and a security review in progress, but no independent audit yet. Treat this as testnet software." },
  ];
  const aiSuggest = ["Explain the bonding progress", "Summarise recent trades", "What does the creator allocation mean?", "What are the fees?"];

  const cols = w >= 1000 ? "minmax(0,1fr) 340px" : "minmax(0,1fr)";
  return (
    <div style={{ minHeight: "100vh", background: "#050505" }}>
      {/* Header */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.8, WebkitMaskImage: "linear-gradient(180deg,#000 40%,transparent)", maskImage: "linear-gradient(180deg,#000 40%,transparent)" }}>
          <Contour density={30} seed={13} opacity={0.1} />
        </div>
        <div style={{ position: "relative", maxWidth: 1360, margin: "0 auto", padding: "clamp(28px,4vw,56px) clamp(18px,5vw,64px) 28px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "clamp(24px,4vw,56px)", alignItems: "center" }}>
          <div style={{ position: "relative", maxWidth: 380, width: "100%", aspectRatio: "0.78", justifySelf: "start" }}>
            <div style={{ position: "absolute", inset: "6% -4% -2% 8%", borderRadius: 32, background: `linear-gradient(165deg, ${light}, ${t.g0})`, opacity: 0.35, transform: "rotate(7deg)" }} />
            <div style={{ position: "relative", height: "100%", borderRadius: 32, overflow: "hidden", background: `linear-gradient(165deg, ${t.g1} 0%, ${t.g0} 70%)`, color: t.ink, boxShadow: "0 30px 80px rgba(0,0,0,0.6),inset 0 0 0 1px rgba(255,255,255,0.35)", transform: "rotate(-3deg)" }}>
              <div style={{ padding: "24px 24px 0", display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{t.name}</span>
                <span style={{ fontFamily: mono, fontWeight: 600 }}>{t.bond}%</span>
              </div>
              <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, height: "68%", borderRadius: 22, background: "rgba(255,255,255,0.28)", display: "grid", placeItems: "center" }}>
                <TokenAvatar sym={t.addr} bg="rgba(255,255,255,0.35)" ink={t.ink} size={170} radius={42} src={t.imageUrl} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ padding: "5px 12px", borderRadius: 999, background: t.graduated ? "rgba(182,154,255,0.12)" : "rgba(115,217,232,0.12)", color: t.graduated ? "#B69AFF" : "#73D9E8", fontSize: 12, fontWeight: 600 }}>{stateLabel}</span>
              <span style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", color: "#A1A1A1", fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#55D69A" }} />{NETWORK_LABEL[NETWORK]}</span>
              <span style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", color: "#A1A1A1", fontSize: 12, whiteSpace: "nowrap" }}>Launched {t.age} ago</span>
              <span style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", color: "#A1A1A1", fontSize: 12 }}>{unit}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(44px,6vw,84px)", letterSpacing: "-0.045em", lineHeight: 0.95 }}>{t.name}</h1>
              <span style={{ fontSize: 20, color: "#A1A1A1" }}>${t.sym}</span>
            </div>
            {t.description && <p style={{ margin: 0, fontSize: 16, color: "#cfcfcf", lineHeight: 1.6, maxWidth: 560, textWrap: "pretty", overflowWrap: "anywhere" }}>{t.description}</p>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              <button onClick={() => { navigator.clipboard?.writeText(t.addr).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400); }} className="lp-copyaddr" style={{ display: "flex", alignItems: "center", gap: 10, padding: 0, border: 0, background: "transparent", color: "#A1A1A1", cursor: "pointer", fontFamily: mono, fontSize: 13, textAlign: "left" }}>
                <span style={{ fontFamily: "var(--font-geist-sans),sans-serif", color: "#696969", width: 64 }}>Contract</span>{t.addrShort}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="9" y="9" width="12" height="12" rx="3" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                <span style={{ color: "#55D69A" }}>{copied ? "Copied" : ""}</span>
              </button>
              <span style={{ display: "flex", gap: 10, color: "#A1A1A1", fontFamily: mono }}><span style={{ fontFamily: "var(--font-geist-sans),sans-serif", color: "#696969", width: 64 }}>Creator</span>{t.creatorShort}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {([["web", "Website"], ["x", "X"], ["tg", "Telegram"], ["dc", "Discord"]] as const).map(([k, label]) =>
                t.links[k] ? (
                  <a key={k} href={t.links[k]} target="_blank" rel="noopener noreferrer nofollow" className="lp-pill-invert" style={{ height: 38, padding: "0 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", display: "inline-flex", alignItems: "center", fontSize: 13 }}>{label} ↗</a>
                ) : null,
              )}
              {explorerContract(t.addr) && (
                <a href={explorerContract(t.addr)!} target="_blank" rel="noopener noreferrer" className="lp-pill-invert" style={{ height: 38, padding: "0 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", display: "inline-flex", alignItems: "center", fontSize: 13 }}>View on Voyager ↗</a>
              )}
              <button onClick={() => { navigator.clipboard?.writeText(window.location.href).catch(() => {}); flash("Link copied"); }} className="lp-pill-invert" style={{ height: 38, padding: "0 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", fontSize: 13, cursor: "pointer" }}>Share</button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section style={{ maxWidth: 1360, margin: "0 auto", padding: "0 clamp(18px,5vw,64px)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 1, borderRadius: 22, overflow: "hidden", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {stats.map((s) => (
            <div key={s.k} style={{ background: "#070707", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.k}</span>
              <span style={{ fontFamily: mono, fontSize: 18, letterSpacing: "-0.02em", color: s.color, whiteSpace: "nowrap" }}>{s.v}</span>
              {s.sub && <span style={{ fontFamily: mono, fontSize: 11, color: "#696969", whiteSpace: "nowrap" }}>{s.sub}</span>}
            </div>
          ))}
        </div>
      </section>

      <main style={{ maxWidth: 1360, margin: "0 auto", padding: "28px clamp(18px,5vw,64px) 140px", display: "grid", gridTemplateColumns: cols, gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div className="lp-noscroll" style={{ display: "flex", gap: 4, overflowX: "auto", padding: 4, borderRadius: 999, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.07)", alignSelf: "flex-start", maxWidth: "100%" }}>
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ flexShrink: 0, height: 38, padding: "0 16px", borderRadius: 999, border: 0, cursor: "pointer", fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", background: tab === k ? "#fff" : "transparent", color: tab === k ? "#050505" : "#A1A1A1" }}>{l}</button>
            ))}
          </div>

          {tab === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 16 }}>
              <div style={{ ...CARD, gap: 16 }}>
                <span style={{ fontSize: 18 }}>Bonding curve</span>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontFamily: mono, fontSize: 44, letterSpacing: "-0.04em" }}>{t.bond}%</span><span style={{ fontSize: 13, color: "#A1A1A1" }}>{t.graduated ? "graduated" : "to graduation"}</span></div>
                <div style={{ height: 12, borderRadius: 99, background: "#151515", overflow: "hidden" }}><div style={{ height: "100%", width: `${t.bond}%`, background: t.barBg, borderRadius: 99 }} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
                  {bondRows.map((b) => (<div key={b.k} style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ color: "#696969" }}>{b.k}</span><span style={{ fontFamily: mono, fontSize: 14 }}>{b.v}</span></div>))}
                </div>
              </div>
              <div style={{ ...CARD, gap: 16 }}>
                <span style={{ fontSize: 18 }}>Supply &amp; allocation</span>
                <div style={{ display: "flex", height: 14, borderRadius: 99, overflow: "hidden", gap: 2 }}><span style={{ width: `${curvePct}%`, background: "#73D9E8" }} /><span style={{ width: `${reservedPct}%`, background: "#B69AFF" }} /><span style={{ width: `${creatorPct}%`, background: "#F38FC4" }} /></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ display: "flex", gap: 8, alignItems: "center", color: "#A1A1A1" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#73D9E8" }} />Bonding curve</span><span style={{ fontFamily: mono }}>{curvePct}%</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ display: "flex", gap: 8, alignItems: "center", color: "#A1A1A1" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#B69AFF" }} />Reserved</span><span style={{ fontFamily: mono }}>{reservedPct}%</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ display: "flex", gap: 8, alignItems: "center", color: "#A1A1A1" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F38FC4" }} />Creator</span><span style={{ fontFamily: mono }}>{creatorPct}%</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}><span style={{ color: "#A1A1A1" }}>Total supply</span><span style={{ fontFamily: mono }}>1,000,000,000</span></div>
                </div>
              </div>
              <div style={{ ...CARD, gap: 12 }}>
                <span style={{ fontSize: 18 }}>Launch</span>
                {launchRows.map((r) => (<div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}><span style={{ color: "#A1A1A1" }}>{r.k}</span><span style={{ fontFamily: mono, textAlign: "right" }}>{r.v}</span></div>))}
              </div>
              <div style={{ ...CARD, gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 18 }}>Price · 24h</span><span style={{ fontFamily: mono, fontSize: 13, color: t.chgColor }}>{t.chgStr}</span></div>
                <div style={{ height: 150 }}><AreaChart values={series} height={150} /></div>
              </div>
            </div>
          )}

          {tab === "chart" && (
            <div style={{ ...CARD, padding: 18, gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 12, background: "#111" }}>
                  {TFS.map((f) => (<button key={f} onClick={() => setTf(f)} style={{ height: 28, padding: "0 10px", borderRadius: 9, border: 0, cursor: "pointer", fontFamily: mono, fontSize: 12, background: tf === f ? "#fff" : "transparent", color: tf === f ? "#050505" : "#A1A1A1" }}>{f}</button>))}
                </div>
                <Link href={termHref} style={{ fontSize: 13, color: "#73D9E8" }}>Open in terminal →</Link>
              </div>
              <div style={{ height: 320 }}><AreaChart values={series} height={320} showAxis /></div>
              <span style={{ fontSize: 11, color: "#696969" }}>Candles built from indexed trades. Prices are in {unit} per token.</span>
            </div>
          )}

          {tab === "trades" && (
            <div style={{ ...CARD, padding: 10 }}>
              {trades.map((r) => {
                const buy = r.side === "buy";
                const url = explorerTx(r.txHash) ?? undefined;
                return (
                  <a key={r.id} href={url} target={url ? "_blank" : undefined} rel="noreferrer" className="lp-trade-row" style={{ display: "grid", gridTemplateColumns: "60px minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr) 64px", gap: 12, alignItems: "center", padding: "11px 12px", borderRadius: 12, fontFamily: mono, fontSize: 12, color: "#d8d8d8" }}>
                    <span style={{ color: buy ? "#55D69A" : "#FF6868", fontFamily: "var(--font-geist-sans),sans-serif", fontWeight: 600 }}>{buy ? "Buy" : "Sell"}</span>
                    <span>{formatUnits(r.traderAmount, dec, 4)} {unit}</span>
                    <span style={{ color: "#A1A1A1" }}>{compact(toNumber(r.tokenAmount, 18))} {t.sym}</span>
                    <span style={{ color: "#A1A1A1", overflow: "hidden", textOverflow: "ellipsis" }}>{shortAddr(r.trader)}</span>
                    <span style={{ textAlign: "right", color: "#696969" }}>{ago(r.blockTime).replace(" ago", "")}{url ? " ↗" : ""}</span>
                  </a>
                );
              })}
              {trades.length === 0 && <div style={{ padding: "40px 12px", textAlign: "center", color: "#A1A1A1", fontSize: 14 }}>{tradesQ.loading ? "Loading…" : "No trades yet."}</div>}
            </div>
          )}

          {tab === "holders" && (
            <div style={{ ...CARD, gap: 14 }}>
              {holders && holders.items.length > 0 ? (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, color: "#696969" }}>Wallets holding</span><span style={{ fontFamily: mono, fontSize: 20 }}>{holders.wallets.toLocaleString()}</span></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, color: "#696969" }}>Top 10 wallets</span><span style={{ fontFamily: mono, fontSize: 20 }}>{(holders.top10ShareBps / 100).toFixed(1)}%</span></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, color: "#696969" }}>Creator holds</span><span style={{ fontFamily: mono, fontSize: 20 }}>{(holders.creatorShareBps / 100).toFixed(1)}%</span></div>
                  </div>
                  {(() => {
                    const maxShare = Math.max(...holders.items.map((h) => h.shareBps), 1);
                    const tags = { curve: ["Curve", "#73D9E8"], reserve: ["Reserve", "#B69AFF"], creator: ["Creator", "#F38FC4"] } as const;
                    return holders.items.map((h) => {
                      const tag = h.role === "holder" ? null : tags[h.role];
                      return (
                        <div key={h.address} style={{ display: "grid", gridTemplateColumns: "minmax(130px,220px) minmax(0,1fr) 64px", gap: 14, alignItems: "center" }}>
                          <span style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: mono, fontSize: 12 }}>
                            {explorerContract(h.address) ? <a href={explorerContract(h.address)!} target="_blank" rel="noopener noreferrer">{shortAddr(h.address)}</a> : shortAddr(h.address)}
                            {tag && <span style={{ fontFamily: "var(--font-geist-sans),sans-serif", fontSize: 10, padding: "2px 7px", borderRadius: 99, background: tag[1], color: "#050505" }}>{tag[0]}</span>}
                          </span>
                          <span style={{ height: 8, borderRadius: 99, background: "#151515", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(h.shareBps / maxShare) * 100}%`, background: tag ? tag[1] : "rgba(255,255,255,0.45)", borderRadius: 99 }} /></span>
                          <span style={{ textAlign: "right", fontFamily: mono, fontSize: 12 }}>{(h.shareBps / 100).toFixed(2)}%</span>
                        </div>
                      );
                    });
                  })()}
                </>
              ) : (
                <div style={{ padding: "30px 8px", textAlign: "center", color: "#A1A1A1", fontSize: 14 }}>{holdersQ.loading ? "Loading…" : holdersQ.error && !holders ? "Can't reach the data service." : "No holders yet."}</div>
              )}
              <span style={{ fontSize: 12, color: "#696969" }}>Built from every transfer of this token. Wallet addresses only; we don&apos;t link wallets to identities. The curve and the reserve are shown but not counted as holders.</span>
            </div>
          )}

          {tab === "security" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {facts.map((c) => (
                <div key={c.label} style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr)", gap: 14, alignItems: "start", padding: 18, borderRadius: 20, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: palette[c.st], color: "#050505", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{icons[c.st]}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                    <span style={{ fontSize: 15 }}>{c.label} <span style={{ color: palette[c.st] }}>· {c.result}</span></span>
                    <span style={{ fontSize: 13, color: "#A1A1A1", lineHeight: 1.5 }}>{c.evidence}</span>
                  </div>
                </div>
              ))}
              <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5 }}>Facts from the launch record and the contract design. Not an audit and not a safety score.</span>
            </div>
          )}

          {tab === "ai" && (
            <div style={{ borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(182,154,255,0.25)", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <AiOfflineNotice />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {aiSuggest.map((q) => (<button key={q} onClick={() => ask(q)} className="lp-aisuggest" style={{ height: 34, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "#111", color: "#ddd", fontSize: 13, cursor: "pointer" }}>{q}</button>))}
              </div>
              {aiMsgs.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, borderRadius: 18, background: m.role === "user" ? "#151515" : "#0f0f12" }}>
                  <span style={{ fontSize: 12, color: "#696969" }}>{m.role === "user" ? "You" : "AI · from indexed data"}</span>
                  <span style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "#e4e4e4" }}>{m.text}</span>
                  {m.sources.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{m.sources.map((x) => (<span key={x} style={{ padding: "3px 9px", borderRadius: 999, background: "#1a1a1a", fontSize: 11, color: "#A1A1A1" }}>{x}</span>))}</div>}
                </div>
              ))}
              {aiLoading && (<div style={{ display: "flex", gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B69AFF", animation: "oc-blink 1s infinite" }} /><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#73D9E8", animation: "oc-blink 1s .2s infinite" }} /><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F38FC4", animation: "oc-blink 1s .4s infinite" }} /></div>)}
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); ask(aiInput); }} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 6px 6px 16px", borderRadius: 999, background: "#050505", border: "1px solid rgba(255,255,255,0.12)" }}>
                <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder={`Ask about ${t.name}...`} style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 14, height: 38 }} />
                <button type="submit" style={{ height: 38, padding: "0 16px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer" }}>Ask</button>
              </form>
            </div>
          )}
        </div>

        {/* Aside trade widget */}
        <aside style={{ position: w >= 1000 ? "sticky" : "relative", top: 90, display: "flex", flexDirection: "column", gap: 12 }}>
          <TradePanel t={t} />
          <ClaimFees t={t} />
          <Link href={termHref} className="lp-term-link" style={{ textAlign: "center", fontSize: 13, color: "#A1A1A1" }}>Open full terminal →</Link>
        </aside>
      </main>

      {note && (
        <div style={{ position: "fixed", left: "50%", bottom: 90, transform: "translateX(-50%)", zIndex: 90, padding: "12px 18px", borderRadius: 999, background: "#fff", color: "#050505", fontSize: 14, fontWeight: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>{note}</div>
      )}
    </div>
  );
}
