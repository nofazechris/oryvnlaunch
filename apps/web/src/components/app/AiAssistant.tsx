"use client";

import { useState, type FormEvent } from "react";
import { GRAD_TARGET, TOKENS, bySym, urlSym } from "@/lib/oryvn-data";

interface Msg {
  role: "user" | "ai";
  text: string;
}

function buildContext(active: string) {
  const sym = urlSym();
  const t = sym ? TOKENS[bySym(sym)]! : null;
  if (t) {
    return {
      page: active || "page",
      token: {
        name: t.name,
        ticker: t.sym,
        priceSTRK: t.price,
        chg24h: t.chg,
        mcapSTRK: t.mcap,
        vol24hSTRK: t.vol,
        holders: t.holders,
        bondingPct: t.bond,
        age: t.age,
      },
    };
  }
  return {
    page: active || "page",
    topTokens: TOKENS.slice()
      .sort((a, b) => b.vol - a.vol)
      .slice(0, 6)
      .map((x) => ({ name: x.name, ticker: x.sym, vol24hSTRK: x.vol, bondingPct: x.bond, chg24h: x.chg, holders: x.holders })),
    platform: { graduationSTRK: GRAD_TARGET, tradeFee: "1% (0.5 platform, 0.5 creator)", deployFee: "10 STRK", creatorCap: "5%" },
  };
}

export function AiAssistant({ active, pad, onClose }: { active: string; pad: string; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sym = urlSym();
  const suggestions = sym
    ? [`Explain $${sym}'s bonding progress`, "What do the holder numbers tell me?", "How do fees work on a trade?"]
    : ["What's trending right now and why?", "How does graduation work?", "What are the launch fees?"];

  async function ask(q: string) {
    const question = q.trim();
    if (!question || loading) return;
    const history = msgs.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...history, { role: "user", content: question }], context: buildContext(active) }),
      });
      if (!res.ok) throw new Error("ai");
      const j = (await res.json()) as { text?: string };
      setMsgs((m) => [...m, { role: "ai", text: j.text ?? "" }]);
    } catch {
      setMsgs((m) => [...m, { role: "ai", text: "AI is unavailable right now. Try again shortly." }]);
    } finally {
      setLoading(false);
    }
  }

  const empty = msgs.length === 0 && !loading;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", display: "flex", justifyContent: "flex-end", alignItems: "flex-end", padding: pad }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 440, height: "min(640px,100%)", borderRadius: 28, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,0.7)" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>Assistant</span>
              <span style={{ fontSize: 12, color: "#A1A1A1" }}>{sym ? `Context: $${sym}` : "Context: platform data"}</span>
            </span>
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setMsgs([])} style={{ height: 32, padding: "0 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#d8d8d8", cursor: "pointer", fontSize: 12 }}>New</button>
            <button onClick={onClose} aria-label="Close" className="lp-close" style={{ width: 32, height: 32, borderRadius: "50%", border: 0, background: "#191919", color: "#fff", cursor: "pointer" }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
          {empty && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 22, letterSpacing: "-0.02em", lineHeight: 1.2 }}>How can I help?</span>
              <span style={{ fontSize: 13, color: "#A1A1A1", lineHeight: 1.5 }}>I answer from indexed platform data. I can&apos;t trade, sign or move funds.</span>
              {suggestions.map((q) => (
                <button key={q} onClick={() => ask(q)} className="lp-aisuggest" style={{ textAlign: "left", padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "#111", color: "#e0e0e0", cursor: "pointer", fontSize: 13 }}>{q}</button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "90%", padding: "11px 15px", borderRadius: 18, background: m.role === "user" ? "#1d1d1d" : "#101010", border: m.role === "user" ? "0" : "1px solid rgba(255,255,255,0.07)", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap", color: "#e6e6e6" }}
            >
              {m.text}
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", gap: 6, padding: "6px 2px" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B69AFF", animation: "oc-blink 1s infinite" }} />
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#73D9E8", animation: "oc-blink 1s .2s infinite" }} />
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F38FC4", animation: "oc-blink 1s .4s infinite" }} />
            </div>
          )}
        </div>

        <form
          onSubmit={(e: FormEvent) => { e.preventDefault(); ask(input); }}
          style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 16px 16px", padding: "6px 6px 6px 16px", borderRadius: 999, background: "#111", border: "1px solid rgba(255,255,255,0.12)" }}
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything..." style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 14, height: 38 }} />
          <button type="submit" style={{ height: 38, padding: "0 16px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer" }}>Ask</button>
        </form>
      </div>
    </div>
  );
}
