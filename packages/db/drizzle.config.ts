import { defineConfig } from "drizzle-kit";

// `pnpm --filter @launchpad/db db:generate` turns schema changes into a new SQL file in ./drizzle.
// Generating needs no database. Review the SQL before committing it: it is what runs on Neon.
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
