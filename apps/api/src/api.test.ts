import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { graduationProgressBps, initialReserves, marketCap, spotPrice, virtualQuote } from "@launchpad/chain";
import { type Db, eq, indexerState, launches, quoteTokenEvents, trades } from "@launchpad/db";
import { createTestDb, type TestDb } from "@launchpad/db/testing";
import { createApp } from "./app.js";

const E18 = 10n ** 18n;
const USDC_UNIT = 10n ** 6n;
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const USDC = "0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343";
const addr = (n: number) => "0x" + n.toString(16).padStart(64, "0");

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

interface SeedOptions {
  n: number;
  quote: string;
  preset: number;
  raise: bigint;
  /** How much of the raise the curve holds, in basis points of the raise. */
  raisedBps?: number;
  graduated?: boolean;
  volume?: bigint;
  createdAt: string;
  creator?: string;
  name?: string;
}

/** Insert a launch with reserves consistent with the curve maths. Tokens are addr(n). */
async function seedLaunch(o: SeedOptions) {
  const opening = initialReserves(o.preset, o.raise);
  const raised = (o.raise * BigInt(o.raisedBps ?? 0)) / 10_000n;
  // Pull the reserves along the curve: quote reserve up by what was raised; token reserve from k.
  const quoteReserve = opening.quoteReserve + raised;
  const k = opening.quoteReserve * opening.tokenReserve;
  const tokenReserve = (k + quoteReserve - 1n) / quoteReserve;
  await db.insert(launches).values({
    token: addr(o.n),
    curve: addr(1000 + o.n),
    factory: addr(9),
    creator: o.creator ?? addr(500),
    quoteToken: o.quote,
    launchId: String(o.n),
    name: o.name ?? `Token ${o.n}`,
    symbol: `T${o.n}`,
    metadataUri: "ipfs://x",
    preset: o.preset,
    creatorBps: 0,
    graduationRaise: o.raise.toString(),
    deployFee: "10",
    createdBlock: o.n,
    createdTx: addr(2000 + o.n),
    createdAt: new Date(o.createdAt),
    graduated: o.graduated ?? false,
    graduatedBlock: o.graduated ? o.n + 1 : null,
    graduatedAt: o.graduated ? new Date(o.createdAt) : null,
    quoteReserve: quoteReserve.toString(),
    tokenReserve: tokenReserve.toString(),
    price: spotPrice(quoteReserve, tokenReserve).toString(),
    marketCap: marketCap(quoteReserve, tokenReserve).toString(),
    tradeCount: 0,
    volumeQuote: (o.volume ?? 0n).toString(),
  });
}

/** Four launches across both assets and three presets. */
async function seedMarket() {
  await seedLaunch({ n: 1, quote: STRK, preset: 1, raise: 1_000n * E18, raisedBps: 0, createdAt: "2026-11-01T10:00:00Z", volume: 0n });
  await seedLaunch({ n: 2, quote: STRK, preset: 2, raise: 1_000n * E18, raisedBps: 4_000, createdAt: "2026-11-02T10:00:00Z", volume: 700n * E18, creator: addr(501) });
  await seedLaunch({ n: 3, quote: USDC, preset: 1, raise: 10_000n * USDC_UNIT, raisedBps: 10_000, graduated: true, createdAt: "2026-11-03T10:00:00Z", volume: 25_000n * USDC_UNIT });
  await seedLaunch({ n: 4, quote: STRK, preset: 0, raise: 1_000n * E18, raisedBps: 2_500, createdAt: "2026-11-04T10:00:00Z", volume: 90n * E18 });
}

const get = async (url: string) => {
  const response = await app.inject({ method: "GET", url });
  return { status: response.statusCode, body: response.json() as any, headers: response.headers };
};
const tokensOf = (body: any) => body.items.map((i: any) => Number(BigInt(i.token)));

