import { describe, expect, it } from "vitest";
import { selector } from "./rpc";
import { buyCalls, claimCreatorFeesCall, friendlyTradeError, parseUnits, sellCalls, withSlippage } from "./trade-tx";

describe("selector", () => {
  it("matches the well-known Starknet selectors", () => {
    expect(selector("transfer")).toBe("0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e");
    expect(selector("balanceOf")).toBe("0x2e4263afad30923c891518314c3c95dbe830a16874e8abc5777a9a20b54c76e");
  });
});

describe("parseUnits", () => {
  it("is exact, never a float", () => {
    expect(parseUnits("1", 18)).toBe(10n ** 18n);
    expect(parseUnits("0.1", 18)).toBe(10n ** 17n);
    expect(parseUnits("12.345678", 6)).toBe(12_345_678n);
    expect(parseUnits(".5", 6)).toBe(500_000n);
    expect(parseUnits("5.", 6)).toBe(5_000_000n);
    expect(parseUnits("123456789012345678.123456789012345678", 18)).toBe(123456789012345678123456789012345678n);
  });

  it("refuses empty, malformed or over-precise input instead of rounding it", () => {
    expect(parseUnits("", 18)).toBeNull();
    expect(parseUnits(".", 18)).toBeNull();
    expect(parseUnits("1.2.3", 18)).toBeNull();
    expect(parseUnits("-1", 18)).toBeNull();
    expect(parseUnits("1e5", 18)).toBeNull();
    expect(parseUnits("1.1234567", 6)).toBeNull();
  });
});

describe("withSlippage", () => {
  it("rounds down so the minimum is never optimistic", () => {
    expect(withSlippage(1_000n, 100)).toBe(990n);
    expect(withSlippage(999n, 100)).toBe(989n);
    expect(withSlippage(1_000n, 0)).toBe(1_000n);
  });
  it("rejects nonsense slippage", () => {
    expect(() => withSlippage(1n, -1)).toThrow();
    expect(() => withSlippage(1n, 5_001)).toThrow();
    expect(() => withSlippage(1n, 1.5)).toThrow();
  });
});

describe("trade calls", () => {
  it("buy: approves the quote asset for this trade only, then buys", () => {
    const calls = buyCalls({ curve: "0xc", quoteToken: "0x57", maxQuoteIn: 5n, minTokensOut: 7n });
    expect(calls).toEqual([
      { contract_address: "0x57", entry_point: "approve", calldata: ["0xc", "0x5", "0x0"] },
      { contract_address: "0xc", entry_point: "buy", calldata: ["0x5", "0x0", "0x7", "0x0"] },
    ]);
  });

  it("sell: approves the token for this trade only, then sells", () => {
    const calls = sellCalls({ curve: "0xc", token: "0x70", tokensIn: 9n, minQuoteOut: 3n });
    expect(calls).toEqual([
      { contract_address: "0x70", entry_point: "approve", calldata: ["0xc", "0x9", "0x0"] },
      { contract_address: "0xc", entry_point: "sell", calldata: ["0x9", "0x0", "0x3", "0x0"] },
    ]);
  });

  it("refuses a zero amount", () => {
    expect(() => buyCalls({ curve: "0xc", quoteToken: "0x57", maxQuoteIn: 0n, minTokensOut: 0n })).toThrow();
    expect(() => sellCalls({ curve: "0xc", token: "0x70", tokensIn: 0n, minQuoteOut: 0n })).toThrow();
  });
});

describe("friendlyTradeError", () => {
  it("explains the common reverts in plain words", () => {
    expect(friendlyTradeError("Execution failed: 'CURVE_SLIPPAGE'")).toMatch(/slippage/i);
    expect(friendlyTradeError("'CURVE_SOLD_OUT'")).toMatch(/sold out/i);
    expect(friendlyTradeError("User abort")).toMatch(/declined/i);
    expect(friendlyTradeError("ERC20: insufficient balance")).toMatch(/balance/i);
  });
  it("never shows raw node text for an unknown failure", () => {
    expect(friendlyTradeError("some stack trace 0xdeadbeef")).toBe("The transaction failed. Nothing was traded.");
    expect(friendlyTradeError(undefined)).toBe("The transaction failed. Nothing was traded.");
  });
});

describe("claiming creator fees", () => {
  it("is a call with no arguments to the curve", () => {
    expect(claimCreatorFeesCall("0xc")).toEqual({ contract_address: "0xc", entry_point: "claim_creator_fees", calldata: [] });
  });
  it("explains the 'nothing to claim' revert", () => {
    expect(friendlyTradeError("Execution failed: 'CURVE_NO_FEES'")).toMatch(/no fees/i);
  });
});
