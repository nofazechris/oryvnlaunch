import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { initialReserves, marketCap, spotPrice } from "@launchpad/chain";
import { type Db, indexerState, launches, quoteTokenEvents, trades } from "@launchpad/db";
import { createTestDb, type TestDb } from "@launchpad/db/testing";
import { createApp } from "./app.js";

const E18 = 10n ** 18n;
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const USDC = "0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343";
const addr = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const MIN = 60_000;
const HOUR = 60 * MIN;

let testDb: TestDb;
let db: Db;
let app: NestFastifyApplication;
beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  app = await createApp(db);
});
afterAll(async () => {
  await app.close();
  await testDb.close();
});
beforeEach(async () => {
  await db.delete(trades);
  await db.delete(launches);
  await db.delete(quoteTokenEvents);
  await db.delete(indexerState);
});

const get = async (url: string) => {
  const r = await app.inject({ method: "GET", url });
  return { status: r.statusCode, body: r.json() as any };
};

const RAISE = 1_000n * E18;
const OPENING = (() => {
  const o = initialReserves(1, RAISE);
  return { ...o, price: spotPrice(o.quoteReserve, o.tokenReserve) };
})();

interface SeedLaunch {
  n: number;
  quote?: string;
  createdMsAgo: number;
  /** The launch's current price; defaults to the opening price. */
  price?: bigint;
  creator?: number;
  graduatedMsAgo?: number;
  tradeCount?: number;
  volume?: bigint;
  fees?: bigint;
}

async function seedLaunch(o: SeedLaunch) {
  const now = Date.now();
  const price = o.price ?? OPENING.price;
  await db.insert(launches).values({
    token: addr(o.n),
    curve: addr(1000 + o.n),
    factory: addr(9),
    creator: addr(o.creator ?? 500),
    quoteToken: o.quote ?? STRK,
    launchId: String(o.n),
    name: `Token ${o.n}`,
    symbol: `T${o.n}`,
    metadataUri: "ipfs://x",
    preset: 1,
    creatorBps: 0,
    graduationRaise: RAISE.toString(),
    deployFee: String(10n * E18),
    tradeFeeBps: 100,
    creatorFeeShareBps: 5_000,
    createdBlock: o.n,
    createdTx: addr(2000 + o.n),
    createdAt: new Date(now - o.createdMsAgo),
    graduated: o.graduatedMsAgo !== undefined,
    graduatedBlock: o.graduatedMsAgo !== undefined ? o.n + 1 : null,
    graduatedAt: o.graduatedMsAgo !== undefined ? new Date(now - o.graduatedMsAgo) : null,
    quoteReserve: OPENING.quoteReserve.toString(),
    tokenReserve: OPENING.tokenReserve.toString(),
    price: price.toString(),
    marketCap: marketCap(OPENING.quoteReserve, OPENING.tokenReserve).toString(),
    tradeCount: o.tradeCount ?? 0,
    volumeQuote: (o.volume ?? 0n).toString(),
    feesTotal: (o.fees ?? 0n).toString(),
  });
}

let block = 100;
async function seedTrade(n: number, msAgo: number, over: Partial<typeof trades.$inferInsert> = {}) {
  block += 1;
  await db.insert(trades).values({
    id: `${block}:c:0`,
    curve: addr(1000 + n),
    token: addr(n),
    side: "buy",
    trader: addr(700),
    quoteAmount: String(10n * E18),
    fee: String(E18 / 10n),
    tokenAmount: String(5n * E18),
    quoteReserve: String(510n * E18),
    tokenReserve: String(1_100n * E18),
    price: OPENING.price.toString(),
    blockNumber: block,
    indexInBlock: 0,
    txHash: addr(3000 + block),
    blockTime: new Date(Date.now() - msAgo),
    ...over,
  });
}

