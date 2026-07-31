import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    conditions: ["workspace", "import", "require"],
  },
  test: {
    // Default environment for pure-logic .test.ts files.
    environment: "node",
    globals: false,
    pool: "forks",
    testTimeout: 15_000,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Component tests (.test.tsx) run in happy-dom for DOM APIs.
    environmentMatchGlobs: [["src/**/*.test.tsx", "happy-dom"]],
  },
});
