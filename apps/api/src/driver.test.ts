// The other API tests run on an in-process Postgres. This one runs the SAME endpoints over the
// production database driver (`postgres`, talking the Postgres wire protocol over TCP), which is what
// really serves traffic. The two treat some queries differently: a raw SQL fragment that works in-process
// can fail on the real driver (a JavaScript date, for instance, is not converted without its column).
// That exact bug shipped once, and only this kind of test finds it.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initialReserves, marketCap, spotPrice } from "@launchpad/chain";
import { type DbConnection, connect, launches, runMigrations, trades } from "@launchpad/db";
import { createApp } from "./app.js";

const PORT = 54_331;
const URL = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
const E18 = 10n ** 18n;
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const addr = (n: number) => "0x" + n.toString(16).padStart(64, "0");
const MIN = 60_000;
const HOUR = 60 * MIN;

let pg: PGlite;
let server: PGLiteSocketServer;
let connection: DbConnection;
let app: NestFastifyApplication;

const get = async (url: string) => {
  const r = await app.inject({ method: "GET", url });
  return { status: r.statusCode, body: r.json() as any };
};

beforeAll(async () => {
  pg = await PGlite.create();
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 10 });
  await server.start();
  await runMigrations(URL);
  connection = connect(URL, { max: 3 });
  app = await createApp(connection.db);

  const o = initialReserves(1, 1_000n * E18);
  const price = spotPrice(o.quoteReserve, o.tokenReserve);
  const now = Date.now();
  await connection.db.insert(launches).values({
    token: addr(1), curve: addr(1001), factory: addr(9), creator: addr(500), quoteToken: STRK, launchId: "0",
    name: "Real Driver", symbol: "RD", metadataUri: "ipfs://x", preset: 1, creatorBps: 0,
    graduationRaise: String(1_000n * E18), deployFee: String(10n * E18), tradeFeeBps: 100, creatorFeeShareBps: 5_000,
    createdBlock: 1, createdTx: addr(2001), createdAt: new Date(now - 40 * HOUR),
    graduated: true, graduatedBlock: 5, graduatedAt: new Date(now - 10 * MIN),
    quoteReserve: o.quoteReserve.toString(), tokenReserve: o.tokenReserve.toString(),
    price: (price * 2n).toString(), marketCap: marketCap(o.quoteReserve, o.tokenReserve).toString(),
    tradeCount: 3, volumeQuote: String(30n * E18), feesTotal: String(3n * E18 / 10n),
  });
  const base = { curve: addr(1001), token: addr(1), trader: addr(700), quoteAmount: String(10n * E18), fee: String(E18 / 10n), tokenAmount: String(5n * E18), quoteReserve: "1", tokenReserve: "1" };
  await connection.db.insert(trades).values([
    { ...base, id: "2:c:0", side: "buy", price: String(price), blockNumber: 2, indexInBlock: 0, txHash: addr(3002), blockTime: new Date(now - 30 * HOUR) },
    { ...base, id: "3:c:0", side: "buy", price: String(price + 5n), blockNumber: 3, indexInBlock: 0, txHash: addr(3003), blockTime: new Date(now - 90_000) },
    { ...base, id: "4:c:0", side: "sell", price: String(price * 2n), blockNumber: 4, indexInBlock: 0, txHash: addr(3004), blockTime: new Date(now - 30_000) },
  ]);
}, 90_000);

afterAll(async () => {
  await app?.close();
  await connection?.close();
  await server?.stop();
  await pg?.close();
});

describe("every read endpoint over the production database driver", () => {
  it("lists launches with their 24 hour change", async () => {
    const { status, body } = await get("/launches");
    expect(status).toBe(200);
    expect(body.items[0]).toMatchObject({ symbol: "RD", graduated: true });
    // price doubled against the trade 30 hours ago
    expect(body.items[0].market.change24hBps).toBe(10_000);
  });

  it("returns one launch and its trades", async () => {
    expect((await get("/launches/" + addr(1))).body.market.progressBps).toBe(10_000);
    const trades = (await get(`/launches/${addr(1)}/trades`)).body;
    expect(trades.items.map((t: any) => t.id)).toEqual(["4:c:0", "3:c:0", "2:c:0"]);
  });

  it("returns candles (the query that failed on the real driver)", async () => {
    const { status, body } = await get(`/launches/${addr(1)}/candles?interval=1m&limit=5`);
    expect(status).toBe(200);
    expect(body.items.length).toBeGreaterThan(0);
    expect(BigInt(body.items.at(-1).close)).toBeGreaterThan(0n);
    expect(body.items.reduce((n: number, c: any) => n + c.trades, 0)).toBe(2); // the two trades in the last few minutes
  });

  it("returns the activity feed, which joins trades to launches", async () => {
    const { status, body } = await get("/activity?limit=10");
    expect(status).toBe(200);
    expect(body.items.map((e: any) => e.kind)).toEqual(["sell", "buy", "graduation", "buy", "launch"].filter((k) => k !== "graduation" || true));
    expect((await get(`/activity?wallet=${addr(700)}`)).body.items).toHaveLength(3);
  });

  it("returns the platform stats, with the filtered count and the grouping", async () => {
    const { status, body } = await get("/stats");
    expect(status).toBe(200);
    expect(body).toMatchObject({ launches: 1, graduated: 1, trades: 3, wallets: 2 });
    expect(body.byAsset[0]).toMatchObject({ symbol: "STRK", launches: 1, volume: String(30n * E18) });
  });

  it("answers the health check", async () => {
    expect((await get("/health")).status).toBe(200);
  });
});
