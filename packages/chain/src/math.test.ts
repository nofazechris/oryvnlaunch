import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_TRADE_FEE_BPS, feeOf, graduationProgressBps, initialReserves, marketCap, netFromGross, spotPrice, splitFee, virtualQuote, TOTAL_SUPPLY } from "./math.js";

const E18 = 10n ** 18n;

interface Fixture {
  expected: Record<string, { spotPrice: string[]; state: string[] }>;
}
const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/devnet-events.json", import.meta.url), "utf8"),
) as Fixture;
const [curve] = Object.keys(fixture.expected) as [string];
const expected = fixture.expected[curve] as { spotPrice: string[]; state: string[] };
const u256 = (felts: string[], at: number) => BigInt(felts[at] as string) + (BigInt(felts[at + 1] as string) << 128n);

describe("derived numbers equal what the contract itself reports", () => {
  // get_state returns: quote_reserve, token_reserve, quote_raised, tokens_sold, curve_supply,
  // reserved_supply (each a u256), then graduated.
  const quoteReserve = u256(expected.state, 0);
  const tokenReserve = u256(expected.state, 2);

  it("spotPrice matches the contract's spot_price()", () => {
    expect(spotPrice(quoteReserve, tokenReserve)).toBe(u256(expected.spotPrice, 0));
  });

  it("reads the graduated flag the same way the events say", () => {
    expect(BigInt(expected.state[12] as string)).toBe(1n);
  });

  it("virtualQuote reproduces the curve's virtual reserve", () => {
    // quote_reserve = virtual + quote_raised
    const raised = u256(expected.state, 4);
    expect(virtualQuote(1, 1_000n * E18)).toBe(quoteReserve - raised);
  });
});

describe("market numbers", () => {
  it("prices a fresh Standard curve at a quote reserve of R/2", () => {
    expect(virtualQuote(0, 1_000n * E18)).toBe(1_000n * E18);
    expect(virtualQuote(1, 1_000n * E18)).toBe(500n * E18);
    expect(virtualQuote(2, 1_000n * E18)).toBe(250n * E18);
  });

  it("rejects an unknown preset and a zero token reserve", () => {
    expect(() => virtualQuote(3, 1n)).toThrow();
    expect(() => spotPrice(1n, 0n)).toThrow();
    expect(() => marketCap(1n, 0n)).toThrow();
  });

  it("gives a market cap of about 3.75x the raise at graduation on the Standard preset", () => {
    // After the graduating buy: quote reserve 1500, token reserve 400M (from the real events).
    const cap = marketCap(1_500n * E18, 400_000_000n * E18);
    expect(cap).toBe((3_750n * E18)); // 1500e18 * 1e9 tokens / 400e6 tokens
    expect(cap).toBe((TOTAL_SUPPLY * 1_500n * E18) / (400_000_000n * E18));
  });

  it("keeps precision for a 6-decimal asset where one token costs a fraction of a unit", () => {
    // USDC Standard curve, R = 10,000 USDC: fresh reserves are 5,000e6 and ~1.2e27.
    const price = spotPrice(5_000n * 10n ** 6n, 1_200_000_000n * E18);
    expect(price).toBeGreaterThan(4n * E18);
    expect(price).toBeLessThan(5n * E18);
  });
});

describe("graduation progress", () => {
  const raise = 1_000n * E18;

  it("is 0 on a fresh curve, whichever preset", () => {
    expect(graduationProgressBps(virtualQuote(0, raise), 0, raise)).toBe(0);
    expect(graduationProgressBps(virtualQuote(1, raise), 1, raise)).toBe(0);
    expect(graduationProgressBps(virtualQuote(2, raise), 2, raise)).toBe(0);
  });

  it("is halfway when half the raise is in", () => {
    expect(graduationProgressBps(virtualQuote(1, raise) + 500n * E18, 1, raise)).toBe(5_000);
  });

  it("is exactly 10000 at graduation and never above", () => {
    expect(graduationProgressBps(virtualQuote(1, raise) + raise, 1, raise)).toBe(10_000);
    expect(graduationProgressBps(virtualQuote(1, raise) + 2n * raise, 1, raise)).toBe(10_000);
  });

  it("never goes negative after sells push the reserve down", () => {
    expect(graduationProgressBps(0n, 1, raise)).toBe(0);
  });
});

