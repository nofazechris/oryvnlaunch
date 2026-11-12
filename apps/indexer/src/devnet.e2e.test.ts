// End-to-end against a REAL node, with nothing faked: the real StarknetRpc client, the real
// contracts' events, a real Postgres (PGlite). Skipped unless pointed at a devnet:
//
//   DEVNET_RPC=http://127.0.0.1:5050/rpc pnpm --filter @launchpad/indexer test
//
// The devnet needs the factory deployed and the smoke scenario run (contracts/scripts/deploy.sh,
// contracts/scripts/smoke.sh). The expectations are checked against the contracts themselves
// (`get_state`, `spot_price`), not against numbers typed into this file.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StarknetRpc, eventSelector, normalizeAddress } from "@launchpad/chain";
import { type Db, launches, trades } from "@launchpad/db";
import { createTestDb, type TestDb } from "@launchpad/db/testing";
import { Indexer } from "./indexer.js";
import { getCursor } from "./project.js";
import { runToIdle } from "./test-support.js";

const RPC = process.env.DEVNET_RPC;

describe.skipIf(!RPC)("indexer against a live devnet", () => {
  let testDb: TestDb;
  let db: Db;
  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  });
  afterAll(async () => testDb.close());

  const deployment = RPC
    ? (JSON.parse(readFileSync(new URL("../../../contracts/deployments/devnet.json", import.meta.url), "utf8")) as {
        factory: { address: string };
      })
    : undefined;

  async function call(address: string, fn: string): Promise<bigint[]> {
    const response = await fetch(RPC as string, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "starknet_call",
        params: {
          request: { contract_address: address, entry_point_selector: "0x" + eventSelector(fn).toString(16), calldata: [] },
          block_id: "latest",
        },
      }),
    });
    const body = (await response.json()) as { result?: string[]; error?: { message: string } };
    if (!body.result) throw new Error(`${fn}: ${body.error?.message}`);
    return body.result.map((v) => BigInt(v));
  }

  it("indexes the real launch and matches the contract's own state", async () => {
    const factory = normalizeAddress(deployment?.factory.address as string);
    const rpc = new StarknetRpc({ url: RPC as string });
    const indexer = new Indexer(rpc, db, { factory, startBlock: 0, overlapBlocks: 10, maxBlockRange: 1000 });

    await runToIdle(indexer);

    const rows = await db.select().from(launches);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const launch of rows) {
      // Ask the contract, and compare it with what we stored.
      const [quoteReserveLow, quoteReserveHigh, tokenReserveLow, tokenReserveHigh] = await call(launch.curve, "get_state");
      const quoteReserve = (quoteReserveLow as bigint) + ((quoteReserveHigh as bigint) << 128n);
      const tokenReserve = (tokenReserveLow as bigint) + ((tokenReserveHigh as bigint) << 128n);
      const [priceLow, priceHigh] = await call(launch.curve, "spot_price");
      expect(BigInt(launch.quoteReserve)).toBe(quoteReserve);
      expect(BigInt(launch.tokenReserve)).toBe(tokenReserve);
      expect(BigInt(launch.price)).toBe((priceLow as bigint) + ((priceHigh as bigint) << 128n));

      const launchTrades = (await db.select().from(trades)).filter((t) => t.curve === launch.curve);
      expect(launchTrades.length).toBe(launch.tradeCount);
    }
  });

  it("finds nothing more to do on the next pass, and makes no changes", async () => {
    const factory = normalizeAddress(deployment?.factory.address as string);
    const indexer = new Indexer(new StarknetRpc({ url: RPC as string }), db, {
      factory,
      startBlock: 0,
      overlapBlocks: 10,
      maxBlockRange: 1000,
    });
    const before = await getCursor(db);
    expect((await indexer.tick()).status).toBe("idle");
    expect(await getCursor(db)).toEqual(before);
  });
});
