import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    include: ["**/*.test.ts"],
    // Integration tests need a running local Supabase: `npm run test:integration`.
    // .claude/ holds other sessions' git worktrees, which must not run here.
    exclude: [...configDefaults.exclude, "tests/integration/**", ".claude/**", "finalfrontendsimp-main/**"],
  },
});
