// Check that the database named in the environment is reachable and set up, without ever printing
// a password:
//
//   pnpm --filter @launchpad/db db:check
//
// It reads DATABASE_URL and DATABASE_URL_DIRECT from the environment or from the repo's .env file.
import postgres from "postgres";
import { adviseOnUrls, describeConnection, scrubError, type ConnectionSummary } from "./check.js";

const pooledUrl = process.env.DATABASE_URL;
const directUrl = process.env.DATABASE_URL_DIRECT;

function summarize(name: string, url: string | undefined): ConnectionSummary | undefined {
  if (!url) return undefined;
  try {
    return describeConnection(url);
  } catch (error) {
    console.error(`  x ${name}: ${error instanceof Error ? error.message : "invalid"}`);
    process.exitCode = 1;
    return undefined;
  }
}

const pooled = summarize("DATABASE_URL", pooledUrl);
const direct = summarize("DATABASE_URL_DIRECT", directUrl);

console.log("Connection strings");
for (const [name, c] of [["DATABASE_URL", pooled], ["DATABASE_URL_DIRECT", direct]] as const) {
  if (c) console.log(`  ${name}: host ${c.host}, database ${c.database}, user ${c.user}, ${c.pooled ? "pooled" : "direct"}`);
}
for (const a of adviseOnUrls(pooled, direct)) {
  console.log(`  ${a.level === "error" ? "x" : "!"} ${a.text}`);
  if (a.level === "error") process.exitCode = 1;
}

async function probe(label: string, url: string): Promise<boolean> {
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    connect_timeout: 15,
  });
  try {
    const [info] = await sql<{ db: string; version: string }[]>`select current_database() as db, version() as version`;
    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public' order by table_name`;
    const names = tables.map((t) => t.table_name);
    const expected = ["indexer_state", "launches", "quote_token_events", "trades"];
    const missing = expected.filter((t) => !names.includes(t));
    console.log(`  ok ${label}: connected to "${info?.db}" (${(info?.version ?? "").split(" ").slice(0, 2).join(" ")})`);
    if (missing.length === expected.length) {
      console.log("    no tables yet: run  pnpm --filter @launchpad/db db:migrate");
    } else if (missing.length > 0) {
      console.log(`    partly migrated, missing: ${missing.join(", ")}. Run  pnpm --filter @launchpad/db db:migrate`);
    } else {
      console.log("    tables are in place");
    }
    return true;
  } catch (error) {
    console.error(`  x ${label}: ${scrubError(error, url)}`);
    process.exitCode = 1;
    return false;
  } finally {
    await sql.end({ timeout: 3 });
  }
}

console.log("\nReaching the database");
if (pooledUrl && pooled) await probe("DATABASE_URL", pooledUrl);
if (directUrl && direct) await probe("DATABASE_URL_DIRECT", directUrl);
if (!pooledUrl && !directUrl) {
  console.error("  x nothing to check. Put DATABASE_URL (and DATABASE_URL_DIRECT) in .env, see .env.example.");
  process.exitCode = 1;
}
console.log(process.exitCode ? "\nNot ready yet." : "\nReady.");
