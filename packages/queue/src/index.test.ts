import {
  ControlJobDispatcher,
  MailboxSyncDispatcher,
  WebhookDeliveryScheduler,
} from "@mailmon/core";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLocalAsyncTransportLayer,
  createGcpWebhookDeliverySchedulerLayer,
  createMailboxSyncJobData,
  createWorkerHttpControlJobDispatcherLayer,
  createWorkerHttpMailboxSyncDispatcherLayer,
  DEFAULT_GCP_WEBHOOK_DELIVERY_QUEUE_ID,
  DEFAULT_LOCAL_WORKER_BASE_URL,
  LocalAsyncTransportProbe,
  SYNC_MAILBOX_QUEUE,
} from "./index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("SYNC_MAILBOX_QUEUE", () => {
  it("uses a stable queue name", () => {
    expect(SYNC_MAILBOX_QUEUE).toBe("mailmon.sync-mailbox");
  });
});

describe("createMailboxSyncJobData", () => {
  it("uses mailbox ids as the unit of work", () => {
    expect(createMailboxSyncJobData("mbx_123")).toEqual({
      mailboxId: "mbx_123",
    });
  });
});

describe("createLocalAsyncTransportLayer", () => {
  it("dispatches mailbox syncs to the worker runtime while recording local probe state", async () => {
    const requests: Array<{
      readonly body: string | null;
      readonly headers: HeadersInit | undefined;
      readonly method: string | undefined;
      readonly url: string;
    }> = [];
    const program = Effect.gen(function* () {
      const mailboxSyncDispatcher = yield* MailboxSyncDispatcher;
      const webhookDeliveryScheduler = yield* WebhookDeliveryScheduler;
      const controlJobDispatcher = yield* ControlJobDispatcher;
      const probe = yield* LocalAsyncTransportProbe;

      yield* mailboxSyncDispatcher.dispatchMailboxSync("mbx_123");
      yield* webhookDeliveryScheduler.scheduleWebhookDelivery({
        deliveryId: "del_123",
        notBefore: "2026-03-24T00:00:00.000Z",
      });
      yield* controlJobDispatcher.dispatchControlJob({
        kind: "repair_mailboxes",
      });

      return yield* probe.getSnapshot;
    });

    await expect(
      Effect.runPromise(
        program.pipe(
          Effect.provide(
            createLocalAsyncTransportLayer({
              fetch: async (url, init) => {
                const requestUrl =
                  typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
                requests.push({
                  body: typeof init?.body === "string" ? init.body : null,
                  headers: init?.headers,
                  method: init?.method,
                  url: requestUrl,
                });

                return new Response(null, {
                  status: 200,
                });
              },
            }),
          ),
        ),
      ),
    ).resolves.toEqual({
      mailboxSyncMailboxIds: ["mbx_123"],
      webhookDeliveries: [
        {
          deliveryId: "del_123",
          notBefore: "2026-03-24T00:00:00.000Z",
        },
      ],
      controlJobs: [{ kind: "repair_mailboxes" }],
    });

    expect(requests).toEqual([
      {
        body: JSON.stringify({
          mailboxId: "mbx_123",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
        url: `${DEFAULT_LOCAL_WORKER_BASE_URL}/internal/sync`,
      },
      {
        body: JSON.stringify({
          deliveryId: "del_123",
          notBefore: "2026-03-24T00:00:00.000Z",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
        url: `${DEFAULT_LOCAL_WORKER_BASE_URL}/internal/webhook-deliveries`,
      },
      {
        body: JSON.stringify({
          kind: "repair_mailboxes",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
        url: `${DEFAULT_LOCAL_WORKER_BASE_URL}/internal/control-jobs`,
      },
    ]);
  });

  it("can reset the recorded local transport state", async () => {
    const program = Effect.gen(function* () {
      const mailboxSyncDispatcher = yield* MailboxSyncDispatcher;
      const probe = yield* LocalAsyncTransportProbe;

      yield* mailboxSyncDispatcher.dispatchMailboxSync("mbx_123");
      yield* probe.reset;

      return yield* probe.getSnapshot;
    });

    await expect(
      Effect.runPromise(
        program.pipe(
          Effect.provide(
            createLocalAsyncTransportLayer({
              fetch: async () =>
                new Response(null, {
                  status: 200,
                }),
            }),
          ),
        ),
      ),
    ).resolves.toEqual({
      mailboxSyncMailboxIds: [],
      webhookDeliveries: [],
      controlJobs: [],
    });
  });

  it("delays webhook delivery dispatches until the durable due time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T00:00:00.000Z"));

    const requests: string[] = [];
    const program = Effect.gen(function* () {
      const webhookDeliveryScheduler = yield* WebhookDeliveryScheduler;
      const probe = yield* LocalAsyncTransportProbe;

      yield* webhookDeliveryScheduler.scheduleWebhookDelivery({
        deliveryId: "del_456",
        notBefore: "2026-03-24T00:00:05.000Z",
      });

      return yield* probe.getSnapshot;
    });

    const snapshot = await Effect.runPromise(
      program.pipe(
        Effect.provide(
          createLocalAsyncTransportLayer({
            fetch: async (url) => {
              requests.push(
                typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url,
              );

              return new Response(null, {
                status: 200,
              });
            },
          }),
        ),
      ),
    );

    expect(snapshot.webhookDeliveries).toEqual([
      {
        deliveryId: "del_456",
        notBefore: "2026-03-24T00:00:05.000Z",
      },
    ]);
    expect(requests).toEqual([]);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(requests).toEqual([`${DEFAULT_LOCAL_WORKER_BASE_URL}/internal/webhook-deliveries`]);
  });
});

describe("createWorkerHttpMailboxSyncDispatcherLayer", () => {
  it("dispatches mailbox sync requests over the worker http interface", async () => {
    const requests: string[] = [];
    const program = Effect.gen(function* () {
      const mailboxSyncDispatcher = yield* MailboxSyncDispatcher;

      yield* mailboxSyncDispatcher.dispatchMailboxSync("mbx_http");
    });

    await expect(
      Effect.runPromise(
        program.pipe(
          Effect.provide(
            createWorkerHttpMailboxSyncDispatcherLayer({
              fetch: async (url) => {
                requests.push(
                  typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url,
                );

                return new Response(null, {
                  status: 200,
                });
              },
            }),
          ),
        ),
      ),
    ).resolves.toBeUndefined();

    expect(requests).toEqual([`${DEFAULT_LOCAL_WORKER_BASE_URL}/internal/sync`]);
  });
});

describe("createWorkerHttpControlJobDispatcherLayer", () => {
  it("dispatches control job requests over the worker http interface", async () => {
    const requests: Array<{
      readonly body: string | null;
      readonly url: string;
    }> = [];
    const program = Effect.gen(function* () {
      const controlJobDispatcher = yield* ControlJobDispatcher;

      yield* controlJobDispatcher.dispatchControlJob({
        kind: "renew_watches",
      });
    });

    await expect(
      Effect.runPromise(
        program.pipe(
          Effect.provide(
            createWorkerHttpControlJobDispatcherLayer({
              fetch: async (url, init) => {
                requests.push({
                  body: typeof init?.body === "string" ? init.body : null,
                  url:
                    typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url,
                });

                return new Response(null, {
                  status: 200,
                });
              },
            }),
          ),
        ),
      ),
    ).resolves.toBeUndefined();

    expect(requests).toEqual([
      {
        body: JSON.stringify({
          kind: "renew_watches",
        }),
        url: `${DEFAULT_LOCAL_WORKER_BASE_URL}/internal/control-jobs`,
      },
    ]);
  });
});

describe("createGcpWebhookDeliverySchedulerLayer", () => {
  it("creates a cloud task for durable webhook delivery dispatch", async () => {
    const createTask = vi.fn(async () => undefined);
    const program = Effect.gen(function* () {
      const webhookDeliveryScheduler = yield* WebhookDeliveryScheduler;

      yield* webhookDeliveryScheduler.scheduleWebhookDelivery({
        deliveryId: "del_gcp",
        notBefore: "2026-03-24T00:00:05.250Z",
      });
    });

    vi.setSystemTime(new Date("2026-03-24T00:00:00.000Z"));

    await expect(
      Effect.runPromise(
        program.pipe(
          Effect.provide(
            createGcpWebhookDeliverySchedulerLayer({
              location: "us-central1",
              projectId: "mailmon-dev",
              taskClient: {
                createTask,
                queuePath: (projectId, location, queueId) =>
                  `projects/${projectId}/locations/${location}/queues/${queueId}`,
              },
              workerAudience: "https://worker.example.com",
              workerBaseUrl: "https://worker.example.com",
              serviceAccountEmail: "tasks@mailmon-dev.iam.gserviceaccount.com",
            }),
          ),
        ),
      ),
    ).resolves.toBeUndefined();

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledWith({
      parent: "projects/mailmon-dev/locations/us-central1/queues/mailmon-webhook-deliveries",
      task: {
        httpRequest: {
          body: Buffer.from(
            JSON.stringify({
              deliveryId: "del_gcp",
              notBefore: "2026-03-24T00:00:05.250Z",
            }),
          ).toString("base64"),
          headers: {
            "content-type": "application/json",
          },
          httpMethod: "POST",
          oidcToken: {
            audience: "https://worker.example.com",
            serviceAccountEmail: "tasks@mailmon-dev.iam.gserviceaccount.com",
          },
          url: "https://worker.example.com/internal/webhook-deliveries",
        },
        name: expect.stringContaining("/tasks/whd-"),
        scheduleTime: {
          nanos: 250000000,
          seconds: 1774310405,
        },
      },
    });
  });

  it("treats duplicate task creation as idempotent success", async () => {
    const program = Effect.gen(function* () {
      const webhookDeliveryScheduler = yield* WebhookDeliveryScheduler;

      yield* webhookDeliveryScheduler.scheduleWebhookDelivery({
        deliveryId: "del_duplicate",
        notBefore: "2026-03-24T00:00:00.000Z",
      });
    });

    await expect(
      Effect.runPromise(
        program.pipe(
          Effect.provide(
            createGcpWebhookDeliverySchedulerLayer({
              location: "us-central1",
              projectId: "mailmon-dev",
              queueId: DEFAULT_GCP_WEBHOOK_DELIVERY_QUEUE_ID,
              taskClient: {
                createTask: async () => {
                  throw {
                    code: 6,
                    message: "ALREADY_EXISTS",
                  };
                },
                queuePath: (projectId, location, queueId) =>
                  `projects/${projectId}/locations/${location}/queues/${queueId}`,
              },
              workerBaseUrl: "https://worker.example.com",
            }),
          ),
        ),
      ),
    ).resolves.toBeUndefined();
  });
});
