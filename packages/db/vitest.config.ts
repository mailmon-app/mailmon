import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    passWithNoTests: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
