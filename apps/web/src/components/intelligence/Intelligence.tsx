"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { NETWORK, NETWORK_LABEL } from "@/lib/config";
import { api } from "@/lib/api";
import { buildBrief, sinceLabel, type Signal } from "@/lib/brief";
import { compact, toNumber, usdOr } from "@/lib/format";
import { loadRuns, newRunId, saveRuns, withoutRun } from "@/lib/research-history";
import { useLaunches, useStrkUsd, type Token } from "@/lib/useApi";
import { Contour } from "@/components/landing/Contour";
import { AiOfflineNotice } from "@/components/ui/AiOfflineNotice";
import { RichText } from "@/components/ui/RichText";
import { TokenAvatar } from "@/components/ui/TokenAvatar";

interface Report {
  headline?: string;
  overview: string; contract: string; tokenomics: string; holders: string; activity: string;
  risks: string[]; missing: string[]; coverage: Record<string, number>;
}
interface Stat { label: string; value: string; sub?: string; color?: string }
interface Run { id: string; q: string; addr: string; time: string; report: Report | null; data: any; follow: { q: string; a: string }[] }

const COV = ["No data", "Limited", "Partial", "Full coverage"];
const COVC = ["#FF6868", "#F3B65F", "#72BFFF", "#55D69A"];
const TONE: Record<Signal["tone"], { fg: string; bg: string; line: string }> = {
  good: { fg: "#55D69A", bg: "rgba(85,214,154,0.08)", line: "rgba(85,214,154,0.28)" },
  warn: { fg: "#F3B65F", bg: "rgba(243,182,95,0.08)", line: "rgba(243,182,95,0.3)" },
  neutral: { fg: "#c9c9c9", bg: "rgba(255,255,255,0.04)", line: "rgba(255,255,255,0.1)" },
};
const SEC: [string, string, string[]][] = [
  ["overview", "Overview", ["Token stats"]],
  ["contract", "Contract information", ["Launch record"]],
  ["tokenomics", "Tokenomics", ["Launch parameters", "Bonding state"]],
  ["holders", "Holder distribution", ["Holder balances"]],
  ["activity", "Recent activity", ["Trades · last 30"]],
  ["risks", "Potential risks", ["Bonding state", "Launch parameters"]],
  ["missing", "Missing information", []],
];
const CTX_KEY = "oryvn.research.ctx";
const mono = "var(--font-geist-mono),monospace";

/** What the AI is allowed to see about a token: only values the indexer actually holds, plus the plain-facts brief. */
async function ctxData(t: Token, strkUsd: number | null) {
  const [{ items }, holders] = await Promise.all([api.trades(t.addr, { limit: 30 }), api.holders(t.addr, 5)]);
  const dec = t.quote.decimals;
  const { facts, signals } = buildBrief(t, items, holders);
  const usd = (n: number) => usdOr(n, t.quote.symbol, strkUsd, `${compact(n)} ${t.quote.symbol}`);
  const stats: Stat[] = [
    { label: "Price", value: t.priceStr, sub: `${t.quote.symbol} per token` },
    { label: "24h change", value: t.chgStr, color: t.chgColor },
    { label: "Market cap", value: usd(t.mcap), sub: strkUsd === null ? undefined : `${t.mcapStr} ${t.quote.symbol}` },
    { label: "Volume", value: usd(t.vol), sub: strkUsd === null ? undefined : `${t.volStr} ${t.quote.symbol}` },
    { label: "Holders", value: facts.holderWallets === null ? "n/a" : String(facts.holderWallets) },
    { label: "Trades", value: t.trades.toLocaleString() },
    { label: "Last trade", value: facts.lastTradeMinutes === null ? "none yet" : sinceLabel(facts.lastTradeMinutes) },
    { label: "Creator holds", value: facts.creatorSharePct === null ? "n/a" : `${facts.creatorSharePct}%` },
  ];
  const sumBuy = facts.buyVolume;
  const sumSell = facts.sellVolume;
  return {
    name: t.name, ticker: t.sym, address: t.addr, creator: t.creator, age: t.age, quoteAsset: t.quote.symbol,
    price: t.price, change24hPct: t.chg, marketCap: t.mcap, volume: t.vol, trades: t.trades,
    marketCapUsd: strkUsd === null || t.quote.symbol !== "STRK" ? null : +(t.mcap * strkUsd).toFixed(2),
    bonding: { progressPct: t.bond, graduationRaise: toNumber(t.launch.graduationRaise, dec), graduated: t.graduated, preset: t.launch.preset.name },
    supply: { total: 1e9, creatorPct: t.launch.creatorBps / 100, mintable: false },
    fees: { tradeFeePct: t.launch.tradeFee.bps / 100, creatorSharePct: t.launch.tradeFee.creatorShareBps / 100 },
    last30Trades: { buys: facts.buys, sells: facts.sells, buyVolume: +sumBuy.toFixed(6), sellVolume: +sumSell.toFixed(6) },
    holders: { wallets: facts.holderWallets, top10SharePct: facts.top10SharePct, creatorSharePct: facts.creatorSharePct, note: "the bonding curve and the reserved share are not counted as holders" },
    facts,
    signals: signals.map((s) => ({ label: s.label, detail: s.detail })),
    unavailable: ["off-chain team identity", "social data", "DEX liquidity (no pool exists)"],
    view: { stats, signals, bond: t.bond, graduated: t.graduated, barBg: t.barBg, remaining: facts.remaining, raised: facts.raised, target: facts.target, unit: t.quote.symbol },
  };
}

