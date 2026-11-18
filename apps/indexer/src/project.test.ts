import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decodeCurveEvent, decodeFactoryEvent, type CurveEvent, type FactoryEvent } from "@launchpad/chain";
import { type Db, launches, trades } from "@launchpad/db";
import { createTestDb, type TestDb } from "@launchpad/db/testing";
import { applyBatch, getCursor, type Batch } from "./project.js";
import { CURVE, clearDatabase, dump, fixture } from "./test-support.js";

let testDb: TestDb;
let db: Db;
beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
});
afterAll(async () => testDb.close());
beforeEach(async () => clearDatabase(db));

const factoryEvents: FactoryEvent[] = fixture.factoryEvents.flatMap((raw, i) => decodeFactoryEvent(raw, i) ?? []);
const curveEvents: CurveEvent[] = (Object.values(fixture.curveEvents)[0] ?? []).flatMap((raw, i) => decodeCurveEvent(raw, i) ?? []);
const allBlocks = new Map(Object.entries(fixture.timestamps).map(([block, time]) => [Number(block), time]));

const batch = (overrides: Partial<Batch> = {}): Batch => ({
  from: 0,
  to: 14,
  toHash: "0x1234",
  factoryEvents,
  curveEvents,
  tokenEvents: [],
  blockTimes: allBlocks,
  ...overrides,
});

describe("applyBatch", () => {
  it("applying the same batch twice leaves the database exactly as applying it once", async () => {
    await applyBatch(db, batch());
    const once = await dump(db);
    await applyBatch(db, batch());
    expect(await dump(db)).toEqual(once);
    expect(once.trades).toHaveLength(5);
  });

  it("refuses an event from a curve whose launch was never indexed, and writes nothing", async () => {
    // Trades for a curve we have no launch for: the factory event is missing.
    await expect(applyBatch(db, batch({ factoryEvents: [] }))).rejects.toThrow(/unknown curve/);
    expect(await db.select().from(trades)).toEqual([]);
    expect(await getCursor(db)).toBeNull();
  });

  it("rolls back every write if any step fails part-way (here: a block with no timestamp)", async () => {
    // The launch (block 6) and the first trades are fine; the graduating buy's block (12) has no time.
    const missing = new Map(allBlocks);
    missing.delete(12);
    await expect(applyBatch(db, batch({ blockTimes: missing }))).rejects.toThrow(/no timestamp for block 12/);
    expect(await db.select().from(launches)).toEqual([]);
    expect(await db.select().from(trades)).toEqual([]);
    expect(await getCursor(db)).toBeNull();
  });

  it("keeps the previous state intact when a later batch fails", async () => {
    await applyBatch(db, batch());
    const before = await dump(db);
    const missing = new Map(allBlocks);
    missing.delete(8);
    await expect(applyBatch(db, batch({ blockTimes: missing }))).rejects.toThrow();
    expect(await dump(db)).toEqual(before);
    expect((await getCursor(db))?.block).toBe(14);
  });

  it("records the cursor block and hash together", async () => {
    await applyBatch(db, batch({ to: 14, toHash: "0xabc" }));
    expect(await getCursor(db)).toEqual({ block: 14, hash: "0xabc" });
  });

  it("builds the launch from the factory event whatever order the curve events arrive in", async () => {
    await applyBatch(db, batch({ curveEvents: [...curveEvents].reverse() }));
    const [launch] = await db.select().from(launches);
    expect(launch?.curve).toBe(CURVE);
    expect(launch?.tradeCount).toBe(5);
    expect(launch?.graduated).toBe(true);
  });
});
