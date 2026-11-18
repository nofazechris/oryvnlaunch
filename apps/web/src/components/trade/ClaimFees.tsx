"use client";

import { useRef, useState } from "react";
import { sendCalls, useWalletStore } from "@/lib/wallet-store";
import { EXPLORER_URL, RPC_URL } from "@/lib/config";
import { fmtUsd, formatUnits, shortAddr, toNumber, toUsd } from "@/lib/format";
import { curveFees, waitForTx } from "@/lib/rpc";
import { claimCreatorFeesCall, friendlyTradeError } from "@/lib/trade-tx";
import { usePolled, useStrkUsd, type Token } from "@/lib/useApi";
import { useWalletAbandoned } from "@/lib/useWalletAbandoned";
import { explorerTx } from "@/lib/safe";

const mono = "var(--font-geist-mono),monospace";

/**
 * What a token's curve owes its creator, and a button to collect it. Half of the 1% trading fee on every buy
 * and sell builds up inside the curve; it reaches the creator's wallet only when it is claimed. Shown to the
 * creator only. The contract pays the creator's own address whoever sends the claim, so this can never
 * redirect money.
 */
export function ClaimFees({ t, compact = false }: { t: Token; compact?: boolean }) {
  const wallet = useWalletStore((s) => s.wallet);
  const strkUsd = useStrkUsd();
  const [stage, setStage] = useState<"idle" | "signature" | "confirming" | "done" | "failed">("idle");
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  const busy = stage === "signature" || stage === "confirming";
  const attempt = useRef(0);
  const walletClosed = useWalletAbandoned(stage === "signature");

  const fees = usePolled((signal) => curveFees(t.curve, signal), RPC_URL ? t.curve : null, 10_000);
  const owed = fees.data?.creatorFees ?? null;
  const dec = t.quote.decimals;
  const unit = t.quote.symbol;
  const usd = owed === null ? null : toUsd(toNumber(owed, dec), unit, strkUsd);
  const isCreator = !!wallet && wallet.toLowerCase() === t.creator.toLowerCase();

  async function claim() {
    if (busy || !owed || owed <= 0n) return;
    const mine = ++attempt.current;
    const stale = () => attempt.current !== mine;
    setStage("signature");
    setError("");
    setHash("");
    try {
      const tx = await sendCalls([claimCreatorFeesCall(t.curve)]);
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
      fees.reload();
    } catch (e) {
      if (stale()) return;
      const msg = e instanceof Error ? e.message : "";
      setError(msg === "not confirmed" ? "The claim was sent but is not confirmed yet. Check the explorer before trying again." : friendlyTradeError(msg));
      setStage("failed");
    }
  }

  if (!isCreator || !RPC_URL) return null;

  return (
    <div style={{ borderRadius: 24, background: "#0d0d0d", border: "1px solid rgba(243,142,196,0.25)", padding: compact ? 14 : 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontSize: 15 }}>Your creator fees</span>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: mono, fontSize: 24, letterSpacing: "-0.02em" }}>{owed === null ? "…" : `${formatUnits(owed, dec, 4)} ${unit}`}</span>
        {usd !== null && owed !== null && owed > 0n && <span style={{ fontSize: 12, color: "#A1A1A1" }}>about {fmtUsd(usd)}</span>}
      </div>
      <button
        onClick={() => void claim()}
        disabled={busy || !owed || owed <= 0n}
        style={{ height: 44, borderRadius: 14, border: 0, fontWeight: 600, fontSize: 14, cursor: busy || !owed || owed <= 0n ? "default" : "pointer", background: owed && owed > 0n && !busy ? "#F38FC4" : "#1a1a1a", color: owed && owed > 0n && !busy ? "#050505" : "#8a8a8a" }}
      >
        {stage === "signature" ? "Approve in your wallet…" : stage === "confirming" ? "Confirming on Starknet…" : owed && owed > 0n ? "Claim to my wallet" : "Nothing to claim yet"}
      </button>
      {stage === "done" && (
        <span style={{ fontSize: 12, color: "#55D69A" }}>
          Claimed.{" "}
          {hash && (explorerTx(hash) ? <a href={explorerTx(hash)!} target="_blank" rel="noopener noreferrer" style={{ fontFamily: mono }}>{shortAddr(hash)} ↗</a> : <span style={{ fontFamily: mono }}>{shortAddr(hash)}</span>)}
        </span>
      )}
      {stage === "failed" && <span style={{ fontSize: 12, color: "#FF6868", lineHeight: 1.5 }}>{error}</span>}
      {stage === "signature" && walletClosed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, color: "#F3B65F", fontSize: 12, lineHeight: 1.5 }}>
          <span>It looks like the wallet window was closed before you approved. Nothing was sent.</span>
          <button onClick={() => { attempt.current += 1; setStage("idle"); }} style={{ alignSelf: "flex-start", height: 30, padding: "0 14px", borderRadius: 999, border: 0, background: "#F3B65F", color: "#1a0d05", fontWeight: 600, cursor: "pointer", fontSize: 12 }}>Start again</button>
        </div>
      )}
      <span style={{ fontSize: 11, color: "#696969", lineHeight: 1.5 }}>
        Half of the {t.launch.tradeFee.bps / 100}% trading fee on every buy and sell of your token builds up here. It goes to your wallet only when you claim it, and only ever to you.
      </span>
    </div>
  );
}
