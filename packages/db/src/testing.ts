// An in-process Postgres for tests (PGlite: real Postgres compiled to WebAssembly). Nothing to
// install and nothing to clean up, and it runs the same SQL migrations as Neon does.
//
// Separate entry point (`@launchpad/db/testing`) so production code never loads it.

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_FOLDER, type Db } from "./client.js";
import * as schema from "./schema.js";

export interface TestDb {
  db: Db;
  close: () => Promise<void>;
}

/** A fresh, empty, fully migrated database. Each call is isolated from every other. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db: db as unknown as Db, close: () => client.close() };
}
