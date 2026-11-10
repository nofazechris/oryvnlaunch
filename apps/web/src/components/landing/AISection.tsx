"use client";

import { useState, type FormEvent } from "react";
import { Reveal } from "./Reveal";
import { Contour } from "./Contour";

interface Idea {
  name: string;
  ticker: string;
  line: string;
}

const DEFAULT_IDEAS: Idea[] = [
  { name: "Cairo Builders", ticker: "CAIRO", line: "Named after the language every builder shares." },
  { name: "Proof Club", ticker: "PROOF", line: "A nod to validity proofs and showing your work." },
  { name: "Shipwright", ticker: "SHIP", line: "For the people who ship, every week." },
];
const DEFAULT_DESC =
  "A community token for people building on Starknet — a shared badge for builders, hackers and the folks who show up to help.";
const IDEA_COLORS: [string, string][] = [
  ["#73D9E8", "#B7F0F5"],
  ["#B69AFF", "#F38FC4"],
  ["#FF9865", "#FFD2A8"],
];

const BULLETS = [
  "Every suggestion is editable",
  "It never changes settings or signs transactions",
  "No price predictions, no claims about future value",
];

export function AISection() {
  const [aiInput, setAiInput] = useState("");
  const [aiPrompt, setAiPrompt] = useState("A community token for people building on Starknet.");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>(DEFAULT_IDEAS);
  const [desc, setDesc] = useState(DEFAULT_DESC);
  const [picked, setPicked] = useState(0);

  const aiReady = !aiLoading && !aiError;

  async function askAI(e: FormEvent) {
    e.preventDefault();
    const idea = aiInput.trim();
    if (!idea || aiLoading) return;
    setAiPrompt(idea);
    setAiInput("");
    setAiLoading(true);
    setAiError(false);
    try {
      const res = await fetch("/api/ai/launch-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      if (!res.ok) throw new Error("ai request failed");
      const j = (await res.json()) as { ideas?: Idea[]; description?: string };
      if (!j.ideas?.length) throw new Error("no ideas");
      setIdeas(j.ideas.slice(0, 3));
      setDesc(j.description ?? "");
      setPicked(0);
      setAiLoading(false);
    } catch {
      setAiLoading(false);
      setAiError(true);
    }
  }

  return (
    <section
      id="ai"
      data-screen-label="05 AI"
      style={{ maxWidth: 1440, margin: "0 auto", padding: "clamp(72px,9vw,140px) clamp(18px,5vw,72px) 0" }}
    >
      <Reveal
        style={{
          position: "relative",
          borderRadius: "clamp(28px,3vw,40px)",
          background: "#090909",
          border: "1px solid rgba(255,255,255,0.09)",
          overflow: "hidden",
          padding: "clamp(28px,5vw,72px)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,400px),1fr))",
          gap: "clamp(32px,5vw,72px)",
          alignItems: "center",
        }}
      >
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.7 }}>
          <Contour density={30} seed={21} opacity={0.08} />
        </div>

        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 22 }}>
          <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#B69AFF" }}>AI Launch Studio</span>
          <h2 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(40px,5vw,64px)", letterSpacing: "-0.04em", lineHeight: 1 }}>
            AI meets token creation.
          </h2>
          <p style={{ margin: 0, color: "#A1A1A1", fontSize: 16, lineHeight: 1.6, maxWidth: 460 }}>
            Describe an idea and get names, tickers and a first description. AI also explains launch settings and helps
            you research any token from indexed on-chain data.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14, color: "#d0d0d0" }}>
            {BULLETS.map((b) => (
              <span key={b} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#C7EA83" }} />
                {b}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            position: "relative",
            borderRadius: 28,
            background: "#101010",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 40px 100px rgba(0,0,0,0.6)",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 8px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 15 }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />
              Create with AI
            </span>
            <span style={{ fontSize: 11, color: "#55D69A", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#55D69A" }} />
              Live
            </span>
          </div>

          <div style={{ alignSelf: "flex-end", maxWidth: "85%", padding: "12px 16px", borderRadius: "18px 18px 4px 18px", background: "#1d1d1d", fontSize: 14, lineHeight: 1.5 }}>
            {aiPrompt}
          </div>

          {aiLoading && (
            <div style={{ display: "flex", gap: 6, padding: "14px 4px" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B69AFF", animation: "oc-blink 1s infinite" }} />
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#73D9E8", animation: "oc-blink 1s .2s infinite" }} />
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F38FC4", animation: "oc-blink 1s .4s infinite" }} />
            </div>
          )}

          {aiReady && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14, lineHeight: 1.55, color: "#d8d8d8" }}>
              <span>Here are three directions. Pick one to send to the studio — you can edit everything before deploying.</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ideas.map((idea, i) => (
                  <button
                    key={`${idea.name}-${i}`}
                    onClick={() => setPicked(i)}
                    className="lp-idea"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 16,
                      border: `1px solid ${i === picked ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"}`,
                      background: "#141414",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 12, background: `linear-gradient(135deg,${IDEA_COLORS[i % 3]![0]},${IDEA_COLORS[i % 3]![1]})` }} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>
                        {idea.name} <span style={{ color: "#A1A1A1", fontWeight: 500 }}>${idea.ticker}</span>
                      </span>
                      <span style={{ fontSize: 12, color: "#A1A1A1" }}>{idea.line}</span>
                    </span>
                  </button>
                ))}
              </div>
              <div style={{ padding: "12px 14px", borderRadius: 14, background: "#0b0b0b", border: "1px dashed rgba(255,255,255,0.12)", fontSize: 13, color: "#cfcfcf" }}>
                {desc}
              </div>
            </div>
          )}

          {aiError && <span style={{ fontSize: 13, color: "#FF6868" }}>AI is unavailable right now. Try again in a moment.</span>}

          <form onSubmit={askAI} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 6px 6px 16px", borderRadius: 999, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.12)" }}>
            <input
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Describe your token idea..."
              style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 14, fontFamily: "inherit", height: 38 }}
            />
            <button
              type="submit"
              aria-label="Send"
              className="lp-send"
              style={{ width: 38, height: 38, borderRadius: "50%", border: 0, background: "#fff", color: "#050505", cursor: "pointer", display: "grid", placeItems: "center" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </form>
        </div>
      </Reveal>
    </section>
  );
}
