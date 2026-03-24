import {
  ControlJobDispatcher,
  MailboxSyncDispatcher,
  WebhookDeliveryScheduler,
  type ControlJobDispatchRequest,
  type WebhookDeliveryScheduleRequest,
} from "@mailmon/core";
import { Context, Effect, Layer, Ref } from "effect";

export { MailboxSyncJobDataSchema, type MailboxSyncJobData } from "@mailmon/core";

export const SYNC_MAILBOX_QUEUE = "mailmon.sync-mailbox";

export const createMailboxSyncJobData = (mailboxId: string) => {
  return {
    mailboxId,
  };
};

export const createRedisConnectionOptions = (redisUrl: string) => {
  const url = new URL(redisUrl);
  const database = url.pathname === "" ? undefined : Number(url.pathname.slice(1));

  return {
    db: Number.isNaN(database) ? undefined : database,
    host: url.hostname,
    maxRetriesPerRequest: null,
    password: url.password === "" ? undefined : url.password,
    port: Number(url.port || "6379"),
  };
};

export interface LocalAsyncTransportSnapshot {
  readonly mailboxSyncMailboxIds: ReadonlyArray<string>;
  readonly webhookDeliveries: ReadonlyArray<WebhookDeliveryScheduleRequest>;
  readonly controlJobs: ReadonlyArray<ControlJobDispatchRequest>;
}

const emptyLocalAsyncTransportSnapshot = (): LocalAsyncTransportSnapshot => {
  return {
    mailboxSyncMailboxIds: [],
    webhookDeliveries: [],
    controlJobs: [],
  };
};

export class LocalAsyncTransportProbe extends Context.Tag(
  "@mailmon/queue/LocalAsyncTransportProbe",
)<
  LocalAsyncTransportProbe,
  {
    readonly getSnapshot: Effect.Effect<LocalAsyncTransportSnapshot>;
    readonly reset: Effect.Effect<void>;
  }
>() {}

export const createLocalAsyncTransportLayer = Layer.unwrapEffect(
  Effect.gen(function* () {
    const snapshotRef = yield* Ref.make<LocalAsyncTransportSnapshot>(
      emptyLocalAsyncTransportSnapshot(),
    );

    return Layer.mergeAll(
      Layer.succeed(MailboxSyncDispatcher, {
        dispatchMailboxSync: (mailboxId: string) =>
          Ref.update(snapshotRef, (snapshot) => ({
            ...snapshot,
            mailboxSyncMailboxIds: [...snapshot.mailboxSyncMailboxIds, mailboxId],
          })),
      }),
      Layer.succeed(WebhookDeliveryScheduler, {
        scheduleWebhookDelivery: (request: WebhookDeliveryScheduleRequest) =>
          Ref.update(snapshotRef, (snapshot) => ({
            ...snapshot,
            webhookDeliveries: [...snapshot.webhookDeliveries, request],
          })),
      }),
      Layer.succeed(ControlJobDispatcher, {
        dispatchControlJob: (request: ControlJobDispatchRequest) =>
          Ref.update(snapshotRef, (snapshot) => ({
            ...snapshot,
            controlJobs: [...snapshot.controlJobs, request],
          })),
      }),
      Layer.succeed(LocalAsyncTransportProbe, {
        getSnapshot: Ref.get(snapshotRef),
        reset: Ref.set(snapshotRef, emptyLocalAsyncTransportSnapshot()),
      }),
    );
  }),
);
