import type { WorkerEnv } from "@mailmon/config";
import type { ControlJobDispatchRequest, GmailPushNotification } from "@mailmon/core";
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
  syncDispatchPubSubTopicName: null,
  gcpProjectId: null,
  gcpRegion: null,
  gcpSchedulerServiceAccountEmail: null,
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
  if (request.kind === "repair_mailboxes") {
    return {
      completedAt: "2026-03-25T00:00:00.000Z",
      cursorResets: 0,
      dispatched: 0,
      kind: request.kind,
      scanned: 0,
      status: "completed" as const,
    };
  }

  if (request.kind === "recover_stuck_syncs") {
    return {
      completedAt: "2026-03-25T00:00:00.000Z",
      dispatched: 0,
      kind: request.kind,
      recovered: 0,
      recoveredExecutions: [],
      scanned: 0,
      skippedReconnectRequired: 0,
      status: "completed" as const,
    };
  }

  if (request.kind === "recover_webhook_deliveries") {
    return {
      completedAt: "2026-03-25T00:00:00.000Z",
      kind: request.kind,
      recovered: 0,
      status: "completed" as const,
    };
  }

  if (request.kind === "dispatch_replays") {
    return {
      completedAt: "2026-03-25T00:00:00.000Z",
      dispatched: 0,
      eventsReplayed: 0,
      failed: 0,
      kind: request.kind,
      scanned: 0,
      status: "completed" as const,
    };
  }

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

const defaultProcessGmailPushNotification = async (notification: GmailPushNotification) => {
  return {
    dispatched: 0,
    emailAddress: notification.emailAddress,
    historyId: notification.historyId,
    kind: "gmail_push" as const,
    status: "accepted" as const,
  };
};

interface GcpVerifiedTokenFixture {
  readonly audience: string;
  readonly email: string;
  readonly emailVerified: boolean | null;
  readonly issuer: string;
}

const gcpVerifiedTokens: Readonly<Record<string, GcpVerifiedTokenFixture>> = {
  "untrusted-audience-token": {
    audience: "https://other-worker.example.com",
    email: "scheduler@mailmon-staging.iam.gserviceaccount.com",
    emailVerified: true,
    issuer: "https://accounts.google.com",
  },
  "untrusted-issuer-token": {
    audience: "https://worker.example.com",
    email: "scheduler@mailmon-staging.iam.gserviceaccount.com",
    emailVerified: true,
    issuer: "https://issuer.example.com",
  },
  "unverified-email-token": {
    audience: "https://worker.example.com",
    email: "scheduler@mailmon-staging.iam.gserviceaccount.com",
    emailVerified: false,
    issuer: "https://accounts.google.com",
  },
  "missing-email-verification-token": {
    audience: "https://worker.example.com",
    email: "scheduler@mailmon-staging.iam.gserviceaccount.com",
    emailVerified: null,
    issuer: "https://accounts.google.com",
  },
  "valid-scheduler-token": {
    audience: "https://worker.example.com",
    email: "scheduler@mailmon-staging.iam.gserviceaccount.com",
    emailVerified: true,
    issuer: "https://accounts.google.com",
  },
  "valid-unauthorized-token": {
    audience: "https://worker.example.com",
    email: "other@mailmon-staging.iam.gserviceaccount.com",
    emailVerified: true,
    issuer: "https://accounts.google.com",
  },
} as const;

const gcpInternalAuth = {
  allowedServiceAccountEmails: [
    "scheduler@mailmon-staging.iam.gserviceaccount.com",
    "tasks@mailmon-staging.iam.gserviceaccount.com",
  ],
  audience: "https://worker.example.com",
  verifier: {
    verify: async (idToken: string, audience: string) => {
      const token = gcpVerifiedTokens[idToken];

      return token !== undefined && audience === "https://worker.example.com"
        ? token
        : Promise.reject(new Error("invalid token"));
    },
  },
};

const gcpAuthorizationHeaders = {
  authorization: "Bearer valid-scheduler-token",
  "content-type": "application/json",
};

type WorkerHttpRuntimeOptions = Parameters<typeof startWorkerHttpRuntime>[0];

const startWorkerTestRuntime = async (overrides: Partial<WorkerHttpRuntimeOptions> = {}) => {
  const runtime = await startWorkerHttpRuntime({
    asyncTransportMode: workerEnvFixture.asyncTransportMode,
    host: workerEnvFixture.host,
    port: workerEnvFixture.port,
    processGmailPushNotification: defaultProcessGmailPushNotification,
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
    ...overrides,
  });

  activeRuntimeClosers.push(runtime.close);

  return runtime;
};

const startGcpWorkerTestRuntime = (overrides: Partial<WorkerHttpRuntimeOptions> = {}) =>
  startWorkerTestRuntime({
    asyncTransportMode: "gcp",
    internalAuth: gcpInternalAuth,
    ...overrides,
  });

