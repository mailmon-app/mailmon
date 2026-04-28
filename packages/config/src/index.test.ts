import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect } from "effect";

import {
  ApiConfig,
  CliConfig,
  DEFAULT_GCP_WEBHOOK_DELIVERY_QUEUE_ID,
  WorkerConfig,
} from "./index.js";

const TEST_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=";

describe("ApiConfig", () => {
  it.effect("loads config from a provider and applies defaults", () =>
    Effect.gen(function* () {
      const config = yield* ApiConfig;

      expect(config).toEqual({
        asyncTransportMode: "local",
        databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
        gmailApiBaseUrl: "https://gmail.googleapis.com/gmail/v1",
        gmailOauthAuthorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        gmailOauthClientId: null,
        gmailOauthClientSecret: null,
        gmailRefreshTokenEncryptionKey: TEST_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY,
        gmailRefreshTokenEncryptionKeyId: "primary",
        gmailRefreshTokenPreviousEncryptionKeys: [],
        gmailOauthTokenUrl: "https://oauth2.googleapis.com/token",
        syncDispatchPubSubTopicName: null,
        host: "127.0.0.1",
        nodeEnv: "test",
        port: 3000,
        workerBaseUrl: "http://127.0.0.1:3001",
      });
    }).pipe(
      Effect.provide(ApiConfig.layer),
      Effect.withConfigProvider(
        ConfigProvider.fromJson({
          DATABASE_URL: "postgres://mailmon:mailmon@localhost:5432/mailmon",
          MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY: TEST_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY,
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
        gmailRefreshTokenEncryptionKey: TEST_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY,
        gmailRefreshTokenEncryptionKeyId: "primary",
        gmailRefreshTokenPreviousEncryptionKeys: [],
        gmailOauthTokenUrl: "https://oauth2.googleapis.com/token",
        gmailPubSubTopicName: null,
        syncDispatchPubSubTopicName: null,
        gcpProjectId: null,
        gcpRegion: null,
        gcpTasksAudience: null,
        gcpTasksServiceAccountEmail: null,
        gcpWebhookDeliveryQueueId: DEFAULT_GCP_WEBHOOK_DELIVERY_QUEUE_ID,
        host: "127.0.0.1",
        nodeEnv: "test",
        port: 3001,
        redisUrl: null,
        workerBaseUrl: "http://127.0.0.1:3001",
      });
    }).pipe(
      Effect.provide(WorkerConfig.layer),
      Effect.withConfigProvider(
        ConfigProvider.fromJson({
          DATABASE_URL: "postgres://mailmon:mailmon@localhost:5432/mailmon",
          MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY: TEST_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY,
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
          MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY: TEST_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY,
          NODE_ENV: "test",
          REDIS_URL: "redis://localhost:6379",
        }),
      ),
    ),
  );

  it("requires a worker base url when gcp mode is selected for the api", async () => {
    await expect(
      Effect.runPromise(
        ApiConfig.pipe(
          Effect.provide(ApiConfig.layer),
          Effect.withConfigProvider(
            ConfigProvider.fromJson({
              DATABASE_URL: "postgres://mailmon:mailmon@localhost:5432/mailmon",
              MAILMON_ASYNC_TRANSPORT_MODE: "gcp",
              MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY: TEST_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY,
              NODE_ENV: "test",
            }),
          ),
        ),
      ),
    ).rejects.toThrow("MAILMON_WORKER_BASE_URL is required when MAILMON_ASYNC_TRANSPORT_MODE=gcp");
  });

  it.effect("binds the api to all interfaces in gcp mode by default", () =>
    Effect.gen(function* () {
      const config = yield* ApiConfig;

      expect(config.host).toBe("0.0.0.0");
      expect(config.syncDispatchPubSubTopicName).toBe(
        "projects/mailmon-staging/topics/mailbox-sync-dispatch",
      );
      expect(config.workerBaseUrl).toBe("https://worker.example.com");
    }).pipe(
      Effect.provide(ApiConfig.layer),
      Effect.withConfigProvider(
        ConfigProvider.fromJson({
          DATABASE_URL: "postgres://mailmon:mailmon@localhost:5432/mailmon",
          MAILMON_ASYNC_TRANSPORT_MODE: "gcp",
          MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY: TEST_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY,
          MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME:
            "projects/mailmon-staging/topics/mailbox-sync-dispatch",
          MAILMON_WORKER_BASE_URL: "https://worker.example.com",
          NODE_ENV: "test",
        }),
      ),
    ),
  );

  it("requires gcp routing values when worker gcp mode is selected", async () => {
    await expect(
      Effect.runPromise(
        WorkerConfig.pipe(
          Effect.provide(WorkerConfig.layer),
          Effect.withConfigProvider(
            ConfigProvider.fromJson({
              DATABASE_URL: "postgres://mailmon:mailmon@localhost:5432/mailmon",
              MAILMON_ASYNC_TRANSPORT_MODE: "gcp",
              MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY: TEST_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY,
              MAILMON_GMAIL_PUBSUB_TOPIC_NAME: "projects/mailmon-staging/topics/gmail-push",
              MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME:
                "projects/mailmon-staging/topics/mailbox-sync-dispatch",
              MAILMON_WORKER_BASE_URL: "https://worker.example.com",
              NODE_ENV: "test",
            }),
          ),
        ),
      ),
    ).rejects.toThrow("GCP_PROJECT_ID is required when MAILMON_ASYNC_TRANSPORT_MODE=gcp");
  });

  it.effect("loads gcp worker scheduling defaults when configured", () =>
    Effect.gen(function* () {
      const config = yield* WorkerConfig;

      expect(config.asyncTransportMode).toBe("gcp");
      expect(config.gcpProjectId).toBe("mailmon-staging");
      expect(config.gcpRegion).toBe("us-central1");
      expect(config.gcpWebhookDeliveryQueueId).toBe(DEFAULT_GCP_WEBHOOK_DELIVERY_QUEUE_ID);
      expect(config.gmailPubSubTopicName).toBe("projects/mailmon-staging/topics/gmail-push");
      expect(config.syncDispatchPubSubTopicName).toBe(
        "projects/mailmon-staging/topics/mailbox-sync-dispatch",
      );
      expect(config.workerBaseUrl).toBe("https://worker.example.com");
      expect(config.host).toBe("0.0.0.0");
      expect(config.gmailRefreshTokenEncryptionKey).toBe(TEST_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY);
    }).pipe(
      Effect.provide(WorkerConfig.layer),
      Effect.withConfigProvider(
        ConfigProvider.fromJson({
          DATABASE_URL: "postgres://mailmon:mailmon@localhost:5432/mailmon",
          GCP_PROJECT_ID: "mailmon-staging",
          GCP_REGION: "us-central1",
          MAILMON_ASYNC_TRANSPORT_MODE: "gcp",
          MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY: TEST_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY,
          MAILMON_GMAIL_PUBSUB_TOPIC_NAME: "projects/mailmon-staging/topics/gmail-push",
          MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME:
            "projects/mailmon-staging/topics/mailbox-sync-dispatch",
          MAILMON_WORKER_BASE_URL: "https://worker.example.com",
          NODE_ENV: "test",
        }),
      ),
    ),
  );

  it.effect("loads Gmail refresh token rotation keys", () =>
    Effect.gen(function* () {
      const config = yield* WorkerConfig;

      expect(config.gmailRefreshTokenEncryptionKeyId).toBe("key_new");
      expect(config.gmailRefreshTokenPreviousEncryptionKeys).toEqual([
        {
          encryptionKey: "old-key",
          keyId: "key_old",
        },
        {
          encryptionKey: "older-key",
          keyId: "key_older",
        },
      ]);
    }).pipe(
      Effect.provide(WorkerConfig.layer),
      Effect.withConfigProvider(
        ConfigProvider.fromJson({
          DATABASE_URL: "postgres://mailmon:mailmon@localhost:5432/mailmon",
          MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY: TEST_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY,
          MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY_ID: "key_new",
          MAILMON_GMAIL_REFRESH_TOKEN_PREVIOUS_ENCRYPTION_KEYS:
            "key_old=old-key,key_older=older-key",
          NODE_ENV: "test",
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
        gmailRefreshTokenEncryptionKey: null,
        gmailRefreshTokenEncryptionKeyId: "primary",
        gmailRefreshTokenPreviousEncryptionKeys: [],
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