describe("GET /launches", () => {
  it("lists newest first by default, with amounts as exact strings", async () => {
    await seedMarket();
    const { status, body } = await get("/launches");
    expect(status).toBe(200);
    expect(tokensOf(body)).toEqual([4, 3, 2, 1]);
    expect(body).toMatchObject({ total: 4, limit: 20, offset: 0 });
    const first = body.items[0];
    expect(first).toMatchObject({
      name: "Token 4",
      symbol: "T4",
      quote: { address: STRK, symbol: "STRK", decimals: 18 },
      preset: { id: 0, name: "Gentle" },
      graduated: false,
    });
    for (const field of ["quoteReserve", "tokenReserve", "price", "marketCap", "volumeQuote"]) {
      expect(typeof first.market[field], field).toBe("string");
    }
    expect(typeof first.graduationRaise).toBe("string");
  });

  it("describes a USDC launch with USDC's symbol and 6 decimals", async () => {
    await seedMarket();
    const { body } = await get("/launches?quote=" + USDC);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].quote).toEqual({ address: USDC, symbol: "USDC", decimals: 6 });
  });

  it("labels an asset it does not recognise as unknown instead of guessing", async () => {
    await seedLaunch({ n: 7, quote: addr(777), preset: 1, raise: 1_000n * E18, createdAt: "2026-11-05T10:00:00Z" });
    const { body } = await get("/launches");
    expect(body.items[0].quote).toEqual({ address: addr(777), symbol: null, decimals: null });
  });

  it("filters by asset, creator and graduation", async () => {
    await seedMarket();
    expect(tokensOf((await get("/launches?quote=" + STRK)).body)).toEqual([4, 2, 1]);
    expect(tokensOf((await get("/launches?creator=" + addr(501))).body)).toEqual([2]);
    expect(tokensOf((await get("/launches?graduated=true")).body)).toEqual([3]);
    expect(tokensOf((await get("/launches?graduated=false")).body)).toEqual([4, 2, 1]);
    expect(tokensOf((await get(`/launches?quote=${STRK}&graduated=false&creator=${addr(500)}`)).body)).toEqual([4, 1]);
  });

  it("accepts addresses without padding and in any letter case", async () => {
    await seedMarket();
    const { body } = await get("/launches?creator=0x1F5");
    expect(body.total).toBe(1);
    expect(tokensOf(body)).toEqual([2]);
  });

  it("pages with limit and offset, and reports the total", async () => {
    await seedMarket();
    const first = (await get("/launches?limit=2")).body;
    const second = (await get("/launches?limit=2&offset=2")).body;
    expect(tokensOf(first)).toEqual([4, 3]);
    expect(tokensOf(second)).toEqual([2, 1]);
    expect(first.total).toBe(4);
    expect((await get("/launches?offset=50")).body.items).toEqual([]);
  });

  describe("sorting", () => {
    it("ranks by graduation progress across different assets", async () => {
      await seedMarket();
      const { body } = await get("/launches?sort=progress");
      // USDC graduated launch (100%), STRK Steep at 40%, STRK Gentle at 25%, fresh launch at 0%
      expect(tokensOf(body)).toEqual([3, 2, 4, 1]);
      expect(body.items.map((i: any) => i.market.progressBps)).toEqual([10_000, 4_000, 2_500, 0]);
    });

    it("orders by progress the same way the numbers it shows would sort", async () => {
      await seedMarket();
      const { body } = await get("/launches?sort=progress");
      const shown = body.items.map((i: any) => i.market.progressBps);
      expect(shown).toEqual([...shown].sort((a: number, b: number) => b - a));
      // and each shown figure equals the rule in @launchpad/chain, not a second copy of it
      for (const item of body.items) {
        const expected = graduationProgressBps(BigInt(item.market.quoteReserve), item.preset.id, BigInt(item.graduationRaise));
        expect(item.market.progressBps).toBe(expected);
      }
    });

    it("ranks by market cap and by volume within one asset", async () => {
      await seedMarket();
      expect(tokensOf((await get(`/launches?sort=marketcap&quote=${STRK}`)).body)).toEqual([2, 4, 1]);
      expect(tokensOf((await get(`/launches?sort=volume&quote=${STRK}`)).body)).toEqual([2, 4, 1]);
    });

    it("refuses to rank volume or market cap across assets, and says why", async () => {
      await seedMarket();
      for (const sort of ["volume", "marketcap"]) {
        const { status, body } = await get(`/launches?sort=${sort}`);
        expect(status).toBe(400);
        expect(JSON.stringify(body)).toMatch(/quote=<asset address>/);
        expect(JSON.stringify(body)).toMatch(/sort=progress/);
      }
    });

    it("compares market caps as numbers, not as text", async () => {
      // As strings "9..." sorts after "1000...", as numbers it must not.
      await seedLaunch({ n: 1, quote: STRK, preset: 1, raise: 9n * E18, createdAt: "2026-11-01T00:00:00Z" });
      await seedLaunch({ n: 2, quote: STRK, preset: 1, raise: 1_000n * E18, createdAt: "2026-11-02T00:00:00Z" });
      expect(tokensOf((await get(`/launches?sort=marketcap&quote=${STRK}`)).body)).toEqual([2, 1]);
    });
  });

  it("keeps a graduated launch at 100% even after sells have lowered its reserve", async () => {
    await seedMarket();
    // Graduated, then people sold: the curve now holds only 25% of the raise.
    await seedLaunch({ n: 5, quote: STRK, preset: 1, raise: 1_000n * E18, raisedBps: 2_500, graduated: true, createdAt: "2026-11-05T10:00:00Z" });

    const detail = (await get("/launches/" + addr(5))).body;
    expect(detail.graduated).toBe(true);
    expect(detail.market.progressBps).toBe(10_000);

    // It must also rank with the graduated launches, ahead of an ungraduated launch at 40%.
    const { body } = await get("/launches?sort=progress");
    expect(tokensOf(body).slice(0, 3).sort()).toEqual([3, 5, 2].sort());
    expect(tokensOf(body)[2]).toBe(2);
    expect(body.items.map((i: any) => i.market.progressBps)).toEqual([10_000, 10_000, 4_000, 2_500, 0]);
  });

  describe("rejecting bad input", () => {
    it.each([
      ["limit=0"],
      ["limit=101"],
      ["limit=abc"],
      ["offset=-1"],
      ["sort=cheapest"],
      ["quote=nope"],
      ["creator=0xZZ"],
      ["graduated=maybe"],
    ])("returns 400 for %s", async (query) => {
      const { status, body } = await get("/launches?" + query);
      expect(status).toBe(400);
      expect(body.error).toBe("Bad Request");
      expect(Array.isArray(body.message)).toBe(true);
    });

    it("names the offending field", async () => {
      const { body } = await get("/launches?limit=0&sort=bogus");
      expect(body.message.map((m: any) => m.field).sort()).toEqual(["limit", "sort"]);
    });
  });
});

