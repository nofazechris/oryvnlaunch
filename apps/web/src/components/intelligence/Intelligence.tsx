"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { GRAD_TARGET, TOKENS, bySym, holders as holdersOf, trades as tradesOf, view } from "@/lib/oryvn-data";
import { Contour } from "@/components/landing/Contour";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Report {
  overview: string; contract: string; tokenomics: string; holders: string; activity: string;
  risks: string[]; missing: string[]; coverage: Record<string, number>;
}
interface Run { q: string; sym: string; time: string; report: Report | null; data: any; follow: { q: string; a: string }[] }

const COV = ["No data", "Limited", "Partial", "Full coverage"];
const COVC = ["#FF6868", "#F3B65F", "#72BFFF", "#55D69A"];
const SEC: [string, string, string[]][] = [
  ["overview", "Overview", ["Token stats"]],
  ["contract", "Contract information", ["Voyager · class hash", "Deploy tx"]],
  ["tokenomics", "Tokenomics", ["Constructor args", "Bonding template"]],
  ["holders", "Holder distribution", ["Holder snapshot"]],
  ["activity", "Recent activity", ["Trades · last 30"]],
  ["risks", "Potential risks", ["Holder snapshot", "Bonding state"]],
  ["missing", "Missing information", []],
];

function ctxData(sym: string) {
  const t = TOKENS[bySym(sym)]!;
  const tr = tradesOf(t.sym, 30);
  const hd = holdersOf(t.sym);
  const buys = tr.filter((x) => x.buy);
  const sells = tr.filter((x) => !x.buy);
  return {
    name: t.name, ticker: t.sym, address: t.addr, creator: t.creator, age: t.age,
    priceSTRK: t.price, change24hPct: t.chg, mcapSTRK: t.mcap, volume24hSTRK: t.vol, holders: t.holders, trades: t.trades,
    bonding: { progressPct: t.bond, reserveSTRK: Math.round((t.bond / 100) * GRAD_TARGET), graduationSTRK: GRAD_TARGET, template: "Standard quadratic v1" },
    supply: { total: 1e9, creatorPct: hd[1]!.pct, mintable: false },
    contract: { verified: true, ownerRenounced: true, upgradable: false, template: "oryvn ERC20 v1" },
    last30Trades: { buys: buys.length, sells: sells.length, buySTRK: +buys.reduce((a, b) => a + b.strk, 0).toFixed(2), sellSTRK: +sells.reduce((a, b) => a + b.strk, 0).toFixed(2), spanMinutes: Math.round(tr[29]!.t / 60) },
    topHolders: hd.map((x) => ({ h: x.label, pct: x.pct })),
    unavailable: ["off-chain team identity", "social follower data", "DEX liquidity (not graduated)"],
  };
}