function Orb({ size = 30 }: { size?: number }) {
  return <span style={{ width: size, height: size, flexShrink: 0, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />;
}

function Typing() {
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center", padding: "4px 0" }} aria-label="Thinking">
      {["#B69AFF", "#73D9E8", "#F38FC4"].map((c, i) => (<span key={c} style={{ width: 7, height: 7, borderRadius: "50%", background: c, animation: `oc-blink 1s ${i * 0.2}s infinite` }} />))}
    </span>
  );
}

/** Plain-facts brief: stats, curve progress and signals. Worked out locally, so it shows even when the AI is slow. */
function BriefCard({ view, headline, waiting }: { view: any; headline?: string; waiting: boolean }) {
  if (!view) return null;
  const stats = view.stats as Stat[];
  const signals = view.signals as Signal[];
  return (
    <section style={{ borderRadius: 24, background: "linear-gradient(180deg,#0f0f12,#0b0b0b)", border: "1px solid rgba(182,154,255,0.22)", padding: "clamp(16px,2.2vw,24px)", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#B69AFF" }}>At a glance</span>
        {headline ? (
          <p style={{ margin: 0, fontSize: "clamp(18px,2vw,22px)", lineHeight: 1.4, letterSpacing: "-0.02em", color: "#fff", textWrap: "pretty" }}><RichText text={headline} /></p>
        ) : waiting ? (
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#A1A1A1" }}><Typing />Writing the summary…</span>
        ) : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 1, borderRadius: 16, overflow: "hidden", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.07)" }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "#0b0b0b", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 10.5, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{s.label}</span>
            <span style={{ fontFamily: mono, fontSize: 15, letterSpacing: "-0.02em", color: s.color ?? "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.value}</span>
            <span style={{ fontFamily: mono, fontSize: 11, color: "#696969", minHeight: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.sub ?? ""}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#A1A1A1" }}>
          <span>{view.graduated ? "Graduated" : "Bonding curve"}</span>
          <span style={{ fontFamily: mono }}>{view.bond}% · {view.raised.toFixed(2)} of {view.target.toFixed(0)} {view.unit} raised</span>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: "#151515", overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, view.bond)}%`, background: view.barBg, borderRadius: 99 }} /></div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {signals.map((s) => {
          const c = TONE[s.tone];
          return (
            <span key={s.label} title={s.detail} style={{ display: "inline-flex", flexDirection: "column", gap: 2, padding: "8px 12px", borderRadius: 14, background: c.bg, border: `1px solid ${c.line}`, maxWidth: 260 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: c.fg }}>{s.label}</span>
              <span style={{ fontSize: 11.5, color: "#a8a8a8", lineHeight: 1.35 }}>{s.detail}</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}

export function Intelligence() {
  const w = useViewportWidth();
  const strkUsd = useStrkUsd();
  const [q, setQ] = useState("");
  const launches = useLaunches({ sort: "newest" }, 15_000);
  const tokens = launches.data?.tokens ?? [];
  const [picked, setPicked] = useState("");
  const ctx = picked || tokens[0]?.addr || "";
  const [vw, setVw] = useState<"home" | "report">("home");
  const [runs, setRuns] = useState<Run[]>([]);
  const [curId, setCurId] = useState("");
  const [loadingId, setLoadingId] = useState("");
  const [failedId, setFailedId] = useState("");
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState(false);
  // Saved research has been read back. Until then nothing is written, or the empty starting list would
  // overwrite what was saved.
  const [ready, setReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seen = useRef({ id: "", count: 0, asking: false, answered: false });

  const showSide = w >= 1000;

  // Pick up saved research and the last token chosen. Saved research is kept in this browser only.
  useEffect(() => {
    setRuns(loadRuns() as Run[]);
    try {
      const last = window.localStorage.getItem(CTX_KEY);
      if (last) setPicked(last);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) saveRuns(runs);
  }, [runs, ready]);
  useEffect(() => {
    if (!picked) return;
    try {
      window.localStorage.setItem(CTX_KEY, picked);
    } catch {
      /* ignore */
    }
  }, [picked]);

  const run = runs.find((r) => r.id === curId);
  const patch = (id: string, change: (r: Run) => Run) => setRuns((prev) => prev.map((r) => (r.id === id ? change(r) : r)));

  // Keep the newest message in view, but only when something is added to the conversation, never on a refresh.
  useEffect(() => {
    if (vw !== "report" || !run) return;
    const answered = run.follow.length > 0 && run.follow[run.follow.length - 1]!.a !== "";
    // Scroll when a message is added, and again when its answer lands (it is taller than the typing dots).
    const grew = seen.current.id === run.id && (run.follow.length > seen.current.count || (asking && !seen.current.asking) || (answered && !seen.current.answered));
    seen.current = { id: run.id, count: run.follow.length, asking, answered };
    if (grew) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [vw, run, asking]);

  async function research(question: string, addrArg?: string) {
    const ques = question.trim();
    const addr = addrArg || ctx;
    const primary = tokens.find((tk) => tk.addr === addr);
    if (!ques || !primary) return;
    const others = tokens.filter((tk) => tk.addr !== addr && (ques.toUpperCase().includes(tk.sym.toUpperCase()) || ques.toLowerCase().includes(tk.name.toLowerCase()))).slice(0, 1);
    const id = newRunId();
    const time = new Date().toTimeString().slice(0, 5);
    setQ("");
    setVw("report");
    setCurId(id);
    setFailedId("");
    setLoadingId(id);
    setRuns((prev) => [...prev, { id, q: ques, addr, time, report: null, data: null, follow: [] }]);
    let data: any;
    try {
      data = { primary: await ctxData(primary, strkUsd), compare: await Promise.all(others.map((tk) => ctxData(tk, strkUsd))) };
    } catch {
      setLoadingId("");
      setFailedId(id);
      return;
    }
    patch(id, (r) => ({ ...r, data }));
    try {
      const res = await fetch("/api/ai/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: ques, data: stripView(data) }) });
      if (!res.ok) throw new Error("ai");
      const report = (await res.json()) as Report;
      patch(id, (r) => ({ ...r, report }));
      setLoadingId("");
    } catch {
      setLoadingId("");
      setFailedId(id);
    }
  }

  async function followUp(question: string) {
    const ques = question.trim();
    if (!ques || !run || !run.data || asking) return;
    const id = run.id;
    const p = run.data.primary;
    // The conversation so far, so a follow-up can refer back to an earlier answer.
    const history = run.follow.flatMap((f) => [{ role: "user", content: f.q }, { role: "assistant", content: f.a }]).slice(-8);
    setQ("");
    setAsking(true);
    patch(id, (r) => ({ ...r, follow: [...r.follow, { q: ques, a: "" }] }));
    const setAnswer = (a: string) => patch(id, (r) => ({ ...r, follow: r.follow.map((f, i) => (i === r.follow.length - 1 ? { ...f, a } : f)) }));
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...history, { role: "user", content: ques }], context: { token: { name: p.name, ticker: p.ticker, bondingPct: p.bonding.progressPct, quoteAsset: p.quoteAsset }, research: stripView(run.data) } }),
      });
      if (!res.ok) throw new Error("ai");
      const j = (await res.json()) as { text?: string };
      setAnswer((j.text ?? "").trim() || "AI is unavailable right now. Try again in a moment.");
    } catch {
      setAnswer("AI is unavailable right now. Try again in a moment.");
    } finally {
      setAsking(false);
    }
  }

  function removeRun(id: string) {
    setRuns((prev) => withoutRun(prev, id));
    if (id === curId) {
      setCurId("");
      setVw("home");
    }
  }
  function clearAll() {
    if (runs.length === 0) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete all ${runs.length} saved research ${runs.length === 1 ? "chat" : "chats"}? This cannot be undone.`)) return;
    setRuns([]);
    setCurId("");
    setVw("home");
  }
  const clearReplies = (id: string) => patch(id, (r) => ({ ...r, follow: [] }));
  const open = (id: string) => { setCurId(id); setVw("report"); setFailedId(""); };

  const taddr = run ? run.addr : ctx;
  const tok = tokens.find((tk) => tk.addr === taddr);
  const R = run?.report ?? null;
  const view = run?.data?.primary?.view ?? null;

  const sections = !R
    ? []
    : SEC.map(([k, title, src], i) => {
        const c = Math.max(0, Math.min(3, (R.coverage?.[k] ?? 2)));
        const val = (R as any)[k];
        const arr = Array.isArray(val) ? (val as string[]) : null;
        return { n: String(i + 1).padStart(2, "0"), title, text: arr ? "" : String(val ?? "n/a"), items: arr ?? [], hasItems: !!arr, dot: k === "risks" ? "#F3B65F" : "#696969", sources: src, cov: COV[c]!, covColor: COVC[c]!, c: c };
      });

  const ctxSym = tokens.find((tk) => tk.addr === ctx)?.sym;
  const other = tokens.find((tk) => tk.addr !== ctx);
  const prompts = [
    "Explain how its bonding curve works",
    "Summarise its recent transactions",
    "What does the creator allocation mean?",
    "What fees does it charge?",
    ...(ctxSym && other ? [`Compare $${ctxSym} with $${other.sym}`] : []),
  ];
  const asked = new Set((run?.follow ?? []).map((f) => f.q));
  const suggestions = [
    "Who holds this token and how concentrated is it?",
    "What happened in the most recent trades?",
    "How far is it from graduating, and what happens then?",
    "How do the trading fees work for the creator?",
    "What are the biggest unknowns here?",
  ].filter((s) => !asked.has(s));
  const showLoading = loadingId === curId && curId !== "";
  const showFailed = failedId === curId && curId !== "";

  const iconBtn = { height: 34, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#ddd", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 } as const;

  const composer = (placeholder: string, onSubmit: () => void, busy: boolean) => (
    <form onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }} style={{ position: "sticky", bottom: 16, zIndex: 5, display: "flex", gap: 8, alignItems: "center", padding: "6px 6px 6px 18px", borderRadius: 999, background: "rgba(16,16,16,0.94)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 18px 50px rgba(0,0,0,0.55)" }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} disabled={busy} maxLength={400} style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 15, height: 40 }} />
      <button type="submit" disabled={busy || !q.trim()} style={{ height: 40, padding: "0 20px", borderRadius: 999, border: 0, background: busy || !q.trim() ? "#2a2a2a" : "#fff", color: busy || !q.trim() ? "#777" : "#050505", fontWeight: 600, cursor: busy || !q.trim() ? "default" : "pointer" }}>{busy ? "…" : "Ask"}</button>
    </form>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: showSide ? "270px minmax(0,1fr)" : "minmax(0,1fr)", minHeight: "calc(100vh - 65px)" }}>
      {showSide && (
        <aside style={{ borderRight: "1px solid rgba(255,255,255,0.07)", padding: "20px 14px", display: "flex", flexDirection: "column", gap: 8, position: "sticky", top: 64, alignSelf: "start", maxHeight: "calc(100vh - 64px)", overflowY: "auto" }}>
          <button onClick={() => { setVw("home"); setQ(""); }} className="lp-h111" style={{ height: 42, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>+ New research</button>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 8px 4px" }}>
            <span style={{ fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>History</span>
            {runs.length > 0 && <button onClick={clearAll} style={{ border: 0, background: "transparent", color: "#8a8a8a", fontSize: 11, cursor: "pointer", padding: 0 }}>Clear all</button>}
          </div>
          {runs.length === 0 && <span style={{ padding: "0 8px", fontSize: 12, color: "#5a5a5a" }}>Your research appears here and is kept on this device.</span>}
          {[...runs].reverse().map((r) => (
            <div key={r.id} className="lp-h121" style={{ position: "relative", borderRadius: 12, background: r.id === curId && vw === "report" ? "#141414" : "transparent" }}>
              <button onClick={() => open(r.id)} style={{ width: "100%", textAlign: "left", padding: "10px 34px 10px 10px", borderRadius: 12, border: 0, background: "transparent", color: "#d8d8d8", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 13, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.q}</span>
                <span style={{ fontSize: 11, color: "#696969" }}>${tokens.find((tk) => tk.addr === r.addr)?.sym ?? "token"} · {r.time}</span>
              </button>
              <button onClick={() => removeRun(r.id)} aria-label={`Delete research: ${r.q}`} title="Delete" style={{ position: "absolute", top: 8, right: 6, width: 24, height: 24, borderRadius: "50%", border: 0, background: "transparent", color: "#777", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
              </button>
            </div>
          ))}
        </aside>
      )}

      <main style={{ minWidth: 0, position: "relative" }}>
        {!showSide && runs.length > 0 && (
          <div className="lp-noscroll" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "12px clamp(14px,3vw,24px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            {[...runs].reverse().map((r) => (
              <button key={r.id} onClick={() => open(r.id)} style={{ flexShrink: 0, maxWidth: 220, height: 34, padding: "0 12px", borderRadius: 999, border: `1px solid ${r.id === curId && vw === "report" ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"}`, background: "#0d0d0d", color: "#d8d8d8", fontSize: 12, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.q}</button>
            ))}
          </div>
        )}

        {vw === "home" || !run ? (
          <section style={{ position: "relative", overflow: "hidden", minHeight: "calc(100vh - 65px)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}><Contour density={44} seed={29} opacity={0.13} /></div>
            <div style={{ position: "relative", maxWidth: 900, width: "100%", margin: "0 auto", padding: "60px clamp(18px,4vw,40px) 120px", display: "flex", flexDirection: "column", gap: 26 }}>
              <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#B69AFF" }}>AI Intelligence</span>
              <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(46px,6.6vw,96px)", letterSpacing: "-0.045em", lineHeight: 0.95 }}>Understand more than the price.</h1>
              <p style={{ margin: 0, color: "#A1A1A1", fontSize: 17, maxWidth: 560, lineHeight: 1.55 }}>Explore token activity, contract information and market behaviour with AI.</p>
              <AiOfflineNotice />
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); void research(q); }} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10, borderRadius: 28, background: "rgba(16,16,16,0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 30px 90px rgba(0,0,0,0.6)" }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about a token..." maxLength={400} style={{ height: 56, padding: "0 14px", background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 19 }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 6px 0 12px", borderRadius: 999, background: "#191919", fontSize: 13, color: "#A1A1A1" }}>Context
                    <select value={ctx} onChange={(e) => setPicked(e.target.value)} style={{ height: 30, borderRadius: 999, border: 0, background: "#252525", color: "#fff", padding: "0 10px", fontSize: 13, outline: "none" }}>
                      {tokens.length === 0 && <option value="">No tokens launched yet</option>}
                      {tokens.map((tk) => (<option key={tk.addr} value={tk.addr}>{tk.name} · ${tk.sym}</option>))}
                    </select>
                  </label>
                  <button type="submit" className="lp-send" style={{ height: 44, padding: "0 22px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer" }}>Research</button>
                </div>
              </form>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {prompts.map((p) => (<button key={p} onClick={() => void research(p)} className="lp-prompt" style={{ minHeight: 36, padding: "6px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(5,5,5,0.6)", color: "#cfcfcf", fontSize: 13, cursor: "pointer" }}>{p}</button>))}
              </div>
            </div>
          </section>
        ) : (
          <div style={{ maxWidth: 960, margin: "0 auto", padding: "clamp(24px,3.5vw,40px) clamp(14px,4vw,40px) 28px", minHeight: "calc(100vh - 65px)", display: "flex", flexDirection: "column", gap: 18 }}>
            {/* who and what this is about */}
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                {tok && <TokenAvatar sym={tok.addr} bg={tok.bg} ink={tok.ink} size={46} src={tok.imageUrl} />}
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 18, letterSpacing: "-0.02em" }}>{tok ? `${tok.name} · $${tok.sym}` : "Research"}</span>
                  <span style={{ fontSize: 12, color: "#696969" }}>{NETWORK_LABEL[NETWORK]} · indexed {run.time}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {tok && <Link href={tok.href} style={iconBtn}>Token page ↗</Link>}
                {tok && <Link href={`/terminal?t=${tok.addr}`} style={iconBtn}>Open in terminal ↗</Link>}
                <button onClick={() => { if (R) navigator.clipboard?.writeText([R.headline ?? "", ...sections.map((x) => `${x.title}\n${x.text}${x.items.map((i) => "\n- " + i).join("")}`)].filter(Boolean).join("\n\n")).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400); }} style={iconBtn}>{copied ? "Copied" : "Copy report"}</button>
                <button onClick={() => { setVw("home"); setQ(""); }} style={iconBtn}>New research</button>
                <button onClick={() => removeRun(run.id)} style={{ ...iconBtn, color: "#FF8f8f", borderColor: "rgba(255,104,104,0.3)" }}>Delete</button>
              </div>
            </div>

            {/* you */}
            <div style={{ alignSelf: "flex-end", maxWidth: "min(85%,640px)", padding: "12px 18px", borderRadius: "20px 20px 4px 20px", background: "#1b1b1b", fontSize: 15, lineHeight: 1.5, overflowWrap: "anywhere" }}>{run.q}</div>

            {/* the AI */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <Orb />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                <BriefCard view={view} headline={R?.headline} waiting={showLoading && !!view} />
                {showLoading && !view && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: "#A1A1A1" }}><Typing />Reading the launch record, bonding state and recent trades…</div>
                )}
                {showLoading && view && !R && [0, 1, 2].map((k) => (<div key={k} style={{ height: 88, borderRadius: 22, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.05)" }} />))}
                {showFailed && (
                  <div style={{ padding: 22, borderRadius: 22, background: "#0b0b0b", border: "1px solid rgba(255,104,104,0.3)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <span style={{ fontSize: 17 }}>{view ? "The AI write-up is unavailable" : "Couldn't load this token's data"}</span>
                    <span style={{ color: "#A1A1A1", fontSize: 14, lineHeight: 1.5 }}>{view ? "The facts above are still current. Try the write-up again in a moment." : "Try again in a moment."}</span>
                    <button onClick={() => { const r0 = run; removeRun(r0.id); void research(r0.q, r0.addr); }} style={{ alignSelf: "flex-start", height: 40, padding: "0 18px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer" }}>Retry</button>
                  </div>
                )}
                {sections.map((s, i) => (
                  <section key={s.n} style={{ borderRadius: 22, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.07)", padding: "clamp(16px,2.2vw,22px)", display: "flex", flexDirection: "column", gap: 10, animation: "oc-rise .4s ease both", animationDelay: `${i * 0.05}s` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}><span style={{ fontFamily: mono, fontSize: 12, color: "#5a5a5a" }}>{s.n}</span><span style={{ fontSize: 18, letterSpacing: "-0.02em" }}>{s.title}</span></span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: s.covColor }}>
                        <span style={{ display: "flex", gap: 2 }}>{[1, 2, 3].map((n) => (<span key={n} style={{ width: 14, height: 4, borderRadius: 2, background: s.c >= n ? s.covColor : "#222" }} />))}</span>{s.cov}
                      </span>
                    </div>
                    {s.text && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "#e0e0e0", textWrap: "pretty" }}><RichText text={s.text} /></p>}
                    {s.hasItems && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {s.items.map((it, j) => (<span key={j} style={{ display: "flex", gap: 10, fontSize: 14, color: "#d0d0d0", lineHeight: 1.5 }}><span style={{ width: 6, height: 6, marginTop: 8, flexShrink: 0, borderRadius: "50%", background: s.dot }} /><span><RichText text={it} /></span></span>))}
                      </div>
                    )}
                    {s.sources.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {s.sources.map((x) => (<span key={x} style={{ padding: "3px 10px", borderRadius: 999, background: "#151515", border: "1px solid rgba(255,255,255,0.07)", fontSize: 11, color: "#A1A1A1" }}>{x}</span>))}
                      </div>
                    )}
                  </section>
                ))}
                {R && (
                  <section style={{ borderRadius: 18, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px", fontSize: 12, color: "#6a6a6a", lineHeight: 1.5 }}>
                    Data from {NETWORK_LABEL[NETWORK]} through the oryvnlaunch indexer: the launch record, bonding state, holder balances and the last 30 trades. No off-chain or social data.
                  </section>
                )}
              </div>
            </div>

            {/* the conversation continues here, newest at the bottom */}
            {run.follow.map((f, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 12, animation: "oc-rise .35s ease both" }}>
                <div style={{ alignSelf: "flex-end", maxWidth: "min(85%,640px)", padding: "11px 16px", borderRadius: "18px 18px 4px 18px", background: "#1b1b1b", fontSize: 14.5, lineHeight: 1.5, overflowWrap: "anywhere" }}>{f.q}</div>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <Orb size={28} />
                  <div style={{ flex: 1, minWidth: 0, padding: "12px 16px", borderRadius: "4px 18px 18px 18px", background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.07)", fontSize: 14.5, lineHeight: 1.65, color: "#e6e6e6", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{f.a ? <RichText text={f.a} /> : <Typing />}</div>
                </div>
              </div>
            ))}

            {R && !asking && suggestions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingLeft: 40 }}>
                {suggestions.slice(0, 4).map((s) => (<button key={s} onClick={() => void followUp(s)} className="lp-prompt" style={{ minHeight: 34, padding: "6px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(5,5,5,0.6)", color: "#cfcfcf", fontSize: 13, cursor: "pointer", textAlign: "left" }}>{s}</button>))}
                {run.follow.length > 0 && <button onClick={() => clearReplies(run.id)} style={{ minHeight: 34, padding: "6px 12px", border: 0, background: "transparent", color: "#777", fontSize: 12, cursor: "pointer" }}>Clear replies</button>}
              </div>
            )}

            <span style={{ fontSize: 12, color: "#5a5a5a", lineHeight: 1.5, paddingLeft: 40 }}>AI reads indexed data only. It can&apos;t trade, move funds or see anything off-chain. No safety score, just evidence.</span>
            <div ref={bottomRef} style={{ height: 1 }} />
            <div style={{ marginTop: "auto", paddingTop: 8 }}>
              {composer(`Ask a follow-up about ${tok ? "$" + tok.sym : "this token"}…`, () => void followUp(q), asking || !run.data)}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/** The data sent to the AI, without the drawing-only part of the brief. */
function stripView(data: any) {
  const clean = (d: any) => {
    const { view: _view, ...rest } = d ?? {};
    return rest;
  };
  return { primary: clean(data.primary), compare: (data.compare ?? []).map(clean) };
}
