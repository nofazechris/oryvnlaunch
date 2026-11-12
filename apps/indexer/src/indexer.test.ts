import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initialReserves } from "@launchpad/chain";
import { type Db, currentQuoteTokens, eq, launches, trades } from "@launchpad/db";
import { createTestDb, type TestDb } from "@launchpad/db/testing";
import { Indexer, type IndexerOptions, type Logger } from "./indexer.js";
import { getCursor } from "./project.js";
import { CURVE, E18, FACTORY, FakeNode, HEAD, STRK, clearDatabase, contractState, dump, fixture, runToIdle } from "./test-support.js";

let testDb: TestDb;
let db: Db;
beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
});
afterAll(async () => testDb.close());
beforeEach(async () => clearDatabase(db));

const options = (overrides: Partial<IndexerOptions> = {}): IndexerOptions => ({
  factory: FACTORY,
  startBlock: 0,
  overlapBlocks: 10,
  maxBlockRange: 1000,
  ...overrides,
});

const silent: Logger = () => {};

async function indexEverything(node = new FakeNode(), overrides: Partial<IndexerOptions> = {}) {
  const indexer = new Indexer(node, db, options(overrides), silent);
  await runToIdle(indexer);
  return { node, indexer };
}

describe("indexing the real scenario", () => {
  it("records the launch with everything the factory emitted", async () => {
    await indexEverything();
    const [launch] = await db.select().from(launches);
    expect(launch).toMatchObject({
      curve: CURVE,
      factory: FACTORY,
      quoteToken: STRK,
      launchId: "0",
      name: "Smoke Test",
      symbol: "SMOKE",
      metadataUri: "ipfs://smoke",
      preset: 1,
      creatorBps: 200,
      createdBlock: 6,
      graduated: true,
      graduatedBlock: 12,
    });
    expect(BigInt(launch?.graduationRaise ?? "0")).toBe(1_000n * E18);
    expect(BigInt(launch?.deployFee ?? "0")).toBe(10n * E18);
    expect(launch?.createdAt).toEqual(new Date(fixture.timestamps["6"]! * 1000));
    expect(launch?.graduatedAt).toEqual(new Date(fixture.timestamps["12"]! * 1000));
  });

  it("records every buy and sell, in order, with exact amounts", async () => {
    await indexEverything();
    const rows = await db.select().from(trades).orderBy(trades.blockNumber, trades.indexInBlock);
    expect(rows.map((r) => [r.side, r.blockNumber, BigInt(r.quoteAmount), BigInt(r.tokenAmount)])).toEqual([
      ["buy", 8, 50n * E18, 109_090_909_090_909_090_909_090_909n],
      ["sell", 10, 50n * E18, 109_090_909_090_909_090_909_090_909n],
      ["buy", 12, 1_000n * E18, 800_000_000n * E18],
      ["sell", 14, 750n * E18, 400_000_000n * E18],
    ]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(4);
  });

  it("stores each trade's price, worked out from that trade's own reserves", async () => {
    await indexEverything();
    const rows = await db.select().from(trades).orderBy(trades.blockNumber, trades.indexInBlock);
    // First buy: 550 STRK against 1,090,909,090,909,090,909,090,909,091 tokens. The expected
    // figure was computed outside this codebase: 550e18 * 1e36 / 1090909090909090909090909091.
    expect(BigInt(rows[0]?.price ?? "0")).toBe(504_166_666_666_666_666_666_666_666_624n);
    // The sell back to the opening reserves lands on the curve's opening price.
    expect(BigInt(rows[1]?.price ?? "0")).toBe(416_666_666_666_666_666_666_666_666_666n);
    // The last trade leaves the curve exactly where the contract says it is now.
    expect(BigInt(rows[3]?.price ?? "0")).toBe(contractState().spotPrice);
    // Buying pushes the price up and selling pulls it down.
    expect(BigInt(rows[0]?.price ?? "0")).toBeGreaterThan(BigInt(rows[1]?.price ?? "0"));
  });

  it("ends with a market snapshot identical to what the contract itself reports", async () => {
    await indexEverything();
    const [launch] = await db.select().from(launches);
    const onChain = contractState();
    expect(BigInt(launch?.quoteReserve ?? "0")).toBe(onChain.quoteReserve);
    expect(BigInt(launch?.tokenReserve ?? "0")).toBe(onChain.tokenReserve);
    expect(BigInt(launch?.price ?? "0")).toBe(onChain.spotPrice);
    expect(launch?.graduated).toBe(onChain.graduated);
    expect(launch?.tradeCount).toBe(4);
    expect(BigInt(launch?.volumeQuote ?? "0")).toBe(1_850n * E18);
    expect(BigInt(launch?.marketCap ?? "0")).toBe(937_500n * 10n ** 15n);
    expect(launch?.lastTradeAt).toEqual(new Date(fixture.timestamps["14"]! * 1000));
  });

  it("keeps the factory's quote asset settings as history and reads the current one back", async () => {
    await indexEverything();
    const current = await currentQuoteTokens(db);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ quoteToken: STRK, enabled: true, blockNumber: 4 });
    expect(BigInt(current[0]?.deployFee ?? "0")).toBe(10n * E18);
    expect(BigInt(current[0]?.graduationRaise ?? "0")).toBe(1_000n * E18);
  });

  it("remembers how far it got, and the hash of that block", async () => {
    await indexEverything();
    const cursor = await getCursor(db);
    expect(cursor?.block).toBe(HEAD);
    expect(BigInt(cursor?.hash ?? "0")).toBe(BigInt(new FakeNode().hashOf(HEAD)));
  });
});

