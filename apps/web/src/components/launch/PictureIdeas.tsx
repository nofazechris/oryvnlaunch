"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { avatarSvg, cleanTicker, imageToSquare, svgToPng, variantsFor, type ArtSuggestion, type Variant } from "@/lib/avatar-art";

interface Capability {
  image: boolean;
  source: "horde" | "cloudflare" | null;
}
let capability: Capability | undefined;

const mono = "var(--font-geist-mono),monospace";
const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What to tell the person while a queued picture waits. */
function waitNote(s: { state?: string; position?: number | null; waitSeconds?: number | null }): string {
  if (s.state === "working") return "Drawing your picture…";
  if (typeof s.position === "number" && s.position > 0) return `In the queue, ${s.position} ahead${s.waitSeconds ? `, about ${s.waitSeconds}s` : ""}…`;
  return "Waiting for a free artist…";
}

/**
 * The token's picture. It is always optional: with none, the app draws an avatar from the token's address.
 * The AI makes a real picture from a description (the AI's own suggested description is filled in for you), and
 * ready-made avatars drawn in the browser sit underneath for when you just want something quick.
 */
export function PictureIdeas({
  ticker,
  idea,
  imagePrompt,
  art,
  busy,
  hasImage,
  onPick,
}: {
  ticker: string;
  /** What the token is about, in the creator's own words. */
  idea: string;
  /** A picture description the AI wrote for this idea, or empty. */
  imagePrompt: string;
  art: ArtSuggestion | null;
  busy: boolean;
  hasImage: boolean;
  /** Called with a picture to use. The studio uploads it exactly like one the person chose from their device. */
  onPick: (file: File) => Promise<void> | void;
}) {
  const [cap, setCap] = useState<Capability | null>(capability ?? null);
  const [prompt, setPrompt] = useState("");
  const [dirty, setDirty] = useState(false);
  const [making, setMaking] = useState(false);
  const [note, setNote] = useState("");
  const [made, setMade] = useState<{ file: File; preview: string } | null>(null);
  const [working, setWorking] = useState("");
  const [chosen, setChosen] = useState("");
  const [err, setErr] = useState("");
  const run = useRef({ cancelled: false });

  const variants = useMemo(() => variantsFor(ticker, art), [ticker, art]);
  const name = cleanTicker(ticker) || "token";
  const suggested = (imagePrompt || idea).trim().slice(0, 200);

  useEffect(() => {
    if (capability) return;
    fetch("/api/ai/status")
      .then((r) => r.json() as Promise<{ image?: boolean; imageSource?: "horde" | "cloudflare" | null }>)
      .then((j) => {
        capability = { image: !!j.image, source: j.imageSource ?? null };
        setCap(capability);
      })
      .catch(() => undefined);
  }, []);

  // Fill in the description for them until they start typing their own.
  useEffect(() => {
    if (!dirty) setPrompt(suggested);
  }, [suggested, dirty]);

  useEffect(() => {
    if (!hasImage) setChosen("");
  }, [hasImage]);

  // Leaving the page stops waiting for a picture, and frees the preview.
  const previewRef = useRef<string>("");
  useEffect(() => {
    const token = run.current;
    return () => {
      token.cancelled = true;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  async function make() {
    const words = prompt.trim() || suggested;
    if (!words || making) return;
    const token = { cancelled: false };
    run.current.cancelled = true;
    run.current = token;
    setMaking(true);
    setErr("");
    setNote("Starting…");
    try {
      const res = await fetch("/api/ai/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: words }) });
      const j = (await res.json().catch(() => ({}))) as { image?: string; job?: string; error?: string };
      if (!res.ok) throw new Error(j.error || "The picture could not be made.");
      let image = j.image;
      if (!image && j.job) {
        const started = Date.now();
        while (!image) {
          if (token.cancelled) return;
          if (Date.now() - started > 150_000) throw new Error("This is taking too long. Try again in a moment.");
          await sleep(2_500);
          if (token.cancelled) return;
          const r = await fetch(`/api/ai/image?job=${encodeURIComponent(j.job)}`);
          const s = (await r.json().catch(() => ({}))) as { state?: string; image?: string; error?: string; position?: number | null; waitSeconds?: number | null };
          if (r.status === 429) continue;
          if (!r.ok || s.state === "failed") throw new Error(s.error || "The picture could not be made.");
          if (s.state === "done" && s.image) image = s.image;
          else setNote(waitNote(s));
        }
      }
      if (!image) throw new Error("The picture could not be made.");
      const jpg = await imageToSquare(image);
      if (token.cancelled) return;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = URL.createObjectURL(jpg);
      setMade({ file: new File([jpg], `${name.toLowerCase()}-ai.jpg`, { type: "image/jpeg" }), preview: previewRef.current });
      setChosen("");
    } catch (e) {
      if (!token.cancelled) setErr(e instanceof Error ? e.message : "The picture could not be made.");
    } finally {
      if (!token.cancelled) {
        setMaking(false);
        setNote("");
      }
    }
  }

  async function acceptMade() {
    if (!made || busy) return;
    setErr("");
    try {
      await onPick(made.file);
      setChosen("generated");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That picture could not be used.");
    }
  }

  async function pickVariant(v: Variant) {
    if (busy || working) return;
    setErr("");
    setWorking(v.key);
    try {
      const png = await svgToPng(avatarSvg(v.spec, ticker));
      await onPick(new File([png], `${name.toLowerCase()}.png`, { type: "image/png" }));
      setChosen(v.key);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That picture could not be used.");
    } finally {
      setWorking("");
    }
  }

  const generated = chosen === "generated" && hasImage;
  const sourceName = cap?.source === "cloudflare" ? "Cloudflare's image service" : "Stable Horde, a free community image network";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 14, borderRadius: 18, background: "#050505", border: "1px solid rgba(182,154,255,0.2)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 14 }}>Make a picture</span>
        <span style={{ fontSize: 12, color: "#8a8a8a", lineHeight: 1.45 }}>
          A picture is optional. Describe it and the AI draws one, or pick a quick avatar below. With none, an avatar is drawn from your token&apos;s address.
        </span>
      </div>

      {cap?.image ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {imagePrompt && !dirty && <span style={{ fontSize: 12, color: "#B69AFF", lineHeight: 1.45 }}>The AI wrote this description from your idea. Change it if you like.</span>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value.slice(0, 200)); setDirty(true); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void make(); } }}
              placeholder="e.g. a sleepy cat wearing headphones"
              aria-label="Describe the picture"
              disabled={making}
              style={{ flex: "1 1 220px", minWidth: 0, height: 42, padding: "0 16px", borderRadius: 999, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, outline: "none" }}
            />
            <button type="button" onClick={() => void make()} disabled={making || !(prompt.trim() || suggested)} style={{ height: 42, padding: "0 20px", borderRadius: 999, border: 0, background: making ? "#2a2a2a" : "#fff", color: making ? "#888" : "#050505", fontWeight: 600, fontSize: 14, cursor: making ? "default" : "pointer" }}>
              {making ? "Making…" : made ? "Try again" : "Make a picture"}
            </button>
          </div>

          {making && (
            <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#A1A1A1" }}>
              <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#B69AFF", animation: "oc-spin 0.9s linear infinite" }} />
              {note || "Working…"}
            </div>
          )}

          {made && !making && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={made.preview} alt="The picture the AI made" width={120} height={120} style={{ borderRadius: 18, display: "block", objectFit: "cover", border: generated ? "2px solid #55D69A" : "2px solid transparent" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button type="button" onClick={() => void acceptMade()} disabled={busy || generated} style={{ alignSelf: "flex-start", height: 38, padding: "0 20px", borderRadius: 999, border: 0, background: generated ? "rgba(85,214,154,0.2)" : "#fff", color: generated ? "#55D69A" : "#050505", fontWeight: 600, fontSize: 14, cursor: busy || generated ? "default" : "pointer" }}>
                  {busy ? "Adding…" : generated ? "In use" : "Use this picture"}
                </button>
                <span style={{ fontSize: 12, color: "#8a8a8a", lineHeight: 1.4 }}>Not quite right? Change the words or press Try again for a new one.</span>
              </div>
            </div>
          )}

          <span style={{ fontSize: 11, color: "#6a6a6a", lineHeight: 1.5 }}>
            Your description is sent to {sourceName} to make the picture, so do not put personal details in it. AI pictures can be imperfect: look yours over before you use it.
          </span>
        </div>
      ) : cap ? (
        <span style={{ fontSize: 12, color: "#8a8a8a" }}>Picture making is turned off on this server. You can still use a quick avatar below or upload your own.</span>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize: 13 }}>Or a quick avatar</span>
        {art && art.why && (
          <span style={{ fontSize: 12, color: "#B69AFF", lineHeight: 1.45 }}>
            AI suggests {art.style} in {art.palette}: {art.why}
          </span>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(88px,1fr))", gap: 10 }}>
          {variants.map((v) => {
            const on = chosen === v.key && hasImage;
            return (
              <button key={v.key} type="button" onClick={() => void pickVariant(v)} disabled={busy || !!working} aria-label={`Use the ${v.label} picture`} aria-pressed={on} title={`Use this ${v.label.toLowerCase()} picture`} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 5, alignItems: "center", padding: 6, borderRadius: 16, border: `1px solid ${on ? "#55D69A" : v.ai ? "rgba(182,154,255,0.5)" : "rgba(255,255,255,0.08)"}`, background: on ? "rgba(85,214,154,0.08)" : "#0b0b0b", cursor: busy || working ? "default" : "pointer", color: "#d8d8d8", opacity: working && working !== v.key ? 0.5 : 1 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUrl(avatarSvg(v.spec, ticker))} alt="" width={76} height={76} style={{ borderRadius: 14, display: "block" }} />
                <span style={{ fontSize: 11, color: v.ai ? "#B69AFF" : "#8a8a8a" }}>{working === v.key ? "Adding…" : on ? "In use" : v.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {err && <span style={{ fontSize: 12, color: "#FF6868", lineHeight: 1.4 }}>{err}</span>}
      <span style={{ fontFamily: mono, fontSize: 10.5, color: "#5a5a5a" }}>Only the picture you choose to use is uploaded to oryvnlaunch.</span>
    </div>
  );
}
