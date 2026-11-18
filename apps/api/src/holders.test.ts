import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { initialReserves, marketCap, spotPrice } from "@launchpad/chain";
import { type Db, eq, indexerState, launches, quoteTokenEvents, trades, transfers } from "@launchpad/db";
import { createTestDb, type TestDb } from "@launchpad/db/testing";
import { createApp } from "./app.js";

const E18 = 10n ** 18n;
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const ZERO = "0x" + "0".repeat(64);
const addr = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const TOKEN = addr(1);
const CURVE = addr(2);
const FACTORY = addr(3);
const CREATOR = addr(4);
const SUPPLY = 1_000_000_000n * E18;

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
  await db.delete(transfers);
  await db.delete(trades);
  await db.delete(launches);
  await db.delete(quoteTokenEvents);
  await db.delete(indexerState);
});

const get = async (url: string) => {
  const r = await app.inject({ method: "GET", url });
  return { status: r.statusCode, body: r.json() as any };
};

async function seed() {
  const o = initialReserves(1, 1_000n * E18);
  await db.insert(launches).values({
    token: TOKEN, curve: CURVE, factory: FACTORY, creator: CREATOR, quoteToken: STRK, launchId: "0", name: "Held", symbol: "HELD",
    metadataUri: "", preset: 1, creatorBps: 200, graduationRaise: (1_000n * E18).toString(), deployFee: (10n * E18).toString(),
    tradeFeeBps: 100, creatorFeeShareBps: 5000, createdBlock: 1, createdTx: addr(7), createdAt: new Date(),
    quoteReserve: o.quoteReserve.toString(), tokenReserve: o.tokenReserve.toString(),
    price: spotPrice(o.quoteReserve, o.tokenReserve).toString(), marketCap: marketCap(o.quoteReserve, o.tokenReserve).toString(),
  });
  let n = 0;
  const move = (from: string, to: string, value: bigint) => ({ id: `1:${TOKEN}:${n++}`, token: TOKEN, from, to, value: value.toString(), blockNumber: 1, indexInBlock: n, txHash: addr(8) });
  // mint to the factory, which sends 80% to the curve and 2% to the creator; then three wallets buy
  const buys: [number, bigint][] = [[20, 100_000_000n * E18], [21, 50_000_000n * E18], [22, 10_000_000n * E18]];
  await db.insert(transfers).values([
    move(ZERO, FACTORY, SUPPLY),
    move(FACTORY, CURVE, (SUPPLY * 80n) / 100n),
    move(FACTORY, CREATOR, (SUPPLY * 2n) / 100n),
    ...buys.map(([w, v]) => move(CURVE, addr(w), v)),
  ]);
}

describe("GET /launches/:token/holders", () => {
  it("lists holders biggest first with exact balances and shares", async () => {
    await seed();
    const { status, body } = await get(`/launches/${TOKEN}/holders`);
    expect(status).toBe(200);
    expect(body.supply).toBe(SUPPLY.toString());
    expect(body.items[0]).toEqual({ address: CURVE, role: "curve", balance: ((SUPPLY * 80n) / 100n - 160_000_000n * E18).toString(), shareBps: 6400 });
    expect(body.items.map((i: any) => i.role)).toEqual(["curve", "reserve", "holder", "holder", "creator", "holder"]);
    const total = body.items.reduce((a: bigint, i: any) => a + BigInt(i.balance), 0n);
    expect(total).toBe(SUPPLY);
  });

  it("never counts the curve or the reserve as holders, or in the concentration figure", async () => {
    await seed();
    const { body } = await get(`/launches/${TOKEN}/holders`);
    expect(body.count).toBe(6);
    expect(body.wallets).toBe(4); // creator + three buyers
    // top wallets: 100M, 50M, 20M (creator, 2%), 10M = 180M of 1B = 18.00%
    expect(body.top10ShareBps).toBe(1800);
    expect(body.creatorShareBps).toBe(200);
  });

  it("respects the page size but keeps the totals exact", async () => {
    await seed();
    const { body } = await get(`/launches/${TOKEN}/holders?limit=2`);
    expect(body.items).toHaveLength(2);
    expect(body.count).toBe(6);
    expect(body.wallets).toBe(4);
  });

  it("returns an empty list for a launch with no transfers yet", async () => {
    await seed();
    await db.delete(transfers);
    const { status, body } = await get(`/launches/${TOKEN}/holders`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ count: 0, wallets: 0, supply: "0", top10ShareBps: 0, creatorShareBps: 0, items: [] });
  });

  it("404s for an unknown token and 400s for a bad address or limit", async () => {
    expect((await get(`/launches/${addr(99)}/holders`)).status).toBe(404);
    expect((await get(`/launches/nope/holders`)).status).toBe(400);
    expect((await get(`/launches/${TOKEN}/holders?limit=0`)).status).toBe(400);
    expect((await get(`/launches/${TOKEN}/holders?limit=101`)).status).toBe(400);
  });
});

describe("launch metadata", () => {
  const uri = (doc: unknown) => "data:application/json;base64," + Buffer.from(JSON.stringify(doc)).toString("base64");

  it("shows what the launch said about itself, with safe links and the image path", async () => {
    await seed();
    const hash = "b".repeat(64);
    await db.update(launches).set({ metadataUri: uri({ v: 1, description: "A held token.", links: { x: "@held", web: "javascript:alert(1)" }, image: `sha256:${hash}` }) }).where(eq(launches.token, TOKEN));
    const { body } = await get(`/launches/${TOKEN}`);
    expect(body.metadata).toEqual({ description: "A held token.", links: { x: "https://x.com/held" }, image: `/images/${hash}` });
  });

  it("is always an object: empty when the URI is not something we read", async () => {
    await seed();
    await db.update(launches).set({ metadataUri: "ipfs://anything" }).where(eq(launches.token, TOKEN));
    const { body } = await get(`/launches/${TOKEN}`);
    expect(body.metadata).toEqual({ description: "", links: {}, image: null });
    expect(body.metadataUri).toBe("ipfs://anything");
  });
});
