import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      all: true,
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
        branches: 74,
        functions: 77,
        lines: 73,
        statements: 73,
        "packages/core/src/use-cases.ts": {
          branches: 85,
          functions: 77,
          lines: 80,
          statements: 80,
        },
        "packages/queue/src/index.ts": {
          branches: 80,
          functions: 95,
          lines: 90,
          statements: 90,
        },
      },
    },
    projects: ["apps/*/vitest.config.ts", "packages/*/vitest.config.ts"],
  },
});
