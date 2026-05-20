import { createHash } from "node:crypto";

import { PubSub } from "@google-cloud/pubsub";
import { CloudTasksClient } from "@google-cloud/tasks";
import {
  ControlJobDispatcher,
  createMailboxSyncJobData,
  encodeInternalJsonPayload,
  MailboxSyncDispatcher,
  WebhookDeliveryScheduler,
  type ControlJobDispatchRequest,
  type WebhookDeliveryScheduleRequest,
} from "@mailmon/core";
import { Context, Effect, Layer, Ref } from "effect";

export {
  createMailboxSyncJobData,
  MailboxSyncJobDataSchema,
  type MailboxSyncJobData,
} from "@mailmon/core";

export const DEFAULT_LOCAL_WORKER_BASE_URL = "http://127.0.0.1:3001";
export const DEFAULT_GCP_WEBHOOK_DELIVERY_QUEUE_ID = "mailmon-webhook-deliveries";

const WEBHOOK_DELIVERY_TASK_PATH = "/internal/webhook-deliveries";
const MAILBOX_SYNC_TASK_PATH = "/internal/sync";
const CONTROL_JOB_TASK_PATH = "/internal/control-jobs";
const encodeJsonString = (value: unknown) => {
  return encodeInternalJsonPayload(value);
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

export class LocalAsyncTransportProbe extends Context.Service<
  LocalAsyncTransportProbe,
  {
    readonly getSnapshot: Effect.Effect<LocalAsyncTransportSnapshot>;
    readonly reset: Effect.Effect<void>;
  }
>()("@mailmon/queue/LocalAsyncTransportProbe") {}

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

const createMailboxSyncWorkerUrl = (workerBaseUrl: string) => {
  return `${normalizeWorkerBaseUrl(workerBaseUrl)}${MAILBOX_SYNC_TASK_PATH}`;
};

const createWebhookDeliveryWorkerUrl = (workerBaseUrl: string) => {
  return `${normalizeWorkerBaseUrl(workerBaseUrl)}${WEBHOOK_DELIVERY_TASK_PATH}`;
};

const createControlJobWorkerUrl = (workerBaseUrl: string) => {
  return `${normalizeWorkerBaseUrl(workerBaseUrl)}${CONTROL_JOB_TASK_PATH}`;
};

const dispatchWorkerJson = (
  fetchImpl: typeof globalThis.fetch,
  url: string,
  body: unknown,
  failureMessage: string,
) =>
  Effect.promise(async () => {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: encodeJsonString(body),
    });

    if (!response.ok) {
      throw new Error(`${failureMessage} ${response.status}: ${await response.text()}`);
    }
  });

const dispatchMailboxSyncToWorker = (
  fetchImpl: typeof globalThis.fetch,
  workerBaseUrl: string,
  mailboxId: string,
) => {
  return dispatchWorkerJson(
    fetchImpl,
    createMailboxSyncWorkerUrl(workerBaseUrl),
    createMailboxSyncJobData(mailboxId),
    "Mailbox sync dispatch failed with",
  );
};

const dispatchWebhookDeliveryToWorker = (
  fetchImpl: typeof globalThis.fetch,
  workerBaseUrl: string,
  request: WebhookDeliveryScheduleRequest,
  failureMessage: string,
) => {
  return dispatchWorkerJson(
    fetchImpl,
    createWebhookDeliveryWorkerUrl(workerBaseUrl),
    request,
    failureMessage,
  );
};

const dispatchControlJobToWorker = (
  fetchImpl: typeof globalThis.fetch,
  workerBaseUrl: string,
  request: ControlJobDispatchRequest,
) => {
  return dispatchWorkerJson(
    fetchImpl,
    createControlJobWorkerUrl(workerBaseUrl),
    request,
    "Control job dispatch failed with",
  );
};

export interface WorkerHttpMailboxSyncDispatcherOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly workerBaseUrl?: string;
}

export const createWorkerHttpMailboxSyncDispatcherLayer = (
  options: WorkerHttpMailboxSyncDispatcherOptions = {},
) => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const workerBaseUrl = normalizeWorkerBaseUrl(
    options.workerBaseUrl ?? DEFAULT_LOCAL_WORKER_BASE_URL,
  );

  return Layer.succeed(MailboxSyncDispatcher, {
    dispatchMailboxSync: (mailboxId: string) =>
      dispatchMailboxSyncToWorker(fetchImpl, workerBaseUrl, mailboxId),
  });
};