describe("24 hour price change", () => {
  it("compares with the price after the last trade at least a day old", async () => {
    await seedLaunch({ n: 1, createdMsAgo: 60 * HOUR, price: (OPENING.price * 3n) / 2n });
    await seedTrade(1, 30 * HOUR, { price: OPENING.price.toString() }); // 30h ago: the reference
    await seedTrade(1, 2 * HOUR, { price: ((OPENING.price * 3n) / 2n).toString() }); // recent: not the reference
    const { body } = await get("/launches/" + addr(1));
    expect(body.market.change24hBps).toBe(5_000); // +50% over the day
  });

  it("for a launch younger than a day, compares with the price it opened at", async () => {
    await seedLaunch({ n: 1, createdMsAgo: 2 * HOUR, price: OPENING.price * 2n });
    await seedTrade(1, 1 * HOUR, { price: (OPENING.price * 2n).toString() });
    const { body } = await get("/launches/" + addr(1));
    expect(body.market.change24hBps).toBe(10_000); // doubled since it opened
  });

  it("is zero for a launch nobody has traded, and negative when the price fell", async () => {
    await seedLaunch({ n: 1, createdMsAgo: HOUR });
    await seedLaunch({ n: 2, createdMsAgo: HOUR, price: OPENING.price / 2n });
    const { body } = await get("/launches?sort=newest");
    const by = Object.fromEntries(body.items.map((i: any) => [i.symbol, i.market.change24hBps]));
    expect(by.T1).toBe(0);
    expect(by.T2).toBe(-5_000);
  });

  it("is worked out per launch, so one launch's history never leaks into another's", async () => {
    await seedLaunch({ n: 1, createdMsAgo: 60 * HOUR, price: OPENING.price * 2n });
    await seedLaunch({ n: 2, createdMsAgo: 60 * HOUR, price: OPENING.price });
    await seedTrade(1, 30 * HOUR, { price: OPENING.price.toString() });
    await seedTrade(2, 30 * HOUR, { price: OPENING.price.toString() });
    const { body } = await get("/launches");
    const by = Object.fromEntries(body.items.map((i: any) => [i.symbol, i.market.change24hBps]));
    expect(by).toEqual({ T1: 10_000, T2: 0 });
  });
});

