"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useViewportWidth } from "@/lib/hooks";
import { sendCalls, useWalletStore } from "@/lib/wallet-store";
import { useUiStore } from "@/lib/ui-store";
import { paletteFor } from "@/lib/art";
import { api, uploadImage, type ApiLaunch } from "@/lib/api";
import type { ArtSuggestion } from "@/lib/avatar-art";
import { PictureIdeas } from "./PictureIdeas";
import { FundsHelp } from "@/components/wallet/FundsHelp";
import { EXPLORER_URL, FACTORY_ADDRESS, NETWORK, NETWORK_LABEL, RPC_URL } from "@/lib/config";
import { balanceOf } from "@/lib/rpc";
import { fmtUsd, formatUnits, shortAddr, toNumber, toUsd } from "@/lib/format";
import { CURVE_PERCENT, MAX_CREATOR_PERCENT, PRESETS, SOCIALS, TOTAL_SUPPLY, TRADE_FEE_NOTE, urlOk } from "@/lib/launch";
import { launchCalls, metadataUri } from "@/lib/launch-tx";
import { useFeeAssets, usePolled, useQuoteTokens, useStrkUsd } from "@/lib/useApi";
import { useWalletAbandoned } from "@/lib/useWalletAbandoned";
import { Contour } from "@/components/landing/Contour";
import { AiOfflineNotice } from "@/components/ui/AiOfflineNotice";
import { explorerTx } from "@/lib/safe";
import { walletLabel } from "@/lib/wallet-label";

type FormState = {
  name: string;
  ticker: string;
  desc: string;
  web: string;
  x: string;
  tg: string;
  dc: string;
  /** Address of the asset chosen to pay the deploy fee in. Empty until the user picks, then the first enabled one is used. */
  feeAsset: string;
  preset: 0 | 1 | 2;
  creatorPct: number;
};

type DepState = null | "preparing" | "signature" | "submitted" | "confirming" | "confirmed" | "failed";

const DEP_ORDER = ["preparing", "signature", "submitted", "confirming", "confirmed"];
const DEP_LABELS = ["Preparing the transaction", "Awaiting wallet signature", "Transaction submitted", "Confirming on Starknet"];
const mono = "var(--font-geist-mono),monospace";

const sameHash = (a: string, b: string) => {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
};

/** Wait until the indexer has seen the launch created by this transaction. */
async function waitForLaunch(creator: string, txHash: string, timeoutMs = 120_000): Promise<ApiLaunch | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { items } = await api.launches({ creator, sort: "newest", limit: 10 });
      const hit = items.find((l) => sameHash(l.createdTx, txHash));
      if (hit) return hit;
    } catch {
      /* the API may be briefly unreachable; keep waiting */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}

