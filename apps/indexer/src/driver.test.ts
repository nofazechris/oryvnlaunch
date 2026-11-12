// The other tests run on PGlite in-process. This one goes through the REAL network driver the
// indexer uses in production (`postgres`, via connect() and runMigrations() from @launchpad/db),
// talking the Postgres wire protocol over TCP to a PGlite server. That is not full Postgres, but
// it exercises our connection settings and the way the driver turns numbers, dates and big
// integers into JavaScript values, none of which the in-process tests touch.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DbConnection, connect, currentQuoteTokens, launches, runMigrations, trades } from "@launchpad/db";
import { Indexer } from "./indexer.js";
import { FACTORY, FakeNode, HEAD, E18, STRK, runToIdle } from "./test-support.js";

const PORT = 54_329;
const URL = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;

let server: PGLiteSocketServer;
let pg: PGlite;
let connection: DbConnection;

beforeAll(async () => {
  pg = await PGlite.create();
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1" });
  await server.start();
  await runMigrations(URL);
  connection = connect(URL, { max: 1 });
}, 60_000);

afterAll(async () => {
  await connection?.close();
  await server?.stop();
  await pg?.close();
});

describe("through the production database driver", () => {
  it("applied the migrations over the network", async () => {
    const tables = await pg.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
    );
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toEqual(expect.arrayContaining(["indexer_state", "launches", "quote_token_events", "trades"]));
  });

  it("is safe to run the migrations again", async () => {
    await expect(runMigrations(URL)).resolves.toBeUndefined();
  });

  it("indexes the real scenario and reads it back with exact numbers and real dates", async () => {
    const indexer = new Indexer(new FakeNode(), connection.db, {
      factory: FACTORY,
      startBlock: 0,
      overlapBlocks: 10,
      maxBlockRange: 1000,
    });
    await runToIdle(indexer);

    const [launch] = await connection.db.select().from(launches);
    expect(launch?.createdAt).toBeInstanceOf(Date);
    expect(launch?.quoteToken).toBe(STRK);
    expect(launch?.launchId).toBe("0");
    // numeric(78,0) must arrive as an exact string, not a rounded JavaScript number
    expect(typeof launch?.quoteReserve).toBe("string");
    expect(BigInt(launch?.quoteReserve ?? "0")).toBe(750n * E18);
    expect(BigInt(launch?.volumeQuote ?? "0")).toBe(1_850n * E18);

    expect(await connection.db.select().from(trades)).toHaveLength(4);
    const current = await currentQuoteTokens(connection.db);
    expect(current[0]).toMatchObject({ quoteToken: STRK, enabled: true });
  });

  it("keeps working across passes, and when the chain grows", async () => {
    const node = new FakeNode();
    node.head = HEAD;
    const indexer = new Indexer(node, connection.db, { factory: FACTORY, startBlock: 0, overlapBlocks: 10, maxBlockRange: 1000 });
    expect((await indexer.tick()).status).toBe("idle");
    expect(await connection.db.select().from(trades)).toHaveLength(4);
  });
});
