import { defineConfig } from "vitest/config";

const include = process.env.PBT_INCLUDE?.split(",")
  .map((pattern) => pattern.trim())
  .filter((pattern) => pattern.length > 0) ?? ["packages/{core,gmail,db}/src/**/*.pbt.test.ts"];

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
