"use client";

import { useEffect, useRef, useState } from "react";
import { sendCalls, useWalletStore } from "@/lib/wallet-store";
import { useUiStore } from "@/lib/ui-store";
import { EXPLORER_URL, RPC_URL } from "@/lib/config";
import { formatUnits, plainUnits, shortAddr } from "@/lib/format";
import { balanceOf, quoteBuy, quoteSell, waitForTx } from "@/lib/rpc";
import { buyCalls, friendlyTradeError, parseUnits, sellCalls, withSlippage } from "@/lib/trade-tx";
import { usePolled, type Token } from "@/lib/useApi";
import { useWalletAbandoned } from "@/lib/useWalletAbandoned";
import { explorerTx } from "@/lib/safe";

const mono = "var(--font-geist-mono),monospace";
const TOKEN_DECIMALS = 18;
const SLIPPAGES = [50, 100, 200];

type Stage = "idle" | "signature" | "confirming" | "done" | "failed";

interface Preview {
  /** Buy: tokens received. Sell: quote received. */
  out: bigint;
  /** Buy only: what is actually paid, fee included. */
  paid?: bigint;
  /** Buy only: the curve is sold out, so nothing can be bought. */
  soldOut?: boolean;
  sellsOut?: boolean;
}

/** Buy and sell on a token's curve, signed in the user's own wallet. */
export function TradePanel({ t, onTraded }: { t: Token; onTraded?: () => void }) {
  const wallet = useWalletStore((s) => s.wallet);
  const setPanel = useUiStore((s) => s.setPanel);

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [text, setText] = useState("");
  const [slip, setSlip] = useState(100);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewErr, setPreviewErr] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  const busy = stage === "signature" || stage === "confirming";
  // An attempt the person gave up on must not change the screen when its answer finally arrives.
  const attempt = useRef(0);
  const walletClosed = useWalletAbandoned(stage === "signature");

  const unit = t.quote.symbol;
  const quoteDec = t.quote.decimals;
  const inDec = side === "buy" ? quoteDec : TOKEN_DECIMALS;
  const outDec = side === "buy" ? TOKEN_DECIMALS : quoteDec;
  const inSym = side === "buy" ? unit : t.sym;
  const outSym = side === "buy" ? t.sym : unit;
  const amount = parseUnits(text, inDec);

  const balances = usePolled(
    async (signal) => {
      const [quote, token] = await Promise.all([balanceOf(t.launch.quote.address, wallet!, signal), balanceOf(t.addr, wallet!, signal)]);
      return { quote, token };
    },
    wallet && RPC_URL ? `${wallet}:${t.addr}` : null,
    8_000,
  );
  const balance = balances.data ? (side === "buy" ? balances.data.quote : balances.data.token) : null;

  // Ask the curve itself what this trade would do. It is the same code that runs on-chain.
  useEffect(() => {
    setPreview(null);
    setPreviewErr("");
    if (!amount || amount <= 0n || !RPC_URL) return;
    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        if (side === "buy") {
          const q = await quoteBuy(t.curve, amount, controller.signal);
          setPreview({ out: q.tokensOut, paid: q.paid, soldOut: q.paid === 0n, sellsOut: q.sellsOut });
        } else {
          setPreview({ out: await quoteSell(t.curve, amount, controller.signal) });
        }
      } catch (e) {
        if (!controller.signal.aborted) setPreviewErr(e instanceof Error && /CURVE_|DUST|Overflow/i.test(e.message) ? friendlyTradeError(e.message) : "Couldn't get a price preview. Try again in a moment.");
      }
    }, 300);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [amount, side, t.curve]);

  function pick(next: "buy" | "sell") {
    if (busy) return;
    setSide(next);
    setText("");
    setStage("idle");
    setError("");
  }

  function onInput(v: string) {
    const clean = v.replace(/[^0-9.]/g, "");
    const [whole = "", ...rest] = clean.split(".");
    const fraction = rest.join("").slice(0, inDec);
    setText(rest.length ? `${whole}.${fraction}` : whole);
    if (stage === "done" || stage === "failed") setStage("idle");
  }

  const enough = amount !== null && balance !== null && amount <= balance;
  const tooSmall = !!preview && !preview.soldOut && preview.out === 0n;
  const ready = !!wallet && !!amount && amount > 0n && enough && !!preview && !preview.soldOut && !tooSmall && !busy;

  async function trade() {
    if (!ready || !amount || !preview) return;
    const mine = ++attempt.current;
    const stale = () => attempt.current !== mine;
    setStage("signature");
    setError("");
    setHash("");
    try {
      const minOut = withSlippage(preview.out, slip);
      const calls =
        side === "buy"
          ? buyCalls({ curve: t.curve, quoteToken: t.launch.quote.address, maxQuoteIn: amount, minTokensOut: minOut })
          : sellCalls({ curve: t.curve, token: t.addr, tokensIn: amount, minQuoteOut: minOut });
      const tx = await sendCalls(calls);
      if (stale()) return;
      setHash(tx);
      setStage("confirming");
      const outcome = await waitForTx(tx);
      if (stale()) return;
      if (!outcome) throw new Error("not confirmed");
      if (!outcome.ok) {
        setError(friendlyTradeError(outcome.reason));
        setStage("failed");
        return;
      }
      setStage("done");
      setText("");
      balances.reload();
      onTraded?.();
    } catch (e) {
      if (stale()) return;
      const msg = e instanceof Error ? e.message : "";
      setError(msg === "not confirmed" ? "The transaction was sent but is not confirmed yet. Check the explorer before trying again." : friendlyTradeError(msg));
      setStage("failed");
    }
  }

  const chips = [25, 50, 75, 100];
  const fillPercent = (p: number) => {
    if (balance === null || balance === 0n) return;
    setText(plainUnits((balance * BigInt(p)) / 100n, inDec));
  };

  const accent = side === "buy" ? "#55D69A" : "#FF6868";
  const label = !wallet
    ? "Connect wallet to trade"
    : stage === "signature"
      ? "Approve in your wallet…"
      : stage === "confirming"
        ? "Confirming on Starknet…"
        : !amount
          ? "Enter an amount"
          : balance !== null && amount > balance
            ? `Not enough ${inSym}`
            : preview?.soldOut
              ? "Curve sold out"
              : tooSmall
                ? "Amount too small"
                : `${side === "buy" ? "Buy" : "Sell"} ${t.sym}`;

  return (
    <div style={{ borderRadius: 24, background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.08)", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: 16, background: "#050505" }}>
        {(["buy", "sell"] as const).map((s) => (
          <button key={s} onClick={() => pick(s)} style={{ height: 40, borderRadius: 12, border: 0, cursor: busy ? "default" : "pointer", fontWeight: 600, fontSize: 14, background: side === s ? (s === "buy" ? "#55D69A" : "#FF6868") : "transparent", color: side === s ? "#050505" : "#A1A1A1" }}>{s === "buy" ? "Buy" : "Sell"}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 18, background: "#050505", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#696969" }}>
          <span>{side === "buy" ? "You pay" : "You sell"}</span>
          <span>{!wallet ? "Wallet not connected" : balance === null ? (RPC_URL ? "Reading balance…" : "") : `Balance ${formatUnits(balance, inDec, 4)}`}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input value={text} onChange={(e) => onInput(e.target.value)} disabled={busy} inputMode="decimal" placeholder="0" aria-label={`Amount of ${inSym}`} style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: "none", color: "#fff", fontFamily: mono, fontSize: 28, letterSpacing: "-0.03em" }} />
          <span style={{ padding: "6px 10px", borderRadius: 999, background: "#151515", fontSize: 13, fontWeight: 600 }}>{inSym}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 6 }}>
        {chips.map((p) => (
          <button key={p} onClick={() => fillPercent(p)} disabled={busy || !balance} className="lp-quick" style={{ height: 32, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#d8d8d8", cursor: busy || !balance ? "default" : "pointer", opacity: balance ? 1 : 0.4, fontFamily: mono, fontSize: 12 }}>{p === 100 ? "Max" : `${p}%`}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 13 }}>
        <Row k="You receive (est.)" v={preview ? `${formatUnits(preview.out, outDec, 6)} ${outSym}` : "—"} />
        <Row k="Minimum received" v={preview ? `${formatUnits(withSlippage(preview.out, slip), outDec, 6)} ${outSym}` : "—"} muted />
        {side === "buy" && preview?.paid !== undefined && preview.paid > 0n && preview.paid < (amount ?? 0n) && <Row k="You will actually pay" v={`${formatUnits(preview.paid, quoteDec, 6)} ${unit}`} muted />}
        <Row k={`Trading fee (${t.launch.tradeFee.bps / 100}%)`} v="included" muted />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#A1A1A1" }}>Slippage</span>
          <div style={{ display: "flex", gap: 4 }}>
            {SLIPPAGES.map((v) => (<button key={v} onClick={() => setSlip(v)} disabled={busy} style={{ height: 26, padding: "0 9px", borderRadius: 8, border: 0, cursor: "pointer", fontFamily: mono, fontSize: 11, background: slip === v ? "#2a2a2a" : "#141414", color: slip === v ? "#fff" : "#A1A1A1" }}>{v / 100}%</button>))}
          </div>
        </div>
      </div>

      {preview?.sellsOut && side === "buy" && <span style={{ fontSize: 12, color: "#F3B65F", lineHeight: 1.5 }}>This buy fills the curve, so it graduates. You only pay for what the curve still has to sell.</span>}
      {previewErr && <span style={{ fontSize: 12, color: "#F3B65F", lineHeight: 1.5 }}>{previewErr}</span>}
      {!RPC_URL && <span style={{ fontSize: 12, color: "#F3B65F", lineHeight: 1.5 }}>Trading needs a Starknet node. Set NEXT_PUBLIC_RPC_URL for this build.</span>}

      <button onClick={() => (wallet ? void trade() : setPanel("wallet"))} disabled={!!wallet && !ready} className="lp-bright" style={{ height: 52, borderRadius: 16, border: 0, cursor: !wallet || ready ? "pointer" : "default", fontWeight: 600, fontSize: 15, background: !wallet ? "#fff" : ready ? accent : "#1a1a1a", color: !wallet || ready ? "#050505" : "#8a8a8a" }}>{label}</button>

      {stage === "done" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px", borderRadius: 14, background: "rgba(85,214,154,0.08)", border: "1px solid rgba(85,214,154,0.25)", fontSize: 13 }}>
          <span style={{ color: "#55D69A", fontWeight: 600 }}>Trade confirmed</span>
          {hash && (explorerTx(hash) ? <a href={explorerTx(hash)!} target="_blank" rel="noopener noreferrer" style={{ color: "#A1A1A1", fontFamily: mono, fontSize: 12 }}>{shortAddr(hash)} ↗</a> : <span style={{ color: "#A1A1A1", fontFamily: mono, fontSize: 12 }}>{shortAddr(hash)}</span>)}
        </div>
      )}
      {stage === "failed" && <span style={{ fontSize: 13, color: "#FF6868", lineHeight: 1.5 }}>{error}</span>}
      {stage === "signature" && walletClosed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 14, background: "rgba(243,182,95,0.08)", border: "1px solid rgba(243,182,95,0.3)", color: "#F3B65F", fontSize: 12, lineHeight: 1.5 }}>
          <span>It looks like the wallet window was closed before you approved. Nothing was sent.</span>
          <button onClick={() => { attempt.current += 1; setStage("idle"); }} style={{ alignSelf: "flex-start", height: 30, padding: "0 14px", borderRadius: 999, border: 0, background: "#F3B65F", color: "#1a0d05", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Start again</button>
        </div>
      )}
      {stage === "confirming" && hash && <span style={{ fontSize: 12, color: "#A1A1A1", fontFamily: mono }}>Sent {shortAddr(hash)}</span>}

      <span style={{ fontSize: 11, color: "#696969", textAlign: "center", lineHeight: 1.5 }}>
        One transaction approves this exact amount and trades. Your wallet shows it before anything is sent. The final amount is set on-chain.
      </span>
    </div>
  );
}

function Row({ k, v, muted = false }: { k: string; v: string; muted?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "#A1A1A1" }}>{k}</span>
      <span style={{ fontFamily: mono, color: muted ? "#A1A1A1" : "#fff", textAlign: "right" }}>{v}</span>
    </div>
  );
}
