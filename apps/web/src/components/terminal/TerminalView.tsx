"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { useWalletStore } from "@/lib/wallet-store";
import { EXPLORER_URL, NETWORK, NETWORK_LABEL } from "@/lib/config";
import { ago, compact, formatUnits, priceNumber, shortAddr, toNumber, usdOr } from "@/lib/format";
import type { CandleInterval } from "@/lib/api";
import { useCandles, useLaunches, useStrkUsd, useToken, useTrades, type Token } from "@/lib/useApi";
import { TerminalChart, type Candle } from "./TerminalChart";
import { INTERVAL_SECONDS, autoInterval } from "@/lib/intervals";
import { TradePanel } from "@/components/trade/TradePanel";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { AiOfflineNotice } from "@/components/ui/AiOfflineNotice";
import { WalletConnectModal } from "@/components/wallet/WalletConnectModal";
import { fmtSmall } from "@/lib/format";
import { explorerTx } from "@/lib/safe";

const TFS: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
const mono = "var(--font-geist-mono),monospace";

type Sort = "new" | "bonding" | "active";
const SORTERS: Record<Sort, (a: Token, b: Token) => number> = {
  new: (a, b) => b.createdMs - a.createdMs,
  bonding: (a, b) => b.bond - a.bond,
  active: (a, b) => b.lastTradeMs - a.lastTradeMs,
};
const SORT_LABELS: [Sort, string][] = [["new", "New"], ["bonding", "Bonding"], ["active", "Active"]];

interface Msg { role: "user" | "ai"; text: string; sources: string[]; time?: string }