describe("GET /launches/:token/candles", () => {
  it("returns contiguous candles ending now, oldest first, with exact string prices", async () => {
    await seedLaunch({ n: 1, createdMsAgo: 10 * MIN });
    await seedTrade(1, 150_000, { price: String(OPENING.price + 10n), quoteAmount: String(3n * E18) });
    await seedTrade(1, 90_000, { price: String(OPENING.price + 30n), quoteAmount: String(4n * E18) });
    await seedTrade(1, 30_000, { price: String(OPENING.price + 20n), quoteAmount: String(5n * E18) });

    const { status, body } = await get(`/launches/${addr(1)}/candles?interval=1m&limit=5`);
    expect(status).toBe(200);
    expect(body.interval).toBe("1m");
    expect(body.items).toHaveLength(5);
    const times: number[] = body.items.map((c: any) => c.time);
    expect(times.every((t, i) => i === 0 || t - times[i - 1]! === 60)).toBe(true);

    // every amount is an exact decimal string
    for (const c of body.items) for (const f of ["open", "high", "low", "close", "volume"]) expect(typeof c[f], f).toBe("string");

    // the three trades are all in the window: their volumes add up, the last close is the last price
    const volume = body.items.reduce((sum: bigint, c: any) => sum + BigInt(c.volume), 0n);
    expect(volume).toBe(12n * E18);
    expect(body.items.reduce((n: number, c: any) => n + c.trades, 0)).toBe(3);
    expect(BigInt(body.items.at(-1).close)).toBe(OPENING.price + 20n);
    // the highest price anywhere in the window is the middle trade
    expect(body.items.map((c: any) => BigInt(c.high)).reduce((a: bigint, b: bigint) => (a > b ? a : b))).toBe(OPENING.price + 30n);
  });

  it("is flat at the opening price for a launch with no trades", async () => {
    await seedLaunch({ n: 1, createdMsAgo: 5 * MIN });
    const { body } = await get(`/launches/${addr(1)}/candles?interval=1m&limit=3`);
    expect(body.items.length).toBeGreaterThan(0);
    for (const c of body.items) {
      expect(BigInt(c.open)).toBe(OPENING.price);
      expect(BigInt(c.close)).toBe(OPENING.price);
      expect(c.volume).toBe("0");
    }
  });

  it("draws nothing from before the launch existed", async () => {
    await seedLaunch({ n: 1, createdMsAgo: 2 * MIN });
    const { body } = await get(`/launches/${addr(1)}/candles?interval=1m&limit=500`);
    expect(body.items.length).toBeLessThanOrEqual(3); // the launch's own minute, and at most the two after
  });

  it("starts the window from the last trade before it, so a quiet stretch is flat at the real price", async () => {
    await seedLaunch({ n: 1, createdMsAgo: 3 * HOUR });
    await seedTrade(1, 2 * HOUR, { price: String(OPENING.price * 5n) }); // a long time ago, then nothing
    const { body } = await get(`/launches/${addr(1)}/candles?interval=1m&limit=4`);
    for (const c of body.items) expect(BigInt(c.close)).toBe(OPENING.price * 5n);
  });

  it("supports every interval and rejects others", async () => {
    await seedLaunch({ n: 1, createdMsAgo: HOUR });
    for (const interval of ["1m", "5m", "15m", "1h", "4h", "1d"]) {
      expect((await get(`/launches/${addr(1)}/candles?interval=${interval}`)).status, interval).toBe(200);
    }
    expect((await get(`/launches/${addr(1)}/candles?interval=2m`)).status).toBe(400);
    expect((await get(`/launches/${addr(1)}/candles?limit=0`)).status).toBe(400);
    expect((await get(`/launches/${addr(1)}/candles?limit=501`)).status).toBe(400);
  });

  it("returns 404 for a token that was never launched, and 400 for a bad address", async () => {
    expect((await get(`/launches/${addr(99)}/candles`)).status).toBe(404);
    expect((await get(`/launches/nope/candles`)).status).toBe(400);
  });
});

