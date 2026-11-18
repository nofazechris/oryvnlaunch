// Turning a launch's trades into candles. Pure, so it is tested on its own with exact BigInt maths.
//
// A price here is the contract's spot price: smallest quote units per whole token, scaled by 1e18, as
// a bigint. Volume is the curve-side amount (fees excluded), like everywhere else in the API.

export const INTERVAL_SECONDS = { "1m": 60, "5m": 300, "15m": 900, "1h": 3_600, "4h": 14_400, "1d": 86_400 } as const;
export type Interval = keyof typeof INTERVAL_SECONDS;
export const INTERVALS = Object.keys(INTERVAL_SECONDS) as [Interval, ...Interval[]];

export interface TradePoint {
  /** Unix seconds. */
  time: number;
  /** Price after this trade. */
  price: bigint;
  /** Curve-side amount of the trade. */
  quoteAmount: bigint;
}

export interface Candle {
  /** Unix seconds at the start of the bucket. */
  time: number;
  open: bigint;
  high: bigint;
  low: bigint;
  close: bigint;
  volume: bigint;
  trades: number;
}

/**
 * Contiguous candles from the bucket containing `from` to the bucket containing `to`, inclusive.
 *
 * A bucket with no trades is still a candle: flat at the previous close, with zero volume, so a chart
 * has no holes. A bucket's open is the previous bucket's close (the price really was that until the
 * first trade of the bucket moved it), and the first bucket opens at `priorClose`. `trades` must be
 * sorted oldest first; any before the first bucket are ignored (they belong in `priorClose`).
 */
export function buildCandles(trades: readonly TradePoint[], interval: Interval, from: number, to: number, priorClose: bigint): Candle[] {
  const size = INTERVAL_SECONDS[interval];
  const first = Math.floor(from / size) * size;
  const last = Math.floor(to / size) * size;
  const out: Candle[] = [];
  let close = priorClose;
  let i = 0;
  while (i < trades.length && (trades[i] as TradePoint).time < first) i += 1;

  for (let start = first; start <= last; start += size) {
    const end = start + size;
    let high = close;
    let low = close;
    const open = close;
    let volume = 0n;
    let count = 0;
    while (i < trades.length && (trades[i] as TradePoint).time < end) {
      const trade = trades[i] as TradePoint;
      if (trade.price > high) high = trade.price;
      if (trade.price < low) low = trade.price;
      close = trade.price;
      volume += trade.quoteAmount;
      count += 1;
      i += 1;
    }
    out.push({ time: start, open, high, low, close, volume, trades: count });
  }
  return out;
}

/**
 * Change from `reference` to `current` in basis points (100 = 1%), truncated toward zero.
 * Null when there is no usable reference price.
 */
export function changeBps(current: bigint, reference: bigint): number | null {
  if (reference <= 0n) return null;
  return Number(((current - reference) * 10_000n) / reference);
}
