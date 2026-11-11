"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TOKENS, view } from "@/lib/oryvn-data";
import { TokenAvatar } from "@/components/ui/TokenAvatar";

export function SearchModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  const query = q.trim().toLowerCase();
  const results = useMemo(() => {
    const all = TOKENS.map((t, i) => view(t, i));
    return all
      .filter((t) => !query || [t.name, t.sym, t.addr, t.creator].some((x) => x.toLowerCase().includes(query)))
      .slice(0, query ? 8 : 5);
  }, [query]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "min(14vh,120px) 14px 14px" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 620, borderRadius: 26, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 40px 120px rgba(0,0,0,0.7)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A1A1A1" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tokens, tickers, contract addresses, creators" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 17 }} />
          <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 11, color: "#696969", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "3px 7px" }}>esc</span>
        </div>
        <div style={{ maxHeight: "min(60vh,460px)", overflowY: "auto", padding: 8 }}>
          <span style={{ display: "block", padding: "8px 12px", fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {query ? "Results" : "Trending now"}
          </span>
          {results.map((t) => (
            <Link key={t.sym} href={t.href} onClick={onClose} className="lp-searchrow" style={{ display: "grid", gridTemplateColumns: "40px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 14, color: "#fff", textDecoration: "none" }}>
              <TokenAvatar sym={t.sym} bg={t.bg} ink={t.ink} size={40} />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{t.name} <span style={{ color: "#696969", fontWeight: 500 }}>${t.sym}</span></span>
                <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 11, color: "#696969", overflow: "hidden", textOverflow: "ellipsis" }}>{t.addrShort} · by {t.creator}</span>
              </span>
              <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 12, color: t.chgColor }}>{t.chgStr}</span>
            </Link>
          ))}
          {results.length === 0 && (
            <div style={{ padding: "36px 12px", textAlign: "center", color: "#A1A1A1", fontSize: 14 }}>No tokens match “{q}”.</div>
          )}
        </div>
      </div>
    </div>
  );
}
