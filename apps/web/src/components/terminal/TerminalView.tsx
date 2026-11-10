"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { useWalletStore } from "@/lib/wallet-store";
import { GRAD_TARGET, TOKENS, bySym, candles as candlesOf, fmtK, fmtP, holders as holdersOf, trades as tradesOf, view, type TokenView } from "@/lib/oryvn-data";
import { TerminalChart } from "./TerminalChart";
import { CurveViz } from "./CurveViz";

const BRAND = "oryvnlaunch";
const TFS = ["1m", "5m", "15m", "1h", "4h", "24h"];
const mono = "var(--font-geist-mono),monospace";

type Side = "buy" | "sell";
type TxStage = "review" | "preparing" | "signature" | "submitted" | "confirming" | "confirmed" | "failed";
interface Tx { stage: TxStage; side: Side; amt: string; out: string; min: string; impact: string; fee: string }

const SORTERS: Record<string, (a: TokenView, b: TokenView) => number> = {
  trending: (a, b) => b.vol * (1 + b.chg / 100) - a.vol * (1 + a.chg / 100),
  new: (a, b) => parseInt(a.age) * (a.age.includes("h") ? 60 : 1) - parseInt(b.age) * (b.age.includes("h") ? 60 : 1),
  bonding: (a, b) => b.bond - a.bond,
  volume: (a, b) => b.vol - a.vol,
};

function estimate(t: TokenView, side: Side, amtStr: string, slip: number, reserve: number) {
  const a = parseFloat(amtStr) || 0;
  if (side === "buy") {
    const fee = a * 0.01;
    const impact = (a / (reserve + a)) * 100 * 0.9;
    const out = ((a - fee) / t.price) * (1 - impact / 100);
    return { a, out: `${fmtK(out)} ${t.sym}`, min: `${fmtK(out * (1 - slip / 100))} ${t.sym}`, impact: impact.toFixed(2) + "%", impactColor: impact > 3 ? "#F3B65F" : "#A1A1A1", fee: fee.toFixed(3) + " STRK" };
  }
  const gross = a * t.price;
  const impact = (gross / (reserve || 1)) * 100 * 0.9;
  const fee = gross * 0.01;
  const out = (gross - fee) * (1 - impact / 100);
  return { a, out: `${out.toFixed(3)} STRK`, min: `${(out * (1 - slip / 100)).toFixed(3)} STRK`, impact: impact.toFixed(2) + "%", impactColor: impact > 3 ? "#F3B65F" : "#A1A1A1", fee: fee.toFixed(4) + " STRK" };
}

interface Msg { role: "user" | "ai"; text: string; sources: string[]; time?: string }

