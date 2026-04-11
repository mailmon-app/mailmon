import {
  ControlJobDispatcher,
  MailboxSyncDispatcher,
  WebhookDeliveryScheduler,
  type ControlJobDispatchRequest,
  type WebhookDeliveryScheduleRequest,
} from "@mailmon/core";
import { Context, Effect, Layer, Ref, Runtime } from "effect";

export { MailboxSyncJobDataSchema, type MailboxSyncJobData } from "@mailmon/core";

export const SYNC_MAILBOX_QUEUE = "mailmon.sync-mailbox";
export const DEFAULT_LOCAL_WORKER_BASE_URL = "http://127.0.0.1:3001";

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

export interface LocalAsyncTransportOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly onWebhookDeliveryDispatchError?: (
    error: unknown,
    request: WebhookDeliveryScheduleRequest,
  ) => void;
  readonly workerBaseUrl?: string;
}

const normalizeWorkerBaseUrl = (workerBaseUrl: string) => {
  return workerBaseUrl.endsWith("/") ? workerBaseUrl.slice(0, -1) : workerBaseUrl;
};

const dispatchWorkerJson = (
  fetchImpl: typeof globalThis.fetch,
  workerBaseUrl: string,
  path: string,
  body: unknown,
  failureMessage: string,
) =>
  Effect.promise(async () => {
    const response = await fetchImpl(`${workerBaseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`${failureMessage} ${response.status}: ${await response.text()}`);
    }
  });

export const createLocalAsyncTransportLayer = (options: LocalAsyncTransportOptions = {}) =>
  Layer.unwrapEffect(
    Effect.gen(function* () {
      const snapshotRef = yield* Ref.make<LocalAsyncTransportSnapshot>(
        emptyLocalAsyncTransportSnapshot(),
      );
      const fetchImpl = options.fetch ?? globalThis.fetch;
      const runtime = yield* Effect.runtime();
      const runPromise = Runtime.runPromise(runtime);
      const workerBaseUrl = normalizeWorkerBaseUrl(
        options.workerBaseUrl ?? DEFAULT_LOCAL_WORKER_BASE_URL,
      );
      const scheduleWebhookDeliveryDispatch = (request: WebhookDeliveryScheduleRequest) =>
        Effect.suspend(() => {
          const delayMs = Math.max(0, Date.parse(request.notBefore) - Date.now());

          if (delayMs === 0) {
            return dispatchWorkerJson(
              fetchImpl,
              workerBaseUrl,
              "/internal/webhook-deliveries",
              request,
              "Local webhook delivery dispatch failed with",
            );
          }

          return Effect.sync(() => {
            globalThis.setTimeout(() => {
              void runPromise(
                dispatchWorkerJson(
                  fetchImpl,
                  workerBaseUrl,
                  "/internal/webhook-deliveries",
                  request,
                  "Local webhook delivery dispatch failed with",
                ),
              ).catch((error) => {
                options.onWebhookDeliveryDispatchError?.(error, request);
              });
            }, delayMs);
          });
        });

      return Layer.mergeAll(
        Layer.succeed(MailboxSyncDispatcher, {
          dispatchMailboxSync: (mailboxId: string) =>
            Ref.update(snapshotRef, (snapshot) => ({
              ...snapshot,
              mailboxSyncMailboxIds: [...snapshot.mailboxSyncMailboxIds, mailboxId],
            })).pipe(
              Effect.zipRight(
                dispatchWorkerJson(
                  fetchImpl,
                  workerBaseUrl,
                  "/internal/sync",
                  createMailboxSyncJobData(mailboxId),
                  "Local mailbox sync dispatch failed with",
                ),
              ),
            ),
        }),
        Layer.succeed(WebhookDeliveryScheduler, {
          scheduleWebhookDelivery: (request: WebhookDeliveryScheduleRequest) =>
            Ref.update(snapshotRef, (snapshot) => ({
              ...snapshot,
              webhookDeliveries: [...snapshot.webhookDeliveries, request],
            })).pipe(
              Effect.zipRight(scheduleWebhookDeliveryDispatch(request)),
            ),
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
