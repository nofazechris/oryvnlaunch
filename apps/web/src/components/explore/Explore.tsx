"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { LAUNCH_TEMPLATES } from "@/lib/launch";
import { useLaunches, useStrkUsd, type Token } from "@/lib/useApi";
import { usdOr } from "@/lib/format";
import { StrkPrice } from "@/components/ui/StrkPrice";
import { Contour } from "@/components/landing/Contour";
import { TokenAvatar } from "@/components/ui/TokenAvatar";

type SortCmp = (a: Token, b: Token) => number;

// Everything here is ranked by a number the platform really has. There is no "trending" score yet:
// that would need hourly volume and unique buyers, which are not tracked, so it is not offered.
const TABS: Record<string, { label: string; note: string; sort: SortCmp; needsAsset?: boolean }> = {
  new: { label: "New", note: "Newest launches first.", sort: (a, b) => b.createdMs - a.createdMs },
  bonding: { label: "Bonding", note: "Closest to graduation first. Comparable across assets.", sort: (a, b) => b.bond - a.bond || b.createdMs - a.createdMs },
  active: { label: "Recently active", note: "Most recent trade first.", sort: (a, b) => b.lastTradeMs - a.lastTradeMs || b.createdMs - a.createdMs },
  volume: { label: "Top volume", note: "Total traded so far. Pick an asset: STRK and USDC amounts are not comparable.", sort: (a, b) => b.vol - a.vol, needsAsset: true },
  mcap: { label: "Market cap", note: "Whole supply at the current price. Pick an asset to rank it.", sort: (a, b) => b.mcap - a.mcap, needsAsset: true },
};

const STAGES: Record<string, { label: string; dot: string; test: (t: Token) => boolean }> = {
  all: { label: "All", dot: "#fff", test: () => true },
  early: { label: "Early · <25%", dot: "#73D9E8", test: (t) => !t.graduated && t.bond < 25 },
  mid: { label: "Mid · 25–75%", dot: "#B69AFF", test: (t) => !t.graduated && t.bond >= 25 && t.bond <= 75 },
  near: { label: "Near graduation", dot: "#FF9865", test: (t) => !t.graduated && t.bond > 75 },
  graduated: { label: "Graduated", dot: "#55D69A", test: (t) => t.graduated },
};

const mono = "var(--font-geist-mono),monospace";

