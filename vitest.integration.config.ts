import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Integration tests against a LOCAL Supabase (`npx supabase start` + `node scripts/seed-local.mjs`).
 * tests/integration/setup.ts refuses to run unless the URL is localhost / 127.0.0.1.
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    // Suites share one seeded database; run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
