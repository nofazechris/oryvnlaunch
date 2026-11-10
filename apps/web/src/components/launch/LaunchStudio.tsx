"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { useWalletStore } from "@/lib/wallet-store";
import { useUiStore } from "@/lib/ui-store";
import { fmtK } from "@/lib/oryvn-data";
import {
  DEPLOY_FEE,
  GRAD_LABEL,
  PAL,
  SOCIALS,
  SUPPLIES,
  TEMPLATES,
  curvePath,
  fmtS,
  tickerExists,
  urlOk,
} from "@/lib/launch";
import { Contour } from "@/components/landing/Contour";

type FormState = {
  name: string;
  ticker: string;
  desc: string;
  img: string | null;
  color: number;
  web: string;
  x: string;
  tg: string;
  dc: string;
  supply: number;
  creatorPct: number;
  tpl: number;
  devBuy: string;
};

type DepState = null | "preparing" | "signature" | "submitted" | "confirming" | "confirmed" | "failed";

const DEP_ORDER = ["preparing", "signature", "submitted", "confirming", "confirmed"];
const DEP_LABELS = ["Preparing deployment", "Awaiting wallet signature", "Transaction submitted", "Confirming on Starknet"];

export function LaunchStudio({ simulateFailure = false }: { simulateFailure?: boolean }) {
  const w = useViewportWidth();
  const wallet = useWalletStore((s) => s.wallet);
  const setPanel = useUiStore((s) => s.setPanel);

  const [step, setStep] = useState(1);
  const [f, setF] = useState<FormState>({
    name: "",
    ticker: "",
    desc: "",
    img: null,
    color: 0,
    web: "",
    x: "",
    tg: "",
    dc: "",
    supply: 1e9,
    creatorPct: 2,
    tpl: 0,
    devBuy: "",
  });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [aiIdea, setAiIdea] = useState("");
  const [ai, setAi] = useState<{ ideas: { name: string; ticker: string; line: string }[]; description: string; branding: string[]; post: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState(false);
  const [usedIdea, setUsedIdea] = useState(-1);
  const [explain, setExplain] = useState<{ s?: string; c?: string }>({});
  const [adv, setAdv] = useState(false);
  const [dep, setDep] = useState<DepState>(null);
  const [share, setShare] = useState(false);
  const [copied, setCopied] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const set = (k: keyof FormState, v: FormState[keyof FormState]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setTouched((t) => ({ ...t, [k]: true }));
  };

  // --- AI ---
  async function askAI(idea?: string) {
    const q = (idea ?? aiIdea).trim();
    if (!q || aiLoading) return;
    setAiIdea(q);
    setAiLoading(true);
    setAiErr(false);
    try {
      const res = await fetch("/api/ai/launch-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: q }),
      });
      if (!res.ok) throw new Error("ai");
      const j = await res.json();
      setAi({ ideas: j.ideas ?? [], description: j.description ?? "", branding: j.branding ?? [], post: j.post ?? "" });
      setUsedIdea(-1);
      setAiLoading(false);
    } catch {
      setAiLoading(false);
      setAiErr(true);
    }
  }
  async function explainAI(key: "s" | "c", prompt: string) {
    setExplain((e) => ({ ...e, [key]: "Thinking…" }));
    try {
      const res = await fetch("/api/ai/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      if (!res.ok) throw new Error("ai");
      const j = (await res.json()) as { text?: string };
      setExplain((e) => ({ ...e, [key]: (j.text ?? "").trim() || "AI is unavailable right now." }));
    } catch {
      setExplain((e) => ({ ...e, [key]: "AI is unavailable right now." }));
    }
  }

  function deploy() {
    const seq: [DepState, number][] = [["preparing", 900], ["signature", 1800], ["submitted", 1000], ["confirming", 2200]];
    let i = 0;
    const nextStep = () => {
      if (i < seq.length) {
        const [st, d] = seq[i++]!;
        setDep(st);
        timer.current = setTimeout(nextStep, d);
      } else {
        setDep(simulateFailure ? "failed" : "confirmed");
      }
    };
    setStep(4);
    nextStep();
  }

  // --- derived ---
  const connected = !!wallet;
  const P = PAL[f.color]!;
  const name = f.name.trim();
  const tick = f.ticker.trim();
  const nameErr = !name ? (touched.name ? "Required" : "") : name.length < 2 ? "At least 2 characters" : "";
  const tickValid = /^[A-Z0-9]{2,8}$/.test(tick);
  const tickErr = !tick
    ? touched.ticker
      ? "Required"
      : "2–8 letters or numbers"
    : !tickValid
      ? "2–8 letters or numbers"
      : tickerExists(tick)
        ? `$${tick} already exists — you can still use it, but it may confuse buyers`
        : "";
  const tickBlocking = !tick || !tickValid;
  const socialVals: Record<string, string> = { web: f.web, x: f.x, tg: f.tg, dc: f.dc };
  const socErr = SOCIALS.some((s) => !urlOk(socialVals[s.key]!, s.re));
  const hasSocial = SOCIALS.some((s) => socialVals[s.key]!.trim());
  const step1Ok = !!name && !nameErr && !tickBlocking && !socErr;
  const canDeploy = step1Ok && connected;

  const tpl = TEMPLATES[f.tpl]!;
  const cp = f.creatorPct;
  const curvePct = (100 - cp) * 0.8;
  const lpPct = (100 - cp) * 0.2;
  const supp = (p: number) => fmtK((f.supply * p) / 100);
  const devBuy = parseFloat(f.devBuy) || 0;
  const startP = tpl.start * (1e9 / f.supply);

  // --- Launch Guard ---
  type Check = { label: string; ok: boolean; warn?: boolean; note: string; block?: boolean };
  const checks: Check[] = [
    { label: "Required metadata", ok: !!name && !tickBlocking, note: name && !tickBlocking ? "Name and ticker set" : "Add a name and a 2–8 character ticker", block: true },
    { label: "Token image", ok: !!f.img, warn: !f.img, note: f.img ? "Uploaded" : "Optional — fallback art will be used" },
    { label: "Supply validation", ok: true, note: `${fmtS(f.supply)} fixed, no mint function` },
    { label: "Creator allocation", ok: cp <= 5, warn: cp > 3, note: cp > 3 ? `${cp}% — within cap, but visible to buyers` : `${cp}% — within 5% cap` },
    { label: "Contract template", ok: true, note: "oryvn ERC20 v1 · verified" },
    { label: "Launch parameters", ok: !socErr, note: socErr ? "Fix the highlighted link format" : `${tpl.name} curve within tested bounds`, block: socErr },
    { label: "Description & links", ok: !!(f.desc.trim() && hasSocial), warn: !(f.desc.trim() && hasSocial), note: f.desc.trim() && hasSocial ? "Looks complete" : "Optional — tokens with context get more trust" },
    { label: "Deployment readiness", ok: connected, note: connected ? `Wallet ${wallet} on Starknet` : "Connect a wallet to deploy", block: !connected },
  ];
  const blocking = checks.filter((c) => !c.ok && c.block).length;
  const warns = checks.filter((c) => (c.ok && c.warn) || (!c.ok && !c.block && c.warn)).length;
  const guardBadge = blocking ? `${blocking} blocking` : warns ? `Ready · ${warns} notes` : "Ready";
  const guardColors = { ok: "#55D69A", warn: "#F3B65F", fail: "#FF6868" } as const;
  const guardIcons = { ok: "✓", warn: "!", fail: "✕" } as const;

  // --- stepper ---
  const stepNames = ["Token details", "Launch settings", "Review", "Deploy"];
  const maxStep = dep ? 4 : step1Ok ? 3 : 1;

  const mobile = w < 980;

  // --- deploy view ---
  const cur = dep === "failed" ? 3 : DEP_ORDER.indexOf(dep ?? "");
  const depTitle = dep === "confirmed" ? `${name || "Your token"} is live.` : dep === "failed" ? "Deployment failed" : "Deploying…";
  const depSub =
    dep === "confirmed"
      ? "Confirmed on-chain. Your token page and bonding curve are open for trading."
      : dep === "failed"
        ? "The transaction reverted during confirmation. Nothing was deployed and only the network fee was spent."
        : dep === "signature"
          ? "Approve the transaction in your wallet."
          : "Keep this page open. We only show success after on-chain confirmation.";

  const label = (color: string): React.CSSProperties => ({ display: "flex", flexDirection: "column", gap: 8, color });
  const smallMuted: React.CSSProperties = { fontSize: 13, color: "#A1A1A1" };
  const inputBase: React.CSSProperties = { height: 50, padding: "0 18px", borderRadius: 16, background: "#050505", color: "#fff", fontSize: 15, outline: "none" };
  const explainBox: React.CSSProperties = { padding: "14px 16px", borderRadius: 18, background: "rgba(182,154,255,0.06)", border: "1px solid rgba(182,154,255,0.2)", fontSize: 14, lineHeight: 1.6, color: "#ddd", whiteSpace: "pre-wrap" };
  const cardBox: React.CSSProperties = { borderRadius: 28, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: "clamp(18px,2.5vw,28px)", display: "flex", flexDirection: "column" };
  const explainBtn: React.CSSProperties = { height: 32, padding: "0 12px", borderRadius: 999, border: "1px solid rgba(182,154,255,0.35)", background: "transparent", color: "#d9ccff", fontSize: 12, cursor: "pointer" };

  const onImg = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => set("img", r.result as string);
    r.readAsDataURL(file);
  };

  const review = [
    { title: "Token", edit: () => setStep(1), rows: [
      { k: "Name", v: name || "—" },
      { k: "Ticker", v: tick ? "$" + tick : "—" },
      { k: "Image", v: f.img ? "Uploaded" : "Fallback art" },
      { k: "Links", v: SOCIALS.filter((s) => socialVals[s.key]!.trim()).map((s) => s.label).join(", ") || "None" },
    ] },
    { title: "Supply & allocation", edit: () => setStep(2), rows: [
      { k: "Total supply", v: fmtS(f.supply) },
      { k: "Bonding curve", v: supp(curvePct) },
      { k: "DEX liquidity", v: supp(lpPct) },
      { k: "Creator", v: `${cp}% · ${supp(cp)}` },
    ] },
    { title: "Bonding", edit: () => setStep(2), rows: [
      { k: "Template", v: tpl.name },
      { k: "Starting price", v: startP.toFixed(8) + " STRK" },
      { k: "Graduation threshold", v: GRAD_LABEL },
      { k: "Initial buy", v: devBuy ? devBuy + " STRK" : "None" },
    ] },
    { title: "Fees", edit: () => setStep(2), rows: [
      { k: "Deploy fee", v: DEPLOY_FEE + " STRK" },
      { k: "Trading fee", v: "1% per trade" },
      { k: "Network fee (est.)", v: "~0.02 STRK" },
    ] },
  ];
  const totalDue = (DEPLOY_FEE + devBuy + 0.02).toFixed(2) + " STRK";

  function next() {
    if (step === 1 && !step1Ok) {
      setTouched((t) => ({ ...t, name: true, ticker: true }));
      return;
    }
    if (step === 3) {
      if (!connected) setPanel("wallet");
      else if (canDeploy) deploy();
      return;
    }
    setStep(step + 1);
  }

  const ideaColors: [string, string][] = [["#73D9E8", "#B7F0F5"], ["#B69AFF", "#F38FC4"], ["#FF9865", "#FFD2A8"]];

  return (
    <div style={{ minHeight: "100vh", background: "#050505" }}>
      {/* Header */}
      <section data-screen-label="Launch header" style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", WebkitMaskImage: "linear-gradient(180deg,#000 40%,transparent)", maskImage: "linear-gradient(180deg,#000 40%,transparent)" }}>
          <Contour density={40} seed={17} opacity={0.13} />
        </div>
        <div style={{ position: "relative", maxWidth: 1360, margin: "0 auto", padding: "clamp(44px,6vw,84px) clamp(18px,5vw,64px) 32px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(48px,7vw,104px)", letterSpacing: "-0.045em", lineHeight: 0.95 }}>Create something.</h1>
            <p style={{ margin: 0, color: "#A1A1A1", fontSize: 17 }}>Bring your token idea to life on Starknet.</p>
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {stepNames.map((l, i) => {
              const n = i + 1;
              const on = step === n;
              const done = n < step;
              const locked = n > maxStep || (!!dep && n < 4 && dep !== "failed");
              return (
                <li key={l}>
                  <button
                    onClick={() => !locked && setStep(n)}
                    disabled={locked}
                    style={{ display: "flex", alignItems: "center", gap: 9, height: 40, padding: "0 16px 0 6px", borderRadius: 999, border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.1)"}`, background: on ? "#fff" : "transparent", color: on ? "#050505" : done ? "#fff" : "#696969", cursor: locked ? "default" : "pointer", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", opacity: locked ? 0.55 : 1 }}
                  >
                    <span style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: on ? "#050505" : done ? "#55D69A" : "#151515", color: on ? "#fff" : done ? "#050505" : "#8a8a8a", fontFamily: "var(--font-geist-mono),monospace", fontSize: 12 }}>
                      {done ? "✓" : n}
                    </span>
                    {l}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <main style={{ maxWidth: 1360, margin: "0 auto", padding: "8px clamp(18px,5vw,64px) 140px", display: "grid", gridTemplateColumns: mobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(320px,400px)", gap: "clamp(20px,3vw,40px)", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {/* STEP 1 */}
          {step === 1 && (
            <>
              <div style={{ position: "relative", overflow: "hidden", borderRadius: 28, border: "1px solid rgba(182,154,255,0.28)", background: "linear-gradient(160deg,rgba(182,154,255,0.12),rgba(115,217,232,0.04) 60%,rgba(5,5,5,0))", padding: "clamp(18px,2.5vw,28px)", display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: "50%", background: "conic-gradient(from 90deg,#B69AFF,#73D9E8,#F38FC4,#B69AFF)" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Create with AI.</span>
                    <span style={smallMuted}>Tell us about your idea. We&apos;ll help you shape it.</span>
                  </div>
                </div>
                <form onSubmit={(e) => { e.preventDefault(); askAI(); }} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 6px 6px 18px", borderRadius: 999, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <input value={aiIdea} onChange={(e) => setAiIdea(e.target.value)} placeholder="Describe your token idea..." style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 15, height: 40 }} />
                  <button type="submit" className="lp-send" style={{ height: 40, padding: "0 18px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{ai ? "Regenerate" : "Generate"}</button>
                </form>
                {!ai && !aiLoading && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["A community token for people building on Starknet.", "A sleepy cat mascot for night-owl traders", "A token for a Lisbon hackathon crew"].map((x) => (
                      <button key={x} onClick={() => askAI(x)} className="lp-chip" style={{ minHeight: 30, padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#cfcfcf", fontSize: 12, cursor: "pointer", textAlign: "left", lineHeight: 1.3 }}>{x}</button>
                    ))}
                  </div>
                )}
                {aiLoading && (
                  <div style={{ display: "flex", gap: 6, padding: "6px 2px" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#B69AFF", animation: "oc-blink 1s infinite" }} />
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#73D9E8", animation: "oc-blink 1s .2s infinite" }} />
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#F38FC4", animation: "oc-blink 1s .4s infinite" }} />
                  </div>
                )}
                {ai && !aiLoading && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))", gap: 8 }}>
                      {ai.ideas.slice(0, 3).map((idea, k) => (
                        <button key={k} onClick={() => { setUsedIdea(k); set("name", idea.name); set("ticker", (idea.ticker || "").toUpperCase().slice(0, 8)); }} className="lp-ideacard" style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left", padding: "12px 14px", borderRadius: 18, border: `1px solid ${usedIdea === k ? "rgba(182,154,255,0.7)" : "rgba(255,255,255,0.08)"}`, background: "#0e0e0e", color: "#fff", cursor: "pointer" }}>
                          <span style={{ fontWeight: 600 }}>{idea.name} <span style={{ color: "#A1A1A1", fontWeight: 500 }}>${idea.ticker}</span></span>
                          <span style={{ fontSize: 12, color: "#A1A1A1", lineHeight: 1.4 }}>{idea.line}</span>
                          <span style={{ fontSize: 11, color: "#B69AFF", marginTop: 4 }}>{usedIdea === k ? "Applied — edit below" : "Use name & ticker"}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 18, background: "#0b0b0b", border: "1px dashed rgba(255,255,255,0.12)" }}>
                      <span style={{ fontSize: 12, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>Description draft</span>
                      <span style={{ fontSize: 14, lineHeight: 1.55, color: "#ddd" }}>{ai.description}</span>
                      <button onClick={() => set("desc", ai.description.slice(0, 280))} className="lp-usedesc" style={{ alignSelf: "flex-start", height: 30, padding: "0 12px", borderRadius: 999, border: 0, background: "#1d1d1d", color: "#fff", fontSize: 12, cursor: "pointer" }}>Use description</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 8 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 18, background: "#0b0b0b" }}>
                        <span style={{ fontSize: 12, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>Branding directions</span>
                        {ai.branding.map((b, k) => (<span key={k} style={{ fontSize: 13, color: "#cfcfcf", lineHeight: 1.45 }}>· {b}</span>))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 18, background: "#0b0b0b" }}>
                        <span style={{ fontSize: 12, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>Launch post</span>
                        <span style={{ fontSize: 13, color: "#cfcfcf", lineHeight: 1.5 }}>{ai.post}</span>
                        <button onClick={() => { navigator.clipboard?.writeText(ai.post).catch(() => {}); setCopied("post"); }} style={{ alignSelf: "flex-start", height: 28, padding: "0 12px", borderRadius: 999, border: 0, background: "#1d1d1d", color: "#fff", fontSize: 12, cursor: "pointer" }}>{copied === "post" ? "Copied" : "Copy"}</button>
                      </div>
                    </div>
                  </div>
                )}
                {aiErr && <span style={{ fontSize: 13, color: "#FF6868" }}>AI is unavailable right now. You can fill everything in by hand.</span>}
                <span style={{ fontSize: 12, color: "#8a8a8a" }}>AI suggests — you decide. It never changes settings or deploys anything on its own.</span>
              </div>

              {/* Token details */}
              <div style={{ ...cardBox, gap: 20 }}>
                <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Token details</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 14 }}>
                  <label style={label("inherit")}>
                    <span style={smallMuted}>Token name</span>
                    <input value={f.name} onChange={(e) => set("name", e.target.value.slice(0, 32))} maxLength={32} placeholder="e.g. Cairo Builders" style={{ ...inputBase, border: `1px solid ${nameErr ? "rgba(255,104,104,0.6)" : "rgba(255,255,255,0.1)"}` }} />
                    <span style={{ fontSize: 12, color: "#FF6868" }}>{nameErr}</span>
                  </label>
                  <label style={label("inherit")}>
                    <span style={smallMuted}>Ticker</span>
                    <div style={{ display: "flex", alignItems: "center", height: 50, padding: "0 18px", borderRadius: 16, background: "#050505", border: `1px solid ${tickBlocking && touched.ticker ? "rgba(255,104,104,0.6)" : "rgba(255,255,255,0.1)"}` }}>
                      <span style={{ color: "#696969", fontSize: 15 }}>$</span>
                      <input value={f.ticker} onChange={(e) => set("ticker", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} maxLength={8} placeholder="CAIRO" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, color: "#fff", fontSize: 15, outline: "none", fontFamily: "var(--font-geist-mono),monospace", letterSpacing: "0.04em" }} />
                    </div>
                    <span style={{ fontSize: 12, color: tickBlocking && touched.ticker ? "#FF6868" : tickErr.includes("exists") ? "#F3B65F" : "#696969" }}>{tickErr}</span>
                  </label>
                </div>
                <label style={label("inherit")}>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#A1A1A1" }}>
                    <span>Description</span>
                    <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 12, color: f.desc.length > 260 ? "#F3B65F" : "#696969" }}>{f.desc.length}/280</span>
                  </span>
                  <textarea value={f.desc} onChange={(e) => set("desc", e.target.value.slice(0, 280))} rows={3} placeholder="What is this token for? Who is it for?" style={{ padding: "14px 18px", borderRadius: 16, background: "#050505", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 15, lineHeight: 1.5, outline: "none", resize: "vertical" }} />
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={smallMuted}>Token image</span>
                  <label className="lp-upload" style={{ display: "flex", alignItems: "center", gap: 16, padding: 14, borderRadius: 18, border: "1px dashed rgba(255,255,255,0.18)", cursor: "pointer", background: "#050505" }}>
                    <span style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 18, background: f.img ? `url(${f.img})` : `linear-gradient(150deg, ${P[1]}, ${P[0]})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 14 }}>{f.img ? "Replace image" : "Upload token image"}</span>
                      <span style={{ fontSize: 12, color: "#696969" }}>PNG, JPG or GIF · square · up to 4 MB. No image? We&apos;ll generate fallback art.</span>
                    </span>
                    <input type="file" accept="image/*" onChange={onImg} style={{ display: "none" }} />
                  </label>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <span style={smallMuted}>Card colour</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {PAL.map((p, i) => (
                      <button key={i} onClick={() => set("color", i)} aria-label={"Colour " + (i + 1)} style={{ width: 38, height: 38, borderRadius: "50%", border: `2px solid ${f.color === i ? "#fff" : "transparent"}`, background: `linear-gradient(150deg, ${p[1]}, ${p[0]})`, cursor: "pointer", padding: 0 }} />
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <span style={smallMuted}>Links <span style={{ color: "#5a5a5a" }}>· optional</span></span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 10 }}>
                    {SOCIALS.map((sc) => {
                      const val = socialVals[sc.key]!;
                      const bad = !urlOk(val, sc.re);
                      return (
                        <div key={sc.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, height: 46, padding: "0 16px", borderRadius: 14, background: "#050505", border: `1px solid ${bad ? "rgba(255,104,104,0.6)" : "rgba(255,255,255,0.08)"}` }}>
                            <span style={{ fontSize: 12, color: "#696969", width: 64 }}>{sc.label}</span>
                            <input value={val} onChange={(e) => set(sc.key, e.target.value)} placeholder={sc.ph} style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, color: "#fff", fontSize: 14, outline: "none" }} />
                          </div>
                          <span style={{ fontSize: 11, color: "#FF6868" }}>{bad ? sc.msg : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              <div style={{ ...cardBox, gap: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Supply &amp; allocation</span>
                  <button onClick={() => explainAI("s", `Explain this setup: total supply ${fmtS(f.supply)}, creator allocation ${cp}%, ${curvePct.toFixed(1)}% sold on the bonding curve, ${lpPct.toFixed(1)}% reserved for DEX liquidity at graduation. What does each part mean for buyers?`)} className="lp-explain" style={explainBtn}>Explain with AI</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <span style={smallMuted}>Total supply</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {SUPPLIES.map((v) => (
                      <button key={v} onClick={() => set("supply", v)} style={{ height: 44, padding: "0 18px", borderRadius: 14, border: `1px solid ${f.supply === v ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"}`, background: f.supply === v ? "#1b1b1b" : "transparent", color: "#fff", fontFamily: "var(--font-geist-mono),monospace", fontSize: 14, cursor: "pointer" }}>{fmtS(v)}</button>
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: "#696969" }}>Fixed at deploy. The token contract has no mint function.</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "#A1A1A1" }}>Creator allocation</span>
                    <span style={{ fontFamily: "var(--font-geist-mono),monospace" }}>{cp}%</span>
                  </div>
                  <input type="range" min={0} max={5} step={0.5} value={cp} onChange={(e) => set("creatorPct", parseFloat(e.target.value))} />
                  <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5 }}>Capped at 5%. Shown publicly on your token page and in holder concentration. Higher allocations make buyers more cautious.</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", height: 16, borderRadius: 99, overflow: "hidden", gap: 2 }}>
                    <span style={{ width: `${curvePct}%`, background: "#73D9E8" }} />
                    <span style={{ width: `${lpPct}%`, background: "#B69AFF" }} />
                    <span style={{ width: `${cp}%`, background: "#F38FC4" }} />
                  </div>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: "#A1A1A1" }}>
                    <span style={{ display: "flex", gap: 7, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#73D9E8" }} />Bonding curve {curvePct.toFixed(1)}% · {supp(curvePct)}</span>
                    <span style={{ display: "flex", gap: 7, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#B69AFF" }} />DEX liquidity at graduation {lpPct.toFixed(1)}% · {supp(lpPct)}</span>
                    <span style={{ display: "flex", gap: 7, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F38FC4" }} />Creator {cp}% · {supp(cp)}</span>
                  </div>
                </div>
                {explain.s && <div style={explainBox}>{explain.s}</div>}
              </div>

              <div style={{ ...cardBox, gap: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Bonding curve</span>
                  <button onClick={() => explainAI("c", `Explain the "${tpl.name}" bonding curve (${tpl.desc}) with starting price ${startP.toFixed(8)} STRK, graduation at 69,000 STRK reserve, 1% trade fee (0.5% platform, 0.5% creator). How does price move as people buy and sell, and what happens at graduation?`)} className="lp-explain" style={explainBtn}>Explain with AI</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: 10 }}>
                  {TEMPLATES.map((t, i) => (
                    <button key={t.name} onClick={() => set("tpl", i)} style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left", padding: 14, borderRadius: 20, border: `1px solid ${f.tpl === i ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"}`, background: f.tpl === i ? "#141414" : "transparent", color: "#fff", cursor: "pointer" }}>
                      <span style={{ height: 56, width: "100%" }}>
                        <svg viewBox="0 0 160 56" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
                          <path d={curvePath(t.k)} fill="none" stroke={f.tpl === i ? P[0] : "#555"} strokeWidth={2} />
                        </svg>
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</span>
                      <span style={{ fontSize: 12, color: "#A1A1A1", lineHeight: 1.45 }}>{t.desc}</span>
                      <span style={{ fontSize: 11, color: "#55D69A" }}>Tested template · audited</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 1, borderRadius: 18, overflow: "hidden", background: "rgba(255,255,255,0.07)" }}>
                  {[
                    { k: "Starting price", v: startP.toFixed(8) + " STRK" },
                    { k: "On the curve", v: supp(curvePct) },
                    { k: "Graduation", v: GRAD_LABEL },
                    { k: "Liquidity at grad.", v: supp(lpPct) + " + reserve" },
                    { k: "Trade fee", v: "1% (0.5 + 0.5)" },
                  ].map((c) => (
                    <div key={c.k} style={{ background: "#0b0b0b", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={{ fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.k}</span>
                      <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 14 }}>{c.v}</span>
                    </div>
                  ))}
                </div>
                {explain.c && <div style={explainBox}>{explain.c}</div>}
                <button onClick={() => setAdv((a) => !a)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 48, padding: "0 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#d0d0d0", cursor: "pointer", fontSize: 14 }}>
                  Advanced options<span style={{ fontFamily: "var(--font-geist-mono),monospace" }}>{adv ? "−" : "+"}</span>
                </button>
                {adv && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <label style={label("inherit")}>
                      <span style={smallMuted}>Initial buy at launch <span style={{ color: "#5a5a5a" }}>· optional</span></span>
                      <div style={{ display: "flex", alignItems: "center", height: 48, padding: "0 16px", borderRadius: 14, background: "#050505", border: "1px solid rgba(255,255,255,0.1)" }}>
                        <input value={f.devBuy} onChange={(e) => set("devBuy", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, color: "#fff", fontFamily: "var(--font-geist-mono),monospace", fontSize: 15, outline: "none" }} />
                        <span style={{ color: "#696969", fontSize: 13 }}>STRK</span>
                      </div>
                      <span style={{ fontSize: 12, color: "#696969" }}>Bought in the same transaction as deploy, at the starting price. Visible on-chain as a creator buy.</span>
                    </label>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, background: "#050505", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <span style={{ fontSize: 14 }}>Creator fee share</span>
                        <span style={{ fontSize: 12, color: "#696969" }}>0.5% of each bonding trade goes to the creator wallet.</span>
                      </span>
                      <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 99, background: "#191919", color: "#A1A1A1" }}>Fixed by template</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div style={{ ...cardBox, gap: 18 }}>
              <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Review</span>
              {review.map((g) => (
                <div key={g.title} style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>{g.title}</span>
                    <button onClick={g.edit} style={{ border: 0, background: "transparent", color: "#73D9E8", fontSize: 12, cursor: "pointer" }}>Edit</button>
                  </div>
                  {g.rows.map((r) => (
                    <div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "6px 0", fontSize: 14 }}>
                      <span style={{ color: "#A1A1A1" }}>{r.k}</span>
                      <span style={{ fontFamily: "var(--font-geist-mono),monospace", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>{r.v}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: 16, borderRadius: 18, background: "#050505" }}>
                <span style={{ color: "#A1A1A1" }}>Total due now</span>
                <span style={{ fontFamily: "var(--font-geist-mono),monospace", fontSize: 22 }}>{totalDue}</span>
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 28, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: "clamp(22px,3vw,36px)", display: "flex", flexDirection: "column", gap: 22 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: "clamp(26px,3vw,36px)", letterSpacing: "-0.03em" }}>{depTitle}</span>
                <span style={{ color: "#A1A1A1", fontSize: 14, lineHeight: 1.5 }}>{depSub}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {DEP_LABELS.map((l, i) => {
                  const done = i < cur || dep === "confirmed";
                  const active = i === cur && dep !== "confirmed" && dep !== "failed";
                  const failed = dep === "failed" && i === 3;
                  return (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 15, color: done || active || failed ? "#fff" : "#5a5a5a" }}>
                      <span style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", border: done || failed ? "0" : active ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)", background: failed ? "#FF6868" : done ? "#55D69A" : "transparent", animation: active ? "oc-blink 1.2s infinite" : "none", fontSize: 13, color: "#050505" }}>
                        {failed ? "!" : done ? "✓" : ""}
                      </span>
                      {l}
                    </div>
                  );
                })}
              </div>
              {dep === "confirmed" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[{ k: "Contract", v: "0x0499b1…e5f7a9" }, { k: "Transaction", v: "0x02c8e1…7b30d4" }].map((r) => (
                    <div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#050505", fontSize: 13 }}>
                      <span style={{ color: "#A1A1A1" }}>{r.k}</span>
                      <span style={{ fontFamily: "var(--font-geist-mono),monospace" }}>{r.v}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <Link href="/token?t=CAIRO" className="lp-cta-primary" style={{ height: 48, padding: "0 22px", borderRadius: 999, background: "#fff", color: "#050505", fontWeight: 600, display: "inline-flex", alignItems: "center" }}>View token page</Link>
                    <button onClick={() => setShare(true)} style={{ height: 48, padding: "0 22px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#fff", fontWeight: 500, cursor: "pointer" }}>Share token</button>
                    <a href="#" style={{ height: 48, padding: "0 18px", display: "inline-flex", alignItems: "center", color: "#A1A1A1", fontSize: 14 }}>View on explorer ↗</a>
                  </div>
                </div>
              )}
              {dep === "failed" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => deploy()} style={{ height: 48, padding: "0 22px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer" }}>Try again</button>
                  <button onClick={() => { setStep(3); setDep(null); }} style={{ height: 48, padding: "0 22px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#fff", cursor: "pointer" }}>Back to review</button>
                </div>
              )}
            </div>
          )}

          {/* Nav buttons */}
          {step < 4 && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <button onClick={() => setStep(Math.max(1, step - 1))} style={{ height: 52, padding: "0 24px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#fff", cursor: "pointer", fontWeight: 500, visibility: step > 1 ? "visible" : "hidden" }}>Back</button>
              <button onClick={next} disabled={step === 3 && connected && !canDeploy} className="lp-next" style={{ height: 52, padding: "0 28px", borderRadius: 999, border: 0, cursor: "pointer", fontWeight: 600, fontSize: 15, background: step === 3 ? "linear-gradient(90deg,#FF9865,#FFE3CF)" : "#fff", color: "#1a0d05", opacity: step === 3 && connected && !canDeploy ? 0.45 : 1 }}>
                {step === 3 ? (connected ? "Deploy Token" : "Connect wallet to deploy") : "Continue"}
              </button>
            </div>
          )}
        </div>

        {/* RIGHT aside */}
        <aside style={{ position: mobile ? "relative" : "sticky", top: 90, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ position: "relative", height: mobile ? 440 : 500, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 8 }}>
            <div style={{ position: "absolute", width: "62%", height: "86%", top: 30, left: "4%", borderRadius: 30, background: `linear-gradient(165deg, ${PAL[(f.color + 2) % 7]![1]}, ${PAL[(f.color + 2) % 7]![0]})`, opacity: 0.35, transform: "rotate(-8deg)" }} />
            <div style={{ position: "relative", width: "min(100%,360px)", height: "calc(100% - 20px)", borderRadius: 30, overflow: "hidden", background: `linear-gradient(165deg, ${P[1]} 0%, ${P[0]} 70%)`, color: P[2], boxShadow: "0 30px 80px rgba(0,0,0,0.6),inset 0 0 0 1px rgba(255,255,255,0.35)", transform: "rotate(2deg)" }}>
              <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, height: "56%", borderRadius: 22, background: f.img ? `url(${f.img})` : "rgba(255,255,255,0.28)", backgroundSize: "cover", backgroundPosition: "center", display: "grid", placeItems: "center", overflow: "hidden" }}>
                <span style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.06em", opacity: f.img ? 0 : 0.25 }}>{tick || "TICKER"}</span>
              </div>
              <div style={{ position: "relative", padding: "24px 24px 0", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05, wordBreak: "break-word" }}>{name || "Your token"}</span>
                  <span style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 999, background: "rgba(0,0,0,0.12)", fontSize: 11, fontWeight: 600 }}>{dep === "confirmed" ? "Live · Bonding" : "Draft"}</span>
                </div>
                <span style={{ fontSize: 15, fontWeight: 500, opacity: 0.75 }}>${tick || "TICKER"}</span>
                <span style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.8, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{f.desc.trim() || "Your description appears here as you type."}</span>
              </div>
            </div>
          </div>

          <div style={{ borderRadius: 24, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                Launch Guard
              </span>
              <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 99, background: blocking ? "rgba(255,104,104,0.15)" : "rgba(85,214,154,0.15)", color: blocking ? "#FF6868" : "#55D69A", fontWeight: 600 }}>{guardBadge}</span>
            </div>
            {checks.map((c) => {
              const st: "ok" | "warn" | "fail" = !c.ok ? (c.block ? "fail" : "warn") : c.warn ? "warn" : "ok";
              return (
                <div key={c.label} style={{ display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, alignItems: "start", fontSize: 13 }}>
                  <span style={{ width: 18, height: 18, marginTop: 1, borderRadius: "50%", background: guardColors[st], color: "#050505", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{guardIcons[st]}</span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ color: st === "fail" ? "#fff" : "#e4e4e4" }}>{c.label}</span>
                    <span style={{ fontSize: 12, color: "#696969" }}>{c.note}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </aside>
      </main>

      {/* Share modal */}
      {share && (
        <div onClick={() => setShare(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 14 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, borderRadius: 28, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontSize: 22 }}>Share {name || "Your token"}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 6px 6px 14px", borderRadius: 14, background: "#050505", border: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ flex: 1, fontFamily: "var(--font-geist-mono),monospace", fontSize: 12, color: "#A1A1A1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>oryvnlaunch.xyz/token/0x0499…e5f7a9</span>
              <button onClick={() => { navigator.clipboard?.writeText("https://oryvnlaunch.xyz/token/0x0499b1").catch(() => {}); setCopied("link"); }} style={{ height: 34, padding: "0 14px", borderRadius: 10, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer" }}>{copied === "link" ? "Copied" : "Copy"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {["X", "Telegram", "Discord"].map((s) => (<a key={s} href="#" style={{ height: 44, borderRadius: 14, background: "#181818", display: "grid", placeItems: "center", fontSize: 14 }}>{s}</a>))}
            </div>
            <button onClick={() => setShare(false)} style={{ height: 44, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", cursor: "pointer" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
