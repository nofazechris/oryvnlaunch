// Turning what a trader typed into the calls their wallet signs. Pure functions, easy to test.
//
// The curve pulls the quote asset (buy) or the token (sell) with `transfer_from`, so each trade is two
// calls in one transaction: approve exactly what the trade can pull, then trade. The approval is for the
// amount of this trade only, never "unlimited".

import { encodeU256, type WalletCall } from "./launch-tx";

/** Exact decimal text to the asset's smallest unit. Null if it is empty, malformed or has too many decimals. */
export function parseUnits(text: string, decimals: number): bigint | null {
  const t = text.trim();
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
  const [whole = "", fraction = ""] = t.split(".");
  if (fraction.length > decimals) return null;
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

/** The least the trader accepts: `amount` reduced by `slippageBps` (100 = 1%), rounded down. */
export function withSlippage(amount: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 5_000) throw new Error("Slippage must be between 0% and 50%");
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}

export function buyCalls(input: { curve: string; quoteToken: string; maxQuoteIn: bigint; minTokensOut: bigint }): WalletCall[] {
  if (input.maxQuoteIn <= 0n) throw new Error("Enter an amount to buy with");
  return [
    { contract_address: input.quoteToken, entry_point: "approve", calldata: [input.curve, ...encodeU256(input.maxQuoteIn)] },
    { contract_address: input.curve, entry_point: "buy", calldata: [...encodeU256(input.maxQuoteIn), ...encodeU256(input.minTokensOut)] },
  ];
}

export function sellCalls(input: { curve: string; token: string; tokensIn: bigint; minQuoteOut: bigint }): WalletCall[] {
  if (input.tokensIn <= 0n) throw new Error("Enter an amount to sell");
  return [
    { contract_address: input.token, entry_point: "approve", calldata: [input.curve, ...encodeU256(input.tokensIn)] },
    { contract_address: input.curve, entry_point: "sell", calldata: [...encodeU256(input.tokensIn), ...encodeU256(input.minQuoteOut)] },
  ];
}

/**
 * Pay out the creator's accrued trading fees. Anyone may send this, but the contract only ever pays the creator,
 * and it reverts when there is nothing to claim.
 */
export function claimCreatorFeesCall(curve: string): WalletCall {
  return { contract_address: curve, entry_point: "claim_creator_fees", calldata: [] };
}

const REVERTS: [RegExp, string][] = [
  [/CURVE_NO_FEES/, "There are no fees to claim right now."],
  [/CURVE_SLIPPAGE/, "The price moved more than your slippage allows. Try again, or raise the slippage a little."],
  [/CURVE_SOLD_OUT/, "The curve has sold out, so buying is closed. You can still sell."],
  [/CURVE_DUST_TRADE/, "That amount is too small to trade."],
  [/CURVE_ZERO_AMOUNT/, "Enter an amount first."],
  [/CURVE_SELL_EXCEEDS_SOLD/, "You are trying to sell more than the curve has sold."],
  [/CURVE_QUOTE_PULL_FAILED|CURVE_TOKEN_PULL_FAILED|ERC20: insufficient (balance|allowance)|u256_sub Overflow/i, "Your balance or approval was not enough for this trade."],
  [/Transaction rejected|declin|reject|cancel|abort/i, "You declined the transaction in your wallet. Nothing was sent."],
];

/** A sentence a person can act on for a failed trade. */
export function friendlyTradeError(raw: string | undefined): string {
  if (!raw) return "The transaction failed. Nothing was traded.";
  for (const [re, text] of REVERTS) if (re.test(raw)) return text;
  return "The transaction failed. Nothing was traded.";
}