export function TerminalView({ symbol }: { symbol: string }) {
  const w = useViewportWidth();
  const wallet = useWalletStore((s) => s.wallet);
  const connecting = useWalletStore((s) => s.connecting);
  const connect = useWalletStore((s) => s.connect);
  const disconnect = useWalletStore((s) => s.disconnect);
  const hydrate = useWalletStore((s) => s.hydrate);

  const [sel, setSel] = useState(() => bySym((symbol || "BUN").toUpperCase()));
  const [tf, setTf] = useState("15m");
  const [type, setType] = useState<"candle" | "line">("candle");
  const [side, setSide] = useState<Side>("buy");
  const [amt, setAmt] = useState("10");
  const [slip, setSlip] = useState(1);
  const [act, setAct] = useState("trades");
  const [listTab, setListTab] = useState("trending");
  const [q, setQ] = useState("");
  const [walletOpen, setWalletOpen] = useState(false);
  const [tx, setTx] = useState<Tx | null>(null);
  const [copied, setCopied] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMsgs, setAiMsgs] = useState<Msg[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState<number | null>(null);
  const txTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => hydrate(), [hydrate]);
  useEffect(() => { if (wallet && walletOpen) setWalletOpen(false); }, [wallet, walletOpen]);
  useEffect(() => () => clearTimeout(txTimer.current), []);

  // Breakpoints account for the dashboard sidebar (up to 236px) beside the content.
  const isMobile = w < 1060;
  const showLeft = w >= 1400;
  const showChips = !showLeft;
  const connected = !!wallet;

  const all = useMemo(() => TOKENS.map((t, i) => view(t, i)), []);
  const query = q.trim().toLowerCase();
  const list = all
    .filter((t) => !query || t.name.toLowerCase().includes(query) || t.sym.toLowerCase().includes(query) || t.addr.toLowerCase().includes(query))
    .slice()
    .sort(SORTERS[listTab]!);
  const t = all[sel]!;

  const nC = isMobile ? 48 : 72;
  const chartH = isMobile ? 260 : 340;
  const candles = useMemo(() => candlesOf(t.sym, tf, nC, t.price), [t.sym, tf, nC, t.price]);
  const hc = candles[hover ?? nC - 1] || candles[nC - 1]!;
  const trRaw = useMemo(() => tradesOf(t.sym, 30), [t.sym]);
  const hRaw = useMemo(() => holdersOf(t.sym), [t.sym]);
  const reserve = (t.bond / 100) * GRAD_TARGET;
  const maxH = Math.max(...hRaw.map((x) => x.pct));
  const est = estimate(t, side, amt, slip, reserve);
  const amtOk = est.a > 0;
  const ago = (sec: number) => (sec < 60 ? sec + "s" : Math.floor(sec / 60) + "m");

  function runTx() {
    const seq: [TxStage, number][] = [["preparing", 700], ["signature", 1600], ["submitted", 900], ["confirming", 1800]];
    let i = 0;
    const next = () => {
      if (i < seq.length) {
        const [st, d] = seq[i++]!;
        setTx((prev) => (prev ? { ...prev, stage: st } : prev));
        txTimer.current = setTimeout(next, d);
      } else {
        setTx((prev) => (prev ? { ...prev, stage: "confirmed" } : prev));
      }
    };
    next();
  }

  async function ask(question: string) {
    const qn = question.trim();
    if (!qn || aiLoading) return;
    const history = aiMsgs.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    setAiMsgs((m) => [...m, { role: "user", text: qn, sources: [] }]);
    setAiInput("");
    setAiLoading(true);
    const buys = trRaw.filter((x) => x.buy);
    const ctx = {
      token: { name: t.name, ticker: t.sym, priceSTRK: t.price, change24hPct: t.chg, marketCapSTRK: t.mcap, volume24hSTRK: t.vol, holders: t.holders, trades: t.trades, launchedAgo: t.age, creator: t.creator },
      bonding: { progressPct: t.bond, reserveSTRK: Math.round(reserve), graduationTargetSTRK: GRAD_TARGET, model: "quadratic bonding curve template v1" },
      recentTrades: { count: trRaw.length, buys: buys.length, sells: trRaw.length - buys.length, buyVolumeSTRK: +buys.reduce((a, b) => a + b.strk, 0).toFixed(2) },
      holders: hRaw.map((hh) => ({ holder: hh.label, pct: hh.pct })),
      contract: { template: "oryvn ERC20 v1", mintable: false, ownerRenounced: true, upgradable: false, verified: true },
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
      if (/holder|concentr|wallet|distrib/.test(l)) srcs.push("Holder snapshot");
      if (/contract|mint|owner|permission|upgrad/.test(l)) srcs.push("Contract metadata");
      if (!srcs.length) srcs.push("Token stats");
      setAiMsgs((m) => [...m, { role: "ai", text: txt, sources: srcs, time: "Indexed " + new Date().toTimeString().slice(0, 5) }]);
    } catch {
      setAiMsgs((m) => [...m, { role: "ai", text: "AI is unavailable right now. The data on this page is still current — try again in a moment.", sources: [], time: "" }]);
    } finally {
      setAiLoading(false);
    }
  }

  const gridStyle: CSSProperties = { flex: 1, display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : showLeft ? "minmax(0,22fr) minmax(0,53fr) minmax(0,25fr)" : "minmax(0,1fr) minmax(300px,340px)", width: "100%", maxWidth: 1760, margin: "0 auto" };
  const rightStyle: CSSProperties = isMobile
    ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, maxHeight: "88vh", overflowY: "auto", padding: "14px 14px 24px", background: "#090909", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTop: "1px solid rgba(255,255,255,0.1)", display: sheet ? "flex" : "none", flexDirection: "column", gap: 12 }
    : { position: "sticky", top: 64, alignSelf: "start", padding: "clamp(14px,2vw,24px) clamp(14px,2vw,24px) 24px 0", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 };

  const card: CSSProperties = { borderRadius: 24, background: "#090909", border: "1px solid rgba(255,255,255,0.07)" };
  const quick = side === "buy"
    ? ["1", "5", "10", "50", "100"].map((v) => ({ label: v, v }))
    : [25, 50, 75, 100].map((p) => ({ label: p === 100 ? "Max" : p + "%", v: String(Math.round((1240000 * p) / 100)) }));

  // tx modal derived
  const order = ["preparing", "signature", "submitted", "confirming", "confirmed"];
  const cur = tx ? (tx.stage === "failed" ? 3 : order.indexOf(tx.stage)) : -1;
  const txLabels = ["Preparing transaction", "Awaiting wallet signature", "Transaction submitted", "Confirming on Starknet"];

  const searchBox = (
    <label style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", height: 40, padding: "0 14px", borderRadius: 999, background: "#101010", border: "1px solid rgba(255,255,255,0.08)" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#696969" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search token, ticker or address" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 14 }} />
    </label>
  );

  return (
    <div style={{ minHeight: "calc(100vh - 64px)", background: "#050505", display: "flex", flexDirection: "column" }}>
      {/* The dashboard shell provides the top bar, nav and wallet; the terminal only needs token search. */}
      {showChips && (
        <div style={{ padding: "12px clamp(14px,2vw,24px) 0" }}>{searchBox}</div>
      )}

      {/* CHIPS */}
      {showChips && (
        <div className="lp-noscroll" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "12px clamp(14px,2vw,24px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {list.map((c) => (
            <button key={c.sym} onClick={() => { setSel(c.idx); setHover(null); setAiMsgs([]); }} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 12px 0 4px", borderRadius: 999, border: `1px solid ${c.idx === sel ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.08)"}`, background: "#0d0d0d", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", background: c.bg }} />{c.sym}<span style={{ fontFamily: mono, fontSize: 12, color: c.chgColor }}>{c.chgStr}</span>
            </button>
          ))}
        </div>
      )}

      <main style={gridStyle}>
        {/* LEFT LIST */}
        {showLeft && (
          <aside style={{ position: "sticky", top: 64, height: "calc(100vh - 64px)", display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.07)", minWidth: 0 }}>
            <div style={{ padding: "18px 16px 10px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Discover</span>
                <span style={{ fontSize: 11, color: "#F3B65F", letterSpacing: "0.06em", textTransform: "uppercase" }}>Preview data</span>
              </div>
              <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 14, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.06)" }}>
                {[["trending", "Trending"], ["new", "New"], ["bonding", "Bonding"], ["volume", "Volume"]].map(([k, l]) => (
                  <button key={k} onClick={() => setListTab(k!)} style={{ flex: 1, height: 30, borderRadius: 10, border: 0, cursor: "pointer", fontSize: 12, fontWeight: 500, background: listTab === k ? "#1d1d1d" : "transparent", color: listTab === k ? "#fff" : "#696969" }}>{l}</button>
                ))}
              </div>
              {searchBox}
            </div>
            <div className="lp-noscroll" style={{ flex: 1, overflowY: "auto", padding: "0 8px 16px" }}>
              {list.map((c) => (
                <button key={c.sym} onClick={() => { setSel(c.idx); setHover(null); setAiMsgs([]); }} className="lp-trow" style={{ width: "100%", display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "10px 10px", borderRadius: 16, border: 0, background: c.idx === sel ? "#151515" : "transparent", color: "#fff", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 42, height: 42, borderRadius: 13, background: c.bg, color: c.ink, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{c.sym2}</span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                    <span style={{ display: "flex", gap: 6, alignItems: "baseline", minWidth: 0 }}><span style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span><span style={{ fontSize: 12, color: "#696969" }}>{c.age}</span></span>
                    <span style={{ height: 3, borderRadius: 9, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${c.bond}%`, background: c.g0 }} /></span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    <span style={{ fontFamily: mono, fontSize: 12 }}>{c.mcapStr}</span>
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

        {/* CENTER */}
        <section style={{ minWidth: 0, padding: "clamp(14px,2vw,24px)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center", minWidth: 0 }}>
              <span style={{ width: 68, height: 68, flexShrink: 0, borderRadius: 22, background: t.bg, color: t.ink, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 18, letterSpacing: "-0.03em", boxShadow: "0 12px 30px rgba(0,0,0,0.5)" }}>{t.sym2}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "clamp(24px,2.4vw,32px)", letterSpacing: "-0.03em", lineHeight: 1 }}>{t.name}</span>
                  <span style={{ fontSize: 15, color: "#A1A1A1" }}>${t.sym}</span>
                  <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(115,217,232,0.12)", color: "#73D9E8", fontSize: 12, fontWeight: 600 }}>Bonding</span>
                </div>
                <button onClick={() => { navigator.clipboard?.writeText(t.addr).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400); }} className="lp-copyaddr" style={{ display: "flex", alignItems: "center", gap: 8, padding: 0, border: 0, background: "transparent", color: "#A1A1A1", cursor: "pointer", fontFamily: mono, fontSize: 12 }}>
                  {t.addrShort}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="3" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                  <span style={{ color: "#55D69A" }}>{copied ? "Copied" : ""}</span>
                </button>
                <Link href={t.href} style={{ fontSize: 12, color: "#73D9E8" }}>Token page →</Link>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span style={{ fontFamily: mono, fontSize: "clamp(24px,2.4vw,32px)", fontWeight: 500, letterSpacing: "-0.03em" }}>{t.priceStr}</span>
              <span style={{ fontFamily: mono, fontSize: 13, whiteSpace: "nowrap", color: t.chgColor }}>{t.chgStr} · 24h</span>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 1, borderRadius: 18, overflow: "hidden", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.07)" }}>
            {[{ label: "Market cap", value: t.mcapStr + " STRK" }, { label: "Volume 24h", value: fmtK(t.vol) + " STRK" }, { label: "Holders", value: t.holdersStr }, { label: "Trades", value: t.trades.toLocaleString() }].map((s) => (
              <div key={s.label} style={{ background: "#090909", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</span>
                <span style={{ fontFamily: mono, fontSize: 16, whiteSpace: "nowrap" }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* CHART */}
          <div style={{ ...card, padding: "16px 16px 10px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 12, background: "#111" }}>
                {TFS.map((f) => (<button key={f} onClick={() => { setTf(f); setHover(null); }} style={{ height: 28, padding: "0 10px", borderRadius: 9, border: 0, cursor: "pointer", fontFamily: mono, fontSize: 12, background: tf === f ? "#fff" : "transparent", color: tf === f ? "#050505" : "#A1A1A1" }}>{f}</button>))}
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center", fontFamily: mono, fontSize: 11, color: "#696969", flexWrap: "wrap" }}>
                <span>O <span style={{ color: "#d0d0d0" }}>{fmtP(hc.o)}</span></span>
                <span>H <span style={{ color: "#d0d0d0" }}>{fmtP(hc.h)}</span></span>
                <span>L <span style={{ color: "#d0d0d0" }}>{fmtP(hc.l)}</span></span>
                <span>C <span style={{ color: hc.c >= hc.o ? "#55D69A" : "#FF6868" }}>{fmtP(hc.c)}</span></span>
                <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 10, background: "#111" }}>
                  <button onClick={() => setType("candle")} aria-label="Candles" style={{ width: 28, height: 24, borderRadius: 7, border: 0, cursor: "pointer", background: type === "candle" ? "#2a2a2a" : "transparent", color: "#fff", display: "grid", placeItems: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M7 3v18M17 3v18" /><rect x="4" y="7" width="6" height="8" rx="1" /><rect x="14" y="9" width="6" height="6" rx="1" /></svg>
                  </button>
                  <button onClick={() => setType("line")} aria-label="Line" style={{ width: 28, height: 24, borderRadius: 7, border: 0, cursor: "pointer", background: type === "line" ? "#2a2a2a" : "transparent", color: "#fff", display: "grid", placeItems: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 17 6-6 4 4 8-8" /></svg>
                  </button>
                </div>
              </div>
            </div>
            <TerminalChart candles={candles} type={type} hover={hover} setHover={setHover} height={chartH} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#696969" }}>
              <span>Preview candles · indexer not connected</span><span>{isMobile ? "" : "Hover for OHLC"}</span>
            </div>
          </div>

          {/* BONDING */}
          <div style={{ ...card, padding: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 24, alignItems: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 15, color: "#A1A1A1" }}>Bonding curve progress</span>
                <span style={{ fontFamily: mono, fontSize: 36, letterSpacing: "-0.04em" }}>{t.bond}%</span>
              </div>
              <div style={{ position: "relative", height: 14, borderRadius: 99, background: "#151515", overflow: "hidden" }}><div style={{ height: "100%", width: `${t.bond}%`, borderRadius: 99, background: t.barBg }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }}>
                {[{ label: "Current reserve", value: fmtK(reserve) + " STRK" }, { label: "Graduation target", value: fmtK(GRAD_TARGET) + " STRK" }, { label: "Remaining", value: fmtK(GRAD_TARGET - reserve) + " STRK" }, { label: "Curve price", value: t.priceStr }].map((b) => (
                  <div key={b.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, color: "#696969" }}>{b.label}</span><span style={{ fontFamily: mono, fontSize: 14 }}>{b.value}</span></div>
                ))}
              </div>
              <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5 }}>At 100% the reserve migrates to a DEX pool. Post-graduation trading isn&apos;t live on {BRAND} yet.</span>
            </div>
            <div style={{ height: 200 }}><CurveViz token={t} /></div>
          </div>

          {/* ACTIVITY */}
          <div style={{ ...card, overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 4, padding: "12px 12px 0" }}>
              {[["trades", "Recent trades"], ["holders", "Holders"]].map(([k, l]) => (
                <button key={k} onClick={() => setAct(k!)} style={{ height: 34, padding: "0 14px", borderRadius: 999, border: 0, cursor: "pointer", fontSize: 13, fontWeight: 500, background: act === k ? "#1d1d1d" : "transparent", color: act === k ? "#fff" : "#696969" }}>{l}</button>
              ))}
            </div>
            {act === "trades" ? (
              <div style={{ padding: "8px 12px 12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "56px minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr) 56px", gap: 10, padding: "8px 8px", fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <span>Side</span><span>STRK</span><span>{t.sym}</span><span>Wallet</span><span style={{ textAlign: "right" }}>Time</span>
                </div>
                {trRaw.slice(0, 14).map((r, i) => (
                  <a key={i} href="#" className="lp-trade-row" style={{ display: "grid", gridTemplateColumns: "56px minmax(0,1fr) minmax(0,1fr) minmax(0,1.1fr) 56px", gap: 10, alignItems: "center", padding: "9px 8px", borderRadius: 10, fontFamily: mono, fontSize: 12, color: "#d8d8d8" }}>
                    <span style={{ color: r.buy ? "#55D69A" : "#FF6868", fontFamily: "var(--font-geist-sans),sans-serif", fontWeight: 600 }}>{r.buy ? "Buy" : "Sell"}</span>
                    <span>{r.strk.toFixed(3)}</span>
                    <span style={{ color: "#A1A1A1" }}>{fmtK(r.strk / t.price)}</span>
                    <span style={{ color: "#A1A1A1", overflow: "hidden", textOverflow: "ellipsis" }}>{r.wallet}</span>
                    <span style={{ textAlign: "right", color: "#696969" }}>{ago(r.t)}</span>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, color: "#696969" }}>Top 10 wallets (excl. curve)</span><span style={{ fontFamily: mono, fontSize: 20 }}>{hRaw.slice(1).reduce((a, b) => a + b.pct, 0).toFixed(1)}%</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, color: "#696969" }}>Creator allocation</span><span style={{ fontFamily: mono, fontSize: 20 }}>{hRaw[1]!.pct}%</span></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 12, color: "#696969" }}>Holders</span><span style={{ fontFamily: mono, fontSize: 20 }}>{t.holdersStr}</span></div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {hRaw.map((hh, i) => {
                    const tag = i === 0 ? "Curve" : hh.creator ? "Creator" : "";
                    const tagBg = i === 0 ? "#73D9E8" : hh.creator ? "#F38FC4" : "transparent";
                    const color = i === 0 ? "#73D9E8" : hh.creator ? "#F38FC4" : "rgba(255,255,255,0.45)";
                    return (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(110px,180px) minmax(0,1fr) 56px", gap: 14, alignItems: "center", fontSize: 13 }}>
                        <span style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: mono, fontSize: 12, color: "#d8d8d8" }}>{hh.label}{tag && <span style={{ fontFamily: "var(--font-geist-sans),sans-serif", fontSize: 10, padding: "2px 7px", borderRadius: 99, background: tagBg, color: "#050505" }}>{tag}</span>}</span>
                        <span style={{ height: 8, borderRadius: 99, background: "#151515", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(hh.pct / maxH) * 100}%`, borderRadius: 99, background: color }} /></span>
                        <span style={{ textAlign: "right", fontFamily: mono, fontSize: 12 }}>{hh.pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {isMobile && <div style={{ height: 80 }} />}
        </section>

        {/* RIGHT: TRADE */}
        <aside style={rightStyle}>
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "0 2px", position: "relative" }}>
              <span style={{ width: 40, height: 4, borderRadius: 9, background: "#333" }} />
              <button onClick={() => setSheet(false)} aria-label="Close" style={{ position: "absolute", right: 16, top: 0, width: 32, height: 32, borderRadius: "50%", border: 0, background: "#191919", color: "#fff", cursor: "pointer" }}>✕</button>
            </div>
          )}
          <div style={{ borderRadius: 24, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: 16, background: "#050505" }}>
              <button onClick={() => { setSide("buy"); setAmt("10"); }} style={{ height: 40, borderRadius: 12, border: 0, cursor: "pointer", fontWeight: 600, fontSize: 14, background: side === "buy" ? "#55D69A" : "transparent", color: side === "buy" ? "#050505" : "#A1A1A1" }}>Buy</button>
              <button onClick={() => { setSide("sell"); setAmt("310000"); }} style={{ height: 40, borderRadius: 12, border: 0, cursor: "pointer", fontWeight: 600, fontSize: 14, background: side === "sell" ? "#FF6868" : "transparent", color: side === "sell" ? "#050505" : "#A1A1A1" }}>Sell</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 18, background: "#050505", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#696969" }}><span>{side === "buy" ? "You pay" : "You sell"}</span><span>{connected ? (side === "buy" ? "Balance 248.50" : "Balance 1.24M") : "Wallet not connected"}</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontFamily: mono, fontSize: 28, letterSpacing: "-0.03em" }} />
                <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px 6px 6px", borderRadius: 999, background: "#151515", fontSize: 13, fontWeight: 600 }}><span style={{ width: 20, height: 20, borderRadius: "50%", background: side === "buy" ? "linear-gradient(135deg,#568BFF,#B69AFF)" : t.bg }} />{side === "buy" ? "STRK" : t.sym}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 6 }}>
              {quick.map((k) => (<button key={k.label} onClick={() => setAmt(k.v)} className="lp-quick" style={{ height: 32, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: amt === k.v ? "#1c1c1c" : "transparent", color: "#d8d8d8", cursor: "pointer", fontFamily: mono, fontSize: 12 }}>{k.label}</button>))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#A1A1A1" }}>You receive (est.)</span><span style={{ fontFamily: mono }}>{est.out}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#A1A1A1" }}>Minimum received</span><span style={{ fontFamily: mono, color: "#A1A1A1" }}>{est.min}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#A1A1A1" }}>Price impact</span><span style={{ fontFamily: mono, color: est.impactColor }}>{est.impact}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#A1A1A1" }}>Platform fee (1%)</span><span style={{ fontFamily: mono, color: "#A1A1A1" }}>{est.fee}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ color: "#A1A1A1" }}>Slippage</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0.5, 1, 2].map((v) => (<button key={v} onClick={() => setSlip(v)} style={{ height: 26, padding: "0 9px", borderRadius: 8, border: 0, cursor: "pointer", fontFamily: mono, fontSize: 11, background: slip === v ? "#2a2a2a" : "#141414", color: slip === v ? "#fff" : "#A1A1A1" }}>{v}%</button>))}
                </div>
              </div>
            </div>
            <button onClick={() => { if (!connected) setWalletOpen(true); else if (amtOk) { setSheet(false); setTx({ stage: "review", side, amt, out: est.out, min: est.min, impact: est.impact, fee: est.fee }); } }} disabled={connected && !amtOk} className="lp-bright" style={{ height: 52, borderRadius: 16, border: 0, cursor: "pointer", fontWeight: 600, fontSize: 15, background: !connected ? "#fff" : side === "buy" ? "#55D69A" : "#FF6868", color: "#050505", opacity: connected && !amtOk ? 0.45 : 1 }}>{!connected ? "Connect wallet to trade" : !amtOk ? "Enter an amount" : `${side === "buy" ? "Buy" : "Sell"} ${t.sym}`}</button>
            <span style={{ fontSize: 11, color: "#696969", textAlign: "center", lineHeight: 1.5 }}>Estimates from the bonding-curve formula. Final amounts are set on-chain.</span>
          </div>

          <div style={{ borderRadius: 24, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 15 }}>Your position</span><span style={{ fontSize: 11, color: "#F3B65F", letterSpacing: "0.06em", textTransform: "uppercase" }}>Preview</span></div>
            {connected ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ color: "#696969" }}>STRK balance</span><span style={{ fontFamily: mono, fontSize: 14 }}>248.50</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ color: "#696969" }}>{t.sym} held</span><span style={{ fontFamily: mono, fontSize: 14 }}>1.24M</span></div>
              </div>
            ) : (
              <span style={{ fontSize: 13, color: "#A1A1A1", lineHeight: 1.5 }}>Connect a wallet to see balances. Browsing and research don&apos;t need one.</span>
            )}
          </div>

          <button onClick={() => { setAiOpen(true); setSheet(false); }} className="lp-aibtn" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 20, border: "1px solid rgba(182,154,255,0.3)", background: "linear-gradient(180deg,rgba(182,154,255,0.10),rgba(182,154,255,0.03))", color: "#fff", cursor: "pointer", textAlign: "left" }}>
            <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontWeight: 600, fontSize: 14 }}>Ask AI about this token</span><span style={{ fontSize: 12, color: "#A1A1A1" }}>Answers from indexed data, with sources</span></span>
          </button>
        </aside>
      </main>

      {/* MOBILE STICKY BAR */}
      {isMobile && !sheet && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 45, display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, padding: "12px 14px", background: "rgba(5,5,5,0.92)", backdropFilter: "blur(14px)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button onClick={() => { setSheet(true); setSide("buy"); setAmt("10"); }} style={{ height: 50, borderRadius: 16, border: 0, fontWeight: 600, fontSize: 15, background: "#55D69A", color: "#050505", cursor: "pointer" }}>Buy</button>
          <button onClick={() => { setSheet(true); setSide("sell"); setAmt("310000"); }} style={{ height: 50, borderRadius: 16, border: 0, fontWeight: 600, fontSize: 15, background: "#FF6868", color: "#050505", cursor: "pointer" }}>Sell</button>
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
              {aiMsgs.length === 0 && !aiLoading && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <span style={{ fontSize: 26, letterSpacing: "-0.03em", lineHeight: 1.1 }}>What do you want to know about {t.name}?</span>
                  <span style={{ fontSize: 13, color: "#A1A1A1", lineHeight: 1.5 }}>Answers use only the indexed bonding state, trades and holder snapshot. No price predictions.</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {["Explain the current bonding progress.", "Summarise recent trading activity.", "Explain the holder distribution.", "What contract permissions does this token have?", "What changed recently?"].map((qq) => (
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
                    <button onClick={() => { navigator.clipboard?.writeText(m.text).catch(() => {}); setCopiedMsg(i); }} className="lp-copyaddr" style={{ alignSelf: "flex-start", height: 26, padding: "0 10px", borderRadius: 999, border: 0, background: "#181818", color: "#A1A1A1", cursor: "pointer", fontSize: 11 }}>{copiedMsg === i ? "Copied" : "Copy"}</button>
                  </div>
                )
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

      {/* TX MODAL */}
      {tx && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 440, borderRadius: 28, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", padding: 24, display: "flex", flexDirection: "column", gap: 18, boxShadow: "0 40px 120px rgba(0,0,0,0.7)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{tx.stage === "review" ? "Confirm trade" : tx.stage === "confirmed" ? "Trade confirmed" : tx.stage === "failed" ? "Transaction failed" : "Processing"}</span>
              {["review", "confirmed", "failed"].includes(tx.stage) && <button onClick={() => { clearTimeout(txTimer.current); setTx(null); }} aria-label="Close" className="lp-close" style={{ width: 34, height: 34, borderRadius: "50%", border: 0, background: "#191919", color: "#fff", cursor: "pointer" }}>✕</button>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.07)" }}>
              <span style={{ width: 48, height: 48, borderRadius: 15, background: t.bg, color: t.ink, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13 }}>{t.sym2}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ fontWeight: 600 }}>{tx.side === "buy" ? "Buy" : "Sell"} {t.sym}</span><span style={{ fontFamily: mono, fontSize: 13, color: "#A1A1A1" }}>{tx.side === "buy" ? `${tx.amt} STRK → ${tx.out}` : `${tx.amt} ${t.sym} → ${tx.out}`}</span></div>
            </div>
            {tx.stage === "review" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 13 }}>
                {[{ k: "Estimated output", v: tx.out }, { k: "Minimum received", v: tx.min }, { k: "Price impact", v: tx.impact }, { k: "Platform fee", v: tx.fee }, { k: "Slippage tolerance", v: slip + "%" }, { k: "Network fee (est.)", v: "~0.004 STRK" }, { k: "Network", v: "Starknet Mainnet" }].map((r) => (
                  <div key={r.k} style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#A1A1A1" }}>{r.k}</span><span style={{ fontFamily: mono }}>{r.v}</span></div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {txLabels.map((lab, i) => {
                  const done = i < cur || tx.stage === "confirmed";
                  const active = i === cur && tx.stage !== "confirmed";
                  const failed = tx.stage === "failed" && i === 3;
                  return (
                    <div key={lab} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: done || active ? "#fff" : "#696969" }}>
                      <span style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", border: failed || done ? "0" : active ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)", background: failed ? "#FF6868" : done ? "#55D69A" : "transparent", animation: active ? "oc-blink 1.2s infinite" : "none", fontSize: 12, color: "#050505" }}>{failed ? "!" : done ? "✓" : ""}</span>{lab}
                    </div>
                  );
                })}
              </div>
            )}
            {(cur >= 2 || tx.stage === "confirmed") && <a href="#" className="lp-copyaddr" style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "10px 12px", borderRadius: 12, background: "#0a0a0a", color: "#A1A1A1" }}>Tx <span style={{ fontFamily: mono }}>0x07a3…e91f ↗</span></a>}
            <span style={{ fontSize: 12, color: tx.stage === "failed" ? "#FF6868" : "#A1A1A1", lineHeight: 1.5 }}>{tx.stage === "review" ? "Your wallet will ask you to approve. Nothing is sent until you sign." : tx.stage === "confirmed" ? "Included in a Starknet block. Balances update after the indexer catches up." : tx.stage === "failed" ? "The transaction reverted — slippage exceeded. No funds left your wallet except the network fee." : tx.stage === "signature" ? "Check your wallet extension to approve." : "Keep this window open. We only show success once the transaction is confirmed on-chain."}</span>
            {["review", "confirmed", "failed"].includes(tx.stage) && (
              <button onClick={() => { if (tx.stage === "review") runTx(); else if (tx.stage === "failed") setTx({ ...tx, stage: "review" }); else setTx(null); }} className="lp-bright" style={{ height: 52, borderRadius: 16, border: 0, cursor: "pointer", fontWeight: 600, fontSize: 15, background: tx.stage === "review" ? (tx.side === "buy" ? "#55D69A" : "#FF6868") : "#fff", color: "#050505" }}>{tx.stage === "review" ? "Confirm in wallet" : tx.stage === "failed" ? "Try again" : "Done"}</button>
            )}
          </div>
        </div>
      )}

      {/* WALLET MODAL */}
      {walletOpen && (
        <div onClick={() => setWalletOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 18 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, borderRadius: 28, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{connected ? "Wallet" : "Connect wallet"}</span>
              <button onClick={() => setWalletOpen(false)} aria-label="Close" className="lp-close" style={{ width: 34, height: 34, borderRadius: "50%", border: 0, background: "#191919", color: "#fff", cursor: "pointer" }}>✕</button>
            </div>
            <span style={{ fontSize: 13, color: "#A1A1A1", display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#55D69A" }} />Starknet Mainnet</span>
            {connected ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ padding: 14, borderRadius: 18, background: "#0a0a0a", fontFamily: mono, fontSize: 14 }}>{wallet}</div>
                <button onClick={() => { disconnect(); setWalletOpen(false); }} className="lp-disconnect" style={{ height: 48, borderRadius: 14, border: "1px solid rgba(255,104,104,0.4)", background: "transparent", color: "#FF6868", cursor: "pointer", fontWeight: 600 }}>Disconnect wallet</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[{ name: "Argent X", color: "linear-gradient(135deg,#FF9865,#FF7777)", initial: "A" }, { name: "Braavos", color: "linear-gradient(135deg,#F3B65F,#FFE6BD)", initial: "B" }].map((wlt) => (
                  <button key={wlt.name} onClick={() => connect(wlt.name)} className="lp-walletopt" style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 18, border: "1px solid rgba(255,255,255,0.09)", background: "#141414", color: "#fff", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ width: 40, height: 40, borderRadius: 12, background: wlt.color, display: "grid", placeItems: "center", fontWeight: 700, color: "#050505" }}>{wlt.initial}</span>
                    <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontWeight: 600, fontSize: 15 }}>{wlt.name}</span><span style={{ fontSize: 12, color: "#A1A1A1" }}>{connecting === wlt.name ? "Approve the connection in your wallet…" : "Browser extension"}</span></span>
                  </button>
                ))}
              </div>
            )}
            <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5 }}>Preview: connection is simulated. Every transaction needs your approval in the wallet.</span>
          </div>
        </div>
      )}
    </div>
  );
}
