import { describe, expect, it } from "vitest";
import type { ApiHolders, ApiLaunch, ApiTrade } from "./api";
import { buildBrief, sinceLabel } from "./brief";
import { toToken } from "./token";

const E18 = 10n ** 18n;
const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);

const launch = (over: { progressBps?: number; graduated?: boolean } = {}): ApiLaunch => ({
  token: "0x" + "1".repeat(64),
  curve: "0x" + "2".repeat(64),
  creator: "0x" + "3".repeat(64),
  quote: { address: "0x" + "4".repeat(64), symbol: "STRK", decimals: 18 },
  name: "Example",
  symbol: "EXM",
  metadataUri: "",
  metadata: { description: "", links: {}, image: null },
  preset: { id: 1, name: "Standard" },
  creatorBps: 200,
  graduationRaise: (1000n * E18).toString(),
  deployFee: "0",
  feeAsset: { address: "0x" + "4".repeat(64), symbol: "STRK", decimals: 18 },
  tradeFee: { bps: 100, creatorShareBps: 5000, totalCollected: (3n * E18).toString() },
  createdAt: new Date(NOW - 3 * 3600_000).toISOString(),
  createdBlock: 1,
  createdTx: "0x1",
  graduated: over.graduated ?? false,
  graduatedAt: null,
  market: { quoteReserve: "1", tokenReserve: "1", price: "1000000000000", marketCap: "1", volumeQuote: "1", tradeCount: 0, lastTradeAt: null, change24hBps: 0, progressBps: over.progressBps ?? 600 },
});

const trade = (side: "buy" | "sell", amount: number, minutesAgo: number, trader = "0xa"): ApiTrade => ({
  id: `${side}${amount}${minutesAgo}${trader}`,
  side,
  trader,
  quoteAmount: "0",
  fee: "0",
  traderAmount: (BigInt(amount) * E18).toString(),
  tokenAmount: "0",
  price: "0",
  quoteReserve: "0",
  tokenReserve: "0",
  txHash: "0x1",
  blockNumber: 1,
  blockTime: new Date(NOW - minutesAgo * 60_000).toISOString(),
});

const holders = (over: Partial<ApiHolders> & { top?: { role: "curve" | "reserve" | "creator" | "holder"; shareBps: number }[] } = {}): ApiHolders => ({
  count: 3,
  wallets: over.wallets ?? 3,
  supply: (1_000_000_000n * E18).toString(),
  top10ShareBps: over.top10ShareBps ?? 2000,
  creatorShareBps: over.creatorShareBps ?? 200,
  items: (over.top ?? [{ role: "curve", shareBps: 8000 }, { role: "holder", shareBps: 300 }]).map((h, i) => ({ address: "0x" + i, role: h.role, balance: "1", shareBps: h.shareBps })),
});

const brief = (trades: ApiTrade[], h: ApiHolders | null, over: Parameters<typeof launch>[0] = {}) => buildBrief(toToken(launch(over)), trades, h, NOW);
const labels = (b: ReturnType<typeof brief>) => b.signals.map((s) => s.label);

describe("buildBrief facts", () => {
  it("sums buys and sells in the token's own units and counts distinct traders", () => {
    const { facts } = brief([trade("buy", 10, 5, "0xa"), trade("buy", 30, 10, "0xb"), trade("sell", 5, 20, "0xa")], holders());
    expect(facts).toMatchObject({ buys: 2, sells: 1, buyVolume: 40, sellVolume: 5, uniqueTraders: 2, largestTrade: 30 });
    expect(facts.avgTrade).toBeCloseTo(15, 6);
    expect(facts.buyShare).toBeCloseTo(2 / 3, 6);
    expect(facts.lastTradeMinutes).toBeCloseTo(5, 6);
  });

  it("works out how much of the raise is in and how much is left", () => {
    const { facts } = brief([], holders(), { progressBps: 2500 });
    expect(facts).toMatchObject({ target: 1000, raised: 250, remaining: 750, feesCollected: 3 });
  });

  it("ignores the curve and the reserve when finding the biggest wallet", () => {
    const { facts } = brief([], holders({ top: [{ role: "curve", shareBps: 8000 }, { role: "reserve", shareBps: 1500 }, { role: "creator", shareBps: 200 }, { role: "holder", shareBps: 300 }] }));
    expect(facts.topWalletPct).toBe(3);
  });

  it("reports missing holder data as null instead of guessing", () => {
    const { facts } = brief([], null);
    expect(facts).toMatchObject({ holderWallets: null, top10SharePct: null, creatorSharePct: null, topWalletPct: null });
  });
});

