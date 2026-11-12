import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "./testing.js";
import { launches, trades } from "./schema.js";

let current: TestDb | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

const U256_MAX = 2n ** 256n - 1n;
const addr = (n: number) => "0x" + n.toString(16).padStart(64, "0");

function launchRow(overrides: Partial<typeof launches.$inferInsert> = {}): typeof launches.$inferInsert {
  return {
    token: addr(1),
    curve: addr(2),
    factory: addr(3),
    creator: addr(4),
    quoteToken: addr(5),
    launchId: "0",
    name: "Test",
    symbol: "TST",
    metadataUri: "ipfs://x",
    preset: 1,
    creatorBps: 0,
    graduationRaise: "1000",
    deployFee: "10",
    createdBlock: 1,
    createdTx: addr(6),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    quoteReserve: "500",
    tokenReserve: "1200",
    price: "1",
    marketCap: "1",
    ...overrides,
  };
}

describe("schema on a real Postgres", () => {
  it("applies the migrations to an empty database", async () => {
    current = await createTestDb();
    expect(await current.db.select().from(launches)).toEqual([]);
    expect(await current.db.select().from(trades)).toEqual([]);
  });

  it("stores a full 256-bit amount exactly, with no rounding", async () => {
    current = await createTestDb();
    await current.db.insert(launches).values(launchRow({ quoteReserve: U256_MAX.toString(), marketCap: U256_MAX.toString() }));
    const [row] = await current.db.select().from(launches);
    expect(BigInt(row?.quoteReserve ?? "0")).toBe(U256_MAX);
    expect(BigInt(row?.marketCap ?? "0")).toBe(U256_MAX);
  });

  it("refuses a number that does not fit a u256 instead of rounding it", async () => {
    current = await createTestDb();
    const tooBig = (10n ** 78n).toString();
    await expect(current.db.insert(launches).values(launchRow({ quoteReserve: tooBig }))).rejects.toThrow();
  });

  it("keeps a u64 launch id exact", async () => {
    current = await createTestDb();
    // Larger than a signed 64-bit integer, so a bigint column would have rejected it.
    const id = 2n ** 64n - 1n;
    await current.db.insert(launches).values(launchRow({ launchId: id.toString() }));
    const [row] = await current.db.select().from(launches);
    expect(BigInt(row?.launchId ?? "0")).toBe(id);
  });

  it("enforces one launch per token and one per curve", async () => {
    current = await createTestDb();
    await current.db.insert(launches).values(launchRow());
    await expect(current.db.insert(launches).values(launchRow())).rejects.toThrow();
    await expect(current.db.insert(launches).values(launchRow({ token: addr(9) }))).rejects.toThrow();
  });

  const tradeRow = (overrides: Partial<typeof trades.$inferInsert> = {}): typeof trades.$inferInsert => ({
    id: "1:c:0",
    curve: addr(2),
    token: addr(1),
    side: "buy",
    trader: addr(7),
    quoteAmount: "1",
    tokenAmount: "1",
    quoteReserve: "1",
    tokenReserve: "1",
    price: "1",
    blockNumber: 1,
    indexInBlock: 0,
    txHash: addr(8),
    blockTime: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });

  it("only accepts buy and sell as a trade side", async () => {
    current = await createTestDb();
    await current.db.insert(trades).values(tradeRow());
    await expect(
      current.db.insert(trades).values(tradeRow({ id: "1:c:1", side: "hold" as unknown as "buy" })),
    ).rejects.toThrow();
  });

  it("refuses a trade of nothing", async () => {
    current = await createTestDb();
    await expect(current.db.insert(trades).values(tradeRow({ quoteAmount: "0" }))).rejects.toThrow();
    await expect(current.db.insert(trades).values(tradeRow({ tokenAmount: "0" }))).rejects.toThrow();
  });

  it("refuses an unknown preset and an empty reserve", async () => {
    current = await createTestDb();
    await expect(current.db.insert(launches).values(launchRow({ preset: 3 }))).rejects.toThrow();
    await expect(current.db.insert(launches).values(launchRow({ tokenReserve: "0" }))).rejects.toThrow();
  });

  it("does not insert the same trade twice when told to ignore duplicates", async () => {
    current = await createTestDb();
    await current.db.insert(trades).values(tradeRow()).onConflictDoNothing();
    await current.db.insert(trades).values(tradeRow()).onConflictDoNothing();
    expect(await current.db.select().from(trades).where(eq(trades.id, "1:c:0"))).toHaveLength(1);
  });
});
