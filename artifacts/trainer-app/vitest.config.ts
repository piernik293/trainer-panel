import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Honour the "workspace" export condition used by monorepo packages
    conditions: ["workspace", "import", "require"],
  },
  test: {
    environment: "node",
    globals: false,
    pool: "forks",
    testTimeout: 15_000,
    include: ["src/**/*.test.ts"],
  },
});
