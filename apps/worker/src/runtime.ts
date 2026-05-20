import type { WorkerEnv } from "@mailmon/config";
import {
  buildWebhookDeliveryHttpRequest,
  classifyWebhookDeliveryTransportFailure,
  MailboxSyncLeaseTiming,
  type PreparedWebhookDelivery,
  type ProcessWebhookDeliveryResult,
  type WebhookDeliveryScheduleRequest,
  WebhookDeliveryScheduler,
  WebhookDeliverySender,
} from "@mailmon/core";
import { createWorkerPersistenceLayer } from "@mailmon/db";
import {
  createAesGcmGmailRefreshTokenCipherLayer,
  createHttpGmailSyncProviderLayer,
  createHttpGmailWatchProviderLayer,
} from "@mailmon/gmail";
import {
  createGcpMailboxSyncDispatcherLayer,
  createWorkerHttpMailboxSyncDispatcherLayer,
} from "@mailmon/queue";
import { Effect, Layer } from "effect";

const DEFAULT_WEBHOOK_DELIVERY_TIMEOUT_MS = 5_000;

const requireGcpWorkerValue = (value: string | null, name: string) => {
  if (value === null) {
    throw new Error(`${name} is required when MAILMON_ASYNC_TRANSPORT_MODE=gcp`);
  }

  return value;
};

type WorkerRuntimeEnv = Pick<
  WorkerEnv,
  | "asyncTransportMode"
  | "databaseUrl"
  | "gmailApiBaseUrl"
  | "gmailOauthClientId"
  | "gmailOauthClientSecret"
  | "gmailRefreshTokenEncryptionKey"
  | "gmailRefreshTokenEncryptionKeyId"
  | "gmailRefreshTokenPreviousEncryptionKeys"
  | "gmailOauthTokenUrl"
  | "gmailPubSubTopicName"
  | "nodeEnv"
  | "mailboxSyncHeartbeatIntervalMs"
  | "mailboxSyncLeaseTtlMs"
  | "syncDispatchPubSubTopicName"
  | "workerBaseUrl"
>;

const classifyWebhookDeliveryFailure = (error: unknown) => {
  return classifyWebhookDeliveryTransportFailure(error, {
    timeoutMessage: "Webhook delivery timed out before the endpoint responded.",
  });
};

const webhookDeliveryTimeoutFailure = () => {
  const error = new Error("Webhook delivery timed out.");
  error.name = "AbortError";

  return classifyWebhookDeliveryFailure(error);
};

export const createWebhookDeliverySenderLayer = (
  options: Readonly<{
    fetch?: typeof globalThis.fetch;
    timeoutMs?: number;
  }> = {},
) => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_WEBHOOK_DELIVERY_TIMEOUT_MS;

  return Layer.succeed(WebhookDeliverySender, {
    send: (delivery: PreparedWebhookDelivery, attemptedAt: string) =>
      Effect.tryPromise({
        catch: classifyWebhookDeliveryFailure,
        try: async (signal) => {
          const request = buildWebhookDeliveryHttpRequest({
            attemptedAt,
            delivery,
            userAgent: "mailmon-worker/phase-6c",
          });
          const response = await fetchImpl(delivery.url, {
            method: "POST",
            headers: request.headers,
            body: request.body,
            signal,
          });

          return {
            statusCode: response.status,
          };
        },
      }).pipe(
        Effect.timeoutOrElse({
          duration: `${timeoutMs} millis`,
          orElse: () => Effect.fail(webhookDeliveryTimeoutFailure()),
        }),
      ),
  });
};

const calculateWebhookDeliveryDelayMs = (notBefore: string, nowMs: number) => {
  return Math.max(0, Date.parse(notBefore) - nowMs);
};

interface InProcessWebhookDeliverySchedulerOptions {
  readonly dispatch: (
    request: WebhookDeliveryScheduleRequest,
  ) => Promise<ProcessWebhookDeliveryResult>;
  readonly now?: () => number;
  readonly onDispatchError?: (error: unknown, request: WebhookDeliveryScheduleRequest) => void;
}

