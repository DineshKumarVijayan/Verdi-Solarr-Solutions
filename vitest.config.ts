import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // The default worker pools ("forks"/"threads") fail on this setup before any test runs
    // ("Vitest failed to find the current suite" / "reading 'config'"); VM threads run the same tests fine.
    pool: "vmThreads",
  },
});
