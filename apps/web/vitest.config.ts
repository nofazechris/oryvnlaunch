import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Next.js keeps `jsx: "preserve"` in tsconfig for its own compiler; the test runner needs JSX compiled, and the
// same "@/..." imports the app uses.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
