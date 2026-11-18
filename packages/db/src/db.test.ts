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

describe("holdersOf", () => {
  const ZERO = "0x" + "0".repeat(64);
  const T = addr(100);
  let n = 0;
  const move = (from: string, to: string, value: bigint, token = T) => ({
    id: `1:${token}:${n++}`,
    token,
    from,
    to,
    value: value.toString(),
    blockNumber: 1,
    indexInBlock: n,
    txHash: addr(7),
  });

  it("adds up transfers into balances, biggest first, and never lists the mint source or empty wallets", async () => {
    current = await createTestDb();
    const { holdersOf } = await import("./queries.js");
    const { transfers } = await import("./schema.js");
    const [factory, curve, creator, alice, bob] = [addr(11), addr(12), addr(13), addr(14), addr(15)];
    await current.db.insert(transfers).values([
      move(ZERO, factory, 1_000n),
      move(factory, curve, 800n),
      move(factory, creator, 20n),
      move(curve, alice, 300n), // alice buys 300
      move(alice, bob, 100n), // and sends 100 on
      move(bob, alice, 100n), // bob sends it all back, so bob is no longer a holder
      move(addr(99), addr(98), 5n, addr(200)), // another token: must not leak in
    ]);
    const r = await holdersOf(current.db, T);
    expect(r.minted).toBe(1_000n);
    expect(r.holders).toEqual([
      { address: curve, balance: 500n },
      { address: alice, balance: 300n },
      { address: factory, balance: 180n },
      { address: creator, balance: 20n },
    ]);
    expect(r.count).toBe(4);
    expect(r.holders.reduce((a, h) => a + h.balance, 0n)).toBe(r.minted);
  });

  it("counts every holder even when only some are returned", async () => {
    current = await createTestDb();
    const { holdersOf } = await import("./queries.js");
    const { transfers } = await import("./schema.js");
    await current.db.insert(transfers).values([move(ZERO, addr(20), 100n), move(addr(20), addr(21), 10n), move(addr(20), addr(22), 20n), move(addr(20), addr(23), 30n)]);
    const r = await holdersOf(current.db, T, 2);
    expect(r.holders.map((h) => h.balance)).toEqual([40n, 30n]);
    expect(r.count).toBe(4);
  });

  it("keeps full 256-bit precision", async () => {
    current = await createTestDb();
    const { holdersOf } = await import("./queries.js");
    const { transfers } = await import("./schema.js");
    await current.db.insert(transfers).values([move(ZERO, addr(30), U256_MAX), move(addr(30), addr(31), U256_MAX - 1n)]);
    const r = await holdersOf(current.db, T);
    expect(r.holders).toEqual([{ address: addr(31), balance: U256_MAX - 1n }, { address: addr(30), balance: 1n }]);
  });

  it("returns nothing for a token with no transfers", async () => {
    current = await createTestDb();
    const { holdersOf } = await import("./queries.js");
    expect(await holdersOf(current.db, addr(555))).toEqual({ holders: [], count: 0, minted: 0n });
  });
});