export function Intelligence() {
  const w = useViewportWidth();
  const [q, setQ] = useState("");
  const [ctx, setCtx] = useState("BUN");
  const [vw, setVw] = useState<"home" | "report">("home");
  const [runs, setRuns] = useState<Run[]>([]);
  const [cur, setCur] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const showSide = w >= 1000;
  const mono = "var(--font-geist-mono),monospace";

  async function research(question: string, symArg?: string) {
    const ques = question.trim();
    if (!ques) return;
    const sym = symArg || ctx;
    const others = TOKENS.filter((tk) => tk.sym !== sym && (ques.toUpperCase().includes(tk.sym) || ques.toLowerCase().includes(tk.name.toLowerCase()))).slice(0, 1);
    const data = { primary: ctxData(sym), compare: others.map((tk) => ctxData(tk.sym)) };
    const idx = runs.length;
    const run: Run = { q: ques, sym, time: new Date().toTimeString().slice(0, 5), report: null, data, follow: [] };
    setRuns((prev) => [...prev, run]);
    setCur(idx);
    setVw("report");
    setLoading(true);
    setFailed(false);
    setQ("");
    try {
      const res = await fetch("/api/ai/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: ques, data }) });
      if (!res.ok) throw new Error("ai");
      const j = (await res.json()) as Report;
      setRuns((prev) => prev.map((r, i) => (i === idx ? { ...r, report: j } : r)));
      setLoading(false);
    } catch {
      setLoading(false);
      setFailed(true);
    }
  }

  async function followUp(question: string) {
    const ques = question.trim();
    const run = runs[cur];
    if (!ques || !run || !run.data) return;
    setQ("");
    const p = run.data.primary;
    const setFollow = (a: string) =>
      setRuns((prev) => prev.map((r, i) => (i === cur ? { ...r, follow: [...r.follow.filter((f) => f.q !== ques), { q: ques, a }] } : r)));
    setFollow("Thinking…");
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: ques }], context: { token: { name: p.name, ticker: p.ticker, bondingPct: p.bonding.progressPct, holders: p.holders }, research: run.data } }),
      });
      if (!res.ok) throw new Error("ai");
      const j = (await res.json()) as { text?: string };
      setFollow((j.text ?? "").trim() || "AI is unavailable right now.");
    } catch {
      setFollow("AI is unavailable right now.");
    }
  }

  const run = runs[cur];
  const tsym = run ? run.sym : ctx;
  const tok = view(TOKENS[bySym(tsym)]!, bySym(tsym));
  const R = run?.report ?? null;

  const sections = !R
    ? []
    : SEC.map(([k, title, src], i) => {
        const c = Math.max(0, Math.min(3, (R.coverage?.[k] ?? 2)));
        const val = (R as any)[k];
        const arr = Array.isArray(val) ? (val as string[]) : null;
        return { n: String(i + 1).padStart(2, "0"), title, text: arr ? "" : String(val ?? "—"), items: arr ?? [], hasItems: !!arr, dot: k === "risks" ? "#F3B65F" : "#696969", sources: src, cov: COV[c]!, covColor: COVC[c]!, c1: c >= 1 ? COVC[c]! : "#222", c2: c >= 2 ? COVC[c]! : "#222", c3: c >= 3 ? COVC[c]! : "#222", delay: i * 0.06 + "s" };
      });
  if (R) sections.push({ n: "08", title: "Data sources", text: "Starknet mainnet via the oryvn indexer: token contract state, deploy transaction, bonding-curve contract, the last 30 trades and a holder snapshot. No off-chain or social data.", items: [], hasItems: false, dot: "#696969", sources: ["Indexer status", "Voyager", "Bonding contract"], cov: COV[3]!, covColor: COVC[3]!, c1: COVC[3]!, c2: COVC[3]!, c3: COVC[3]!, delay: "0.42s" });

  const prompts = [`Analyse $${ctx}'s holder distribution`, "Explain its smart contract permissions", "Summarise its recent transactions", `Compare $${ctx} with ${ctx === "PXP" ? "$BUN" : "$PXP"}`, "Explain its bonding-curve mechanics"];
  const showLoading = loading && cur === runs.length - 1;
  const showFailed = failed && cur === runs.length - 1;

  return (
    <div style={{ display: "grid", gridTemplateColumns: showSide ? "260px minmax(0,1fr)" : "minmax(0,1fr)", minHeight: "calc(100vh - 65px)" }}>
      {showSide && (
        <aside style={{ borderRight: "1px solid rgba(255,255,255,0.07)", padding: "20px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => { setVw("home"); setQ(""); }} className="lp-h111" style={{ height: 42, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>+ New research</button>
          <span style={{ padding: "12px 8px 4px", fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>History</span>
          {runs.length === 0 && <span style={{ padding: "0 8px", fontSize: 12, color: "#5a5a5a" }}>Your research appears here.</span>}
          {runs.map((r, i) => i).reverse().map((i) => {
            const r = runs[i]!;
            return (
              <button key={i} onClick={() => { setCur(i); setVw("report"); setFailed(false); }} className="lp-h121" style={{ textAlign: "left", padding: 10, borderRadius: 12, border: 0, background: i === cur && vw === "report" ? "#141414" : "transparent", color: "#d8d8d8", cursor: "pointer", display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 13, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.q}</span>
                <span style={{ fontSize: 11, color: "#696969" }}>${r.sym} · {r.time}</span>
              </button>
            );
          })}
        </aside>
      )}

      <main style={{ minWidth: 0, position: "relative" }}>
        {vw === "home" ? (
          <section style={{ position: "relative", overflow: "hidden", minHeight: "calc(100vh - 65px)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}><Contour density={44} seed={29} opacity={0.13} /></div>
            <div style={{ position: "relative", maxWidth: 900, width: "100%", margin: "0 auto", padding: "60px clamp(18px,4vw,40px) 120px", display: "flex", flexDirection: "column", gap: 26 }}>
              <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#B69AFF" }}>AI Intelligence</span>
              <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(46px,6.6vw,96px)", letterSpacing: "-0.045em", lineHeight: 0.95 }}>Understand more than the price.</h1>
              <p style={{ margin: 0, color: "#A1A1A1", fontSize: 17, maxWidth: 560, lineHeight: 1.55 }}>Explore token activity, contract information and market behaviour with AI.</p>
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); research(q); }} style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10, borderRadius: 28, background: "rgba(16,16,16,0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 30px 90px rgba(0,0,0,0.6)" }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about a token..." style={{ height: 56, padding: "0 14px", background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 19 }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 6px 0 12px", borderRadius: 999, background: "#191919", fontSize: 13, color: "#A1A1A1" }}>Context
                    <select value={ctx} onChange={(e) => setCtx(e.target.value)} style={{ height: 30, borderRadius: 999, border: 0, background: "#252525", color: "#fff", padding: "0 10px", fontSize: 13, outline: "none" }}>
                      {TOKENS.map((tk) => (<option key={tk.sym} value={tk.sym}>{tk.name} · ${tk.sym}</option>))}
                    </select>
                  </label>
                  <button type="submit" className="lp-send" style={{ height: 44, padding: "0 22px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer" }}>Research</button>
                </div>
              </form>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {prompts.map((p) => (<button key={p} onClick={() => research(p)} className="lp-prompt" style={{ minHeight: 36, padding: "6px 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(5,5,5,0.6)", color: "#cfcfcf", fontSize: 13, cursor: "pointer" }}>{p}</button>))}
              </div>
            </div>
          </section>
        ) : (
          <div style={{ maxWidth: 960, margin: "0 auto", padding: "clamp(28px,4vw,48px) clamp(18px,4vw,40px) 140px", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <span style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 16, background: tok.bg, color: tok.ink, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12 }}>{tok.sym2}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                <span style={{ fontSize: "clamp(22px,2.6vw,30px)", letterSpacing: "-0.03em", lineHeight: 1.15 }}>{run?.q}</span>
                <span style={{ fontSize: 12, color: "#696969" }}>{tok.name} · ${tok.sym} · indexed {run?.time}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => { if (R) navigator.clipboard?.writeText(sections.map((x) => `${x.title}\n${x.text}${x.items.map((i) => "\n- " + i).join("")}`).join("\n\n")).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400); }} style={{ height: 34, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#ddd", fontSize: 13, cursor: "pointer" }}>{copied ? "Copied" : "Copy report"}</button>
              <button onClick={() => { setVw("home"); setQ(""); }} style={{ height: 34, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#ddd", fontSize: 13, cursor: "pointer" }}>New research</button>
              <Link href={tok.href} style={{ height: 34, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", color: "#ddd", fontSize: 13, display: "inline-flex", alignItems: "center" }}>Token page ↗</Link>
            </div>

            {showLoading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: "#A1A1A1" }}>
                  <span style={{ display: "flex", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B69AFF", animation: "oc-blink 1s infinite" }} /><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#73D9E8", animation: "oc-blink 1s .2s infinite" }} /><span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F38FC4", animation: "oc-blink 1s .4s infinite" }} /></span>
                  Reading contract, trades and holder snapshot…
                </div>
                {[0, 1, 2, 3].map((k) => (<div key={k} style={{ height: 96, borderRadius: 22, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.05)" }} />))}
              </div>
            )}
            {showFailed && (
              <div style={{ padding: 28, borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(255,104,104,0.3)", display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ fontSize: 18 }}>AI is unavailable</span>
                <span style={{ color: "#A1A1A1", fontSize: 14 }}>The token data is still available on its page. Try the research again in a moment.</span>
                <button onClick={() => { if (run) { setRuns((prev) => prev.slice(0, -1)); research(run.q, run.sym); } }} style={{ alignSelf: "flex-start", height: 40, padding: "0 18px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer" }}>Retry</button>
              </div>
            )}

            {sections.map((s) => (
              <section key={s.n} style={{ borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.07)", padding: "clamp(18px,2.4vw,24px)", display: "flex", flexDirection: "column", gap: 12, animation: "oc-rise .4s ease both", animationDelay: s.delay }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}><span style={{ fontFamily: mono, fontSize: 12, color: "#5a5a5a" }}>{s.n}</span><span style={{ fontSize: 19, letterSpacing: "-0.02em" }}>{s.title}</span></span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: s.covColor }}>
                    <span style={{ display: "flex", gap: 2 }}><span style={{ width: 14, height: 4, borderRadius: 2, background: s.c1 }} /><span style={{ width: 14, height: 4, borderRadius: 2, background: s.c2 }} /><span style={{ width: 14, height: 4, borderRadius: 2, background: s.c3 }} /></span>{s.cov}
                  </span>
                </div>
                {s.text && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "#e0e0e0", textWrap: "pretty" }}>{s.text}</p>}
                {s.hasItems && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {s.items.map((it, j) => (<span key={j} style={{ display: "flex", gap: 10, fontSize: 14, color: "#d0d0d0", lineHeight: 1.5 }}><span style={{ width: 6, height: 6, marginTop: 8, flexShrink: 0, borderRadius: "50%", background: s.dot }} />{it}</span>))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {s.sources.map((x) => (<a key={x} href="#" style={{ padding: "4px 10px", borderRadius: 999, background: "#151515", border: "1px solid rgba(255,255,255,0.07)", fontSize: 11, color: "#A1A1A1" }}>{x} ↗</a>))}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#5a5a5a" }}>Updated {run?.time}</span>
                </div>
              </section>
            ))}

            {R && (
              <form onSubmit={(e: FormEvent) => { e.preventDefault(); followUp(q); }} style={{ position: "sticky", bottom: 20, display: "flex", gap: 8, alignItems: "center", padding: "6px 6px 6px 18px", borderRadius: 999, background: "rgba(16,16,16,0.92)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a follow-up…" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 15, height: 40 }} />
                <button type="submit" style={{ height: 40, padding: "0 18px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer" }}>Ask</button>
              </form>
            )}
            {(run?.follow ?? []).map((f, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 10, animation: "oc-rise .4s ease both" }}>
                <span style={{ alignSelf: "flex-end", maxWidth: "80%", padding: "11px 16px", borderRadius: "18px 18px 4px 18px", background: "#1b1b1b", fontSize: 14 }}>{f.q}</span>
                <span style={{ padding: 16, borderRadius: 18, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.07)", fontSize: 14, lineHeight: 1.6, color: "#e0e0e0", whiteSpace: "pre-wrap" }}>{f.a}</span>
              </div>
            ))}
            <span style={{ fontSize: 12, color: "#5a5a5a", lineHeight: 1.5 }}>AI reads indexed data only. It can&apos;t trade, move funds or see anything off-chain. No safety score — just evidence.</span>
          </div>
        )}
      </main>
    </div>
  );
}
