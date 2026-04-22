import type { WorkerEnv } from "@mailmon/config";
import type { ControlJobDispatchRequest } from "@mailmon/core";
import { afterEach, describe, expect, it } from "vitest";

import { startWorkerHttpRuntime } from "./server.js";

const activeRuntimeClosers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(activeRuntimeClosers.splice(0).map((close) => close()));
});

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

const defaultProcessControlJob = async (request: ControlJobDispatchRequest) => {
  if (request.kind !== "renew_watches") {
    return {
      completedAt: "2026-03-25T00:00:00.000Z",
      kind: request.kind,
      status: "noop" as const,
    };
  }

  return {
    completedAt: "2026-03-25T00:00:00.000Z",
    expired: 0,
    expiring: 0,
    failed: 0,
    kind: request.kind,
    renewed: 0,
    scanned: 0,
    status: "completed" as const,
  };
};

describe("startWorkerHttpRuntime", () => {
  it("serves a health response in local mode", async () => {
    const runtime = await startWorkerHttpRuntime({
      asyncTransportMode: workerEnvFixture.asyncTransportMode,
      host: workerEnvFixture.host,
      port: workerEnvFixture.port,
      processControlJob: defaultProcessControlJob,
      processSyncJob: async ({ mailboxId }) => ({
        mailboxId,
        syncRunId: "sr_health",
        startedAt: "2026-03-25T00:00:00.000Z",
        status: "completed",
        completedAt: "2026-03-25T00:00:01.000Z",
        eventsEmitted: 1,
        nextCursor: "hist_123",
      }),
      processWebhookDelivery: async ({ deliveryId }) => ({
        deliveryId,
        status: "delivered",
        attemptCount: 1,
        nextAttemptAt: null,
      }),
    });
    activeRuntimeClosers.push(runtime.close);

    const response = await fetch(`http://${runtime.host}:${runtime.port}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      transportMode: "local",
    });
  });

  it("runs the mailbox sync workflow through /internal/sync", async () => {
    const runtime = await startWorkerHttpRuntime({
      asyncTransportMode: workerEnvFixture.asyncTransportMode,
      host: workerEnvFixture.host,
      port: workerEnvFixture.port,
      processControlJob: defaultProcessControlJob,
      processSyncJob: async ({ mailboxId }) => ({
        mailboxId,
        syncRunId: "sr_sync",
        startedAt: "2026-03-25T00:00:00.000Z",
        status: "completed",
        completedAt: "2026-03-25T00:00:01.000Z",
        eventsEmitted: 2,
        nextCursor: "hist_456",
      }),
      processWebhookDelivery: async ({ deliveryId }) => ({
        deliveryId,
        status: "delivered",
        attemptCount: 1,
        nextAttemptAt: null,
      }),
    });
    activeRuntimeClosers.push(runtime.close);

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailboxId: "mbx_demo",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mailboxId: "mbx_demo",
      status: "completed",
      nextCursor: "hist_456",
    });
  });

  it("rejects invalid sync payloads", async () => {
    const runtime = await startWorkerHttpRuntime({
      asyncTransportMode: workerEnvFixture.asyncTransportMode,
      host: workerEnvFixture.host,
      port: workerEnvFixture.port,
      processControlJob: defaultProcessControlJob,
      processSyncJob: async ({ mailboxId }) => ({
        mailboxId,
        syncRunId: "sr_sync",
        startedAt: "2026-03-25T00:00:00.000Z",
        status: "completed",
        completedAt: "2026-03-25T00:00:01.000Z",
        eventsEmitted: 2,
        nextCursor: "hist_456",
      }),
      processWebhookDelivery: async ({ deliveryId }) => ({
        deliveryId,
        status: "delivered",
        attemptCount: 1,
        nextAttemptAt: null,
      }),
    });
    activeRuntimeClosers.push(runtime.close);

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailboxId: "",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_mailbox_sync_request",
    });
  });

  it("allows the runtime to close more than once", async () => {
    const runtime = await startWorkerHttpRuntime({
      asyncTransportMode: workerEnvFixture.asyncTransportMode,
      host: workerEnvFixture.host,
      port: workerEnvFixture.port,
      processControlJob: defaultProcessControlJob,
      processSyncJob: async ({ mailboxId }) => ({
        mailboxId,
        syncRunId: "sr_sync",
        startedAt: "2026-03-25T00:00:00.000Z",
        status: "completed",
        completedAt: "2026-03-25T00:00:01.000Z",
        eventsEmitted: 2,
        nextCursor: "hist_456",
      }),
      processWebhookDelivery: async ({ deliveryId }) => ({
        deliveryId,
        status: "delivered",
        attemptCount: 1,
        nextAttemptAt: null,
      }),
    });

    await expect(runtime.close()).resolves.toBeUndefined();
    await expect(runtime.close()).resolves.toBeUndefined();
  });

  it("runs the webhook delivery workflow through /internal/webhook-deliveries", async () => {
    const runtime = await startWorkerHttpRuntime({
      asyncTransportMode: workerEnvFixture.asyncTransportMode,
      host: workerEnvFixture.host,
      port: workerEnvFixture.port,
      processControlJob: defaultProcessControlJob,
      processSyncJob: async ({ mailboxId }) => ({
        mailboxId,
        syncRunId: "sr_sync",
        startedAt: "2026-03-25T00:00:00.000Z",
        status: "completed",
        completedAt: "2026-03-25T00:00:01.000Z",
        eventsEmitted: 2,
        nextCursor: "hist_456",
      }),
      processWebhookDelivery: async ({ deliveryId }) => ({
        deliveryId,
        status: "scheduled_for_retry",
        attemptCount: 2,
        nextAttemptAt: "2026-03-25T00:00:10.000Z",
      }),
    });
    activeRuntimeClosers.push(runtime.close);

    const response = await fetch(
      `http://${runtime.host}:${runtime.port}/internal/webhook-deliveries`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          deliveryId: "del_demo",
          notBefore: "2026-03-25T00:00:00.000Z",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deliveryId: "del_demo",
      status: "scheduled_for_retry",
      attemptCount: 2,
      nextAttemptAt: "2026-03-25T00:00:10.000Z",
    });
  });

  it("runs the control job workflow through /internal/control-jobs", async () => {
    const runtime = await startWorkerHttpRuntime({
      asyncTransportMode: workerEnvFixture.asyncTransportMode,
      host: workerEnvFixture.host,
      port: workerEnvFixture.port,
      processControlJob: async (request) =>
        request.kind === "renew_watches"
          ? {
              completedAt: "2026-03-25T00:00:00.000Z",
              expired: 1,
              expiring: 2,
              failed: 0,
              kind: request.kind,
              renewed: 3,
              scanned: 3,
              status: "completed" as const,
            }
          : {
              completedAt: "2026-03-25T00:00:00.000Z",
              kind: request.kind,
              status: "noop" as const,
            },
      processSyncJob: async ({ mailboxId }) => ({
        mailboxId,
        syncRunId: "sr_sync",
        startedAt: "2026-03-25T00:00:00.000Z",
        status: "completed",
        completedAt: "2026-03-25T00:00:01.000Z",
        eventsEmitted: 2,
        nextCursor: "hist_456",
      }),
      processWebhookDelivery: async ({ deliveryId }) => ({
        deliveryId,
        status: "delivered",
        attemptCount: 1,
        nextAttemptAt: null,
      }),
    });
    activeRuntimeClosers.push(runtime.close);

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/control-jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "renew_watches",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: "renew_watches",
      renewed: 3,
      status: "completed",
    });
  });

  it("rejects invalid webhook delivery payloads", async () => {
    const runtime = await startWorkerHttpRuntime({
      asyncTransportMode: workerEnvFixture.asyncTransportMode,
      host: workerEnvFixture.host,
      port: workerEnvFixture.port,
      processControlJob: defaultProcessControlJob,
      processSyncJob: async ({ mailboxId }) => ({
        mailboxId,
        syncRunId: "sr_sync",
        startedAt: "2026-03-25T00:00:00.000Z",
        status: "completed",
        completedAt: "2026-03-25T00:00:01.000Z",
        eventsEmitted: 2,
        nextCursor: "hist_456",
      }),
      processWebhookDelivery: async ({ deliveryId }) => ({
        deliveryId,
        status: "delivered",
        attemptCount: 1,
        nextAttemptAt: null,
      }),
    });
    activeRuntimeClosers.push(runtime.close);

    const response = await fetch(
      `http://${runtime.host}:${runtime.port}/internal/webhook-deliveries`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          deliveryId: "",
          notBefore: "2026-03-25T00:00:00.000Z",
        }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_webhook_delivery_request",
    });
  });
});
