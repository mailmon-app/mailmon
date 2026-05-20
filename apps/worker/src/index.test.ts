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
  gmailPubSubTopicName: null,
  syncDispatchPubSubTopicName: null,
  gcpProjectId: null,
  gcpRegion: null,
  gcpSchedulerServiceAccountEmail: null,
  gcpTasksAudience: null,
  gcpTasksServiceAccountEmail: null,
  gcpWebhookDeliveryQueueId: "mailmon-webhook-deliveries",
  host: "127.0.0.1",
  mailboxSyncHeartbeatIntervalMs: 30_000,
  mailboxSyncLeaseTtlMs: 90_000,
  nodeEnv: "test",
  port: 0,
  stagingPubSubRetrySmokeMailboxIds: [],
  workerBaseUrl: "http://127.0.0.1:3001",
};

describe("startWorkerRuntime", () => {
  it("starts the http runtime in local mode", async () => {
    const runtime = await startWorkerRuntime(workerEnvFixture);

    await expect(runtime.close()).resolves.toBeUndefined();
  });

  it("starts the http runtime in gcp mode", async () => {
    const runtime = await startWorkerRuntime({
      ...workerEnvFixture,
      asyncTransportMode: "gcp",
      gcpProjectId: "mailmon-dev",
      gcpRegion: "us-central1",
      gcpSchedulerServiceAccountEmail: "scheduler@mailmon-dev.iam.gserviceaccount.com",
      gcpTasksAudience: "https://worker.example.com",
      gcpTasksServiceAccountEmail: "tasks@mailmon-dev.iam.gserviceaccount.com",
      gmailPubSubTopicName: "projects/mailmon-dev/topics/gmail-push",
      syncDispatchPubSubTopicName: "projects/mailmon-dev/topics/mailbox-sync-dispatch",
    });

    await expect(runtime.close()).resolves.toBeUndefined();
  });
});