describe("GET /launches/:token", () => {
  it("returns one launch with its market numbers and graduation progress", async () => {
    await seedMarket();
    const { status, body } = await get("/launches/" + addr(2));
    expect(status).toBe(200);
    expect(body).toMatchObject({ token: addr(2), curve: addr(1002), preset: { id: 2, name: "Steep" } });
    expect(body.market.progressBps).toBe(4_000);
    expect(BigInt(body.market.quoteReserve)).toBeGreaterThan(virtualQuote(2, 1_000n * E18));
  });

  it("accepts an unpadded, mixed-case address and returns the canonical one", async () => {
    await seedMarket();
    const { status, body } = await get("/launches/0x2");
    expect(status).toBe(200);
    expect(body.token).toBe(addr(2));
  });

  it("returns 404 for a token that was never launched", async () => {
    await seedMarket();
    const { status, body } = await get("/launches/" + addr(99));
    expect(status).toBe(404);
    expect(body.message).toContain(addr(99));
  });

  it("returns 400 for something that is not an address", async () => {
    expect((await get("/launches/not-an-address")).status).toBe(400);
    expect((await get("/launches/0x" + "f".repeat(65))).status).toBe(400);
  });

  it("keeps a 256-bit value exact, which a JSON number could not", async () => {
    await seedMarket();
    const huge = (2n ** 255n + 1n).toString();
    await db.update(launches).set({ volumeQuote: huge });
    const { body } = await get("/launches/" + addr(1));
    expect(body.market.volumeQuote).toBe(huge);
    expect(Number(huge).toString()).not.toBe(huge); // proves a float would have corrupted it
  });
});

describe("GET /launches/:token/trades", () => {
  async function seedTrades() {
    await seedMarket();
    const base = { curve: addr(1002), token: addr(2), trader: addr(7), quoteAmount: "5", tokenAmount: "5", quoteReserve: "5", tokenReserve: "5", price: "1" };
    for (const [i, [block, index, side]] of (
      [[10, 0, "buy"], [10, 1, "sell"], [11, 0, "buy"], [12, 2, "buy"]] as const
    ).entries()) {
      await db.insert(trades).values({ ...base, id: `${block}:c:${index}`, side, blockNumber: block, indexInBlock: index, txHash: addr(3000 + i), blockTime: new Date(Date.UTC(2026, 10, 2, 12, i)) });
    }
    await db.update(launches).set({ tradeCount: 4 }).where(eq(launches.token, addr(2)));
  }

  it("lists trades newest first, using block and position within the block", async () => {
    await seedTrades();
    const { status, body } = await get(`/launches/${addr(2)}/trades`);
    expect(status).toBe(200);
    expect(body.items.map((t: any) => t.id)).toEqual(["12:c:2", "11:c:0", "10:c:1", "10:c:0"]);
    expect(body.items[0]).toMatchObject({ side: "buy", trader: addr(7), quoteAmount: "5", blockNumber: 12 });
    expect(typeof body.items[0].quoteAmount).toBe("string");
    expect(body.items[0].blockTime).toMatch(/^2026-11-02T12:\d\d:00\.000Z$/);
  });

  it("pages through them", async () => {
    await seedTrades();
    const page2 = (await get(`/launches/${addr(2)}/trades?limit=2&offset=2`)).body;
    expect(page2.items.map((t: any) => t.id)).toEqual(["10:c:1", "10:c:0"]);
    expect(page2).toMatchObject({ total: 4, limit: 2, offset: 2 });
  });

  it("returns an empty list, not an error, for a launch with no trades", async () => {
    await seedMarket();
    const { status, body } = await get(`/launches/${addr(1)}/trades`);
    expect(status).toBe(200);
    expect(body.items).toEqual([]);
  });

  it("returns 404 for an unknown token and 400 for a bad limit", async () => {
    await seedMarket();
    expect((await get(`/launches/${addr(99)}/trades`)).status).toBe(404);
    expect((await get(`/launches/${addr(1)}/trades?limit=1000`)).status).toBe(400);
  });
});