export function Explore() {
  const w = useViewportWidth();
  const strkUsd = useStrkUsd();
  const { data, error, loading } = useLaunches({ sort: "newest" });
  const [tab, setTab] = useState("new");
  const [q, setQ] = useState("");
  const [asset, setAsset] = useState("all");
  const [stage, setStage] = useState("all");
  const [gridView, setGridView] = useState(true);

  const tokens = useMemo(() => data?.tokens ?? [], [data]);
  const query = q.trim().toLowerCase();
  const wide = w >= 900;
  const wideList = w >= 760;
  const hasLaunches = tokens.length > 0;

  // The assets that actually have launches, so the filter never offers an empty choice.
  const assets = useMemo(() => [...new Set(tokens.map((t) => t.quote.symbol))].sort(), [tokens]);
  const tabInfo = TABS[tab]!;
  const needsAsset = !!tabInfo.needsAsset && asset === "all";

  const cards = useMemo(() => {
    const list = tokens
      .filter((t) => asset === "all" || t.quote.symbol === asset)
      .filter((t) => STAGES[stage]!.test(t))
      .filter((t) => !query || [t.name, t.sym, t.addr].some((x) => x.toLowerCase().includes(query)));
    // A number that cannot be compared fairly is not used to rank. Fall back to newest, and say so below.
    list.sort(needsAsset ? TABS.new!.sort : tabInfo.sort);
    const featured = gridView && !query && stage === "all" && wide && list.length >= 3;
    return list.map((t, i) => ({ t, big: featured && i < 2 }));
  }, [tokens, asset, stage, query, gridView, wide, needsAsset, tabInfo]);

  const listCols = wideList ? "minmax(0,2fr) 1fr 0.7fr 1fr 1.3fr" : "minmax(0,2fr) 1fr 0.8fr";

  const pill = (active: boolean): React.CSSProperties => ({
    flexShrink: 0,
    height: 38,
    padding: "0 16px",
    borderRadius: 999,
    border: `1px solid ${active ? "#fff" : "rgba(255,255,255,0.09)"}`,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: "nowrap",
    background: active ? "#fff" : "transparent",
    color: active ? "#050505" : "#A1A1A1",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#050505" }}>
      {/* Header */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", WebkitMaskImage: "linear-gradient(180deg,#000 30%,transparent)", maskImage: "linear-gradient(180deg,#000 30%,transparent)" }}>
          <Contour density={34} seed={5} opacity={0.12} />
        </div>
        <div style={{ position: "relative", maxWidth: 1440, margin: "0 auto", padding: "clamp(48px,7vw,96px) clamp(18px,5vw,72px) clamp(28px,4vw,48px)", display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
            <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(46px,6.4vw,92px)", letterSpacing: "-0.045em", lineHeight: 0.98 }}>Explore the ecosystem.</h1>
            <div><StrkPrice /></div>
            <p style={{ margin: 0, color: "#A1A1A1", fontSize: 17, lineHeight: 1.55 }}>Every token launched on oryvnlaunch, straight from the chain.</p>
          </div>
          <div style={{ display: "flex", gap: 28, fontSize: 13, color: "#A1A1A1" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontFamily: mono, fontSize: 24, color: "#fff" }}>{data?.total ?? "—"}</span>launched on oryvnlaunch</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontFamily: mono, fontSize: 24, color: "#fff" }}>{data ? tokens.filter((t) => !t.graduated).length : "—"}</span>bonding now</div>
          </div>
        </div>
      </section>

      {/* Sticky filter bar */}
      <section style={{ position: "sticky", top: 64, zIndex: 20, background: "rgba(5,5,5,0.9)", backdropFilter: "blur(14px)", borderTop: "1px solid rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "12px clamp(18px,5vw,72px)", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div className="lp-noscroll" style={{ display: "flex", gap: 4, overflowX: "auto", flex: "1 1 auto", minWidth: 0 }}>
            {Object.entries(TABS).map(([k, t]) => (
              <button key={k} onClick={() => setTab(k)} className="lp-tap" style={pill(tab === k)}>{t.label}</button>
            ))}
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 14px", borderRadius: 999, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.09)", flex: "1 1 240px", maxWidth: 340 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#696969" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, ticker or 0x address" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 14 }} />
          </label>
          <select value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="Quote asset" style={{ height: 40, padding: "0 14px", borderRadius: 999, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.09)", color: "#fff", fontSize: 14, outline: "none" }}>
            <option value="all">All assets</option>
            {assets.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 999, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.09)" }}>
            <button onClick={() => setGridView(true)} aria-label="Grid view" className="lp-tap" style={{ width: 34, height: 32, borderRadius: 999, border: 0, cursor: "pointer", background: gridView ? "#252525" : "transparent", color: "#fff", display: "grid", placeItems: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>
            </button>
            <button onClick={() => setGridView(false)} aria-label="List view" className="lp-tap" style={{ width: 34, height: 32, borderRadius: 999, border: 0, cursor: "pointer", background: !gridView ? "#252525" : "transparent", color: "#fff", display: "grid", placeItems: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
            </button>
          </div>
        </div>
      </section>

      <main style={{ maxWidth: 1440, margin: "0 auto", padding: "24px clamp(18px,5vw,72px) 120px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(STAGES).map(([k, f]) => (
              <button key={k} onClick={() => setStage(k)} className="lp-tap" style={{ height: 32, padding: "0 12px", borderRadius: 999, border: 0, cursor: "pointer", fontSize: 13, background: stage === k ? "#1b1b1b" : "transparent", color: stage === k ? "#fff" : "#8a8a8a", display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: f.dot }} />{f.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "#696969", maxWidth: 520 }}>
            {tabInfo.note}
            {needsAsset && <span style={{ color: "#F3B65F" }}> Showing newest first until you pick an asset.</span>}
          </span>
        </div>

        {error && (
          <div role="alert" style={{ borderRadius: 18, border: "1px solid rgba(255,104,104,0.35)", background: "rgba(255,104,104,0.06)", padding: "14px 18px", fontSize: 14, color: "#ffb4b4" }}>
            {error}{hasLaunches ? " Showing the last data received." : ""}
          </div>
        )}

        {loading && !data && <div style={{ padding: "80px 0", textAlign: "center", color: "#8a8a8a" }}>Loading launches…</div>}

        {data && !hasLaunches && (
          <div style={{ position: "relative", overflow: "hidden", borderRadius: 28, border: "1px solid rgba(182,154,255,0.28)", background: "linear-gradient(160deg,rgba(182,154,255,0.12),rgba(115,217,232,0.04) 60%,rgba(5,5,5,0))", padding: "clamp(20px,3vw,32px)", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 620 }}>
                <span style={{ fontSize: "clamp(22px,2.6vw,30px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>Nothing has launched yet. Be the first.</span>
                <span style={{ fontSize: 14, color: "#A1A1A1", lineHeight: 1.55 }}>Real launches appear here the moment they are confirmed on Starknet. Pick a kind of token to start.</span>
              </div>
              <Link href="/launch" className="lp-cta-primary" style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 48, padding: "0 24px", borderRadius: 999, background: "#fff", color: "#050505", fontWeight: 600, fontSize: 15, whiteSpace: "nowrap" }}>Launch a token</Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 10 }}>
              {LAUNCH_TEMPLATES.map((tp) => (
                <Link key={tp.key} href="/launch" className="lp-explore-card" style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 12, background: `linear-gradient(150deg, ${tp.g[1]}, ${tp.g[0]})`, color: tp.ink, display: "grid", placeItems: "center", fontWeight: 700 }}>{tp.label.charAt(0)}</span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{tp.label}</span>
                    <span style={{ fontSize: 12, color: "#A1A1A1", lineHeight: 1.4 }}>Start with this</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {hasLaunches && cards.length === 0 && (
          <div style={{ padding: "80px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
            <span style={{ width: 84, height: 84, borderRadius: "50%", border: "1px dashed rgba(255,255,255,0.25)" }} />
            <span style={{ fontSize: 24, letterSpacing: "-0.02em" }}>{query ? `No results for “${q}”` : "Nothing matches these filters"}</span>
            <span style={{ color: "#A1A1A1", fontSize: 14 }}>Check the ticker, or paste the full contract address.</span>
            <button onClick={() => { setQ(""); setAsset("all"); setStage("all"); }} style={{ marginTop: 6, height: 42, padding: "0 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#fff", cursor: "pointer" }}>Clear filters</button>
          </div>
        )}

        {cards.length > 0 && gridView && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,270px),1fr))", gap: 16 }}>
            {cards.map(({ t, big }) => (
              <Link key={t.addr} href={t.href} className="lp-explore-card" style={{ gridColumn: big ? "span 2" : "auto", position: "relative", borderRadius: 28, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", display: "flex", flexDirection: big ? "row" : "column" }}>
                <div style={{ position: "relative", flex: big ? "0 0 46%" : "0 0 auto", minHeight: big ? 300 : 180, margin: 8, borderRadius: 22, background: t.bg, color: t.ink, overflow: "hidden", display: "grid", placeItems: "center" }}>
                  <span style={{ position: "absolute", width: "62%", aspectRatio: "1", borderRadius: "50%", background: "rgba(255,255,255,0.35)", right: "-12%", bottom: "-18%" }} />
                  <span style={{ position: "relative" }}><TokenAvatar sym={t.addr} bg="rgba(255,255,255,0.32)" ink={t.ink} size={big ? 132 : 96} radius={30} src={t.imageUrl} /></span>
                  <span style={{ position: "absolute", left: 12, top: 12, padding: "5px 10px", borderRadius: 999, background: "rgba(255,255,255,0.65)", fontSize: 11, fontWeight: 600 }}>{t.graduated ? "Graduated" : `${t.launch.preset.name ?? "Curve"} curve`}</span>
                  <span style={{ position: "absolute", right: 12, top: 12, padding: "5px 10px", borderRadius: 999, background: "rgba(5,5,5,0.55)", color: "#fff", fontSize: 11, fontWeight: 600 }}>{t.quote.symbol}</span>
                </div>
                <div style={{ flex: 1, padding: big ? "20px 22px 20px 6px" : "6px 18px 20px", display: "flex", flexDirection: "column", gap: 14, justifyContent: "center", minWidth: 0 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                      <span style={{ fontSize: big ? 28 : 19, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{t.name}</span>
                      <span style={{ fontFamily: mono, fontSize: 13, color: t.chgColor }}>{t.chgStr}</span>
                    </div>
                    <span style={{ fontSize: 13, color: "#A1A1A1" }}>${t.sym} · {t.age} old</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, fontSize: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ color: "#696969" }}>Mcap</span><span title={`${t.mcapStr} ${t.quote.symbol}`} style={{ fontFamily: mono, fontSize: 13 }}>{usdOr(t.mcap, t.quote.symbol, strkUsd, `${t.mcapStr} ${t.quote.symbol}`)}</span></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ color: "#696969" }}>Volume</span><span title={`${t.volStr} ${t.quote.symbol}`} style={{ fontFamily: mono, fontSize: 13 }}>{usdOr(t.vol, t.quote.symbol, strkUsd, `${t.volStr} ${t.quote.symbol}`)}</span></div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={{ color: "#696969" }}>Trades</span><span style={{ fontFamily: mono, fontSize: 13 }}>{t.trades.toLocaleString()}</span></div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: "#696969" }}>Bonding</span><span style={{ fontFamily: mono }}>{t.bond}%</span></div>
                    <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}><div style={{ height: "100%", width: `${t.bond}%`, background: t.barBg, borderRadius: 99 }} /></div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {cards.length > 0 && !gridView && (
          <div style={{ borderRadius: 24, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", background: "#090909" }}>
            {cards.map(({ t }) => (
              <Link key={t.addr} href={t.href} className="lp-list-row" style={{ display: "grid", gridTemplateColumns: listCols, gap: 16, alignItems: "center", padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <span style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                  <TokenAvatar sym={t.addr} bg={t.bg} ink={t.ink} size={44} src={t.imageUrl} />
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                    <span style={{ fontSize: 12, color: "#696969" }}>${t.sym} · {t.age} · {t.quote.symbol}</span>
                  </span>
                </span>
                <span style={{ fontFamily: mono, fontSize: 13 }}>{t.priceStr}</span>
                <span style={{ fontFamily: mono, fontSize: 13, color: t.chgColor }}>{t.chgStr}</span>
                {wideList && <span title={`${t.volStr} ${t.quote.symbol}`} style={{ fontFamily: mono, fontSize: 13, color: "#A1A1A1" }}>{usdOr(t.vol, t.quote.symbol, strkUsd, t.volStr)}</span>}
                {wideList && (
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ flex: 1, height: 4, borderRadius: 9, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${t.bond}%`, background: t.g0 }} /></span>
                    <span style={{ fontFamily: mono, fontSize: 12, width: 34 }}>{t.bond}%</span>
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
