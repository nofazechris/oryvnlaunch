"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { useWalletStore } from "@/lib/wallet-store";
import { ME, TOKENS, activity, ago, bySym, hash, view, type ActivityItem } from "@/lib/oryvn-data";

type Kind = "Buy" | "Sell" | "Launch" | "Deploy";
interface Row extends Omit<ActivityItem, "kind"> {
  kind: Kind;
  id?: string;
}

const KC: Record<Kind, [string, string]> = {
  Buy: ["rgba(85,214,154,0.12)", "#55D69A"],
  Sell: ["rgba(255,104,104,0.12)", "#FF6868"],
  Launch: ["rgba(115,217,232,0.12)", "#73D9E8"],
  Deploy: ["rgba(182,154,255,0.12)", "#B69AFF"],
};
const FILTERS: Record<string, [string, (a: Row) => boolean]> = {
  all: ["All", () => true],
  launch: ["Launches", (a) => a.kind === "Launch"],
  buy: ["Buys", (a) => a.kind === "Buy"],
  sell: ["Sells", (a) => a.kind === "Sell"],
  deploy: ["Deployments", (a) => a.kind === "Deploy"],
};

export function Activity() {
  const w = useViewportWidth();
  const wallet = useWalletStore((s) => s.wallet);
  const hydrate = useWalletStore((s) => s.hydrate);
  const [tab, setTab] = useState("all");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [live, setLive] = useState(true);
  const [extra, setExtra] = useState<Row[]>([]);
  const liveRef = useRef(true);
  const nRef = useRef(0);

  useEffect(() => hydrate(), [hydrate]);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!liveRef.current) return;
      const base = activity(1, 900 + nRef.current)[0]!;
      nRef.current += 1;
      const fresh: Row = { ...base, kind: base.kind as Kind, t: 0, status: "pending", id: "x" + nRef.current };
      setExtra((prev) => [fresh, ...prev.map((x) => ({ ...x, status: "confirmed" as const, t: x.t + 4 }))].slice(0, 20));
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const mono = "var(--font-geist-mono),monospace";
  const wide = w >= 820;

  let all: Row[] = [
    ...extra,
    ...activity(40, 11).map((a) => ({ ...a, kind: a.kind as Kind, t: a.t + 6, status: "confirmed" as const })),
  ];
  all = all.map((a) => (a.kind === "Launch" && hash(a.wallet) % 2 ? { ...a, kind: "Deploy" as Kind } : a));
  if (scope === "mine") {
    all = wallet ? all.filter((_, i) => i % 4 === 0).map((a) => ({ ...a, wallet: ME.addr })) : [];
  }

  const list = all.filter(FILTERS[tab]![1]).slice(0, 40);

  const cols = wide ? "minmax(0,1.6fr) 110px 1fr 1fr 110px 90px" : "minmax(0,1.4fr) 80px 1fr 70px";

  const items = list.map((a) => {
    const i = bySym(a.sym);
    const t = view(TOKENS[i]!, i);
    const pend = a.status === "pending";
    const amt = a.kind === "Launch" ? "Curve opened" : a.kind === "Deploy" ? "10 STRK fee" : `${a.strk} STRK`;
    return {
      key: a.id ?? `${a.sym}-${a.t}-${a.wallet}`,
      t,
      kind: a.kind,
      kBg: KC[a.kind][0],
      kColor: KC[a.kind][1],
      amt,
      wallet: a.wallet,
      time: a.t < 5 ? "now" : ago(a.t).replace(" ago", ""),
      status: pend ? "Pending" : "Confirmed",
      stColor: pend ? "#F3B65F" : "#55D69A",
      stAnim: pend ? "oc-blink 1s infinite" : "none",
      anim: a.id && a.t === 0 ? "oc-in 1.6s ease" : "none",
    };
  });

  const emptyTitle = scope === "mine" && !wallet ? "Connect a wallet to see your activity" : "Nothing here yet";
  const emptyBody = scope === "mine" && !wallet ? "Your buys, sells and launches will show up here." : "New activity appears as it confirms on Starknet.";

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(36px,5vw,72px) clamp(18px,5vw,64px) 140px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(44px,6vw,84px)", letterSpacing: "-0.045em", lineHeight: 0.95 }}>Activity.</h1>
          <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16 }}>Every launch, buy and sell on the platform, as it lands on Starknet.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setLive((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", fontSize: 13, cursor: "pointer" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: live ? "#55D69A" : "#696969", animation: live ? "oc-blink 1.4s infinite" : "none" }} />
            {live ? "Live" : "Paused"}
          </button>
          <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 999, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.09)" }}>
            {([["all", "Platform"], ["mine", "My wallet"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setScope(k)} style={{ height: 34, padding: "0 14px", borderRadius: 999, border: 0, cursor: "pointer", fontSize: 13, background: scope === k ? "#fff" : "transparent", color: scope === k ? "#050505" : "#A1A1A1" }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="lp-noscroll" style={{ display: "flex", gap: 6, overflowX: "auto" }}>
        {Object.entries(FILTERS).map(([k, f]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flexShrink: 0, height: 38, padding: "0 16px", borderRadius: 999, border: `1px solid ${tab === k ? "#fff" : "rgba(255,255,255,0.09)"}`, cursor: "pointer", fontSize: 14, background: tab === k ? "#fff" : "transparent", color: tab === k ? "#050505" : "#A1A1A1" }}>
            {f[0]} <span style={{ fontFamily: mono, fontSize: 11, opacity: 0.6 }}>{all.filter(f[1]).length}</span>
          </button>
        ))}
      </div>

      <div style={{ borderRadius: 28, background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.08)", padding: 8 }}>
        {items.map((a) => (
          <div key={a.key} className="lp-list-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 14, alignItems: "center", padding: "12px 14px", borderRadius: 16, animation: a.anim }}>
            <Link href={a.t.href} style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
              <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 14, background: a.t.bg, color: a.t.ink, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{a.t.sym2}</span>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.t.name}</span>
                <span style={{ fontSize: 12, color: "#696969" }}>${a.t.sym}</span>
              </span>
            </Link>
            <span style={{ justifySelf: "start", padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: a.kBg, color: a.kColor }}>{a.kind}</span>
            <span style={{ fontFamily: mono, fontSize: 13 }}>{a.amt}</span>
            {wide && <span style={{ fontFamily: mono, fontSize: 12, color: "#A1A1A1" }}>{a.wallet}</span>}
            {wide && (
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: a.stColor }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.stColor, animation: a.stAnim }} />
                {a.status}
              </span>
            )}
            <a href="#" style={{ justifySelf: "end", fontSize: 12, color: "#696969", whiteSpace: "nowrap" }}>{a.time} ↗</a>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ padding: "70px 20px", textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            <span style={{ width: 64, height: 64, borderRadius: "50%", border: "1px dashed rgba(255,255,255,0.25)" }} />
            <span style={{ fontSize: 20 }}>{emptyTitle}</span>
            <span style={{ color: "#A1A1A1", fontSize: 14 }}>{emptyBody}</span>
          </div>
        )}
      </div>
      <span style={{ fontSize: 12, color: "#F3B65F" }}>Preview data · simulated live feed</span>
    </main>
  );
}