describe("a launch before its first trade", () => {
  it("opens at the curve's starting reserves, so it already has a price and a market cap", async () => {
    const node = new FakeNode();
    node.head = 6;
    await indexEverything(node);
    const [launch] = await db.select().from(launches);
    const opening = initialReserves(1, 1_000n * E18);
    expect(BigInt(launch?.quoteReserve ?? "0")).toBe(opening.quoteReserve);
    expect(BigInt(launch?.tokenReserve ?? "0")).toBe(opening.tokenReserve);
    expect(launch).toMatchObject({ tradeCount: 0, volumeQuote: "0", graduated: false, lastTradeAt: null });
    expect(BigInt(launch?.price ?? "0")).toBeGreaterThan(0n);
  });
});

describe("reading the chain in different sized pieces", () => {
  it("gives the same database however the blocks are chunked, with or without overlap", async () => {
    const { indexer } = await indexEverything();
    expect(indexer).toBeDefined();
    const reference = await dump(db);
    expect(reference.trades).toHaveLength(4);

    for (const [maxBlockRange, overlapBlocks] of [[1, 0], [2, 3], [3, 10], [7, 0], [1000, 10]] as const) {
      await clearDatabase(db);
      await indexEverything(new FakeNode(), { maxBlockRange, overlapBlocks });
      expect(await dump(db), `range ${maxBlockRange}, overlap ${overlapBlocks}`).toEqual(reference);
    }
  });

  it("gives the same database when the chain grows while indexing", async () => {
    const reference = await (async () => {
      await indexEverything();
      return dump(db);
    })();
    await clearDatabase(db);

    const node = new FakeNode();
    const indexer = new Indexer(node, db, options({ maxBlockRange: 3 }), silent);
    for (let head = 1; head <= HEAD; head += 1) {
      node.head = head;
      await runToIdle(indexer);
    }
    expect(await dump(db)).toEqual(reference);
  });

  it("does nothing, and asks for no events, when there are no new blocks", async () => {
    const { node, indexer } = await indexEverything();
    node.requests.length = 0;
    const before = await dump(db);
    expect(await indexer.tick()).toEqual({ status: "idle", head: HEAD });
    expect(node.requests.filter((r) => r.startsWith("getEvents"))).toEqual([]);
    expect(await dump(db)).toEqual(before);
  });

  it("carries on from where it stopped after a restart, without re-reading old blocks", async () => {
    const node = new FakeNode();
    node.head = 8;
    await runToIdle(new Indexer(node, db, options(), silent));
    node.head = HEAD;
    node.requests.length = 0;

    const restarted = new Indexer(node, db, options(), silent); // a fresh process, same database
    const first = await restarted.tick();
    expect(first).toMatchObject({ status: "indexed", from: 9, to: HEAD });
    expect(node.requests.some((r) => /getEvents \S+ [0-8]-/.test(r))).toBe(false);
    expect((await db.select().from(trades)).length).toBe(4);
  });

  it("indexes nothing before START_BLOCK, which is why it must be set to the factory's deploy block", async () => {
    await indexEverything(new FakeNode(), { startBlock: 7 });
    // The launch was created in block 6, so it was never seen, and a curve that was never seen is never read.
    expect(await db.select().from(launches)).toEqual([]);
    expect(await db.select().from(trades)).toEqual([]);
  });
});

