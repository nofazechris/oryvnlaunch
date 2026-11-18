// Market numbers derived from curve reserves. Exact integer arithmetic only: the contract is
// the source of truth for money, so the database must never round it through a float.
//
// All of these mirror contracts/src/curve_math.cairo, and the tests check them against values
// produced by the real contracts.

/** Every token has the same fixed supply: 1,000,000,000 with 18 decimals. */
export const TOTAL_SUPPLY = 1_000_000_000n * 10n ** 18n;
export const ONE_TOKEN = 10n ** 18n;
const BPS = 10_000n;

/** Share of the graduation raise used as the virtual reserve, per preset (0 Gentle, 1 Standard, 2 Steep). */
export const PRESET_VIRTUAL_BPS = [10_000n, 5_000n, 2_500n] as const;
export const PRESET_NAMES = ["Gentle", "Standard", "Steep"] as const;

/**
 * Spot price: smallest quote units per whole token, scaled by 1e18. Same formula as the
 * contract's `spot_price`, so a stored price always equals what the curve reports.
 */
export function spotPrice(quoteReserve: bigint, tokenReserve: bigint): bigint {
  if (tokenReserve <= 0n) throw new Error("token reserve must be positive");
  return (quoteReserve * ONE_TOKEN * ONE_TOKEN) / tokenReserve;
}

/**
 * Fully diluted market cap in the quote asset's smallest unit: the whole fixed supply priced
 * at the curve's current price (quote reserve per token reserve).
 */
export function marketCap(quoteReserve: bigint, tokenReserve: bigint): bigint {
  if (tokenReserve <= 0n) throw new Error("token reserve must be positive");
  return (quoteReserve * TOTAL_SUPPLY) / tokenReserve;
}

/** Tokens a curve sells before graduating: 80% of the supply. */
export const CURVE_SUPPLY = (TOTAL_SUPPLY * 8_000n) / BPS;

/** The curve's virtual quote reserve for a preset and graduation raise. */
export function virtualQuote(preset: number, graduationRaise: bigint): bigint {
  const bps = PRESET_VIRTUAL_BPS[preset];
  if (bps === undefined) throw new Error(`unknown preset ${preset}`);
  return (graduationRaise * bps) / BPS;
}

/**
 * Progress to graduation, 0 to 10000 (basis points): how much of the graduation raise the
 * curve currently holds. Derived from the quote reserve, so it needs no extra event.
 */
export function graduationProgressBps(quoteReserve: bigint, preset: number, graduationRaise: bigint): number {
  if (graduationRaise <= 0n) return 0;
  const raised = quoteReserve - virtualQuote(preset, graduationRaise);
  if (raised <= 0n) return 0;
  const bps = (raised * BPS) / graduationRaise;
  return Number(bps > BPS ? BPS : bps);
}

/** Hard ceiling on the trading fee, in basis points (3%). Enforced by the factory and every curve. */
export const MAX_TRADE_FEE_BPS = 300;

/** Fee on a curve-side amount, rounded UP. Mirrors `fee_of` in curve_math.cairo. */
export function feeOf(amount: bigint, feeBps: number): bigint {
  return ceilDiv(amount * BigInt(feeBps), BPS);
}

/**
 * The most that can go into the curve out of a total budget once the fee on it is paid: the largest
 * `net` with `net + feeOf(net) <= gross`. Mirrors `net_from_gross` in curve_math.cairo.
 */
export function netFromGross(gross: bigint, feeBps: number): bigint {
  let net = (gross * BPS) / (BPS + BigInt(feeBps));
  while (net > 0n && net + feeOf(net, feeBps) > gross) net -= 1n;
  return net;
}

/** Split a fee into [creator, platform]. The creator's share rounds down, the platform keeps the rest. */
export function splitFee(fee: bigint, creatorShareBps: number): [bigint, bigint] {
  const creator = (fee * BigInt(creatorShareBps)) / BPS;
  return [creator, fee - creator];
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/**
 * Reserves of a curve before its first trade. Nothing is emitted when a launch is created, so
 * this is how a brand new launch gets a price and a market cap. Mirrors the contract:
 * virtual_tokens = ceil(curve_supply * (virtual_quote + raise) / raise).
 */
export function initialReserves(preset: number, graduationRaise: bigint): { quoteReserve: bigint; tokenReserve: bigint } {
  if (graduationRaise <= 0n) throw new Error("graduation raise must be positive");
  const quoteReserve = virtualQuote(preset, graduationRaise);
  return { quoteReserve, tokenReserve: ceilDiv(CURVE_SUPPLY * (quoteReserve + graduationRaise), graduationRaise) };
}