describe("GET /activity", () => {
  async function seedScene() {
    await seedLaunch({ n: 1, createdMsAgo: 50 * MIN, creator: 501, graduatedMsAgo: 5 * MIN });
    await seedLaunch({ n: 2, createdMsAgo: 40 * MIN, creator: 502, quote: USDC });
    await seedTrade(1, 30 * MIN, { side: "buy", trader: addr(701), quoteAmount: String(10n * E18), fee: String(E18 / 10n) });
    await seedTrade(1, 20 * MIN, { side: "sell", trader: addr(702), quoteAmount: String(10n * E18), fee: String(E18 / 10n) });
    await seedTrade(2, 10 * MIN, { side: "buy", trader: addr(701), quoteAmount: "5000000", fee: "50000" });
  }

  it("lists launches, buys, sells and graduations, newest first", async () => {
    await seedScene();
    const { status, body } = await get("/activity");
    expect(status).toBe(200);
    expect(body.items.map((e: any) => `${e.kind}:${e.symbol}`)).toEqual([
      "graduation:T1", // 5 min ago
      "buy:T2", // 10 min ago
      "sell:T1", // 20 min ago
      "buy:T1", // 30 min ago
      "launch:T2", // 40 min ago
      "launch:T1", // 50 min ago
    ]);
  });

  it("shows a buy as what the wallet paid and a sell as what it received, both fee-adjusted, in the right asset", async () => {
    await seedScene();
    const { body } = await get("/activity");
    const buy = body.items.find((e: any) => e.kind === "buy" && e.symbol === "T1");
    const sell = body.items.find((e: any) => e.kind === "sell");
    const usdcBuy = body.items.find((e: any) => e.kind === "buy" && e.symbol === "T2");
    expect(buy.amount).toBe(String(10n * E18 + E18 / 10n)); // 10 into the curve + 0.1 fee
    expect(sell.amount).toBe(String(10n * E18 - E18 / 10n)); // 10 out of the curve - 0.1 fee
    expect(usdcBuy.amount).toBe("5050000");
    expect(usdcBuy.quote).toEqual({ address: USDC, symbol: "USDC", decimals: 6 });
    expect(buy.quote.symbol).toBe("STRK");
  });

  it("reports a launch as the deploy fee its creator paid, and a graduation without an amount or wallet", async () => {
    await seedScene();
    const { body } = await get("/activity");
    const launch = body.items.find((e: any) => e.kind === "launch" && e.symbol === "T1");
    const graduation = body.items.find((e: any) => e.kind === "graduation");
    expect(launch).toMatchObject({ wallet: addr(501), amount: String(10n * E18) });
    expect(graduation).toMatchObject({ wallet: null, amount: null, tokenAmount: null });
  });

  it("filters to one wallet's own trades and launches, and leaves graduations out", async () => {
    await seedScene();
    const traderFeed = (await get(`/activity?wallet=${addr(701)}`)).body.items.map((e: any) => `${e.kind}:${e.symbol}`);
    expect(traderFeed).toEqual(["buy:T2", "buy:T1"]);
    const creatorFeed = (await get(`/activity?wallet=${addr(501)}`)).body.items.map((e: any) => `${e.kind}:${e.symbol}`);
    expect(creatorFeed).toEqual(["launch:T1"]); // not the graduation: it belongs to the token, not a wallet
  });

  it("filters to one token", async () => {
    await seedScene();
    const feed = (await get(`/activity?token=${addr(2)}`)).body.items.map((e: any) => `${e.kind}:${e.symbol}`);
    expect(feed).toEqual(["buy:T2", "launch:T2"]);
  });

  it("limits the feed, and validates the limit", async () => {
    await seedScene();
    expect((await get("/activity?limit=2")).body.items).toHaveLength(2);
    expect((await get("/activity?limit=0")).status).toBe(400);
    expect((await get("/activity?limit=101")).status).toBe(400);
    expect((await get("/activity?wallet=nope")).status).toBe(400);
  });

  it("is an empty list on an empty platform", async () => {
    expect((await get("/activity")).body).toEqual({ items: [] });
  });
});

describe("GET /stats", () => {
  it("is all zeros on an empty platform", async () => {
    expect((await get("/stats")).body).toEqual({ launches: 0, graduated: 0, trades: 0, wallets: 0, byAsset: [] });
  });

  it("counts launches, graduations, trades and distinct wallets, and keeps each asset separate", async () => {
    await seedLaunch({ n: 1, createdMsAgo: HOUR, creator: 501, graduatedMsAgo: 5 * MIN, tradeCount: 2, volume: 20n * E18, fees: E18 / 5n });
    await seedLaunch({ n: 2, createdMsAgo: HOUR, creator: 501, quote: USDC, tradeCount: 1, volume: 5_000_000n, fees: 50_000n });
    await seedTrade(1, 30 * MIN, { trader: addr(701) });
    await seedTrade(1, 20 * MIN, { trader: addr(702) });
    await seedTrade(2, 10 * MIN, { trader: addr(701) });
    const { body } = await get("/stats");
    expect(body).toMatchObject({ launches: 2, graduated: 1, trades: 3 });
    // wallets: creator 501, traders 701 and 702. 701 traded twice and 501 created twice: each counts once.
    expect(body.wallets).toBe(3);
    const strk = body.byAsset.find((a: any) => a.symbol === "STRK");
    const usdc = body.byAsset.find((a: any) => a.symbol === "USDC");
    expect(strk).toMatchObject({ launches: 1, volume: String(20n * E18), fees: String(E18 / 5n), decimals: 18 });
    expect(usdc).toMatchObject({ launches: 1, volume: "5000000", fees: "50000", decimals: 6 });
  });
});
