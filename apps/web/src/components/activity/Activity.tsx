"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { useWalletStore } from "@/lib/wallet-store";
import { paletteFor } from "@/lib/art";
import { EXPLORER_URL } from "@/lib/config";
import { ago, amountLabel, shortAddr } from "@/lib/format";
import type { ApiActivity } from "@/lib/api";
import { useActivity, useLaunches } from "@/lib/useApi";
import { TokenAvatar } from "@/components/ui/TokenAvatar";
import { explorerTx } from "@/lib/safe";

type Kind = ApiActivity["kind"];

const KC: Record<Kind, [string, string, string]> = {
  buy: ["rgba(85,214,154,0.12)", "#55D69A", "Buy"],
  sell: ["rgba(255,104,104,0.12)", "#FF6868", "Sell"],
  launch: ["rgba(115,217,232,0.12)", "#73D9E8", "Launch"],
  graduation: ["rgba(182,154,255,0.12)", "#B69AFF", "Graduation"],
};
const FILTERS: Record<string, [string, (a: ApiActivity) => boolean]> = {
  all: ["All", () => true],
  launch: ["Launches", (a) => a.kind === "launch"],
  buy: ["Buys", (a) => a.kind === "buy"],
  sell: ["Sells", (a) => a.kind === "sell"],
  graduation: ["Graduations", (a) => a.kind === "graduation"],
};

function amountText(a: ApiActivity): string {
  if (a.kind === "graduation") return "Curve filled";
  if (a.amount === null) return "Curve opened";
  if (a.kind === "launch") return `${amountLabel(a.amount, a.quote)} deploy fee`;
  return amountLabel(a.amount, a.quote);
}

export function Activity() {
  const w = useViewportWidth();
  const wallet = useWalletStore((s) => s.wallet);
  const hydrate = useWalletStore((s) => s.hydrate);
  const [tab, setTab] = useState("all");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [live, setLive] = useState(true);
  const [frozen, setFrozen] = useState<ApiActivity[] | undefined>(undefined);

  useEffect(() => hydrate(), [hydrate]);

  const launches = useLaunches({ sort: "newest" }, 15_000);
  const imageOf = new Map((launches.data?.tokens ?? []).map((t) => [t.addr, t.imageUrl]));
  const mine = scope === "mine";
  const { data, error, loading } = useActivity(mine ? { wallet: wallet ?? undefined, limit: 100 } : { limit: 100 }, !mine || !!wallet);

  const mono = "var(--font-geist-mono),monospace";
  const wide = w >= 820;

  // "Paused" freezes the list on screen; the feed keeps loading underneath.
  const all: ApiActivity[] = (live ? data : (frozen ?? data)) ?? [];
  const list = all.filter(FILTERS[tab]![1]).slice(0, 60);
  const cols = wide ? "minmax(0,1.6fr) 110px 1.2fr 1fr 90px" : "minmax(0,1.4fr) 80px 1fr 70px";

  const togglelive = () => {
    if (live) setFrozen(data);
    setLive((v) => !v);
  };

  const down = !!error && !data;
  const emptyTitle = mine && !wallet ? "Connect a wallet to see your activity" : down ? "Can't reach the data service" : loading ? "Loading…" : "Nothing here yet";
  const emptyBody =
    mine && !wallet
      ? "Your buys, sells and launches will show up here."
      : down
        ? "The feed will fill in as soon as it is back."
        : "New activity appears as it confirms on Starknet.";

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(36px,5vw,72px) clamp(18px,5vw,64px) 140px", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(44px,6vw,84px)", letterSpacing: "-0.045em", lineHeight: 0.95 }}>Activity.</h1>
          <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16 }}>Every launch, buy and sell on the platform, as it lands on Starknet.</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={togglelive} style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", fontSize: 13, cursor: "pointer" }}>
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
        {list.map((a, i) => {
          const [kBg, kColor, kLabel] = KC[a.kind];
          const [primary, light, ink] = paletteFor(a.token);
          const when = ago(a.time).replace(" ago", "");
          const txUrl = explorerTx(a.txHash);
          return (
            <div key={`${a.txHash ?? a.kind}-${a.token}-${a.time}-${i}`} className="lp-list-row" style={{ display: "grid", gridTemplateColumns: cols, gap: 14, alignItems: "center", padding: "12px 14px", borderRadius: 16 }}>
              <Link href={`/token?t=${a.token}`} style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                <TokenAvatar sym={a.token} bg={`linear-gradient(150deg, ${light}, ${primary})`} ink={ink} size={44} src={imageOf.get(a.token)} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
                  <span style={{ fontSize: 12, color: "#696969" }}>${a.symbol}</span>
                </span>
              </Link>
              <span style={{ justifySelf: "start", padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: kBg, color: kColor }}>{kLabel}</span>
              <span style={{ fontFamily: mono, fontSize: 13 }}>{amountText(a)}</span>
              {wide && <span style={{ fontFamily: mono, fontSize: 12, color: "#A1A1A1" }}>{a.wallet ? shortAddr(a.wallet) : "—"}</span>}
              {txUrl ? (
                <a href={txUrl} target="_blank" rel="noreferrer" style={{ justifySelf: "end", fontSize: 12, color: "#696969", whiteSpace: "nowrap" }}>{when} ↗</a>
              ) : (
                <span style={{ justifySelf: "end", fontSize: 12, color: "#696969", whiteSpace: "nowrap" }}>{when}</span>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <div style={{ padding: "70px 20px", textAlign: "center", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
            <span style={{ width: 64, height: 64, borderRadius: "50%", border: "1px dashed rgba(255,255,255,0.25)" }} />
            <span style={{ fontSize: 20 }}>{emptyTitle}</span>
            <span style={{ color: "#A1A1A1", fontSize: 14 }}>{emptyBody}</span>
          </div>
        )}
      </div>
    </main>
  );
}
