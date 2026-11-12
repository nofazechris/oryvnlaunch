// Connecting to Postgres. In production that is Neon.
//
// Neon gives two connection strings for one database:
//   - the POOLED one (host contains "-pooler"): for the app and the indexer. It goes through
//     PgBouncer in transaction mode, which does not support prepared statements, so we turn
//     them off (`prepare: false`). Safe on a direct connection too, just a touch slower.
//   - the DIRECT one: for running migrations, which should not go through a pooler.
//
// Queries are written against `Db`, not against a driver, so the same code runs on Neon in
// production and on an in-process Postgres (PGlite) in tests.

import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Folder of generated SQL migrations. Sits next to `dist`, so it works from source and from the build. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

export interface DbConnection {
  db: Db;
  close: () => Promise<void>;
}

export interface ConnectOptions {
  /** Connections in the pool. Neon's pooler handles many clients, so keep this small. Default 5. */
  max?: number;
}

/** Connect to Postgres (Neon) with a connection string. TLS is required: Neon refuses plain TCP. */
export function connect(url: string, options: ConnectOptions = {}): DbConnection {
  const client = postgres(url, {
    max: options.max ?? 5,
    prepare: false,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    idle_timeout: 20,
    connect_timeout: 15,
  });
  return { db: drizzle(client, { schema }) as unknown as Db, close: () => client.end({ timeout: 5 }) };
}

/** Apply any pending migrations. Run it with the DIRECT connection string. */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, {
    max: 1,
    prepare: false,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
  });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end({ timeout: 5 });
  }
}
