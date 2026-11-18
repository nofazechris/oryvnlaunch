import { describe, expect, it } from "vitest";
import { buildCandles, changeBps, INTERVAL_SECONDS, type TradePoint } from "./candles.js";

const E18 = 10n ** 18n;
const trade = (time: number, price: bigint, quoteAmount = E18): TradePoint => ({ time, price, quoteAmount });

describe("buildCandles", () => {
  it("makes one candle per bucket from the first to the last, with no holes", () => {
    const candles = buildCandles([], "1m", 600, 600 + 4 * 60, 7n);
    expect(candles.map((c) => c.time)).toEqual([600, 660, 720, 780, 840]);
    // nothing traded: every candle is flat at the price before, with no volume
    for (const c of candles) expect(c).toMatchObject({ open: 7n, high: 7n, low: 7n, close: 7n, volume: 0n, trades: 0 });
  });

  it("opens a bucket at the previous close and takes the high and low from the trades", () => {
    const candles = buildCandles([trade(605, 12n), trade(620, 9n), trade(640, 11n), trade(670, 15n)], "1m", 600, 720, 10n);
    expect(candles[0]).toMatchObject({ time: 600, open: 10n, high: 12n, low: 9n, close: 11n, trades: 3 });
    // the second bucket opens where the first closed, and its one trade moves it
    expect(candles[1]).toMatchObject({ time: 660, open: 11n, high: 15n, low: 11n, close: 15n, trades: 1 });
    // an empty bucket after it is flat at the last close
    expect(candles[2]).toMatchObject({ time: 720, open: 15n, high: 15n, low: 15n, close: 15n, trades: 0 });
  });

  it("sums the volume of each bucket exactly", () => {
    const candles = buildCandles([trade(601, 10n, 3n), trade(602, 10n, 4n), trade(661, 10n, 5n)], "1m", 600, 660, 10n);
    expect(candles.map((c) => c.volume)).toEqual([7n, 5n]);
  });

  it("ignores trades before the first bucket, which belong in the prior close", () => {
    const candles = buildCandles([trade(100, 999n), trade(610, 20n)], "1m", 600, 600, 10n);
    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({ open: 10n, high: 20n, low: 10n, close: 20n, trades: 1 });
  });

  it("puts a trade exactly on a bucket boundary in the new bucket", () => {
    const candles = buildCandles([trade(660, 20n)], "1m", 600, 660, 10n);
    expect(candles[0]).toMatchObject({ time: 600, close: 10n, trades: 0 });
    expect(candles[1]).toMatchObject({ time: 660, close: 20n, trades: 1 });
  });

  it("aligns buckets to the interval, whatever time you start from", () => {
    const candles = buildCandles([], "1h", 3_600 * 5 + 1_234, 3_600 * 7 + 5, 1n);
    expect(candles.map((c) => c.time)).toEqual([3_600 * 5, 3_600 * 6, 3_600 * 7]);
  });

  it("supports every interval, with the sizes it claims", () => {
    expect(INTERVAL_SECONDS).toEqual({ "1m": 60, "5m": 300, "15m": 900, "1h": 3_600, "4h": 14_400, "1d": 86_400 });
    for (const interval of Object.keys(INTERVAL_SECONDS) as (keyof typeof INTERVAL_SECONDS)[]) {
      const [a, b] = buildCandles([], interval, 0, INTERVAL_SECONDS[interval], 1n);
      expect(b!.time - a!.time).toBe(INTERVAL_SECONDS[interval]);
    }
  });

  it("keeps prices and volumes exact beyond what a JavaScript number can hold", () => {
    const huge = 2n ** 200n;
    const [c] = buildCandles([trade(601, huge + 1n, huge), trade(602, huge + 3n, huge)], "1m", 600, 600, huge);
    expect(c).toMatchObject({ open: huge, high: huge + 3n, low: huge, close: huge + 3n, volume: 2n * huge });
  });

  it("never lets low exceed open or close, nor high fall below them", () => {
    const candles = buildCandles([trade(601, 5n), trade(602, 50n), trade(603, 20n), trade(661, 1n)], "1m", 600, 660, 10n);
    for (const c of candles) {
      expect(c.low <= c.open && c.low <= c.close && c.low <= c.high).toBe(true);
      expect(c.high >= c.open && c.high >= c.close).toBe(true);
    }
  });
});

describe("changeBps", () => {
  it("is the change in basis points", () => {
    expect(changeBps(150n, 100n)).toBe(5_000); // +50%
    expect(changeBps(50n, 100n)).toBe(-5_000); // -50%
    expect(changeBps(100n, 100n)).toBe(0);
  });

  it("truncates toward zero rather than rounding", () => {
    expect(changeBps(10_001n, 10_000n)).toBe(1); // +0.01%
    expect(changeBps(10_000n, 10_001n)).toBe(0); // -0.0099...% truncates to 0
  });

  it("is null when there is no reference price to compare with", () => {
    expect(changeBps(100n, 0n)).toBeNull();
  });

  it("works on prices far larger than a JavaScript number", () => {
    const base = 10n ** 60n;
    expect(changeBps(base * 3n, base)).toBe(20_000);
  });
});
