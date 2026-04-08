import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";

import { ApiConfig, CliConfig, WorkerConfig } from "./index.js";

describe("ApiConfig", () => {
  it.effect("loads config from a provider and applies defaults", () =>
    Effect.gen(function* () {
      const config = yield* ApiConfig;

      expect(config).toEqual({
        databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
        gmailApiBaseUrl: "https://gmail.googleapis.com/gmail/v1",
        gmailOauthAuthorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        gmailOauthClientId: null,
        gmailOauthClientSecret: null,
        gmailOauthTokenUrl: "https://oauth2.googleapis.com/token",
        nodeEnv: "test",
        port: 3000,
        workerBaseUrl: "http://127.0.0.1:3001",
      });
    }).pipe(
      Effect.provide(ApiConfig.layer),
      Effect.withConfigProvider(
        ConfigProvider.fromJson({
          DATABASE_URL: "postgres://mailmon:mailmon@localhost:5432/mailmon",
          NODE_ENV: "test",
        }),
      ),
    ),
  );
});

describe("WorkerConfig", () => {
  it.effect("defaults to local http runtime settings", () =>
    Effect.gen(function* () {
      const config = yield* WorkerConfig;

      expect(config).toEqual({
        asyncTransportMode: "local",
        databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
        gmailApiBaseUrl: "https://gmail.googleapis.com/gmail/v1",
        gmailOauthClientId: null,
        gmailOauthClientSecret: null,
        gmailOauthTokenUrl: "https://oauth2.googleapis.com/token",
        gcpProjectId: null,
        gcpRegion: null,
        host: "127.0.0.1",
        nodeEnv: "test",
        port: 3001,
        redisUrl: null,
      });
    }).pipe(
      Effect.provide(WorkerConfig.layer),
      Effect.withConfigProvider(
        ConfigProvider.fromJson({
          DATABASE_URL: "postgres://mailmon:mailmon@localhost:5432/mailmon",
          NODE_ENV: "test",
        }),
      ),
    ),
  );

  it.effect("supports legacy bullmq mode when redis is configured", () =>
    Effect.gen(function* () {
      const config = yield* WorkerConfig;

      expect(config.asyncTransportMode).toBe("legacy_bullmq");
      expect(config.redisUrl).toBe("redis://localhost:6379");
      expect(config.host).toBe("127.0.0.1");
      expect(config.gmailOauthClientId).toBeNull();
    }).pipe(
      Effect.provide(WorkerConfig.layer),
      Effect.withConfigProvider(
        ConfigProvider.fromJson({
          DATABASE_URL: "postgres://mailmon:mailmon@localhost:5432/mailmon",
          MAILMON_ASYNC_TRANSPORT_MODE: "legacy_bullmq",
          NODE_ENV: "test",
          REDIS_URL: "redis://localhost:6379",
        }),
      ),
    ),
  );
});

describe("CliConfig", () => {
  it.effect("defaults optional local mailbox dispatch settings", () =>
    Effect.gen(function* () {
      const config = yield* CliConfig;

      expect(config).toEqual({
        asyncTransportMode: "local",
        databaseUrl: null,
        nodeEnv: "test",
        workerBaseUrl: "http://127.0.0.1:3001",
      });
    }).pipe(
      Effect.provide(CliConfig.layer),
      Effect.withConfigProvider(
        ConfigProvider.fromJson({
          NODE_ENV: "test",
        }),
      ),
    ),
  );
});