export function LaunchStudio() {
  const w = useViewportWidth();
  const wallet = useWalletStore((s) => s.wallet);
  const provider = useWalletStore((s) => s.provider);
  const hydrate = useWalletStore((s) => s.hydrate);
  const setPanel = useUiStore((s) => s.setPanel);
  const panel = useUiStore((s) => s.panel);
  const quotes = useQuoteTokens();
  const feeAssets = useFeeAssets();
  const strkUsd = useStrkUsd();

  const [step, setStep] = useState(1);
  const [f, setF] = useState<FormState>({ name: "", ticker: "", desc: "", web: "", x: "", tg: "", dc: "", feeAsset: "", preset: 1, creatorPct: 2 });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [aiIdea, setAiIdea] = useState("");
  const [ai, setAi] = useState<{ ideas: { name: string; ticker: string; line: string }[]; description: string; branding: string[]; post: string; art: ArtSuggestion | null; imagePrompt: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState(false);
  const [usedIdea, setUsedIdea] = useState(-1);
  const [explain, setExplain] = useState<string>("");
  const [dep, setDep] = useState<DepState>(null);
  const [txHash, setTxHash] = useState("");
  const [launched, setLaunched] = useState<ApiLaunch | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [share, setShare] = useState(false);
  const [image, setImage] = useState<{ uri: string; preview: string } | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageErr, setImageErr] = useState("");
  // The user asked to deploy before connecting: connect, then carry straight on into the deploy.
  const [pendingDeploy, setPendingDeploy] = useState(false);
  const [sigSlow, setSigSlow] = useState(false);
  // Each deploy attempt gets a number, so the answer to one the person gave up on can never change the screen.
  const attemptRef = useRef(0);
  const walletClosed = useWalletAbandoned(dep === "signature");
  // The wallet was connected as part of 'connect and deploy': the next click is the one that signs.
  const [justConnected, setJustConnected] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => hydrate(), [hydrate]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setTouched((t) => ({ ...t, [k]: true }));
  };

  async function onImage(file: File | undefined) {
    if (!file) return;
    setImageErr("");
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) return setImageErr("Use a PNG, JPEG, WebP or GIF image.");
    if (file.size > 512 * 1024) return setImageErr("Images are limited to 512 KB. Try a smaller or more compressed one.");
    setImageBusy(true);
    try {
      const { uri } = await uploadImage(file);
      setImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.preview);
        return { uri, preview: URL.createObjectURL(file) };
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "The upload failed.";
      setImageErr(message);
      throw new Error(message);
    } finally {
      setImageBusy(false);
    }
  }

  // --- AI helper (suggestions only: it never sets a parameter or sends anything) ---
  async function askAI(idea?: string) {
    const q = (idea ?? aiIdea).trim();
    if (!q || aiLoading) return;
    setAiIdea(q);
    setAiLoading(true);
    setAiErr(false);
    try {
      const res = await fetch("/api/ai/launch-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea: q }) });
      if (!res.ok) throw new Error("ai");
      const j = await res.json();
      setAi({ ideas: j.ideas ?? [], description: j.description ?? "", branding: j.branding ?? [], post: j.post ?? "", art: j.art ?? null, imagePrompt: j.imagePrompt ?? "" });
      setUsedIdea(-1);
    } catch {
      setAiErr(true);
    } finally {
      setAiLoading(false);
    }
  }
  async function explainAI(prompt: string) {
    setExplain("Thinking…");
    try {
      const res = await fetch("/api/ai/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      if (!res.ok) throw new Error("ai");
      const j = (await res.json()) as { text?: string };
      setExplain((j.text ?? "").trim() || "AI is unavailable right now.");
    } catch {
      setExplain("AI is unavailable right now.");
    }
  }

  // --- derived ---
  const connected = !!wallet;
  // Every token trades in STRK. The only choice here is what the one-time deploy fee is paid in.
  const enabledFees = (feeAssets.data ?? []).filter((q) => q.enabled && q.symbol && q.decimals !== null);
  const fee = enabledFees.find((q) => q.address === f.feeAsset) ?? enabledFees[0];
  const curveAsset = (quotes.data ?? []).find((q) => q.enabled && q.symbol === "STRK");
  const preset = PRESETS.find((p) => p.id === f.preset)!;
  const name = f.name.trim();
  const tick = f.ticker.trim();
  const [primary, light, ink] = paletteFor(name + tick || "oryvn");
  const nameErr = !name ? (touched.name ? "Required" : "") : name.length < 2 ? "At least 2 characters" : "";
  const tickValid = /^[A-Z0-9]{2,8}$/.test(tick);
  const tickErr = !tick ? (touched.ticker ? "Required" : "2–8 letters or numbers") : !tickValid ? "2–8 letters or numbers" : "";
  const socialVals: Record<string, string> = { web: f.web, x: f.x, tg: f.tg, dc: f.dc };
  const socErr = SOCIALS.some((s) => !urlOk(socialVals[s.key]!, s.re));
  const step1Ok = !!name && !nameErr && tickValid && !socErr;
  const factoryOk = !!FACTORY_ADDRESS;
  const ready = step1Ok && connected && !!fee && !!curveAsset && factoryOk;

  const cp = f.creatorPct;
  const reservedPct = Math.max(0, 100 - CURVE_PERCENT - cp);
  const supp = (p: number) => ((TOTAL_SUPPLY * p) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const dec = fee?.decimals ?? 18;
  const asset = fee?.symbol ?? "—";
  const deployFee = fee ? formatUnits(fee.deployFee, dec, 4) : "—";
  const feeUsd = fee ? toUsd(toNumber(fee.deployFee, dec), asset, strkUsd) : null;
  const raise = curveAsset ? formatUnits(curveAsset.graduationRaise, 18, 2) : "—";
  const raiseUsd = curveAsset ? toUsd(toNumber(curveAsset.graduationRaise, 18), "STRK", strkUsd) : null;
  // Does the wallet hold enough to pay? The fee in the fee asset, plus a little STRK for the network fee.
  // (A wallet that cannot pay never gets as far as a prompt, which looks like "the wallet did not open".)
  const GAS_BUFFER = 3n * 10n ** 17n; // 0.3 STRK
  const balances = usePolled(
    async (signal) => {
      const [feeBal, strkBal] = await Promise.all([balanceOf(fee!.address, wallet!, signal), balanceOf(curveAsset!.address, wallet!, signal)]);
      return { feeBal, strkBal };
    },
    wallet && RPC_URL && fee && curveAsset ? `${wallet}:${fee.address}` : null,
    8_000,
  );
  // A brand-new wallet has an address but no account on-chain until it is activated, and cannot sign before then.
  const walletName = provider ? walletLabel(provider) : "your wallet";
  const need = fee ? BigInt(fee.deployFee) : 0n;
  const payingInStrk = !!fee && !!curveAsset && fee.address === curveAsset.address;
  const feeShort = balances.data && fee ? balances.data.feeBal < (payingInStrk ? need + GAS_BUFFER : need) : false;
  const gasShort = balances.data && !payingInStrk ? balances.data.strkBal < GAS_BUFFER : false;
  const fundsKnown = !!balances.data || !wallet || !RPC_URL;
  const fundsOk = !feeShort && !gasShort;
  const fundsNote = !balances.data
    ? "Checking your balance…"
    : feeShort
      ? `You have ${formatUnits(balances.data.feeBal, dec, 4)} ${asset} and need about ${formatUnits(payingInStrk ? need + GAS_BUFFER : need, dec, 4)}`
      : gasShort
        ? `You have ${formatUnits(balances.data.strkBal, 18, 4)} STRK and need about 0.3 STRK for the network fee`
        : `${formatUnits(balances.data.feeBal, dec, 4)} ${asset} available`;
  const usdNote = (v: number | null) => (v === null ? "" : ` (about ${fmtUsd(v)})`);

  type Check = { label: string; ok: boolean; warn?: boolean; note: string; block?: boolean };
  const checks: Check[] = [
    { label: "Name and ticker", ok: !!name && tickValid, note: name && tickValid ? "Set" : "Add a name and a 2–8 character ticker", block: true },
    { label: "Supply", ok: true, note: `${TOTAL_SUPPLY.toLocaleString("en-US")} fixed, no mint function` },
    { label: "Creator allocation", ok: cp <= MAX_CREATOR_PERCENT, warn: cp > 3, note: cp > 3 ? `${cp}%, within the cap but visible to buyers` : `${cp}%, within the ${MAX_CREATOR_PERCENT}% cap` },
    { label: "Deploy fee", ok: !!fee && !!curveAsset, note: !fee ? (feeAssets.loading ? "Loading…" : "No asset is enabled for the deploy fee yet") : `${deployFee} ${asset}${usdNote(feeUsd)}, trades in STRK`, block: true },
    { label: "Links", ok: !socErr, note: socErr ? "Fix the highlighted link format" : "Looks fine", block: socErr },
    { label: "Factory", ok: factoryOk, note: factoryOk ? `On ${NETWORK_LABEL[NETWORK]}` : "The factory address is not configured for this build", block: true },
    { label: "Wallet", ok: connected, note: connected ? `${shortAddr(wallet!)} connected` : "Connect a wallet to deploy", block: true },
    ...(connected && RPC_URL ? [{ label: "Funds", ok: fundsOk, note: fundsNote, block: true }] : []),
  ];
  const blocking = checks.filter((c) => !c.ok && c.block).length;
  const warns = checks.filter((c) => c.ok && c.warn).length;
  const guardBadge = blocking ? `${blocking} to fix` : warns ? `Ready · ${warns} note` : "Ready";
  const guardColors = { ok: "#55D69A", warn: "#F3B65F", fail: "#FF6868" } as const;
  const guardIcons = { ok: "✓", warn: "!", fail: "✕" } as const;

  const stepNames = ["Token details", "Launch settings", "Review", "Deploy"];
  const maxStep = dep ? 4 : step1Ok ? 3 : 1;
  const mobile = w < 980;

  async function deploy() {
    if (!ready || !fee || !FACTORY_ADDRESS || !wallet || !fundsOk) return;
    const attempt = ++attemptRef.current;
    const stale = () => attemptRef.current !== attempt;
    setStep(4);
    setDep("preparing");
    setErrMsg("");
    setLaunched(null);
    try {
      const links: Record<string, string> = {};
      for (const s of SOCIALS) if (socialVals[s.key]!.trim()) links[s.key] = socialVals[s.key]!.trim();
      const calls = launchCalls({
        factory: FACTORY_ADDRESS,
        name,
        symbol: tick,
        metadataUri: metadataUri({ description: f.desc.trim(), links, image: image?.uri }),
        feeToken: fee.address,
        preset: f.preset,
        creatorBps: Math.round(cp * 100),
        deployFee: BigInt(fee.deployFee),
      });
      setDep("signature");
      const hash = await sendCalls(calls);
      if (stale()) return;
      setTxHash(hash);
      setDep("submitted");
      setDep("confirming");
      const found = await waitForLaunch(wallet, hash);
      if (stale()) return;
      if (!found) throw new Error("The transaction was sent but the indexer has not seen the launch yet. Check the explorer, then refresh the Explore page.");
      setLaunched(found);
      setDep("confirmed");
    } catch (e) {
      if (stale()) return;
      const msg = e instanceof Error ? e.message : "";
      setErrMsg(/reject|declin|cancel|abort/i.test(msg) ? "You declined the transaction in your wallet. Nothing was sent." : msg || "The transaction failed. Nothing was deployed.");
      setDep("failed");
    }
  }

  useEffect(() => {
    if (!pendingDeploy) return;
    // Closed the connect window without connecting: forget the request.
    if (!connected && panel !== "wallet") return setPendingDeploy(false);
    if (!connected) return; // still connecting
    setPendingDeploy(false);
    // A browser only lets an extension open its window shortly after a click of ours. Approving the connection
    // was a click in the wallet's window, not ours, so a deploy fired now would ask a wallet that cannot show
    // its prompt. If the browser still counts this as a fresh click, go; otherwise hand over to one clear click.
    const fresh = typeof navigator !== "undefined" && navigator.userActivation?.isActive === true;
    if (fresh && ready && fundsOk) void deploy();
    else setJustConnected(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDeploy, connected, panel, ready, fundsOk]);

  // The hand-over only makes sense on the review screen; drop it as soon as anything else happens.
  useEffect(() => {
    if (step !== 3 || dep) setJustConnected(false);
  }, [step, dep]);

  // If the wallet has not answered after a while, say what to look at instead of spinning forever.
  useEffect(() => {
    setSigSlow(false);
    if (dep !== "signature") return;
    const id = setTimeout(() => setSigSlow(true), 20_000);
    return () => clearTimeout(id);
  }, [dep]);

  const cur = dep === "failed" ? Math.max(0, DEP_ORDER.indexOf(txHash ? "confirming" : "signature")) : DEP_ORDER.indexOf(dep ?? "");
  const depTitle = dep === "confirmed" ? `${name || "Your token"} is live.` : dep === "failed" ? "Deployment stopped" : "Deploying…";
  const depSub = dep === "confirmed" ? "Confirmed on-chain. Your token page and bonding curve are open for trading." : dep === "failed" ? errMsg : dep === "signature" ? "Approve the transaction in your wallet. It approves the deploy fee and creates the token in one step. If no window opened, click your wallet's icon in the browser toolbar." : "Keep this page open. We only show success after the launch is on-chain and indexed.";

  const smallMuted: React.CSSProperties = { fontSize: 13, color: "#A1A1A1" };
  const inputBase: React.CSSProperties = { height: 50, padding: "0 18px", borderRadius: 16, background: "#050505", color: "#fff", fontSize: 15, outline: "none" };
  const explainBox: React.CSSProperties = { padding: "14px 16px", borderRadius: 18, background: "rgba(182,154,255,0.06)", border: "1px solid rgba(182,154,255,0.2)", fontSize: 14, lineHeight: 1.6, color: "#ddd", whiteSpace: "pre-wrap" };
  const cardBox: React.CSSProperties = { borderRadius: 28, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: "clamp(18px,2.5vw,28px)", display: "flex", flexDirection: "column" };
  const explainBtn: React.CSSProperties = { height: 32, padding: "0 12px", borderRadius: 999, border: "1px solid rgba(182,154,255,0.35)", background: "transparent", color: "#d9ccff", fontSize: 12, cursor: "pointer" };

  const review = useMemo(
    () => [
      { title: "Token", edit: () => setStep(1), rows: [
        { k: "Name", v: name || "—" },
        { k: "Ticker", v: tick ? "$" + tick : "—" },
        { k: "Links", v: SOCIALS.filter((s) => socialVals[s.key]!.trim()).map((s) => s.label).join(", ") || "None" },
      ] },
      { title: "Supply & allocation", edit: () => setStep(2), rows: [
        { k: "Total supply", v: TOTAL_SUPPLY.toLocaleString("en-US") },
        { k: "Bonding curve", v: `${CURVE_PERCENT}% · ${supp(CURVE_PERCENT)}` },
        { k: "Reserved", v: `${reservedPct}% · ${supp(reservedPct)}` },
        { k: "Creator", v: `${cp}% · ${supp(cp)}` },
      ] },
      { title: "Curve", edit: () => setStep(2), rows: [
        { k: "Trades in", v: "STRK" },
        { k: "Curve", v: `${preset.name} · about ${preset.multiple}x to graduation` },
        { k: "Graduation raise", v: `${raise} STRK${usdNote(raiseUsd)}` },
        { k: "Trade fee", v: "1%" },
      ] },
      { title: "Fees", edit: () => setStep(2), rows: [
        { k: "Deploy fee, paid in", v: `${deployFee} ${asset}${usdNote(feeUsd)}` },
        { k: "Network fee", v: "Paid in STRK, shown by your wallet" },
      ] },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f, fee, asset, raise, deployFee, feeUsd, raiseUsd],
  );

  function next() {
    if (step === 1 && !step1Ok) {
      setTouched((t) => ({ ...t, name: true, ticker: true }));
      return;
    }
    if (step === 3) {
      if (!connected) {
        setPendingDeploy(true);
        setPanel("wallet");
      } else if (ready) {
        setJustConnected(false);
        void deploy();
      }
      return;
    }
    setStep(step + 1);
  }

  const tokenUrl = launched ? `/token?t=${launched.token}` : "";
  const absTokenUrl = launched && typeof window !== "undefined" ? `${window.location.origin}${tokenUrl}` : "";
  const ideaColors: [string, string][] = [["#73D9E8", "#B7F0F5"], ["#B69AFF", "#F38FC4"], ["#FF9865", "#FFD2A8"]];
  void ideaColors;

  return (
    <div style={{ minHeight: "100vh", background: "#050505" }}>
      <section data-screen-label="Launch header" style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", WebkitMaskImage: "linear-gradient(180deg,#000 40%,transparent)", maskImage: "linear-gradient(180deg,#000 40%,transparent)" }}>
          <Contour density={40} seed={17} opacity={0.13} />
        </div>
        <div style={{ position: "relative", maxWidth: 1360, margin: "0 auto", padding: "clamp(44px,6vw,84px) clamp(18px,5vw,64px) 32px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h1 style={{ margin: 0, fontWeight: 400, fontSize: "clamp(48px,7vw,104px)", letterSpacing: "-0.045em", lineHeight: 0.95 }}>Create something.</h1>
            <p style={{ margin: 0, color: "#A1A1A1", fontSize: 17 }}>Bring your token idea to life on Starknet. {NETWORK_LABEL[NETWORK]}.</p>
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {stepNames.map((l, i) => {
              const n = i + 1;
              const on = step === n;
              const done = n < step;
              const locked = n > maxStep || (!!dep && n < 4 && dep !== "failed");
              return (
                <li key={l}>
                  <button onClick={() => !locked && setStep(n)} disabled={locked} style={{ display: "flex", alignItems: "center", gap: 9, height: 40, padding: "0 16px 0 6px", borderRadius: 999, border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.1)"}`, background: on ? "#fff" : "transparent", color: on ? "#050505" : done ? "#fff" : "#696969", cursor: locked ? "default" : "pointer", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", opacity: locked ? 0.55 : 1 }}>
                    <span style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: on ? "#050505" : done ? "#55D69A" : "#151515", color: on ? "#fff" : done ? "#050505" : "#8a8a8a", fontFamily: mono, fontSize: 12 }}>{done ? "✓" : n}</span>
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
                <AiOfflineNotice />
                <form onSubmit={(e) => { e.preventDefault(); void askAI(); }} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 6px 6px 18px", borderRadius: 999, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.12)" }}>
                  <input value={aiIdea} onChange={(e) => setAiIdea(e.target.value)} placeholder="Describe your token idea..." style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontSize: 15, height: 40 }} />
                  <button type="submit" className="lp-send" style={{ height: 40, padding: "0 18px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{ai ? "Regenerate" : "Generate"}</button>
                </form>
                {!ai && !aiLoading && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["A community token for people building on Starknet.", "A sleepy cat mascot for night-owl traders", "A token for a Lisbon hackathon crew"].map((x) => (
                      <button key={x} onClick={() => void askAI(x)} className="lp-chip" style={{ minHeight: 30, padding: "6px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#cfcfcf", fontSize: 12, cursor: "pointer", textAlign: "left", lineHeight: 1.3 }}>{x}</button>
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
                        <button key={k} onClick={() => { setUsedIdea(k); set("name", (idea.name || "").slice(0, 32)); set("ticker", (idea.ticker || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)); }} className="lp-ideacard" style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left", padding: "12px 14px", borderRadius: 18, border: `1px solid ${usedIdea === k ? "rgba(182,154,255,0.7)" : "rgba(255,255,255,0.08)"}`, background: "#0e0e0e", color: "#fff", cursor: "pointer" }}>
                          <span style={{ fontWeight: 600 }}>{idea.name} <span style={{ color: "#A1A1A1", fontWeight: 500 }}>${idea.ticker}</span></span>
                          <span style={{ fontSize: 12, color: "#A1A1A1", lineHeight: 1.4 }}>{idea.line}</span>
                          <span style={{ fontSize: 11, color: "#B69AFF", marginTop: 4 }}>{usedIdea === k ? "Applied. Edit below" : "Use name & ticker"}</span>
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
                <span style={{ fontSize: 12, color: "#8a8a8a" }}>AI suggests, you decide. It never changes settings or deploys anything on its own.</span>
              </div>

              <div style={{ ...cardBox, gap: 20 }}>
                <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Token details</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))", gap: 14 }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={smallMuted}>Token name</span>
                    <input value={f.name} onChange={(e) => set("name", e.target.value.slice(0, 32))} maxLength={32} placeholder="e.g. Cairo Builders" style={{ ...inputBase, border: `1px solid ${nameErr ? "rgba(255,104,104,0.6)" : "rgba(255,255,255,0.1)"}` }} />
                    <span style={{ fontSize: 12, color: "#FF6868" }}>{nameErr}</span>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <span style={smallMuted}>Ticker</span>
                    <div style={{ display: "flex", alignItems: "center", height: 50, padding: "0 18px", borderRadius: 16, background: "#050505", border: `1px solid ${!tickValid && touched.ticker ? "rgba(255,104,104,0.6)" : "rgba(255,255,255,0.1)"}` }}>
                      <span style={{ color: "#696969", fontSize: 15 }}>$</span>
                      <input value={f.ticker} onChange={(e) => set("ticker", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} maxLength={8} placeholder="CAIRO" style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, color: "#fff", fontSize: 15, outline: "none", fontFamily: mono, letterSpacing: "0.04em" }} />
                    </div>
                    <span style={{ fontSize: 12, color: !tickValid && touched.ticker ? "#FF6868" : "#696969" }}>{tickErr || "Tickers are not unique on-chain. Buyers tell tokens apart by contract address."}</span>
                  </label>
                </div>
                <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#A1A1A1" }}>
                    <span>Description</span>
                    <span style={{ fontFamily: mono, fontSize: 12, color: f.desc.length > 260 ? "#F3B65F" : "#696969" }}>{f.desc.length}/280</span>
                  </span>
                  <textarea value={f.desc} onChange={(e) => set("desc", e.target.value.slice(0, 280))} rows={3} placeholder="What is this token for? Who is it for?" style={{ padding: "14px 18px", borderRadius: 16, background: "#050505", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 15, lineHeight: 1.5, outline: "none", resize: "vertical" }} />
                  <span style={{ fontSize: 12, color: "#696969" }}>Stored with the launch on-chain.</span>
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={smallMuted}>Token image <span style={{ color: "#5a5a5a" }}>· optional</span></span>
                  <label className="lp-upload" style={{ display: "flex", alignItems: "center", gap: 16, padding: 14, borderRadius: 18, border: "1px dashed rgba(255,255,255,0.18)", cursor: imageBusy ? "default" : "pointer", background: "#050505" }}>
                    <span style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 18, background: image ? `url(${image.preview}) center/cover` : `linear-gradient(150deg, ${light}, ${primary})` }} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 14 }}>{imageBusy ? "Uploading…" : image ? "Replace image" : "Upload token image"}</span>
                      <span style={{ fontSize: 12, color: "#696969" }}>PNG, JPEG, WebP or GIF · square works best · up to 512 KB. No image? A generated avatar is used.</span>
                    </span>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={imageBusy} onChange={(e) => { onImage(e.target.files?.[0]).catch(() => undefined); e.target.value = ""; }} style={{ display: "none" }} />
                  </label>
                  {imageErr && <span style={{ fontSize: 12, color: "#FF6868" }}>{imageErr}</span>}
                  {image && <button onClick={() => { URL.revokeObjectURL(image.preview); setImage(null); }} style={{ alignSelf: "flex-start", border: 0, background: "transparent", color: "#73D9E8", fontSize: 12, cursor: "pointer", padding: 0 }}>Remove image</button>}
                  <PictureIdeas ticker={f.ticker} idea={aiIdea || [f.name, f.desc].filter(Boolean).join(": ")} imagePrompt={ai?.imagePrompt ?? ""} art={ai?.art ?? null} busy={imageBusy} hasImage={!!image} onPick={onImage} />
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
                  <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Deploy fee &amp; allocation</span>
                  <button onClick={() => void explainAI(`Explain this setup: a fixed supply of 1,000,000,000 tokens, creator allocation ${cp}%, ${CURVE_PERCENT}% sold on the bonding curve, ${reservedPct}% reserved. The token trades in STRK and the one-time deploy fee is paid in ${asset}. What does each part mean for buyers?`)} className="lp-explain" style={explainBtn}>Explain with AI</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <span style={smallMuted}>Pay the deploy fee in</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {enabledFees.map((q) => {
                      const usd = toUsd(toNumber(q.deployFee, q.decimals ?? 18), q.symbol, strkUsd);
                      return (
                        <button key={q.address} onClick={() => set("feeAsset", q.address)} style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left", padding: "12px 18px", borderRadius: 16, border: `1px solid ${fee?.address === q.address ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"}`, background: fee?.address === q.address ? "#1b1b1b" : "transparent", color: "#fff", cursor: "pointer", minWidth: 200 }}>
                          <span style={{ fontWeight: 600, fontSize: 15 }}>{q.symbol}</span>
                          <span style={{ fontSize: 12, color: "#A1A1A1" }}>{formatUnits(q.deployFee, q.decimals ?? 18, 4)} {q.symbol}{usd === null ? "" : ` · about ${fmtUsd(usd)}`}</span>
                        </button>
                      );
                    })}
                    {enabledFees.length === 0 && <span style={{ fontSize: 13, color: "#F3B65F" }}>{feeAssets.loading ? "Loading…" : feeAssets.error ? "Can't reach the data service." : "No asset is enabled for the deploy fee yet."}</span>}
                  </div>
                  <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5 }}>This is a one-time fee, paid once to the platform when you launch. Your token always trades in STRK: choosing USDC only changes how you pay the fee.</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "#A1A1A1" }}>Creator allocation</span>
                    <span style={{ fontFamily: mono }}>{cp}%</span>
                  </div>
                  <input type="range" min={0} max={MAX_CREATOR_PERCENT} step={0.5} value={cp} onChange={(e) => set("creatorPct", parseFloat(e.target.value))} />
                  <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5 }}>Capped at {MAX_CREATOR_PERCENT}% by the contract. It is public on-chain. Higher allocations make buyers more cautious.</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", height: 16, borderRadius: 99, overflow: "hidden", gap: 2 }}>
                    <span style={{ width: `${CURVE_PERCENT}%`, background: "#73D9E8" }} />
                    <span style={{ width: `${reservedPct}%`, background: "#B69AFF" }} />
                    <span style={{ width: `${cp}%`, background: "#F38FC4" }} />
                  </div>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: "#A1A1A1" }}>
                    <span style={{ display: "flex", gap: 7, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#73D9E8" }} />Bonding curve {CURVE_PERCENT}% · {supp(CURVE_PERCENT)}</span>
                    <span style={{ display: "flex", gap: 7, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#B69AFF" }} />Reserved {reservedPct}% · {supp(reservedPct)}</span>
                    <span style={{ display: "flex", gap: 7, alignItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F38FC4" }} />Creator {cp}% · {supp(cp)}</span>
                  </div>
                  <span style={{ fontSize: 12, color: "#696969" }}>The supply is fixed at {TOTAL_SUPPLY.toLocaleString("en-US")} and the token contract has no mint function.</span>
                </div>
                {explain && <div style={explainBox}>{explain}</div>}
              </div>

              <div style={{ ...cardBox, gap: 20 }}>
                <span style={{ fontSize: 22, letterSpacing: "-0.02em" }}>Bonding curve</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: 10 }}>
                  {PRESETS.map((p) => (
                    <button key={p.id} onClick={() => set("preset", p.id)} style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "left", padding: 14, borderRadius: 20, border: `1px solid ${f.preset === p.id ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)"}`, background: f.preset === p.id ? "#141414" : "transparent", color: "#fff", cursor: "pointer" }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</span>
                      <span style={{ fontSize: 12, color: "#A1A1A1", lineHeight: 1.45 }}>{p.desc}</span>
                      <span style={{ fontFamily: mono, fontSize: 12, color: primary }}>about {p.multiple}x to graduation</span>
                    </button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 1, borderRadius: 18, overflow: "hidden", background: "rgba(255,255,255,0.07)" }}>
                  {[
                    { k: "On the curve", v: supp(CURVE_PERCENT) },
                    { k: "Graduation raise", v: `${raise} STRK${usdNote(raiseUsd)}` },
                    { k: "Deploy fee", v: `${deployFee} ${asset}${usdNote(feeUsd)}` },
                    { k: "Trade fee", v: "1% (0.5 + 0.5)" },
                  ].map((c) => (
                    <div key={c.k} style={{ background: "#0b0b0b", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={{ fontSize: 11, color: "#696969", textTransform: "uppercase", letterSpacing: "0.06em" }}>{c.k}</span>
                      <span style={{ fontFamily: mono, fontSize: 14 }}>{c.v}</span>
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.6 }}>
                  Graduation is a milestone, not a lock: when the raise is reached the token is marked graduated and trading on the curve continues. The curve parameters are fixed at launch and nobody, including us, can change them. {TRADE_FEE_NOTE}.
                </span>
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
                      <span style={{ fontFamily: mono, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>{r.v}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: 16, borderRadius: 18, background: "#050505" }}>
                <span style={{ color: "#A1A1A1" }}>Due now</span>
                <span style={{ fontFamily: mono, fontSize: 22 }}>{deployFee} {asset}{feeUsd === null ? "" : <span style={{ fontSize: 13, color: "#A1A1A1" }}> · about {fmtUsd(feeUsd)}</span>}</span>
              </div>
              <span style={{ fontSize: 12, color: "#696969", lineHeight: 1.5 }}>Your wallet will ask you to approve one transaction: it lets the factory take the deploy fee, then creates the token and its curve. Nothing is sent until you sign.</span>
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 28, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.08)", padding: "clamp(22px,3vw,36px)", display: "flex", flexDirection: "column", gap: 22 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: "clamp(26px,3vw,36px)", letterSpacing: "-0.03em" }}>{depTitle}</span>
                <span style={{ color: dep === "failed" ? "#FF6868" : "#A1A1A1", fontSize: 14, lineHeight: 1.5 }}>{depSub}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {DEP_LABELS.map((l, i) => {
                  const done = i < cur || dep === "confirmed";
                  const active = i === cur && dep !== "confirmed" && dep !== "failed";
                  const failed = dep === "failed" && i === cur;
                  return (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 15, color: done || active || failed ? "#fff" : "#5a5a5a" }}>
                      <span style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", border: done || failed ? "0" : active ? "2px solid #fff" : "1px solid rgba(255,255,255,0.15)", background: failed ? "#FF6868" : done ? "#55D69A" : "transparent", animation: active ? "oc-blink 1.2s infinite" : "none", fontSize: 13, color: "#050505" }}>{failed ? "!" : done ? "✓" : ""}</span>
                      {l}
                    </div>
                  );
                })}
              </div>
              {(sigSlow || walletClosed) && dep === "signature" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", borderRadius: 16, background: "rgba(243,182,95,0.08)", border: "1px solid rgba(243,182,95,0.3)", color: "#F3B65F", fontSize: 13, lineHeight: 1.6 }}>
                  {walletClosed ? (
                    <span>It looks like the {walletName} window was closed before you approved. Nothing was sent. If it is still open, approve there; otherwise start again.</span>
                  ) : (
                    <span>Still no answer from {walletName}. Open the extension and look for a waiting request. If there is none, the wallet may be locked, on the wrong network, or not activated on {NETWORK_LABEL[NETWORK]} yet (a new wallet needs &ldquo;Activate&rdquo; or &ldquo;Deploy account&rdquo; once).</span>
                  )}
                  <button onClick={() => { attemptRef.current += 1; setDep(null); setStep(3); }} style={{ alignSelf: "flex-start", height: 36, padding: "0 16px", borderRadius: 999, border: 0, background: "#F3B65F", color: "#1a0d05", fontWeight: 600, cursor: "pointer" }}>{walletClosed ? "Back to review" : "Cancel and try again"}</button>
                </div>
              )}
              {(txHash || launched) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {launched && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#050505", fontSize: 13 }}>
                      <span style={{ color: "#A1A1A1" }}>Token contract</span>
                      <span style={{ fontFamily: mono }}>{shortAddr(launched.token)}</span>
                    </div>
                  )}
                  {txHash && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#050505", fontSize: 13 }}>
                      <span style={{ color: "#A1A1A1" }}>Transaction</span>
                      {explorerTx(txHash) ? <a href={explorerTx(txHash)!} target="_blank" rel="noopener noreferrer" style={{ fontFamily: mono }}>{shortAddr(txHash)} ↗</a> : <span style={{ fontFamily: mono }}>{shortAddr(txHash)}</span>}
                    </div>
                  )}
                </div>
              )}
              {dep === "confirmed" && launched && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link href={tokenUrl} className="lp-cta-primary" style={{ height: 48, padding: "0 22px", borderRadius: 999, background: "#fff", color: "#050505", fontWeight: 600, display: "inline-flex", alignItems: "center" }}>View token page</Link>
                  <button onClick={() => setShare(true)} style={{ height: 48, padding: "0 22px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#fff", fontWeight: 500, cursor: "pointer" }}>Share token</button>
                </div>
              )}
              {dep === "failed" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => void deploy()} style={{ height: 48, padding: "0 22px", borderRadius: 999, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer" }}>Try again</button>
                  <button onClick={() => { setStep(3); setDep(null); }} style={{ height: 48, padding: "0 22px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#fff", cursor: "pointer" }}>Back to review</button>
                </div>
              )}
            </div>
          )}

          {step === 3 && justConnected && connected && !dep && (
            <div role="status" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 18, background: "rgba(85,214,154,0.1)", border: "1px solid rgba(85,214,154,0.35)", color: "#55D69A", fontSize: 14, lineHeight: 1.5 }}>
              <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: "50%", background: "#55D69A", color: "#050505", display: "grid", placeItems: "center", fontWeight: 700 }}>✓</span>
              <span>Wallet connected. Click <strong>Deploy Token</strong> and {walletName} will open for you to approve.</span>
            </div>
          )}

          {step === 3 && connected && wallet && fundsKnown && !fundsOk && <FundsHelp address={wallet} />}

          {/* Nav buttons */}
          {step < 4 && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <button onClick={() => setStep(Math.max(1, step - 1))} style={{ height: 52, padding: "0 24px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#fff", cursor: "pointer", fontWeight: 500, visibility: step > 1 ? "visible" : "hidden" }}>Back</button>
              <button onClick={next} disabled={step === 3 && connected && (!ready || !fundsOk)} className="lp-next" style={{ height: 52, padding: "0 28px", borderRadius: 999, border: 0, cursor: "pointer", fontWeight: 600, fontSize: 15, boxShadow: step === 3 && justConnected ? "0 0 0 4px rgba(255,152,101,0.35)" : "none", background: step === 3 ? "linear-gradient(90deg,#FF9865,#FFE3CF)" : "#fff", color: "#1a0d05", opacity: step === 3 && connected && (!ready || !fundsOk) ? 0.45 : 1 }}>
                {step === 3 ? (connected ? (fundsKnown && !fundsOk ? "Add funds to deploy" : "Deploy Token") : "Connect wallet and deploy") : "Continue"}
              </button>
            </div>
          )}
        </div>

        {/* RIGHT aside */}
        <aside style={{ position: mobile ? "relative" : "sticky", top: 90, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ position: "relative", height: mobile ? 400 : 440, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 8 }}>
            <div style={{ position: "absolute", width: "62%", height: "86%", top: 30, left: "4%", borderRadius: 30, background: `linear-gradient(165deg, ${primary}, ${light})`, opacity: 0.3, transform: "rotate(-8deg)" }} />
            <div style={{ position: "relative", width: "min(100%,360px)", height: "calc(100% - 20px)", borderRadius: 30, overflow: "hidden", background: `linear-gradient(165deg, ${light} 0%, ${primary} 70%)`, color: ink, boxShadow: "0 30px 80px rgba(0,0,0,0.6),inset 0 0 0 1px rgba(255,255,255,0.35)", transform: "rotate(2deg)" }}>
              <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, height: "56%", borderRadius: 22, background: image ? `url(${image.preview}) center/cover` : "rgba(255,255,255,0.28)", display: "grid", placeItems: "center", overflow: "hidden" }}>
                <span style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.06em", opacity: image ? 0 : 0.25 }}>{tick || "TICKER"}</span>
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
          <span style={{ fontSize: 11, color: "#696969", textAlign: "center" }}>A preview. Without an image, the avatar and colours come from the token&apos;s contract address.</span>

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

      {share && launched && (
        <div onClick={() => setShare(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "grid", placeItems: "center", padding: 14 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, borderRadius: 28, background: "#101010", border: "1px solid rgba(255,255,255,0.1)", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={{ fontSize: 22 }}>Share {name || "your token"}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 6px 6px 14px", borderRadius: 14, background: "#050505", border: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ flex: 1, fontFamily: mono, fontSize: 12, color: "#A1A1A1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{absTokenUrl}</span>
              <button onClick={() => { navigator.clipboard?.writeText(absTokenUrl).catch(() => {}); setCopied("link"); }} style={{ height: 34, padding: "0 14px", borderRadius: 10, border: 0, background: "#fff", color: "#050505", fontWeight: 600, cursor: "pointer" }}>{copied === "link" ? "Copied" : "Copy"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
              <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`$${tick} just launched on oryvnlaunch`)}&url=${encodeURIComponent(absTokenUrl)}`} target="_blank" rel="noreferrer" style={{ height: 44, borderRadius: 14, background: "#181818", display: "grid", placeItems: "center", fontSize: 14 }}>X</a>
              <a href={`https://t.me/share/url?url=${encodeURIComponent(absTokenUrl)}&text=${encodeURIComponent(`$${tick} just launched on oryvnlaunch`)}`} target="_blank" rel="noreferrer" style={{ height: 44, borderRadius: 14, background: "#181818", display: "grid", placeItems: "center", fontSize: 14 }}>Telegram</a>
            </div>
            <button onClick={() => setShare(false)} style={{ height: 44, borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "#fff", cursor: "pointer" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