export function TerminalView({ address }: { address: string | null }) {
  const w = useViewportWidth();
  const strkUsd = useStrkUsd();
  const wallet = useWalletStore((s) => s.wallet);
  const connecting = useWalletStore((s) => s.connecting);
  const walletError = useWalletStore((s) => s.error);
  const connect = useWalletStore((s) => s.connect);
  const disconnect = useWalletStore((s) => s.disconnect);
  const hydrate = useWalletStore((s) => s.hydrate);

  const [sel, setSel] = useState<string | null>(address);
  // The token looked at last time, so the terminal opens where the person left off. A link to a token wins.
  const [remembered, setRemembered] = useState<string | null>(null);
  const [tf, setTf] = useState<CandleInterval>("15m");
  const pickedTf = useRef(false);
  const [type, setType] = useState<"candle" | "line">("candle");
  const [listTab, setListTab] = useState<Sort>("new");
  const [q, setQ] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMsgs, setAiMsgs] = useState<Msg[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  // Panels can be folded away so the chart gets the room. The choice is remembered.
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  // Full chart: every panel and card steps aside and the chart fills the screen.
  const [focus, setFocus] = useState(false);
  const [vh, setVh] = useState(800);

  useEffect(() => hydrate(), [hydrate]);

  useEffect(() => {
    try {
      setRemembered(localStorage.getItem("oryvn.terminal.token"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      setLeftOpen(localStorage.getItem("oryvn.term.left") !== "0");
      setRightOpen(localStorage.getItem("oryvn.term.right") !== "0");
    } catch {
      /* ignore */
    }
    const onResize = () => setVh(window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Full chart also folds the main menu, and puts it back the way the user had it afterwards. Esc leaves.
  useEffect(() => {
    if (!focus) return;
    window.dispatchEvent(new CustomEvent("oryvn-sidebar", { detail: true }));
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFocus(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      let folded = false;
      try { folded = localStorage.getItem("oryvn.sidebar") === "1"; } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent("oryvn-sidebar", { detail: folded }));
    };
  }, [focus]);

  function togglePanel(side: "left" | "right") {
    const set = side === "left" ? setLeftOpen : setRightOpen;
    set((open) => {
      try { localStorage.setItem(`oryvn.term.${side}`, open ? "0" : "1"); } catch { /* ignore */ }
      return !open;
    });
  }

  // Breakpoints account for the dashboard sidebar (up to 236px) beside the content.
  const isMobile = w < 1060;
  const wide = w >= 1400;
  const showLeft = wide && leftOpen && !focus;
  const showChips = !focus && !showLeft;
  const connected = !!wallet;

  const launches = useLaunches({ sort: "newest" });
  const all = useMemo(() => launches.data?.tokens ?? [], [launches.data]);
  const query = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      all
        .filter((t) => !query || t.name.toLowerCase().includes(query) || t.sym.toLowerCase().includes(query) || t.addr.toLowerCase().includes(query))
        .slice()
        .sort(SORTERS[listTab]),
    [all, query, listTab],
  );
  const chosen = sel ?? (remembered && all.some((x) => x.addr === remembered) ? remembered : all[0]?.addr) ?? null;
  const fresh = useToken(chosen);
  const t: Token | undefined = fresh.data ?? all.find((x) => x.addr === chosen);

  // A token that is minutes old on a 15-minute chart is one or two candles. Until the user chooses a time frame,
  // pick the widest one that still gives the chart a useful number of candles to draw.
  const ageMins = t?.ageMins ?? null;
  useEffect(() => {
    if (pickedTf.current || ageMins === null) return;
    setTf(autoInterval(ageMins));
  }, [ageMins === null, t?.addr]); // eslint-disable-line react-hooks/exhaustive-deps

  const nC = focus ? 160 : isMobile ? 48 : 72;
  const chartH = focus ? Math.max(isMobile ? 300 : 420, vh - (isMobile ? 230 : 270)) : isMobile ? 260 : 340;
  const candlesQ = useCandles(chosen, tf, nC);
  const tradesQ = useTrades(chosen, 30);
  const trades = tradesQ.data?.items ?? [];

  const candles: Candle[] = useMemo(() => {
    if (!t) return [];
    const q2 = t.launch.quote;
    return (candlesQ.data ?? []).map((c) => ({
      o: priceNumber(c.open, q2),
      h: priceNumber(c.high, q2),
      l: priceNumber(c.low, q2),
      c: priceNumber(c.close, q2),
      v: toNumber(c.volume, q2.decimals ?? 18),
      t: c.time,
    }));
  }, [candlesQ.data, t]);
  const hc = candles.length ? (candles[hover ?? candles.length - 1] ?? candles[candles.length - 1]!) : null;

  function pick(addr: string) {
    setSel(addr);
    try {
      localStorage.setItem("oryvn.terminal.token", addr);
    } catch {
      /* ignore */
    }
    setHover(null);
    setAiMsgs([]);
  }

  async function ask(question: string) {
    const qn = question.trim();
    if (!qn || aiLoading || !t) return;
    const history = aiMsgs.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    setAiMsgs((m) => [...m, { role: "user", text: qn, sources: [] }]);
    setAiInput("");
    setAiLoading(true);
    const buys = trades.filter((x) => x.side === "buy");
    const ctx = {
      token: { name: t.name, ticker: t.sym, quoteAsset: t.quote.symbol, price: t.price, change24hPct: t.chg, marketCap: t.mcap, volume: t.vol, trades: t.trades, launchedAgo: t.age },
      bonding: { progressPct: t.bond, graduationRaise: toNumber(t.launch.graduationRaise, t.quote.decimals), graduated: t.graduated },
      recentTrades: { count: trades.length, buys: buys.length, sells: trades.length - buys.length },
      launch: { preset: t.launch.preset.name, creatorAllocationPct: t.launch.creatorBps / 100, tradeFeePct: t.launch.tradeFee.bps / 100 },
      contract: { fixedSupply: true, audited: false },
    };
    try {
      const res = await fetch("/api/ai/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [...history, { role: "user", content: qn }], context: ctx }) });
      if (!res.ok) throw new Error("ai");
      const j = (await res.json()) as { text?: string };
      const txt = j.text ?? "";
      const l = (qn + txt).toLowerCase();
      const srcs: string[] = [];
      if (/bond|gradu|reserve|curve/.test(l)) srcs.push("Bonding state");
      if (/trade|buy|sell|volume|activ/.test(l)) srcs.push("Trades · last 30");
      if (/contract|mint|owner|permission|fee/.test(l)) srcs.push("Launch parameters");
      if (!srcs.length) srcs.push("Token stats");
      setAiMsgs((m) => [...m, { role: "ai", text: txt, sources: srcs, time: "Indexed " + new Date().toTimeString().slice(0, 5) }]);
    } catch {
      setAiMsgs((m) => [...m, { role: "ai", text: "AI is unavailable right now. The data on this page is still current. Try again in a moment.", sources: [], time: "" }]);
    } finally {
      setAiLoading(false);
    }
  }

  const showRightPanel = isMobile || (rightOpen && !focus);
  const showRightRail = !isMobile && !rightOpen && !focus;
  const showLeftRail = wide && !leftOpen && !focus && !isMobile;
  let cols: string;
  if (focus || isMobile) cols = "minmax(0,1fr)";
  else if (wide && leftOpen && rightOpen) cols = "minmax(0,22fr) minmax(0,53fr) minmax(0,25fr)";
  else if (wide && leftOpen) cols = "minmax(0,22fr) minmax(0,78fr) 44px";
  else if (wide) cols = `44px minmax(0,1fr) ${rightOpen ? "minmax(300px,340px)" : "44px"}`;
  else cols = `minmax(0,1fr) ${rightOpen ? "minmax(300px,340px)" : "44px"}`;
  const gridStyle: CSSProperties = { flex: 1, display: "grid", gridTemplateColumns: cols, width: "100%", maxWidth: focus ? 2200 : 1760, margin: "0 auto" };
  const chevron = (d: string) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
  const collapseBtn = (side: "left" | "right") => (
    <button onClick={() => togglePanel(side)} aria-label={side === "left" ? "Hide token list" : "Hide trade panel"} title={side === "left" ? "Hide token list" : "Hide trade panel"} className="lp-iconbtn" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: "#A1A1A1", cursor: "pointer", display: "grid", placeItems: "center" }}>
      {chevron(side === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6")}
    </button>
  );
  const rail = (side: "left" | "right", label: string) => (
    <aside style={{ position: "sticky", top: 64, height: "calc(100vh - 64px)", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "14px 0", borderLeft: side === "right" ? "1px solid rgba(255,255,255,0.07)" : undefined, borderRight: side === "left" ? "1px solid rgba(255,255,255,0.07)" : undefined }}>
      <button onClick={() => togglePanel(side)} aria-label={`Show ${label.toLowerCase()}`} title={`Show ${label.toLowerCase()}`} className="lp-iconbtn" style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.09)", background: "transparent", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}>
        {chevron(side === "left" ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6")}
      </button>
      <span style={{ writingMode: "vertical-rl", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#696969" }}>{label}</span>
    </aside>
  );
  const rightStyle: CSSProperties = isMobile
    ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, maxHeight: "88vh", overflowY: "auto", padding: "14px 14px 24px", background: "#090909", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTop: "1px solid rgba(255,255,255,0.1)", display: sheet ? "flex" : "none", flexDirection: "column", gap: 12 }
    : { position: "sticky", top: 64, alignSelf: "start", padding: "clamp(14px,2vw,24px) clamp(14px,2vw,24px) 24px 0", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 };
  const card: CSSProperties = { borderRadius: 24, background: "#090909", border: "1px solid rgba(255,255,255,0.07)" };

  const searchBox = (
    <label style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", height: 40, padding: "0 14px", borderRadius: 999, background: "#101010", border: "1px solid rgba(255,255,255,0.08)" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#696969" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search token, ticker or address" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 14 }} />
    </label>
  );

  // Nothing to show yet: say why, plainly.
  if (!t) {
    const down = !!launches.error && !launches.data;
    return (
      <div style={{ minHeight: "calc(100vh - 64px)", background: "#050505", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center", maxWidth: 420 }}>
          <span style={{ width: 64, height: 64, borderRadius: "50%", border: "1px dashed rgba(255,255,255,0.25)" }} />
          <span style={{ fontSize: 22 }}>{down ? "Can't reach the data service" : launches.loading || (!!chosen && fresh.loading) ? "Loading…" : "Nothing to trade yet"}</span>
          <span style={{ color: "#A1A1A1", fontSize: 14, lineHeight: 1.6 }}>
            {down ? launches.error : "Tokens appear here as soon as the first launch confirms on-chain."}
          </span>
          {!down && !launches.loading && <Link href="/launch" style={{ marginTop: 6, height: 44, padding: "0 22px", borderRadius: 999, background: "#fff", color: "#050505", fontWeight: 600, display: "inline-flex", alignItems: "center" }}>Launch a token</Link>}
        </div>
      </div>
    );
  }

  const unit = t.quote.symbol;
  const dec = t.quote.decimals;
  const target = BigInt(t.launch.graduationRaise);
  const raised = (target * BigInt(t.launch.market.progressBps)) / 10_000n;

  return (
    <div style={{ minHeight: "calc(100vh - 64px)", background: "#050505", display: "flex", flexDirection: "column" }}>
      {showChips && <div style={{ padding: "12px clamp(14px,2vw,24px) 0" }}>{searchBox}</div>}

      {showChips && (
        <div className="lp-noscroll" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "12px clamp(14px,2vw,24px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {list.map((c) => (
            <button key={c.addr} onClick={() => pick(c.addr)} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px 0 4px", borderRadius: 999, border: `1px solid ${c.addr === t.addr ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.08)"}`, background: "#0d0d0d", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", background: c.bg }} />{c.sym}<span style={{ fontFamily: mono, fontSize: 12, color: c.chgColor }}>{c.chgStr}</span>
            </button>
          ))}
          {list.length === 0 && <span style={{ fontSize: 13, color: "#696969", alignSelf: "center" }}>No tokens match.</span>}
        </div>
      )}

      <main style={gridStyle}>
        {/* LEFT LIST */}
        {showLeft && (
          <aside style={{ position: "sticky", top: 64, height: "calc(100vh - 64px)", display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.07)", minWidth: 0 }}>
            <div style={{ padding: "18px 16px 10px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>{collapseBtn("left")}<span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Discover</span></span>
                <span style={{ fontSize: 11, color: "#696969", letterSpacing: "0.06em", textTransform: "uppercase" }}>{launches.data?.total ?? 0} launches</span>
              </div>
              <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 14, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)" }}>
                {SORT_LABELS.map(([k, l]) => (
                  <button key={k} onClick={() => setListTab(k)} className="lp-tap-s" style={{ flex: 1, height: 30, borderRadius: 10, border: 0, cursor: "pointer", fontSize: 12, fontWeight: 500, background: listTab === k ? "#1d1d1d" : "transparent", color: listTab === k ? "#fff" : "#696969" }}>{l}</button>
                ))}
              </div>
              {searchBox}
            </div>
            <div className="lp-noscroll" style={{ flex: 1, overflowY: "auto", padding: "0 8px 16px" }}>
              {list.map((c) => (
                <button key={c.addr} onClick={() => pick(c.addr)} className="lp-trow" style={{ width: "100%", display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "10px 10px", borderRadius: 16, border: 0, background: c.addr === t.addr ? "#151515" : "transparent", color: "#fff", cursor: "pointer", textAlign: "left" }}>
                  <TokenAvatar sym={c.addr} bg={c.bg} ink={c.ink} size={42} src={c.imageUrl} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                    <span style={{ display: "flex", gap: 6, alignItems: "baseline", minWidth: 0 }}><span style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span><span style={{ fontSize: 12, color: "#696969" }}>{c.age}</span></span>
                    <span style={{ height: 3, borderRadius: 9, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${c.bond}%`, background: c.g0 }} /></span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    <span title={`${c.mcapStr} ${c.quote.symbol}`} style={{ fontFamily: mono, fontSize: 12 }}>{usdOr(c.mcap, c.quote.symbol, strkUsd, `${c.mcapStr} ${c.quote.symbol}`)}</span>
                    <span style={{ fontFamily: mono, fontSize: 12, color: c.chgColor }}>{c.chgStr}</span>
                  </span>
                </button>
              ))}
              {list.length === 0 && (
                <div style={{ padding: "40px 16px", textAlign: "center", display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                  <span style={{ width: 56, height: 56, borderRadius: "50%", border: "1px dashed rgba(255,255,255,0.2)" }} />
                  <span style={{ fontSize: 15 }}>No tokens match</span>
                  <span style={{ fontSize: 13, color: "#696969" }}>Try a ticker or paste a contract address.</span>
                </div>
              )}
            </div>
          </aside>
        )}

        {showLeftRail && rail("left", "Discover")}

        {/* CENTER */}
        <section style={{ minWidth: 0, padding: "clamp(14px,2vw,24px)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center", minWidth: 0 }}>
              <span style={{ flexShrink: 0, borderRadius: 22, boxShadow: "0 12px 30px rgba(0,0,0,0.5)", display: "inline-flex" }}><TokenAvatar sym={t.addr} bg={t.bg} ink={t.ink} size={68} radius={22} src={t.imageUrl} /></span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "clamp(24px,2.4vw,32px)", letterSpacing: "-0.03em", lineHeight: 1 }}>{t.name}</span>
                  <span style={{ fontSize: 15, color: "#A1A1A1" }}>${t.sym}</span>
                  <span style={{ padding: "4px 10px", borderRadius: 999, background: t.graduated ? "rgba(182,154,255,0.12)" : "rgba(115,217,232,0.12)", color: t.graduated ? "#B69AFF" : "#73D9E8", fontSize: 12, fontWeight: 600 }}>{t.graduated ? "Graduated" : "Bonding"}</span>
                </div>
                <button onClick={() => { navigator.clipboard?.writeText(t.addr).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400); }} className="lp-copyaddr lp-tap-link" style={{ display: "flex", alignItems: "center", gap: 8, padding: 0, border: 0, background: "transparent", color: "#A1A1A1", cursor: "pointer", fontFamily: mono, fontSize: 12 }}>
                  {t.addrShort}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="3" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                  <span style={{ color: "#55D69A" }}>{copied ? "Copied" : ""}</span>
                </button>
                <Link href={t.href} className="lp-tap-link" style={{ fontSize: 12, color: "#73D9E8" }}>Token page →</Link>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span style={{ fontFamily: mono, fontSize: "clamp(24px,2.4vw,32px)", fontWeight: 500, letterSpacing: "-0.03em" }}>{t.priceStr} <span style={{ fontSize: 14, color: "#A1A1A1" }}>{unit}</span></span>
              <span style={{ fontFamily: mono, fontSize: 13, whiteSpace: "nowrap", color: t.chgColor }}>{t.chgStr} · 24h</span>
            </div>
          </div>

          {!focus && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(118px,1fr))", gap: 1, borderRadius: 18, overflow: "hidden", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {[
              { label: "Market cap", value: usdOr(t.mcap, unit, strkUsd, `${t.mcapStr} ${unit}`), sub: strkUsd === null ? "" : `${t.mcapStr} ${unit}` },
              { label: "Volume", value: usdOr(t.vol, unit, strkUsd, `${t.volStr} ${unit}`), sub: strkUsd === null ? "" : `${t.volStr} ${unit}` },
              { label: "Trades", value: t.trades.toLocaleString(), sub: "" },
              { label: "Graduation", value: t.graduated ? "Done" : `${t.bond}%`, sub: t.graduated ? "milestone reached" : "of the raise" },
              { label: "Network", value: NETWORK === "sepolia" ? "Sepolia" : NETWORK_LABEL[NETWORK], sub: "testnet" },
            ].map((s) => (
              <div key={s.label} style={{ background: "#090909", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 10.5, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{s.label}</span>
                <span style={{ fontFamily: mono, fontSize: 15, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.value}</span>
                <span style={{ fontFamily: mono, fontSize: 11, color: "#696969", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minHeight: 14 }}>{s.sub}</span>
              </div>
            ))}
          </div>)}

          {/* CHART */}
          <div style={{ ...card, padding: "16px 16px 10px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 12, background: "#111" }}>
                {TFS.map((f) => (<button key={f} onClick={() => { pickedTf.current = true; setTf(f); setHover(null); }} className="lp-tap-s" style={{ height: 28, padding: "0 10px", borderRadius: 9, border: 0, cursor: "pointer", fontFamily: mono, fontSize: 12, background: tf === f ? "#fff" : "transparent", color: tf === f ? "#050505" : "#A1A1A1" }}>{f}</button>))}
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center", fontFamily: mono, fontSize: 11, color: "#696969", flexWrap: "wrap" }}>
                {hc && (
                  <>
                    <span>O <span style={{ color: "#d0d0d0" }}>{fmtSmall(hc.o)}</span></span>
                    <span>H <span style={{ color: "#d0d0d0" }}>{fmtSmall(hc.h)}</span></span>
                    <span>L <span style={{ color: "#d0d0d0" }}>{fmtSmall(hc.l)}</span></span>
                    <span>C <span style={{ color: hc.c >= hc.o ? "#55D69A" : "#FF6868" }}>{fmtSmall(hc.c)}</span></span>
                  </>
                )}
                <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 10, background: "#111" }}>
                  <button onClick={() => setType("candle")} aria-label="Candles" className="lp-tap-s" style={{ width: 28, height: 24, borderRadius: 7, border: 0, cursor: "pointer", background: type === "candle" ? "#2a2a2a" : "transparent", color: "#fff", display: "grid", placeItems: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M7 3v18M17 3v18" /><rect x="4" y="7" width="6" height="8" rx="1" /><rect x="14" y="9" width="6" height="6" rx="1" /></svg>
                  </button>
                  <button onClick={() => setType("line")} aria-label="Line" className="lp-tap-s" style={{ width: 28, height: 24, borderRadius: 7, border: 0, cursor: "pointer", background: type === "line" ? "#2a2a2a" : "transparent", color: "#fff", display: "grid", placeItems: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 17 6-6 4 4 8-8" /></svg>
                  </button>
                </div>
                <button onClick={() => setFocus((f) => !f)} aria-label={focus ? "Exit full chart" : "Full chart"} title={focus ? "Exit full chart (Esc)" : "Full chart"} className="lp-iconbtn lp-tap-s" style={{ height: 30, padding: isMobile ? "0 9px" : "0 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: focus ? "#fff" : "transparent", color: focus ? "#050505" : "#d0d0d0", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-geist-sans),sans-serif", fontSize: 12, fontWeight: 600 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{focus ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}</svg>
                  {!isMobile && (focus ? "Exit full chart" : "Full chart")}
                </button>
              </div>
            </div>
            <TerminalChart candles={candles} type={type} hover={hover} setHover={setHover} height={chartH} intervalSeconds={INTERVAL_SECONDS[tf]} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#696969" }}>
              <span>Candles built from indexed trades · {unit} per token</span><span>{isMobile ? "" : "Hover for OHLC"}</span>
            </div>
          </div>

          {!focus && (<>
          {/* BONDING */}
          <div style={{ ...card, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontSize: 15, color: "#A1A1A1" }}>Bonding curve progress</span>
              <span style={{ fontFamily: mono, fontSize: 36, letterSpacing: "-0.04em" }}>{t.bond}%</span>
            </div>
            <div style={{ position: "relative", height: 14, borderRadius: 99, background: "#151515", overflow: "hidden" }}><div style={{ height: "100%", width: `${t.bond}%`, borderRadius: 99, background: t.barBg }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
              {[{ label: "Raised (approx.)", value: `${formatUnits(raised, dec, 2)} ${unit}` }, { label: "Graduation raise", value: `${formatUnits(target, dec, 2)} ${unit}` }, { label: "Remaining", value: `${formatUnits(target - raised, dec, 2)} ${unit}` }, { label: "Trade fee", value: `${t.launch.tradeFee.bps / 100}%` }].map((b) => (
                <div key={b.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, color: "#696969" }}>{b.label}</span><span style={{ fontFamily: mono, fontSize: 14 }}>{b.value}</span></div>
              ))}
            </div>
            <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5 }}>Graduation is a milestone, not a lock: buying and selling continue on the curve afterwards. A DEX pool is not part of this release.</span>
          </div>

          {/* TRADES */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 0", fontSize: 15 }}>Recent trades</div>
            <div style={{ padding: "8px 12px 12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "56px minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr) 56px", gap: 10, padding: "8px 8px", fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <span>Side</span><span>{unit}</span><span>{t.sym}</span><span>Wallet</span><span style={{ textAlign: "right" }}>Time</span>
              </div>
              {trades.slice(0, 14).map((r) => {
                const buy = r.side === "buy";
                const url = explorerTx(r.txHash) ?? undefined;
                return (
                  <a key={r.id} href={url} target={url ? "_blank" : undefined} rel="noreferrer" className="lp-trade-row" style={{ display: "grid", gridTemplateColumns: "56px minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr) 56px", gap: 10, alignItems: "center", padding: "9px 8px", borderRadius: 10, fontFamily: mono, fontSize: 12, color: "#d8d8d8" }}>
                    <span style={{ color: buy ? "#55D69A" : "#FF6868", fontFamily: "var(--font-geist-sans),sans-serif", fontWeight: 600 }}>{buy ? "Buy" : "Sell"}</span>
                    <span>{formatUnits(r.traderAmount, dec, 4)}</span>
                    <span style={{ color: "#A1A1A1" }}>{compact(toNumber(r.tokenAmount, 18))}</span>
                    <span style={{ color: "#A1A1A1", overflow: "hidden", textOverflow: "ellipsis" }}>{shortAddr(r.trader)}</span>
                    <span style={{ textAlign: "right", color: "#696969" }}>{ago(r.blockTime).replace(" ago", "")}</span>
                  </a>
                );
              })}
              {trades.length === 0 && <div style={{ padding: "28px 8px", textAlign: "center", color: "#A1A1A1", fontSize: 14 }}>{tradesQ.loading ? "Loading…" : "No trades yet."}</div>}
            </div>
          </div>
          </>)}
          {isMobile && !focus && <div style={{ height: 80 }} />}
        </section>

        {/* RIGHT: TRADE */}
        {showRightRail && rail("right", "Trade")}
        {showRightPanel && (
        <aside style={rightStyle}>
          {!isMobile && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "#696969" }}>Trade</span>{collapseBtn("right")}</div>}
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "0 2px", position: "relative" }}>
              <span style={{ width: 40, height: 4, borderRadius: 9, background: "#333" }} />
              <button onClick={() => setSheet(false)} aria-label="Close" className="lp-close" style={{ position: "absolute", right: 16, top: 0, width: 32, height: 32, borderRadius: "50%", border: 0, background: "#191919", color: "#fff", cursor: "pointer" }}>✕</button>
            </div>
          )}
          <TradePanel t={t} />

          <div style={{ borderRadius: 24, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 15 }}>Your wallet</span>
            {connected ? (
              <span style={{ fontFamily: mono, fontSize: 13, color: "#d8d8d8", wordBreak: "break-all" }}>{wallet}</span>
            ) : (
              <span style={{ fontSize: 13, color: "#A1A1A1", lineHeight: 1.5 }}>Connect a wallet to trade. Browsing and research don&apos;t need one.</span>
            )}
          </div>

          <button onClick={() => { setAiOpen(true); setSheet(false); }} className="lp-aibtn" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 20, border: "1px solid rgba(182,154,255,0.3)", background: "linear-gradient(180deg,rgba(182,154,255,0.10),rgba(182,154,255,0.03))", color: "#fff", cursor: "pointer", textAlign: "left" }}>
            <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontWeight: 600, fontSize: 14 }}>Ask AI about this token</span><span style={{ fontSize: 12, color: "#A1A1A1" }}>Answers from indexed data, with sources</span></span>
          </button>
        </aside>
        )}
      </main>

      {/* MOBILE STICKY BAR */}
      {isMobile && !sheet && !focus && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 45, display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, padding: "12px 14px", background: "rgba(5,5,5,0.92)", backdropFilter: "blur(14px)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button onClick={() => setSheet(true)} style={{ height: 50, borderRadius: 16, border: 0, fontWeight: 600, fontSize: 15, background: "#55D69A", color: "#050505", cursor: "pointer" }}>Buy</button>
          <button onClick={() => setSheet(true)} style={{ height: 50, borderRadius: 16, border: 0, fontWeight: 600, fontSize: 15, background: "#FF6868", color: "#050505", cursor: "pointer" }}>Sell</button>
          <button onClick={() => { setAiOpen(true); setSheet(false); }} aria-label="Ask AI" style={{ width: 50, height: 50, borderRadius: 16, border: "1px solid rgba(182,154,255,0.4)", background: "#0d0d0d", cursor: "pointer", display: "grid", placeItems: "center" }}><span style={{ width: 24, height: 24, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} /></button>
        </div>
      )}
      {isMobile && sheet && <div onClick={() => setSheet(false)} style={{ position: "fixed", inset: 0, zIndex: 49, background: "rgba(0,0,0,0.6)" }} />}

      {/* AI DRAWER */}
      {aiOpen && (
        <>
          <div onClick={() => setAiOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.5)" }} />
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 61, width: "min(440px,100vw)", background: "#0a0a0a", borderLeft: "1px solid rgba(255,255,255,0.09)", display: "flex", flexDirection: "column", boxShadow: "-40px 0 120px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "18px 18px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 30, height: 30, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontWeight: 600, fontSize: 15 }}>Token AI</span><span style={{ fontSize: 12, color: "#A1A1A1" }}>Context: {t.name} · ${t.sym}</span></div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setAiMsgs([])} style={{ height: 32, padding: "0 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#d8d8d8", cursor: "pointer", fontSize: 12 }}>New</button>
                <button onClick={() => setAiOpen(false)} aria-label="Close" className="lp-close" style={{ width: 32, height: 32, borderRadius: "50%", border: 0, background: "#191919", color: "#fff", cursor: "pointer" }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              <AiOfflineNotice />
              {aiMsgs.length === 0 && !aiLoading && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <span style={{ fontSize: 26, letterSpacing: "-0.03em", lineHeight: 1.1 }}>What do you want to know about {t.name}?</span>
                  <span style={{ fontSize: 13, color: "#A1A1A1", lineHeight: 1.5 }}>Answers use only the indexed bonding state, trades and launch parameters. No price predictions.</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {["Explain the current bonding progress.", "Summarise recent trading activity.", "What does the creator allocation mean?", "What are the fees on this token?"].map((qq) => (
                      <button key={qq} onClick={() => ask(qq)} className="lp-aisuggest" style={{ textAlign: "left", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "#111", color: "#e0e0e0", cursor: "pointer", fontSize: 13 }}>{qq}</button>
                    ))}
                  </div>
                </div>
              )}
              {aiMsgs.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} style={{ alignSelf: "flex-end", maxWidth: "88%", padding: "11px 15px", borderRadius: "18px 18px 4px 18px", background: "#1d1d1d", fontSize: 14, lineHeight: 1.5 }}>{m.text}</div>
                ) : (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 18, background: "#101010", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <span style={{ fontSize: 14, lineHeight: 1.6, color: "#e4e4e4", whiteSpace: "pre-wrap" }}>{m.text}</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      {m.sources.map((src) => (<span key={src} style={{ padding: "4px 9px", borderRadius: 999, background: "#181818", border: "1px solid rgba(255,255,255,0.08)", fontSize: 11, color: "#A1A1A1" }}>{src}</span>))}
                      {m.time && <span style={{ fontSize: 11, color: "#696969", marginLeft: "auto" }}>{m.time}</span>}
                    </div>
                  </div>
                ),
              )}
              {aiLoading && (<div style={{ display: "flex", gap: 6, padding: "8px 4px" }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B69AFF", animation: "oc-blink 1s infinite" }} /><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#73D9E8", animation: "oc-blink 1s .2s infinite" }} /><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F38FC4", animation: "oc-blink 1s .4s infinite" }} /></div>)}
            </div>
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); ask(aiInput); }} style={{ display: "flex", gap: 8, alignItems: "center", margin: "14px 18px 18px", padding: "6px 6px 6px 16px", borderRadius: 999, background: "#111", border: "1px solid rgba(255,255,255,0.12)" }}>
              <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Ask anything about this token..." style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 14, height: 38 }} />
              <button type="submit" aria-label="Send" className="lp-send" style={{ width: 38, height: 38, borderRadius: "50%", border: 0, background: "#fff", color: "#050505", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              </button>
            </form>
          </div>
        </>
      )}

      {walletOpen && <WalletConnectModal onClose={() => setWalletOpen(false)} />}
    </div>
  );
}
