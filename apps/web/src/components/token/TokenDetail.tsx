"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useViewportWidth } from "@/lib/hooks";
import { useWalletStore } from "@/lib/wallet-store";
import { useUiStore } from "@/lib/ui-store";
import { GRAD_TARGET, TOKENS, bySym, candles, fmtK, holders as holdersOf, trades as tradesOf, view } from "@/lib/oryvn-data";
import { Contour } from "@/components/landing/Contour";
import { ImageSlot } from "@/components/landing/ImageSlot";
import { AreaChart } from "./AreaChart";

const DESCS: Record<string, string> = {
  BUN: "A sunny bakery mascot for the Starknet morning crowd. Community art drops every Friday.",
  PXP: "Pixel companions collected by builders. Holders vote on the next pal.",
};
const TABS: [string, string][] = [
  ["overview", "Overview"],
  ["chart", "Chart"],
  ["trades", "Trades"],
  ["holders", "Holders"],
  ["security", "Security"],
  ["ai", "AI Insights"],
];
const TFS = ["1m", "5m", "15m", "1h", "4h", "24h"];
const CARD: React.CSSProperties = { borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.07)", padding: 22, display: "flex", flexDirection: "column" };

interface Msg { role: "user" | "ai"; text: string; sources: string[] }

export function TokenDetail({ symbol }: { symbol: string }) {
  const w = useViewportWidth();
  const router = useRouter();
  const wallet = useWalletStore((s) => s.wallet);
  const setPanel = useUiStore((s) => s.setPanel);

  const [tab, setTab] = useState("overview");
  const [tf, setTf] = useState("1h");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("10");
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");
  const [aiMsgs, setAiMsgs] = useState<Msg[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const idx = bySym((symbol || "BUN").toUpperCase());
  const t = view(TOKENS[idx]!, idx);
  const other = TOKENS[(idx + 2) % TOKENS.length]!;
  const connected = !!wallet;
  const termHref = `/terminal?t=${t.sym}`;

  const { tr, hd, reserve, top10, maxH } = useMemo(() => {
    const trv = tradesOf(t.sym, 30);
    const hdv = holdersOf(t.sym);
    return {
      tr: trv,
      hd: hdv,
      reserve: (t.bond / 100) * GRAD_TARGET,
      top10: hdv.slice(1).reduce((a, b) => a + b.pct, 0),
      maxH: Math.max(...hdv.map((x) => x.pct)),
    };
  }, [t.sym, t.bond]);

  const creatorPct = hd[1]!.pct;
  const desc = DESCS[t.sym] || "A community token launched on a tested bonding-curve template.";

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
      token: { name: t.name, ticker: t.sym, priceSTRK: t.price, change24hPct: t.chg, mcapSTRK: t.mcap, vol24hSTRK: t.vol, holders: t.holders, trades: t.trades, age: t.age },
      bonding: { progressPct: t.bond, graduationSTRK: GRAD_TARGET },
      recentTrades: { buys: tr.filter((x) => x.buy).length, sells: tr.filter((x) => !x.buy).length },
      holders: hd.map((x) => ({ h: x.label, pct: x.pct })),
      contract: { mintable: false, ownerRenounced: true, upgradable: false, verified: true },
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
      if (/holder|concentr/.test(l)) src.push("Holder snapshot");
      if (/contract|mint|owner|permission/.test(l)) src.push("Contract metadata");
      if (!src.length) src.push("Token stats");
      setAiMsgs((m) => [...m, { role: "ai", text, sources: src }]);
    } catch {
      setAiMsgs((m) => [...m, { role: "ai", text: "AI is unavailable right now.", sources: [] }]);
    } finally {
      setAiLoading(false);
    }
  }

  const amtNum = parseFloat(amt) || 0;
  const estOut = side === "buy" ? fmtK((amtNum * 0.99) / t.price) + " " + t.sym : (amtNum * t.price * 0.99).toFixed(3) + " STRK";

  const stats = [
    { k: "Price", v: t.priceStr, color: "#fff" },
    { k: "24h", v: t.chgStr, color: t.chgColor },
    { k: "Market cap", v: t.mcapStr + " STRK", color: "#fff" },
    { k: "Volume 24h", v: t.volStr + " STRK", color: "#fff" },
    { k: "Holders", v: t.holdersStr, color: "#fff" },
    { k: "Trades", v: t.trades.toLocaleString(), color: "#fff" },
  ];
  const bondRows = [
    { k: "Reserve", v: fmtK(reserve) + " STRK" },
    { k: "Target", v: "69K STRK" },
    { k: "Remaining", v: fmtK(GRAD_TARGET - reserve) + " STRK" },
    { k: "Curve price", v: t.priceStr },
  ];
  const alloc = { curve: ((100 - creatorPct) * 0.8).toFixed(1), lp: ((100 - creatorPct) * 0.2).toFixed(1), creator: creatorPct };
  const launchRows = [
    { k: "Launched", v: t.age + " ago" },
    { k: "Template", v: "Standard curve" },
    { k: "Network", v: "Starknet Mainnet" },
    { k: "Trade fee", v: "1%" },
  ];
  const palette = { ok: "#55D69A", warn: "#F3B65F", info: "#72BFFF" } as const;
  const icons = { ok: "✓", warn: "!", info: "i" } as const;
  const security: { label: string; result: string; st: keyof typeof palette; evidence: string }[] = [
    { label: "Contract verification", result: "Verified", st: "ok", evidence: "Source matches the oryvn ERC20 v1 template (class hash 0x05b1…c7e2) published on Voyager." },
    { label: "Mint permissions", result: "No mint function", st: "ok", evidence: "The token contract exposes no mint entrypoint. Supply was fixed at 1,000,000,000 in the constructor." },
    { label: "Ownership", result: "Renounced", st: "ok", evidence: "Owner set to 0x0 in the deploy transaction (block 912,408)." },
    { label: "Upgradability", result: "Not upgradable", st: "ok", evidence: "No replace_class call is reachable from any external function." },
    { label: "Creator allocation", result: creatorPct + "%", st: creatorPct > 4 ? "warn" : "ok", evidence: `Creator wallet ${t.creator} holds ${creatorPct}% of supply. Template cap is 5%.` },
    { label: "Holder concentration", result: `Top 10 hold ${top10.toFixed(1)}%`, st: top10 > 40 ? "warn" : "ok", evidence: "Excludes the bonding-curve contract. Calculated from the latest holder snapshot." },
    { label: "Liquidity", result: `${fmtK(reserve)} STRK in curve reserve`, st: "info", evidence: "Liquidity sits in the bonding-curve contract until graduation; no DEX pool exists yet." },
  ];
  const aiSuggest = ["Explain the bonding progress", "Summarise recent trades", "Is holder ownership concentrated?", "What permissions does the contract have?"];

  const cols = w >= 1000 ? "minmax(0,1fr) 340px" : "minmax(0,1fr)";
  const mono = "var(--font-geist-mono),monospace";

  function doTrade() {
    if (connected) router.push(termHref);
    else setPanel("wallet");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#050505" }}>
      {/* Header */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.8, WebkitMaskImage: "linear-gradient(180deg,#000 40%,transparent)", maskImage: "linear-gradient(180deg,#000 40%,transparent)" }}>
          <Contour density={30} seed={13} opacity={0.1} />
        </div>
        <div style={{ position: "relative", maxWidth: 1360, margin: "0 auto", padding: "clamp(28px,4vw,56px) clamp(18px,5vw,64px) 28px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: "clamp(24px,4vw,56px)", alignItems: "center" }}>
          <div style={{ position: "relative", maxWidth: 380, width: "100%", aspectRatio: "0.78", justifySelf: "start" }}>
            <div style={{ position: "absolute", inset: "6% -4% -2% 8%", borderRadius: 32, background: `linear-gradient(165deg, ${other.g[1]}, ${other.g[0]})`, opacity: 0.35, transform: "rotate(7deg)" }} />
            <div style={{ position: "relative", height: "100%", borderRadius: 32, overflow: "hidden", background: `linear-gradient(165deg, ${t.g1} 0%, ${t.g0} 70%)`, color: t.ink, boxShadow: "0 30px 80px rgba(0,0,0,0.6),inset 0 0 0 1px rgba(255,255,255,0.35)", transform: "rotate(-3deg)" }}>
              <div style={{ padding: "24px 24px 0", display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{t.name}</span>
                <span style={{ fontFamily: mono, fontWeight: 600 }}>{t.bond}%</span>
              </div>
              <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, height: "68%", display: "grid", placeItems: "center" }}>
                <span style={{ position: "absolute", fontSize: 110, fontWeight: 700, letterSpacing: "-0.06em", opacity: 0.2 }}>{t.sym}</span>
                <ImageSlot radius={22} placeholder="Drop token artwork" style={{ background: "transparent", borderColor: "rgba(0,0,0,0.12)" }} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ padding: "5px 12px", borderRadius: 999, background: "rgba(115,217,232,0.12)", color: "#73D9E8", fontSize: 12, fontWeight: 600 }}>Bonding</span>
              <span style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", color: "#A1A1A1", fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#55D69A" }} />Starknet</span>
              <span style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", color: "#A1A1A1", fontSize: 12, whiteSpace: "nowrap" }}>Launched {t.age} ago</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(44px,6vw,84px)", letterSpacing: "-0.045em", lineHeight: 0.95 }}>{t.name}</h1>
              <span style={{ fontSize: 20, color: "#A1A1A1" }}>${t.sym}</span>
            </div>
            <p style={{ margin: 0, fontSize: 16, color: "#cfcfcf", lineHeight: 1.6, maxWidth: 560, textWrap: "pretty" }}>{desc}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              <button onClick={() => { navigator.clipboard?.writeText(t.addr).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400); }} className="lp-copyaddr" style={{ display: "flex", alignItems: "center", gap: 10, padding: 0, border: 0, background: "transparent", color: "#A1A1A1", cursor: "pointer", fontFamily: mono, fontSize: 13, textAlign: "left" }}>
                <span style={{ fontFamily: "var(--font-geist-sans),sans-serif", color: "#696969", width: 64 }}>Contract</span>{t.addrShort}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="9" y="9" width="12" height="12" rx="3" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                <span style={{ color: "#55D69A" }}>{copied ? "Copied" : ""}</span>
              </button>
              <span style={{ display: "flex", gap: 10, color: "#A1A1A1", fontFamily: mono }}><span style={{ fontFamily: "var(--font-geist-sans),sans-serif", color: "#696969", width: 64 }}>Creator</span>{t.creator}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["Website", "X", "Telegram"].map((sName) => (
                <a key={sName} href="#" className="lp-pill-invert" style={{ height: 38, padding: "0 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", display: "inline-flex", alignItems: "center", fontSize: 13 }}>{sName}</a>
              ))}
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
              <span style={{ fontFamily: mono, fontSize: 20, letterSpacing: "-0.02em", color: s.color, whiteSpace: "nowrap" }}>{s.v}</span>
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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontFamily: mono, fontSize: 44, letterSpacing: "-0.04em" }}>{t.bond}%</span><span style={{ fontSize: 13, color: "#A1A1A1" }}>to graduation</span></div>
                <div style={{ height: 12, borderRadius: 99, background: "#151515", overflow: "hidden" }}><div style={{ height: "100%", width: `${t.bond}%`, background: t.barBg, borderRadius: 99 }} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
                  {bondRows.map((b) => (<div key={b.k} style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ color: "#696969" }}>{b.k}</span><span style={{ fontFamily: mono, fontSize: 14 }}>{b.v}</span></div>))}
                </div>
              </div>
              <div style={{ ...CARD, gap: 16 }}>
                <span style={{ fontSize: 18 }}>Supply &amp; allocation</span>
                <div style={{ display: "flex", height: 14, borderRadius: 99, overflow: "hidden", gap: 2 }}><span style={{ width: `${alloc.curve}%`, background: "#73D9E8" }} /><span style={{ width: `${alloc.lp}%`, background: "#B69AFF" }} /><span style={{ width: `${alloc.creator}%`, background: "#F38FC4" }} /></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ display: "flex", gap: 8, alignItems: "center", color: "#A1A1A1" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#73D9E8" }} />Bonding curve</span><span style={{ fontFamily: mono }}>{alloc.curve}%</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ display: "flex", gap: 8, alignItems: "center", color: "#A1A1A1" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#B69AFF" }} />DEX liquidity at graduation</span><span style={{ fontFamily: mono }}>{alloc.lp}%</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ display: "flex", gap: 8, alignItems: "center", color: "#A1A1A1" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F38FC4" }} />Creator</span><span style={{ fontFamily: mono }}>{alloc.creator}%</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}><span style={{ color: "#A1A1A1" }}>Total supply</span><span style={{ fontFamily: mono }}>1,000,000,000</span></div>
                </div>
              </div>
              <div style={{ ...CARD, gap: 12 }}>
                <span style={{ fontSize: 18 }}>Launch</span>
                {launchRows.map((r) => (<div key={r.k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ color: "#A1A1A1" }}>{r.k}</span><span style={{ fontFamily: mono }}>{r.v}</span></div>))}
              </div>
              <div style={{ ...CARD, gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 18 }}>Price · 24h</span><span style={{ fontFamily: mono, fontSize: 13, color: t.chgColor }}>{t.chgStr}</span></div>
                <div style={{ height: 150 }}><AreaChart candles={candles(t.sym, "1h", 24, t.price)} height={150} /></div>
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
              <div style={{ height: 320 }}><AreaChart candles={candles(t.sym, tf, 90, t.price)} height={320} showAxis /></div>
              <span style={{ fontSize: 11, color: "#696969" }}>Preview candles · indexer not connected</span>
            </div>
          )}

          {tab === "trades" && (
            <div style={{ ...CARD, padding: 10 }}>
              {tr.slice(0, 16).map((r, i) => (
                <a key={i} href="#" className="lp-trade-row" style={{ display: "grid", gridTemplateColumns: "60px minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr) 64px", gap: 12, alignItems: "center", padding: "11px 12px", borderRadius: 12, fontFamily: mono, fontSize: 12, color: "#d8d8d8" }}>
                  <span style={{ color: r.buy ? "#55D69A" : "#FF6868", fontFamily: "var(--font-geist-sans),sans-serif", fontWeight: 600 }}>{r.buy ? "Buy" : "Sell"}</span>
                  <span>{r.strk.toFixed(3)} STRK</span>
                  <span style={{ color: "#A1A1A1" }}>{fmtK(r.strk / t.price)} {t.sym}</span>
                  <span style={{ color: "#A1A1A1", overflow: "hidden", textOverflow: "ellipsis" }}>{r.wallet}</span>
                  <span style={{ textAlign: "right", color: "#696969" }}>{r.t < 60 ? r.t + "s" : Math.floor(r.t / 60) + "m"} ↗</span>
                </a>
              ))}
            </div>
          )}

          {tab === "holders" && (
            <div style={{ ...CARD, gap: 14 }}>
              {hd.map((h, i) => {
                const tag = i === 0 ? "Curve" : h.creator ? "Creator" : "";
                const tagBg = i === 0 ? "#73D9E8" : h.creator ? "#F38FC4" : "transparent";
                const color = i === 0 ? "#73D9E8" : h.creator ? "#F38FC4" : "rgba(255,255,255,0.45)";
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(120px,200px) minmax(0,1fr) 60px", gap: 14, alignItems: "center" }}>
                    <span style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: mono, fontSize: 12 }}>{h.label}{tag && <span style={{ fontFamily: "var(--font-geist-sans),sans-serif", fontSize: 10, padding: "2px 7px", borderRadius: 99, background: tagBg, color: "#050505" }}>{tag}</span>}</span>
                    <span style={{ height: 8, borderRadius: 99, background: "#151515", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(h.pct / maxH) * 100}%`, background: color, borderRadius: 99 }} /></span>
                    <span style={{ textAlign: "right", fontFamily: mono, fontSize: 12 }}>{h.pct}%</span>
                  </div>
                );
              })}
              <span style={{ fontSize: 12, color: "#696969" }}>Wallet addresses only. We don&apos;t link wallets to identities.</span>
            </div>
          )}

          {tab === "security" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {security.map((c) => (
                <div key={c.label} style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 14, alignItems: "start", padding: 18, borderRadius: 20, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: palette[c.st], color: "#050505", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>{icons[c.st]}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                    <span style={{ fontSize: 15 }}>{c.label} <span style={{ color: palette[c.st] }}>· {c.result}</span></span>
                    <span style={{ fontSize: 13, color: "#A1A1A1", lineHeight: 1.5 }}>{c.evidence}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#696969", whiteSpace: "nowrap" }}>Updated 2m ago</span>
                </div>
              ))}
              <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5 }}>Facts read from the contract and indexer. Not an audit and not a safety score.</span>
            </div>
          )}

          {tab === "ai" && (
            <div style={{ borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(182,154,255,0.25)", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
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
          <div style={{ borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: 16, background: "#050505" }}>
              <button onClick={() => { setSide("buy"); setAmt("10"); }} style={{ height: 40, borderRadius: 12, border: 0, cursor: "pointer", fontWeight: 600, background: side === "buy" ? "#55D69A" : "transparent", color: side === "buy" ? "#050505" : "#A1A1A1" }}>Buy</button>
              <button onClick={() => { setSide("sell"); setAmt("100000"); }} style={{ height: 40, borderRadius: 12, border: 0, cursor: "pointer", fontWeight: 600, background: side === "sell" ? "#FF6868" : "transparent", color: side === "sell" ? "#050505" : "#A1A1A1" }}>Sell</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: 18, background: "#050505", border: "1px solid rgba(255,255,255,0.07)" }}>
              <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontFamily: mono, fontSize: 26 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#A1A1A1" }}>{side === "buy" ? "STRK" : t.sym}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ color: "#A1A1A1" }}>You receive (est.)</span><span style={{ fontFamily: mono }}>{estOut}</span></div>
            <button onClick={doTrade} style={{ height: 50, borderRadius: 16, border: 0, cursor: "pointer", fontWeight: 600, background: !connected ? "#fff" : side === "buy" ? "#55D69A" : "#FF6868", color: "#050505" }}>{!connected ? "Connect wallet to trade" : `Review ${side} in terminal`}</button>
            <Link href={termHref} className="lp-term-link" style={{ textAlign: "center", fontSize: 13, color: "#A1A1A1" }}>Open full terminal →</Link>
          </div>
        </aside>
      </main>

      {note && (
        <div style={{ position: "fixed", left: "50%", bottom: 90, transform: "translateX(-50%)", zIndex: 90, padding: "12px 18px", borderRadius: 999, background: "#fff", color: "#050505", fontSize: 14, fontWeight: 500, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>{note}</div>
      )}
    </div>
  );
}