const createWorkerInternalRequest = (
  runtime: Awaited<ReturnType<typeof startWorkerHttpRuntime>>,
  path: string,
  body: unknown,
  options: Readonly<{
    headers?: HeadersInit;
  }> = {},
) =>
  fetch(`http://${runtime.host}:${runtime.port}${path}`, {
    method: "POST",
    headers: options.headers ?? {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("startWorkerHttpRuntime", () => {
  it("serves a health response in local mode", async () => {
    const runtime = await startWorkerTestRuntime({
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
    });

    const response = await fetch(`http://${runtime.host}:${runtime.port}/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      transportMode: "local",
    });
  });

  it("runs the mailbox sync workflow through /internal/sync", async () => {
    const runtime = await startWorkerTestRuntime();
    const response = await createWorkerInternalRequest(runtime, "/internal/sync", {
      mailboxId: "mbx_demo",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mailboxId: "mbx_demo",
      status: "completed",
      nextCursor: "hist_456",
    });
  });

  it("rejects invalid sync payloads", async () => {
    const runtime = await startWorkerTestRuntime();
    const response = await createWorkerInternalRequest(runtime, "/internal/sync", {
      mailboxId: "",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_mailbox_sync_request",
    });
  });

  it("accepts mailbox sync dead-letter envelopes and records exhaustion", async () => {
    const runtime = await startWorkerTestRuntime({
      processMailboxSyncDeadLetter: async ({ mailboxId }) => ({
        mailboxId,
        status: "recorded",
        syncRunId: "sr_exhausted",
        recordedAt: "2026-03-25T00:00:02.000Z",
        detail: "mailbox_sync_dispatch_retry_exhausted",
      }),
    });
    const response = await createWorkerInternalRequest(runtime, "/internal/sync-dead-letter", {
      message: {
        data: Buffer.from(JSON.stringify({ mailboxId: "mbx_demo" }), "utf8").toString("base64"),
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mailboxId: "mbx_demo",
      status: "recorded",
      detail: "mailbox_sync_dispatch_retry_exhausted",
    });
  });

  it("acknowledges malformed mailbox sync dead-letter envelopes", async () => {
    const runtime = await startWorkerTestRuntime();
    const response = await createWorkerInternalRequest(runtime, "/internal/sync-dead-letter", {
      message: {
        data: "not-valid-json",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "accepted",
    });
  });

  it("accepts Gmail push wake-ups without decoding in local mode", async () => {
    const runtime = await startWorkerTestRuntime({
      processGmailPushNotification: async () => {
        throw new Error("local mode should not dispatch Gmail push notifications");
      },
    });
    const response = await createWorkerInternalRequest(runtime, "/internal/gmail-push", {
      malformed: true,
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      status: "accepted",
      detail:
        "Local mode accepts Gmail push wake-ups, but direct sync dispatch should use /internal/sync.",
    });
  });

  it("decodes GCP Pub/Sub mailbox sync dispatches", async () => {
    const syncJobs: string[] = [];
    const runtime = await startGcpWorkerTestRuntime({
      processSyncJob: async ({ mailboxId }) => {
        syncJobs.push(mailboxId);

        return {
          mailboxId,
          syncRunId: "sr_sync",
          startedAt: "2026-03-25T00:00:00.000Z",
          status: "completed",
          completedAt: "2026-03-25T00:00:01.000Z",
          eventsEmitted: 2,
          nextCursor: "hist_456",
        };
      },
    });

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/sync`, {
      method: "POST",
      headers: gcpAuthorizationHeaders,
      body: JSON.stringify({
        message: {
          data: Buffer.from(
            JSON.stringify({
              mailboxId: "mbx_pubsub",
            }),
          ).toString("base64"),
          messageId: "pubsub_msg_sync_123",
        },
        subscription: "projects/mailmon-staging/subscriptions/mailbox-sync-dispatch-worker",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mailboxId: "mbx_pubsub",
      status: "completed",
    });
    expect(syncJobs).toEqual(["mbx_pubsub"]);
  });

  it("requires internal authentication outside local mode", async () => {
    await expect(
      startWorkerHttpRuntime({
        asyncTransportMode: "gcp",
        host: workerEnvFixture.host,
        port: workerEnvFixture.port,
        processGmailPushNotification: defaultProcessGmailPushNotification,
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
      }),
    ).rejects.toThrow("Internal worker authentication is required outside local mode.");
  });

  it("rejects unauthenticated internal requests in gcp mode", async () => {
    const runtime = await startGcpWorkerTestRuntime();

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailboxId: "mbx_demo",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "worker_internal_auth_required",
    });
  });

  it("rejects invalid internal auth tokens in gcp mode", async () => {
    const runtime = await startGcpWorkerTestRuntime();

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/sync`, {
      method: "POST",
      headers: {
        authorization: "Bearer invalid-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailboxId: "mbx_demo",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "worker_internal_auth_invalid",
      detail: "The internal worker authorization token is invalid.",
    });
  });

  it("rejects untrusted internal auth tokens in gcp mode", async () => {
    const runtime = await startGcpWorkerTestRuntime();

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/sync`, {
      method: "POST",
      headers: {
        authorization: "Bearer untrusted-issuer-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailboxId: "mbx_demo",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "worker_internal_auth_forbidden",
      detail: "The internal worker authorization token is not trusted for this worker.",
    });
  });

  it("rejects internal auth tokens with an untrusted audience in gcp mode", async () => {
    const runtime = await startGcpWorkerTestRuntime();

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/sync`, {
      method: "POST",
      headers: {
        authorization: "Bearer untrusted-audience-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailboxId: "mbx_demo",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "worker_internal_auth_forbidden",
      detail: "The internal worker authorization token is not trusted for this worker.",
    });
  });

  it("rejects internal requests from unauthorized service accounts in gcp mode", async () => {
    const runtime = await startGcpWorkerTestRuntime();

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/sync`, {
      method: "POST",
      headers: {
        authorization: "Bearer valid-unauthorized-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailboxId: "mbx_demo",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "worker_internal_auth_forbidden",
    });
  });

  it("rejects internal auth tokens without a verified service account in gcp mode", async () => {
    const runtime = await startGcpWorkerTestRuntime();

    for (const token of ["unverified-email-token", "missing-email-verification-token"]) {
      const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/sync`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mailboxId: "mbx_demo",
        }),
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        code: "worker_internal_auth_forbidden",
        detail: "The internal worker authorization token is missing a verified service account.",
      });
    }
  });

  it("preserves retryable sync failures across the internal http boundary", async () => {
    const runtime = await startWorkerTestRuntime({
      processSyncJob: async () => {
        throw {
          code: "gmail_history_fetch_failed",
          detail: "Fetching Gmail history failed with HTTP 503.",
          retryable: true,
          status: 503,
          title: "Gmail history fetch failed",
          type: "https://api.mailmon.dev/problems/gmail-history-fetch-failed",
        };
      },
    });

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailboxId: "mbx_demo",
      }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "gmail_history_fetch_failed",
      detail: "Fetching Gmail history failed with HTTP 503.",
      retryable: true,
      status: 503,
    });
  });

  it("allows the runtime to close more than once", async () => {
    const runtime = await startWorkerTestRuntime();

    await expect(runtime.close()).resolves.toBeUndefined();
    await expect(runtime.close()).resolves.toBeUndefined();
  });

  it("decodes GCP Pub/Sub Gmail pushes and dispatches mailbox sync wake-ups", async () => {
    const notifications: GmailPushNotification[] = [];
    const runtime = await startGcpWorkerTestRuntime({
      processGmailPushNotification: async (notification) => {
        notifications.push(notification);

        return {
          dispatched: 2,
          emailAddress: notification.emailAddress,
          historyId: notification.historyId,
          kind: "gmail_push",
          status: "accepted",
        };
      },
    });

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/gmail-push`, {
      method: "POST",
      headers: gcpAuthorizationHeaders,
      body: JSON.stringify({
        message: {
          data: Buffer.from(
            JSON.stringify({
              emailAddress: "demo@mailmon.dev",
              historyId: "hist_push_123",
            }),
          ).toString("base64"),
          messageId: "pubsub_msg_123",
        },
        subscription: "projects/mailmon-staging/subscriptions/gmail-push-worker",
      }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      dispatched: 2,
      emailAddress: "demo@mailmon.dev",
      historyId: "hist_push_123",
      kind: "gmail_push",
      status: "accepted",
    });
    expect(notifications).toEqual([
      {
        emailAddress: "demo@mailmon.dev",
        historyId: "hist_push_123",
        messageId: "pubsub_msg_123",
        subscription: "projects/mailmon-staging/subscriptions/gmail-push-worker",
      },
    ]);
  });

  it("rejects malformed GCP Gmail push envelopes", async () => {
    const runtime = await startGcpWorkerTestRuntime();

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/gmail-push`, {
      method: "POST",
      headers: gcpAuthorizationHeaders,
      body: JSON.stringify({
        message: {
          data: Buffer.from(JSON.stringify({ emailAddress: "demo@mailmon.dev" })).toString(
            "base64",
          ),
        },
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_gmail_push_request",
    });
  });

  it("runs the webhook delivery workflow through /internal/webhook-deliveries", async () => {
    const runtime = await startWorkerTestRuntime({
      processWebhookDelivery: async ({ deliveryId }) => ({
        deliveryId,
        status: "scheduled_for_retry",
        attemptCount: 2,
        nextAttemptAt: "2026-03-25T00:00:10.000Z",
      }),
    });

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

  it("preserves retryable webhook delivery failures across the internal http boundary", async () => {
    const runtime = await startWorkerTestRuntime({
      processWebhookDelivery: async () => {
        throw {
          code: "webhook_delivery_timeout",
          detail: "Webhook delivery timed out before the endpoint responded.",
          retryable: true,
          status: 503,
          title: "Webhook delivery timeout",
          type: "https://api.mailmon.dev/problems/webhook-delivery-timeout",
        };
      },
    });

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

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "webhook_delivery_timeout",
      detail: "Webhook delivery timed out before the endpoint responded.",
      retryable: true,
      status: 503,
    });
  });

  it("runs the control job workflow through /internal/control-jobs", async () => {
    const runtime = await startWorkerTestRuntime({
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
          : request.kind === "repair_mailboxes"
            ? {
                completedAt: "2026-03-25T00:00:00.000Z",
                cursorResets: 1,
                dispatched: 2,
                kind: request.kind,
                scanned: 2,
                status: "completed" as const,
              }
            : request.kind === "recover_stuck_syncs"
              ? {
                  completedAt: "2026-03-25T00:00:00.000Z",
                  dispatched: 1,
                  kind: request.kind,
                  recovered: 1,
                  recoveredExecutions: [
                    {
                      mailboxId: "mbx_demo",
                      leaseOwnerId: "lease_owner",
                      syncRunId: "sr_stuck",
                    },
                  ],
                  scanned: 1,
                  skippedReconnectRequired: 0,
                  status: "completed" as const,
                }
              : request.kind === "recover_webhook_deliveries"
                ? {
                    completedAt: "2026-03-25T00:00:00.000Z",
                    kind: request.kind,
                    recovered: 0,
                    status: "completed" as const,
                  }
                : request.kind === "dispatch_replays"
                  ? {
                      completedAt: "2026-03-25T00:00:00.000Z",
                      dispatched: 0,
                      eventsReplayed: 0,
                      failed: 0,
                      kind: request.kind,
                      scanned: 0,
                      status: "completed" as const,
                    }
                  : {
                      completedAt: "2026-03-25T00:00:00.000Z",
                      kind: request.kind,
                      status: "noop" as const,
                    },
    });

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

  it("maps unknown processor failures to worker internal errors", async () => {
    const runtime = await startWorkerTestRuntime({
      processControlJob: async () => {
        throw new Error("unexpected control job failure");
      },
    });
    const response = await createWorkerInternalRequest(runtime, "/internal/control-jobs", {
      kind: "renew_watches",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      code: "worker_internal_error",
      detail: "The worker failed while processing the control job request.",
    });
  });

  it("accepts stuck mailbox sync recovery control jobs", async () => {
    const controlJobs: ControlJobDispatchRequest[] = [];
    const runtime = await startWorkerTestRuntime({
      processControlJob: async (request) => {
        controlJobs.push(request);

        return {
          completedAt: "2026-03-25T00:00:00.000Z",
          dispatched: 1,
          kind: "recover_stuck_syncs",
          recovered: 1,
          recoveredExecutions: [
            {
              mailboxId: "mbx_demo",
              leaseOwnerId: "lease_owner",
              syncRunId: "sr_stuck",
            },
          ],
          scanned: 1,
          skippedReconnectRequired: 0,
          status: "completed",
        };
      },
    });

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/control-jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "recover_stuck_syncs",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      dispatched: 1,
      kind: "recover_stuck_syncs",
      recovered: 1,
      scanned: 1,
      status: "completed",
    });
    expect(controlJobs).toEqual([{ kind: "recover_stuck_syncs" }]);
  });

  it("accepts webhook delivery recovery control jobs", async () => {
    const controlJobs: ControlJobDispatchRequest[] = [];
    const runtime = await startWorkerTestRuntime({
      processControlJob: async (request) => {
        controlJobs.push(request);

        return {
          completedAt: "2026-03-25T00:00:00.000Z",
          kind: "recover_webhook_deliveries",
          recovered: 2,
          status: "completed",
        };
      },
    });

    const response = await fetch(`http://${runtime.host}:${runtime.port}/internal/control-jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        kind: "recover_webhook_deliveries",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      kind: "recover_webhook_deliveries",
      recovered: 2,
      status: "completed",
    });
    expect(controlJobs).toEqual([{ kind: "recover_webhook_deliveries" }]);
  });

  it("rejects invalid control job payloads", async () => {
    const runtime = await startWorkerTestRuntime();
    const response = await createWorkerInternalRequest(runtime, "/internal/control-jobs", {
      kind: "unknown",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_control_job_request",
    });
  });

  it("rejects invalid webhook delivery payloads", async () => {
    const runtime = await startWorkerTestRuntime();

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
