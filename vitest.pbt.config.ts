import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["packages/{core,gmail,db}/src/**/*.pbt.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