describe("when the chain changes under the indexer", () => {
  it("rebuilds after a reorg at the same height, dropping what the old blocks said", async () => {
    const { node, indexer } = await indexEverything();
    expect((await db.select().from(launches))[0]?.graduated).toBe(true);

    // Blocks 12 onwards are replaced and the graduating buy is not in the new block 12.
    // The head does not move, so only the block hash can reveal this.
    node.fork(12, (events) => events.filter((e) => !(e.block_number === 12)));
    const result = await indexer.tick();
    expect(result).toMatchObject({ status: "indexed", head: HEAD });

    const rows = await db.select().from(trades).orderBy(trades.blockNumber);
    expect(rows.map((r) => r.blockNumber)).toEqual([8, 10, 14]);
    const [launch] = await db.select().from(launches);
    expect(launch).toMatchObject({ graduated: false, graduatedBlock: null, graduatedAt: null, tradeCount: 3 });
    expect(launch?.lastTradeAt).toEqual(new Date((fixture.timestamps["14"]! + 1) * 1000)); // the new block 14's time
    expect((await getCursor(db))?.hash).toBe(node.hashOf(HEAD));
  });

  it("clears everything past a rollback when the node's head falls behind the indexer", async () => {
    const { node, indexer } = await indexEverything();

    // The chain rolls back to block 11 and blocks from 10 on differ: block 12 and 14 never happened.
    node.head = 11;
    node.fork(10, (events) => events.filter((e) => e.block_number < 10));
    await indexer.tick();

    const rows = await db.select().from(trades).orderBy(trades.blockNumber);
    expect(rows.map((r) => r.blockNumber)).toEqual([8]); // the sell at block 10 is gone too
    const [launch] = await db.select().from(launches);
    expect(launch).toMatchObject({ graduated: false, tradeCount: 1 });
    expect((await getCursor(db))?.block).toBe(11);
  });

  it("empties the database when the whole chain is replaced by an empty one (a devnet reset)", async () => {
    const { node, indexer } = await indexEverything();
    node.head = 3;
    node.fork(0, () => []);
    await indexer.tick();
    expect(await db.select().from(launches)).toEqual([]);
    expect(await db.select().from(trades)).toEqual([]);
    expect(await currentQuoteTokens(db)).toEqual([]);
    expect((await getCursor(db))?.block).toBe(3);
  });

  it("restores an earlier quote asset setting when the change that replaced it is reorged away", async () => {
    // Factory events: a first setting at block 4 (real), then a second change at block 12.
    const node = new FakeNode();
    const first = fixture.factoryEvents.find((e) => e.block_number === 4 && e.data.length === 5)!;
    const changed = { ...first, block_number: 12, data: ["0x0", ...first.data.slice(1)] }; // enabled -> false
    node.events.push(changed);
    const indexer = new Indexer(node, db, options(), silent);
    await runToIdle(indexer);
    expect((await currentQuoteTokens(db))[0]).toMatchObject({ enabled: false, blockNumber: 12 });

    node.fork(12, (events) => events.filter((e) => e !== changed));
    await indexer.tick();
    expect((await currentQuoteTokens(db))[0]).toMatchObject({ enabled: true, blockNumber: 4 });
  });
});

describe("failing safely", () => {
  it("writes nothing and does not advance when an event cannot be decoded", async () => {
    const node = new FakeNode();
    node.events = node.events.map((e) => (e.block_number === 8 ? { ...e, data: [...e.data, "0x1"] } : e));
    const indexer = new Indexer(node, db, options(), silent);
    await expect(indexer.tick()).rejects.toThrow(/left unread/);
    expect(await getCursor(db)).toBeNull();
    expect(await db.select().from(launches)).toEqual([]);
  });

  it("keeps going from the last good point after a node outage", async () => {
    const node = new FakeNode();
    node.head = 8;
    const indexer = new Indexer(node, db, options(), silent);
    await runToIdle(indexer);
    node.head = HEAD;
    node.failNext = 1;
    await expect(indexer.tick()).rejects.toThrow(/node unavailable/);
    expect((await getCursor(db))?.block).toBe(8);
    await runToIdle(indexer);
    expect((await getCursor(db))?.block).toBe(HEAD);
    expect((await db.select().from(trades)).length).toBe(4);
  });

  it("retries in run() with a pause and stops promptly when told to", async () => {
    const node = new FakeNode();
    node.failNext = 2;
    const logs: string[] = [];
    const indexer = new Indexer(node, db, options(), (level, message) => logs.push(`${level}: ${message}`));
    const stop = new AbortController();
    const running = indexer.run(stop.signal, 1);

    // Wait for it to index everything despite the two failures, then stop it.
    const deadline = Date.now() + 20_000;
    while ((await getCursor(db))?.block !== HEAD && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    stop.abort();
    await running;

    expect((await getCursor(db))?.block).toBe(HEAD);
    expect(logs.filter((l) => l.startsWith("error: indexing failed"))).toHaveLength(2);
    expect(logs).toContain("info: indexed blocks");
  });
});

describe("what the database holds", () => {
  it("has one launch per curve and one trade per event, however many times blocks are re-read", async () => {
    const { indexer } = await indexEverything(new FakeNode(), { overlapBlocks: 20 });
    for (let i = 0; i < 3; i += 1) await indexer.tick();
    expect(await db.select().from(launches).where(eq(launches.curve, CURVE))).toHaveLength(1);
    expect(await db.select().from(trades)).toHaveLength(4);
  });
});
