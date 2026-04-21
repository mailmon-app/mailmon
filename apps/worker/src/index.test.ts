import type { WorkerEnv } from "@mailmon/config";
import { describe, expect, it } from "vitest";

import { startWorkerRuntime } from "./index.js";

const workerEnvFixture: WorkerEnv = {
  asyncTransportMode: "local",
  databaseUrl: "postgres://mailmon:mailmon@localhost:5432/mailmon",
  gmailApiBaseUrl: "https://gmail.googleapis.com/gmail/v1",
  gmailOauthClientId: null,
  gmailOauthClientSecret: null,
  gmailRefreshTokenEncryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
  gmailRefreshTokenEncryptionKeyId: "primary",
  gmailRefreshTokenPreviousEncryptionKeys: [],
  gmailOauthTokenUrl: "https://oauth2.googleapis.com/token",
  gcpProjectId: null,
  gcpRegion: null,
  gcpTasksAudience: null,
  gcpTasksServiceAccountEmail: null,
  gcpWebhookDeliveryQueueId: "mailmon-webhook-deliveries",
  host: "127.0.0.1",
  nodeEnv: "test",
  port: 0,
  redisUrl: null,
  workerBaseUrl: "http://127.0.0.1:3001",
};

describe("startWorkerRuntime", () => {
  it("requires redis when legacy bullmq mode is selected", async () => {
    await expect(
      startWorkerRuntime({
        ...workerEnvFixture,
        asyncTransportMode: "legacy_bullmq",
      }),
    ).rejects.toThrow("REDIS_URL is required when MAILMON_ASYNC_TRANSPORT_MODE=legacy_bullmq");
  });
});
