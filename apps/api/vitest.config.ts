import { defineConfig } from "vitest/config";

// Tests that start an in-process Postgres (PGlite) spend a couple of seconds on setup, and much
// longer when several packages run at once. These limits are about slow machines, not about
// hiding slow code: a test that really hangs still fails, just after 30 seconds, not 5.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 90_000,
  },
});
