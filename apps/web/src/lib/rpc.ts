// Reading from Starknet straight from the browser: balances, trade previews and transaction status.
//
// Writes never go through here. They go through the user's wallet (wallet-store.ts). This file only
// asks a node questions, so a wrong or missing RPC URL can make a preview fail but can never move funds.

import { keccak_256 } from "@noble/hashes/sha3.js";
import { RPC_URL } from "./config";

const MASK_250 = (1n << 250n) - 1n;

/** The entry-point selector Starknet uses for a function name: keccak256 truncated to 250 bits. */
export function selector(name: string): string {
  const digest = keccak_256(new TextEncoder().encode(name));
  let value = 0n;
  for (const byte of digest) value = (value << 8n) | BigInt(byte);
  return "0x" + (value & MASK_250).toString(16);
}

export class RpcError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = "RpcError";
  }
}

async function rpc<T>(method: string, params: unknown, signal?: AbortSignal): Promise<T> {
  if (!RPC_URL) throw new RpcError("No Starknet RPC URL is configured (NEXT_PUBLIC_RPC_URL).");
  let response: Response;
  try {
    response = await fetch(RPC_URL, { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new RpcError("Cannot reach the Starknet node.");
  }
  const body = (await response.json()) as { result?: T; error?: { code: number; message: string; data?: unknown } };
  if (body.error) throw new RpcError(describe(body.error), body.error.code);
  return body.result as T;
}

function describe(error: { message: string; data?: unknown }): string {
  const data = typeof error.data === "string" ? error.data : error.data ? JSON.stringify(error.data) : "";
  return data ? `${error.message}: ${data}` : error.message;
}

/** Call a read-only contract function. Returns the result felts as bigints. */
export async function callContract(address: string, entrypoint: string, calldata: string[] = [], signal?: AbortSignal): Promise<bigint[]> {
  const result = await rpc<string[]>("starknet_call", { request: { contract_address: address, entry_point_selector: selector(entrypoint), calldata }, block_id: "latest" }, signal);
  return result.map((x) => BigInt(x));
}

const MASK_128 = (1n << 128n) - 1n;
export const u256Calldata = (v: bigint): string[] => ["0x" + (v & MASK_128).toString(16), "0x" + (v >> 128n).toString(16)];
const u256At = (felts: bigint[], i: number): bigint => (felts[i] ?? 0n) + ((felts[i + 1] ?? 0n) << 128n);

/** A wallet's balance of an ERC-20, in its smallest unit. */
export async function balanceOf(token: string, owner: string, signal?: AbortSignal): Promise<bigint> {
  try {
    return u256At(await callContract(token, "balance_of", [owner], signal), 0);
  } catch (error) {
    if (signal?.aborted) throw error;
    // Some older ERC-20s only expose the camelCase name.
    return u256At(await callContract(token, "balanceOf", [owner], signal), 0);
  }
}

/**
 * Is there an account contract at this address yet? A brand-new Argent X or Braavos wallet has an address
 * from the start, but no account on-chain until its first activation. Until then it cannot sign anything, and
 * wallets tend to just sit there instead of saying why. Null when we cannot tell (no node, or it is down).
 */
export async function accountDeployed(address: string, signal?: AbortSignal): Promise<boolean | null> {
  try {
    await rpc("starknet_getClassHashAt", { block_id: "latest", contract_address: address }, signal);
    return true;
  } catch (e) {
    if (signal?.aborted) throw e;
    if (e instanceof RpcError && (e.code === 20 || /contract not found/i.test(e.message))) return false;
    return null;
  }
}

export interface BuyQuote {
  /** What the buyer would pay in total, fee included. */
  paid: bigint;
  tokensOut: bigint;
  /** True when this buy would fill the curve. */
  sellsOut: boolean;
}

/** The curve's own preview of a buy of up to `maxQuoteIn`. All zeros while the curve is sold out. */
export async function quoteBuy(curve: string, maxQuoteIn: bigint, signal?: AbortSignal): Promise<BuyQuote> {
  const r = await callContract(curve, "quote_buy", u256Calldata(maxQuoteIn), signal);
  return { paid: u256At(r, 0), tokensOut: u256At(r, 2), sellsOut: (r[4] ?? 0n) !== 0n };
}

/** The curve's own preview of a sell: what the seller would receive after the fee. */
export async function quoteSell(curve: string, tokensIn: bigint, signal?: AbortSignal): Promise<bigint> {
  return u256At(await callContract(curve, "quote_sell", u256Calldata(tokensIn), signal), 0);
}

/**
 * Fees a curve is holding for its creator and for the platform, in the quote asset's smallest unit. Read from
 * `get_state`, whose layout is: quote_reserve, token_reserve, quote_raised, tokens_sold, curve_supply and
 * reserved_supply (a u256 each, two felts), graduated, trade_fee_bps, creator_fee_share_bps (one felt each),
 * then creator_fees and platform_fees (a u256 each).
 */
export function parseCurveFees(felts: bigint[]): { creatorFees: bigint; platformFees: bigint } {
  if (felts.length < 19) throw new RpcError("Unexpected get_state answer from the curve.");
  return { creatorFees: u256At(felts, 15), platformFees: u256At(felts, 17) };
}

export async function curveFees(curve: string, signal?: AbortSignal) {
  return parseCurveFees(await callContract(curve, "get_state", [], signal));
}

/**
 * How many tokens the curve has sold so far, which is the most it can ever take back: it only returns what
 * buyers paid in. A wallet can hold more than this (a creator's own allocation was never sold by the curve),
 * and that extra part cannot be sold to the curve. Same `get_state` answer as above, the fourth pair.
 */
export function parseTokensSold(felts: bigint[]): bigint {
  if (felts.length < 19) throw new RpcError("Unexpected get_state answer from the curve.");
  return u256At(felts, 6);
}

export async function curveTokensSold(curve: string, signal?: AbortSignal): Promise<bigint> {
  return parseTokensSold(await callContract(curve, "get_state", [], signal));
}

export interface TxOutcome {
  ok: boolean;
  /** Why it failed, when the node says. */
  reason?: string;
}

/** Wait until a transaction is accepted or rejected. Resolves with the outcome, or null on timeout. */
export async function waitForTx(hash: string, timeoutMs = 180_000, signal?: AbortSignal): Promise<TxOutcome | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !signal?.aborted) {
    try {
      const status = await rpc<{ finality_status?: string; execution_status?: string }>("starknet_getTransactionStatus", { transaction_hash: hash }, signal);
      if (status.finality_status === "REJECTED") return { ok: false, reason: "The network rejected the transaction." };
      if (status.finality_status === "ACCEPTED_ON_L2" || status.finality_status === "ACCEPTED_ON_L1") {
        if (status.execution_status === "REVERTED") {
          try {
            const receipt = await rpc<{ revert_reason?: string }>("starknet_getTransactionReceipt", { transaction_hash: hash }, signal);
            return { ok: false, reason: receipt.revert_reason };
          } catch {
            return { ok: false };
          }
        }
        return { ok: true };
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      // "Transaction hash not found" is normal for a moment after sending; keep waiting.
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return null;
}
