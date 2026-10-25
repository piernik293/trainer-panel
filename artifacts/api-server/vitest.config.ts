import { defineConfig } from "vitest/config";
import { assertTestDatabase } from "./src/lib/testGuard";

// Safety: API tests only ever run against a database named *_test (see test-guard.ts).
assertTestDatabase(process.env.DATABASE_URL);

export default defineConfig({
  resolve: {
    // Honour the "workspace" export condition used by monorepo packages
    // (e.g. @workspace/db exports its TypeScript source under this condition).
    conditions: ["workspace", "import", "require"],
  },
  test: {
    environment: "node",
    globals: false,
    // Run each test file in its own worker process so the DB pool in
    // @workspace/db is isolated and exits cleanly when the file finishes.
    pool: "forks",
    testTimeout: 30_000,
    include: ["src/**/*.test.ts"],
  },
});
