"use client";

import { TOKENS } from "@/lib/oryvn-data";

const VERBS: [string, string][] = [
  ["bought", "#55D69A"],
  ["launched", "#73D9E8"],
  ["sold", "#FF6868"],
  ["bought", "#55D69A"],
  ["graduated", "#B69AFF"],
];

interface TickEvent {
  sym: string;
  verb: string;
  color: string;
  bg: string;
  amt: string;
  ago: string;
}

function buildEvents(): TickEvent[] {
  const ev = TOKENS.slice(0, 8).map((t, i) => {
    const [verb, color] = VERBS[i % 5]!;
    const amt =
      verb === "launched"
        ? "new"
        : verb === "graduated"
          ? "100%"
          : (verb === "sold" ? "−" : "+") + (120 + ((i * 377) % 2400)).toLocaleString() + " STRK";
    return {
      sym: t.sym,
      verb,
      color,
      bg: `linear-gradient(135deg,${t.g[0]},${t.g[1]})`,
      amt,
      ago: ((i * 7) % 50 + 4) + "s ago",
    };
  });
  return ev.concat(ev);
}

export function Ticker() {
  const items = buildEvents();
  return (
    <div
      className="oc-marquee-wrap"
      style={{
        position: "relative",
        marginTop: 12,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.09)",
        background: "#080808",
        overflow: "hidden",
        WebkitMaskImage: "linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)",
        maskImage: "linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)",
      }}
    >
      <div className="oc-marquee" style={{ display: "flex", width: "max-content", gap: 10, padding: "10px 0" }}>
        {items.map((e, i) => (
          <a
            key={i}
            href="#"
            className="lp-ticker-item"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 40,
              padding: "0 16px 0 6px",
              borderRadius: 999,
              background: "#111",
              border: "1px solid rgba(255,255,255,0.06)",
              whiteSpace: "nowrap",
              fontSize: 13,
            }}
          >
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: e.bg }} />
            <span style={{ color: "#A1A1A1" }}>{e.verb}</span>
            <span style={{ fontWeight: 600 }}>${e.sym}</span>
            <span style={{ fontFamily: "var(--font-geist-mono),monospace", color: e.color }}>{e.amt}</span>
            <span style={{ color: "#5a5a5a", fontSize: 12 }}>{e.ago}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
