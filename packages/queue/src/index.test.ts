import {
  ControlJobDispatcher,
  MailboxSyncDispatcher,
  WebhookDeliveryScheduler,
} from "@mailmon/core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  createLocalAsyncTransportLayer,
  createMailboxSyncJobData,
  DEFAULT_LOCAL_WORKER_BASE_URL,
  LocalAsyncTransportProbe,
  SYNC_MAILBOX_QUEUE,
} from "./index.js";

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
      webhookDeliveries: [{ deliveryId: "del_123" }],
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
});