describe("GET /quote-tokens", () => {
  it("lists each asset's current setting, from the newest change event", async () => {
    const row = (id: string, quote: string, enabled: boolean, fee: string, block: number) => ({
      id,
      quoteToken: quote,
      enabled,
      deployFee: fee,
      graduationRaise: "1000",
      blockNumber: block,
      indexInBlock: 0,
    });
    await db.insert(quoteTokenEvents).values([
      row("4:f:0", STRK, true, String(10n * E18), 4),
      row("9:f:0", STRK, true, String(20n * E18), 9), // repriced later
      row("4:f:1", USDC, true, String(15n * USDC_UNIT), 4),
      row("12:f:0", USDC, false, String(15n * USDC_UNIT), 12), // then switched off
    ]);
    const { status, body } = await get("/quote-tokens");
    expect(status).toBe(200);
    const bySymbol = Object.fromEntries(body.items.map((i: any) => [i.symbol, i]));
    expect(bySymbol.STRK).toMatchObject({ enabled: true, deployFee: String(20n * E18), decimals: 18, sinceBlock: 9 });
    expect(bySymbol.USDC).toMatchObject({ enabled: false, decimals: 6, sinceBlock: 12 });
  });

  it("is an empty list before the indexer has seen the factory", async () => {
    expect((await get("/quote-tokens")).body).toEqual({ items: [] });
  });
});

describe("GET /health", () => {
  it("is ok with no indexer progress yet, and says so", async () => {
    const { status, body } = await get("/health");
    expect(status).toBe(200);
    expect(body).toEqual({ status: "ok", database: "ok", indexer: null });
  });

  it("reports how far the indexer has got and how fresh that is", async () => {
    await db.insert(indexerState).values({ key: "cursor", value: "12345", updatedAt: new Date(Date.now() - 42_000) });
    const { body } = await get("/health");
    expect(body.indexer.block).toBe(12345);
    expect(body.indexer.ageSeconds).toBeGreaterThanOrEqual(41);
    expect(body.indexer.ageSeconds).toBeLessThan(60);
  });
});

describe("what the API does not do", () => {
  it("has no write routes", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const response = await app.inject({ method, url: "/launches", payload: {} });
      expect(response.statusCode, method).toBe(404);
    }
  });

  it("answers unknown routes with 404", async () => {
    expect((await get("/nope")).status).toBe(404);
  });

  it("does not allow any browser origin unless configured", async () => {
    const response = await app.inject({ method: "GET", url: "/launches", headers: { origin: "https://evil.example" } });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("CORS when configured", () => {
  let corsApp: NestFastifyApplication;
  beforeAll(async () => {
    corsApp = await createApp(db, { corsOrigins: ["https://oryvnlaunch.com"] });
  });
  afterAll(async () => corsApp.close());

  it("lets the configured site read the API", async () => {
    const response = await corsApp.inject({ method: "GET", url: "/health", headers: { origin: "https://oryvnlaunch.com" } });
    expect(response.headers["access-control-allow-origin"]).toBe("https://oryvnlaunch.com");
  });

  it("still refuses any other site", async () => {
    const response = await corsApp.inject({ method: "GET", url: "/health", headers: { origin: "https://evil.example" } });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("only advertises read methods in the preflight", async () => {
    const response = await corsApp.inject({
      method: "OPTIONS",
      url: "/launches",
      headers: { origin: "https://oryvnlaunch.com", "access-control-request-method": "POST" },
    });
    expect(String(response.headers["access-control-allow-methods"] ?? "")).not.toMatch(/POST|PUT|DELETE|PATCH/);
  });
});
