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
  it("records mailbox sync dispatches, webhook deliveries, and control jobs", async () => {
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
      Effect.runPromise(program.pipe(Effect.provide(createLocalAsyncTransportLayer))),
    ).resolves.toEqual({
      mailboxSyncMailboxIds: ["mbx_123"],
      webhookDeliveries: [{ deliveryId: "del_123" }],
      controlJobs: [{ kind: "repair_mailboxes" }],
    });
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
      Effect.runPromise(program.pipe(Effect.provide(createLocalAsyncTransportLayer))),
    ).resolves.toEqual({
      mailboxSyncMailboxIds: [],
      webhookDeliveries: [],
      controlJobs: [],
    });
  });
});