describe("buildBrief signals", () => {
  it("says so when nothing has traded", () => {
    expect(labels(brief([], holders()))).toContain("No trades yet");
  });

  it("calls a token active, quiet or dormant by how long ago it last traded", () => {
    expect(labels(brief([trade("buy", 1, 10)], holders()))).toContain("Active");
    expect(labels(brief([trade("buy", 1, 300)], holders()))).toContain("Quiet");
    expect(labels(brief([trade("buy", 1, 60 * 30)], holders()))).toContain("Dormant");
  });

  it("only comments on buy and sell balance with at least three trades", () => {
    expect(labels(brief([trade("buy", 1, 5), trade("buy", 1, 6)], holders()))).not.toContain("Mostly buys");
    expect(labels(brief([trade("buy", 1, 5), trade("buy", 1, 6), trade("buy", 1, 7)], holders()))).toContain("Mostly buys");
    expect(labels(brief([trade("sell", 1, 5), trade("sell", 1, 6), trade("sell", 1, 7)], holders()))).toContain("Mostly sells");
    expect(labels(brief([trade("buy", 1, 5), trade("sell", 1, 6), trade("buy", 1, 7), trade("sell", 1, 8)], holders()))).toContain("Balanced trading");
  });

  it("flags very few holders, a big creator share and a concentrated top ten as warnings", () => {
    const b = brief([], holders({ wallets: 1, creatorShareBps: 1519, top10ShareBps: 6000 }));
    const warn = b.signals.filter((s) => s.tone === "warn").map((s) => s.label);
    expect(warn).toEqual(expect.arrayContaining(["1 holder", "Creator holds 15.19%", "Concentrated"]));
  });

  it("treats a wide holder base and a small creator share as fine", () => {
    const b = brief([], holders({ wallets: 40, creatorShareBps: 200, top10ShareBps: 2000 }));
    expect(b.signals.find((s) => s.label === "40 holders")?.tone).toBe("good");
    expect(b.signals.find((s) => s.label.startsWith("Creator holds"))?.tone).toBe("neutral");
    expect(labels(b)).not.toContain("Concentrated");
  });

  it("describes where the token is on the curve", () => {
    expect(labels(brief([], holders(), { progressBps: 600 }))).toContain("Early stage");
    expect(labels(brief([], holders(), { progressBps: 3000 }))).toContain("Mid curve");
    expect(labels(brief([], holders(), { progressBps: 8000 }))).toContain("Near graduation");
    expect(labels(brief([], holders(), { graduated: true, progressBps: 10000 }))).toContain("Graduated");
  });

  it("never gives advice, a score or a prediction", () => {
    const text = brief([trade("buy", 1, 5), trade("buy", 1, 6), trade("buy", 1, 7)], holders({ wallets: 1, creatorShareBps: 3000 }))
      .signals.map((s) => `${s.label} ${s.detail}`)
      .join(" ")
      .toLowerCase();
    for (const word of ["should buy", "should sell", "will rise", "will fall", "safe", "scam", "rug", "score", "guarantee"]) expect(text).not.toContain(word);
  });
});

describe("sinceLabel", () => {
  it("speaks in minutes, hours and days", () => {
    expect(sinceLabel(0.2)).toBe("under a minute ago");
    expect(sinceLabel(1)).toBe("1 minute ago");
    expect(sinceLabel(45)).toBe("45 minutes ago");
    expect(sinceLabel(180)).toBe("3 hours ago");
    expect(sinceLabel(60 * 24 * 5)).toBe("5 days ago");
  });
});
