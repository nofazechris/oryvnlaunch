"use client";

import { fmtUsd } from "@/lib/format";
import { usePrices } from "@/lib/useApi";

/** What one STRK is worth right now, so the dollar figures around it make sense. Hidden until a price is known. */
export function StrkPrice({ style }: { style?: React.CSSProperties }) {
  const quote = usePrices().data?.STRK;
  if (!quote) return null;
  return (
    <span
      title={`From an outside quote${quote.stale ? ", a little old" : ""}. Dollar values are approximate.`}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 32, padding: "0 14px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, color: "#d8d8d8", whiteSpace: "nowrap", ...style }}
    >
      <span style={{ color: "#696969" }}>1 STRK</span>
      <span style={{ fontFamily: "var(--font-geist-mono),monospace" }}>{fmtUsd(quote.usd)}</span>
    </span>
  );
}
