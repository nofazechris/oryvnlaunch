// Apply migrations to the database named in the environment:
//   DATABASE_URL_DIRECT=postgres://... pnpm --filter @launchpad/db db:migrate
// Use Neon's DIRECT connection string (no "-pooler" in the host). The pooled one also works
// for these simple migrations, but a pooler is the wrong tool for schema changes.
import { runMigrations } from "./client.js";

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL_DIRECT (preferred) or DATABASE_URL to your Neon connection string.");
  process.exit(1);
}
if (!process.env.DATABASE_URL_DIRECT && /-pooler/.test(url)) {
  console.warn("Warning: migrating through a pooled connection. Prefer the direct connection string.");
}

await runMigrations(url);
console.log("Migrations applied.");