export const createInProcessWebhookDeliverySchedulerLayer = (
  options: InProcessWebhookDeliverySchedulerOptions,
) =>
  Layer.effect(
    WebhookDeliveryScheduler,
    Effect.acquireRelease(
      Effect.sync(() => {
        const now = options.now ?? Date.now;
        const timers = new Set<ReturnType<typeof globalThis.setTimeout>>();

        return {
          service: {
            scheduleWebhookDelivery: (request: WebhookDeliveryScheduleRequest) =>
              Effect.sync(() => {
                const scheduleTimer = () => {
                  const delayMs = calculateWebhookDeliveryDelayMs(request.notBefore, now());
                  let timer: ReturnType<typeof globalThis.setTimeout>;
                  const dispatch = () => {
                    timers.delete(timer);

                    if (calculateWebhookDeliveryDelayMs(request.notBefore, now()) > 0) {
                      scheduleTimer();
                      return;
                    }

                    void options.dispatch(request).catch((error) => {
                      options.onDispatchError?.(error, request);
                    });
                  };

                  timer = globalThis.setTimeout(dispatch, delayMs);
                  timers.add(timer);
                };

                scheduleTimer();
              }),
          },
          timers,
        };
      }),
      ({ timers }) =>
        Effect.sync(() => {
          for (const timer of timers) {
            globalThis.clearTimeout(timer);
          }

          timers.clear();
        }),
    ).pipe(Effect.map(({ service }) => service)),
  );

const createMailboxSyncDispatcherLayer = (env: WorkerRuntimeEnv) => {
  if (env.asyncTransportMode === "gcp") {
    return createGcpMailboxSyncDispatcherLayer({
      topicName: requireGcpWorkerValue(
        env.syncDispatchPubSubTopicName,
        "MAILMON_SYNC_DISPATCH_PUBSUB_TOPIC_NAME",
      ),
    });
  }

  return createWorkerHttpMailboxSyncDispatcherLayer({
    workerBaseUrl: env.workerBaseUrl,
  });
};

export const createWorkerRuntimeLayer = (env: WorkerRuntimeEnv) => {
  const gmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
    activeKeyId: env.gmailRefreshTokenEncryptionKeyId,
    allowPlaintextFallback: env.nodeEnv !== "production",
    decryptionKeys: env.gmailRefreshTokenPreviousEncryptionKeys,
    encryptionKey: env.gmailRefreshTokenEncryptionKey,
  });
  const persistenceLayer = createWorkerPersistenceLayer(env.databaseUrl).pipe(
    Layer.provide(gmailRefreshTokenCipherLayer),
  );
  const gmailSyncProviderLayer = createHttpGmailSyncProviderLayer({
    apiBaseUrl: env.gmailApiBaseUrl,
    oauthClientId: env.gmailOauthClientId,
    oauthClientSecret: env.gmailOauthClientSecret,
    oauthTokenUrl: env.gmailOauthTokenUrl,
  }).pipe(Layer.provide(persistenceLayer));
  const gmailWatchProviderLayer = createHttpGmailWatchProviderLayer({
    apiBaseUrl: env.gmailApiBaseUrl,
    gmailPubSubTopicName: env.gmailPubSubTopicName,
    oauthClientId: env.gmailOauthClientId,
    oauthClientSecret: env.gmailOauthClientSecret,
    oauthTokenUrl: env.gmailOauthTokenUrl,
  }).pipe(Layer.provide(persistenceLayer));
  const webhookDeliverySenderLayer = createWebhookDeliverySenderLayer();
  const mailboxSyncDispatcherLayer = createMailboxSyncDispatcherLayer(env);

  return Layer.mergeAll(
    persistenceLayer,
    gmailSyncProviderLayer,
    gmailWatchProviderLayer,
    mailboxSyncDispatcherLayer,
    MailboxSyncLeaseTiming.layer({
      heartbeatIntervalMs: env.mailboxSyncHeartbeatIntervalMs,
      leaseTtlMs: env.mailboxSyncLeaseTtlMs,
    }),
    webhookDeliverySenderLayer,
  );
};