export interface PubSubTopicLike {
  readonly publishMessage: (message: {
    readonly attributes?: Readonly<Record<string, string>>;
    readonly data: Buffer;
  }) => Promise<unknown>;
}

export interface PubSubClientLike {
  readonly topic: (name: string) => PubSubTopicLike;
}

export interface GcpMailboxSyncDispatcherOptions {
  readonly pubSubClient?: PubSubClientLike;
  readonly topicName: string;
}

export const createGcpMailboxSyncDispatcherLayer = (options: GcpMailboxSyncDispatcherOptions) => {
  const pubSubClient = options.pubSubClient ?? new PubSub();
  const topic = pubSubClient.topic(options.topicName);

  return Layer.succeed(MailboxSyncDispatcher, {
    dispatchMailboxSync: (mailboxId: string) =>
      Effect.promise(async () => {
        const payload = encodeJsonString(createMailboxSyncJobData(mailboxId));

        await topic.publishMessage({
          attributes: {
            kind: "mailbox_sync",
            mailboxId,
          },
          data: Buffer.from(payload, "utf8"),
        });
      }),
  });
};

export interface WorkerHttpControlJobDispatcherOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly workerBaseUrl?: string;
}

export const createWorkerHttpControlJobDispatcherLayer = (
  options: WorkerHttpControlJobDispatcherOptions = {},
) => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const workerBaseUrl = normalizeWorkerBaseUrl(
    options.workerBaseUrl ?? DEFAULT_LOCAL_WORKER_BASE_URL,
  );

  return Layer.succeed(ControlJobDispatcher, {
    dispatchControlJob: (request: ControlJobDispatchRequest) =>
      dispatchControlJobToWorker(fetchImpl, workerBaseUrl, request),
  });
};

export interface CloudTasksClientLike {
  readonly createTask: (request: {
    readonly parent: string;
    readonly task: {
      readonly name: string;
      readonly scheduleTime?: {
        readonly nanos: number;
        readonly seconds: number;
      };
      readonly httpRequest: {
        readonly body: string;
        readonly headers: Readonly<Record<string, string>>;
        readonly httpMethod: "POST";
        readonly oidcToken?: {
          readonly audience?: string;
          readonly serviceAccountEmail: string;
        };
        readonly url: string;
      };
    };
  }) => Promise<unknown>;
  readonly queuePath: (projectId: string, location: string, queueId: string) => string;
}

export interface GcpWebhookDeliverySchedulerOptions {
  readonly location: string;
  readonly projectId: string;
  readonly queueId?: string;
  readonly serviceAccountEmail?: string | null;
  readonly taskClient?: CloudTasksClientLike;
  readonly workerAudience?: string | null;
  readonly workerBaseUrl: string;
}

const createWebhookDeliveryTaskId = (request: WebhookDeliveryScheduleRequest) => {
  const digest = createHash("sha256")
    .update(`${request.deliveryId}:${request.notBefore}`)
    .digest("hex");

  return `whd-${digest}`;
};

const createWebhookDeliveryTaskScheduleTime = (notBefore: string) => {
  const scheduleMs = Date.parse(notBefore);

  if (Number.isNaN(scheduleMs)) {
    throw new Error(`Webhook delivery notBefore must be a valid ISO timestamp: ${notBefore}`);
  }

  if (scheduleMs <= Date.now()) {
    return undefined;
  }

  return {
    nanos: (scheduleMs % 1_000) * 1_000_000,
    seconds: Math.floor(scheduleMs / 1_000),
  };
};

const isCloudTasksAlreadyExistsError = (error: unknown) => {
  return (
    typeof error === "object" &&
    error !== null &&
    (("code" in error && error.code === 6) ||
      ("message" in error &&
        typeof error.message === "string" &&
        error.message.includes("ALREADY_EXISTS")))
  );
};

