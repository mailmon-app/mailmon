import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";

import { ApiConfig } from "./index.js";

describe("ApiConfig", () => {
  it.effect("loads config from a provider and applies defaults", () =>
    Effect.gen(function* () {
      const config = yield* ApiConfig;

      expect(config).toEqual({
        databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
        nodeEnv: "test",
        port: 3000,
        redisUrl: "redis://localhost:6379",
      });
    }).pipe(
      Effect.provide(ApiConfig.layer),
      Effect.withConfigProvider(
        ConfigProvider.fromJson({
          DATABASE_URL: "postgres://mailmon:mailmon@localhost:5432/mailmon",
          NODE_ENV: "test",
          REDIS_URL: "redis://localhost:6379",
        }),
      ),
    ),
  );
});
