// A throwaway local database for development, standing in for Neon. It is real Postgres (PGlite, the
// Postgres engine compiled to WebAssembly) speaking the normal network protocol, so the indexer and the
// API connect to it exactly as they connect to Neon. Nothing to install.
//
//   pnpm --filter @launchpad/db db:local
//
// Then point the apps at it:
//   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54320/postgres
//
// Data lives in memory by default and is gone when you stop it. Pass a folder to keep it:
//   pnpm --filter @launchpad/db db:local -- .local-data
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { runMigrations } from "../dist/index.js";

const PORT = Number(process.env.LOCAL_DB_PORT ?? 54320);
const folder = process.argv[2];

const pg = await PGlite.create(folder ? { dataDir: folder } : undefined);
const server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 10 });
await server.start();

const url = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;
await runMigrations(url);
console.log(`Local database ready (${folder ? `kept in ${folder}` : "in memory"}).`);
console.log(`DATABASE_URL=${url}`);

const stop = async () => {
  await server.stop();
  await pg.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