export const createGcpWebhookDeliverySchedulerLayer = (
  options: GcpWebhookDeliverySchedulerOptions,
) => {
  const taskClient = options.taskClient ?? new CloudTasksClient();
  const parent = taskClient.queuePath(
    options.projectId,
    options.location,
    options.queueId ?? DEFAULT_GCP_WEBHOOK_DELIVERY_QUEUE_ID,
  );
  const taskTargetUrl = createWebhookDeliveryWorkerUrl(options.workerBaseUrl);

  return Layer.succeed(WebhookDeliveryScheduler, {
    scheduleWebhookDelivery: (request: WebhookDeliveryScheduleRequest) =>
      Effect.promise(async () => {
        const payload = encodeJsonString(request);
        const scheduleTime = createWebhookDeliveryTaskScheduleTime(request.notBefore);

        try {
          await taskClient.createTask({
            parent,
            task: {
              name: `${parent}/tasks/${createWebhookDeliveryTaskId(request)}`,
              ...(scheduleTime === undefined ? {} : { scheduleTime }),
              httpRequest: {
                body: Buffer.from(payload).toString("base64"),
                headers: {
                  "content-type": "application/json",
                },
                httpMethod: "POST",
                ...(options.serviceAccountEmail === null ||
                options.serviceAccountEmail === undefined
                  ? {}
                  : {
                      oidcToken: {
                        ...(options.workerAudience === null || options.workerAudience === undefined
                          ? {}
                          : { audience: options.workerAudience }),
                        serviceAccountEmail: options.serviceAccountEmail,
                      },
                    }),
                url: taskTargetUrl,
              },
            },
          });
        } catch (error) {
          if (isCloudTasksAlreadyExistsError(error)) {
            return;
          }

          throw error;
        }
      }),
  });
};

export const createLocalAsyncTransportLayer = (options: LocalAsyncTransportOptions = {}) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const snapshotRef = yield* Ref.make<LocalAsyncTransportSnapshot>(
        emptyLocalAsyncTransportSnapshot(),
      );
      const fetchImpl = options.fetch ?? globalThis.fetch;
      const runPromise = Effect.runPromise;
      const workerBaseUrl = normalizeWorkerBaseUrl(
        options.workerBaseUrl ?? DEFAULT_LOCAL_WORKER_BASE_URL,
      );
      const scheduleWebhookDeliveryDispatch = (request: WebhookDeliveryScheduleRequest) =>
        Effect.suspend(() => {
          const delayMs = Math.max(0, Date.parse(request.notBefore) - Date.now());

          if (delayMs === 0) {
            return dispatchWebhookDeliveryToWorker(
              fetchImpl,
              workerBaseUrl,
              request,
              "Local webhook delivery dispatch failed with",
            );
          }

          return Effect.sync(() => {
            globalThis.setTimeout(() => {
              void runPromise(
                dispatchWebhookDeliveryToWorker(
                  fetchImpl,
                  workerBaseUrl,
                  request,
                  "Local webhook delivery dispatch failed with",
                ),
              ).catch((error: unknown) => {
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
              Effect.andThen(dispatchMailboxSyncToWorker(fetchImpl, workerBaseUrl, mailboxId)),
            ),
        }),
        Layer.succeed(WebhookDeliveryScheduler, {
          scheduleWebhookDelivery: (request: WebhookDeliveryScheduleRequest) =>
            Ref.update(snapshotRef, (snapshot) => ({
              ...snapshot,
              webhookDeliveries: [...snapshot.webhookDeliveries, request],
            })).pipe(Effect.andThen(scheduleWebhookDeliveryDispatch(request))),
        }),
        Layer.succeed(ControlJobDispatcher, {
          dispatchControlJob: (request: ControlJobDispatchRequest) =>
            Ref.update(snapshotRef, (snapshot) => ({
              ...snapshot,
              controlJobs: [...snapshot.controlJobs, request],
            })).pipe(Effect.andThen(dispatchControlJobToWorker(fetchImpl, workerBaseUrl, request))),
        }),
        Layer.succeed(LocalAsyncTransportProbe, {
          getSnapshot: Ref.get(snapshotRef),
          reset: Ref.set(snapshotRef, emptyLocalAsyncTransportSnapshot()),
        }),
      );
    }),
  );
