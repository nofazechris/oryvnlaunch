import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { graduationProgressBps, initialReserves, marketCap, spotPrice, virtualQuote, TOTAL_SUPPLY } from "./math.js";

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
