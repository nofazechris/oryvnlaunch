import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { initialReserves, marketCap, spotPrice } from "@launchpad/chain";
import { type Db, feeAssetEvents, indexerState, launches, quoteTokenEvents, trades } from "@launchpad/db";
import { createTestDb, type TestDb } from "@launchpad/db/testing";
import { createApp } from "./app.js";

const E18 = 10n ** 18n;
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
  await db.delete(feeAssetEvents);
  await db.delete(quoteTokenEvents);
  await db.delete(indexerState);
});

const get = async (url: string) => {
  const r = await app.inject({ method: "GET", url });
  return { status: r.statusCode, body: r.json() as any };
};

async function seedLaunch(n: number, feeToken: string | null) {
  const o = initialReserves(1, 1_000n * E18);
  await db.insert(launches).values({
    token: addr(n), curve: addr(1000 + n), factory: addr(9), creator: addr(500), quoteToken: STRK, launchId: String(n),
    name: `Token ${n}`, symbol: `T${n}`, metadataUri: "", preset: 1, creatorBps: 0, graduationRaise: (1_000n * E18).toString(),
    deployFee: feeToken === USDC ? "2000000" : String(10n * E18), feeToken, tradeFeeBps: 100, creatorFeeShareBps: 5000,
    createdBlock: n, createdTx: addr(7), createdAt: new Date(),
    quoteReserve: o.quoteReserve.toString(), tokenReserve: o.tokenReserve.toString(),
    price: spotPrice(o.quoteReserve, o.tokenReserve).toString(), marketCap: marketCap(o.quoteReserve, o.tokenReserve).toString(),
  });
}

describe("GET /fee-assets", () => {
  const row = (id: string, token: string, enabled: boolean, fee: string, block: number) => ({ id, feeToken: token, enabled, deployFee: fee, blockNumber: block, indexInBlock: 0 });

  it("lists each asset a creator can pay the deploy fee in, with its current fee", async () => {
    await db.insert(feeAssetEvents).values([
      row("4:f:0", STRK, true, String(10n * E18), 4),
      row("4:f:1", USDC, true, "5000000", 4),
      row("9:f:0", USDC, true, "2000000", 9), // repriced to 2 USDC
    ]);
    const { status, body } = await get("/fee-assets");
    expect(status).toBe(200);
    const by = Object.fromEntries(body.items.map((i: any) => [i.symbol, i]));
    expect(by.STRK).toMatchObject({ enabled: true, decimals: 18, deployFee: String(10n * E18) });
    expect(by.USDC).toMatchObject({ enabled: true, decimals: 6, deployFee: "2000000", sinceBlock: 9 });
  });

  it("shows an asset the factory switched off as disabled, so the app can stop offering it", async () => {
    await db.insert(feeAssetEvents).values([row("4:f:1", USDC, true, "2000000", 4), row("12:f:0", USDC, false, "2000000", 12)]);
    const { body } = await get("/fee-assets");
    expect(body.items[0]).toMatchObject({ symbol: "USDC", enabled: false });
  });

  it("is empty before the indexer has seen the factory", async () => {
    expect((await get("/fee-assets")).body).toEqual({ items: [] });
  });
});

describe("a launch's fee asset", () => {
  it("says USDC paid the fee while the token itself trades in STRK", async () => {
    await seedLaunch(1, USDC);
    const { body } = await get(`/launches/${addr(1)}`);
    expect(body.quote.symbol).toBe("STRK");
    expect(body.feeAsset).toMatchObject({ symbol: "USDC", decimals: 6 });
    expect(body.deployFee).toBe("2000000");
  });

  it("falls back to the trading asset for launches indexed before fee assets existed", async () => {
    await seedLaunch(2, null);
    const { body } = await get(`/launches/${addr(2)}`);
    expect(body.feeAsset).toMatchObject({ symbol: "STRK" });
  });
});
