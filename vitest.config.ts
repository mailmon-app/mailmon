import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "**/dist/**",
        "**/drizzle/**",
        "**/test-setup.ts",
        "**/vitest.config.ts",
      ],
      include: ["apps/*/src/**/*.ts", "packages/*/src/**/*.ts"],
      provider: "v8",
      reportOnFailure: true,
      reporter: ["text-summary", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        branches: 66,
        functions: 75,
        lines: 76,
        statements: 76,
        "packages/core/src/use-cases.ts": {
          branches: 70,
          functions: 78,
          lines: 79,
          statements: 80,
        },
        "packages/queue/src/index.ts": {
          branches: 66,
          functions: 94,
          lines: 93,
          statements: 93,
        },
      },
    },
    projects: ["apps/*/vitest.config.ts", "packages/*/vitest.config.ts"],
  },
});