describe("initialReserves", () => {
  const raise = 1_000n * E18;

  it("reproduces the reserves the real curve started with", () => {
    // From the captured events: after buying 109090909090909090909090909 tokens the token
    // reserve was 1090909090909090909090909091, so the curve opened at their sum.
    expect(initialReserves(1, raise)).toEqual({
      quoteReserve: 500n * E18,
      tokenReserve: 1_090_909_090_909_090_909_090_909_091n + 109_090_909_090_909_090_909_090_909n,
    });
  });

  it("opens each preset at the documented size", () => {
    expect(initialReserves(0, raise).tokenReserve).toBe(1_600_000_000n * E18);
    expect(initialReserves(1, raise).tokenReserve).toBe(1_200_000_000n * E18);
    expect(initialReserves(2, raise).tokenReserve).toBe(1_000_000_000n * E18);
  });

  it("starts steeper curves at a lower price", () => {
    const price = (p: number) => {
      const r = initialReserves(p, raise);
      return spotPrice(r.quoteReserve, r.tokenReserve);
    };
    expect(price(2)).toBeLessThan(price(1));
    expect(price(1)).toBeLessThan(price(0));
  });

  it("rounds the token reserve up, like the contract", () => {
    // raise 3 units, Standard: virtual quote 1 (floor of 1.5), tokens = ceil(S * 4 / 3)
    const r = initialReserves(1, 3n);
    expect(r.quoteReserve).toBe(1n);
    expect(r.tokenReserve * 3n).toBeGreaterThanOrEqual(TOTAL_SUPPLY * 8n / 10n * 4n);
  });
});

// These use the same figures as the contract's own Cairo tests (contracts/src/tests/test_curve_math.cairo),
// because this code must agree with the contract to the last unit: the front end uses it for previews.
describe("trading fee maths mirror the contract", () => {
  it("takes one percent of a round amount", () => {
    expect(feeOf(100n * E18, 100)).toBe(E18);
    expect(feeOf(50n * E18, 100)).toBe(E18 / 2n);
    expect(feeOf(12_345n, 0)).toBe(0n);
  });

  it("rounds the fee up, so a tiny trade still pays a unit", () => {
    expect([1n, 99n, 100n, 101n].map((n) => feeOf(n, 100))).toEqual([1n, 1n, 1n, 2n]);
  });

  it("turns a total budget into the amount that can go into the curve", () => {
    expect(netFromGross((505n * E18) / 10n, 100)).toBe(50n * E18);
    expect(netFromGross(0n, 100)).toBe(0n);
    expect(netFromGross(1n, 100)).toBe(0n);
    expect(netFromGross(2n, 100)).toBe(1n);
    expect(netFromGross(12_345n, 0)).toBe(12_345n);
  });

  it("splits a fee without losing or creating a unit", () => {
    expect(splitFee(101n, 5_000)).toEqual([50n, 51n]);
    expect(splitFee(7n, 0)).toEqual([0n, 7n]);
    expect(splitFee(7n, 10_000)).toEqual([7n, 0n]);
  });

  it("always fits the budget, and never leaves a spendable unit unused, for any fee up to the cap", () => {
    // A deterministic spread of budgets, from a single unit to far beyond 2^128, at every fee in range.
    const budgets = [0n, 1n, 2n, 3n, 99n, 100n, 101n, 9_999n, 10_001n, 123_456_789n, 10n ** 18n, 5n * 10n ** 21n + 7n, 2n ** 130n + 12_345n];
    for (let bps = 0; bps <= MAX_TRADE_FEE_BPS; bps += 1) {
      for (const gross of budgets) {
        const net = netFromGross(gross, bps);
        expect(net + feeOf(net, bps), `budget ${gross} at ${bps} bps`).toBeLessThanOrEqual(gross);
        if (gross > 0n) expect(net + 1n + feeOf(net + 1n, bps), `tight at ${gross}, ${bps} bps`).toBeGreaterThan(gross);
      }
    }
  });

  it("agrees with the real events: a 50.5 buy at 1% is 50 into the curve and 0.5 of fee", () => {
    const net = netFromGross((505n * E18) / 10n, 100);
    expect([net, feeOf(net, 100)]).toEqual([50n * E18, E18 / 2n]);
  });

  it("exposes the same 3% ceiling the contract enforces", () => {
    expect(MAX_TRADE_FEE_BPS).toBe(300);
  });
});
