import { createHmac } from "node:crypto";

import type { WorkerEnv } from "@mailmon/config";
import {
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
import { Effect, Layer } from "effect";

const DEFAULT_WEBHOOK_DELIVERY_TIMEOUT_MS = 5_000;

const createWebhookDeliverySignature = (
  signingSecret: string,
  timestampSeconds: string,
  body: string,
) => {
  const signature = createHmac("sha256", signingSecret)
    .update(`${timestampSeconds}.${body}`)
    .digest("hex");

  return `t=${timestampSeconds},v1=${signature}`;
};

const classifyWebhookDeliveryFailure = (error: unknown) => {
  if (error instanceof Error && error.name === "AbortError") {
    return {
      code: "webhook_delivery_timeout",
      message: "Webhook delivery timed out before the endpoint responded.",
      retryable: true,
    } as const;
  }

  return {
    code: "webhook_delivery_transport_error",
    message: error instanceof Error ? error.message : "Webhook delivery failed before a response.",
    retryable: true,
  } as const;
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
        try: async () => {
          const abortController = new AbortController();
          const timeout = globalThis.setTimeout(() => {
            abortController.abort();
          }, timeoutMs);

          try {
            const body = JSON.stringify(delivery.event);
            const timestampSeconds = String(Math.floor(Date.parse(attemptedAt) / 1000));
            const response = await fetchImpl(delivery.url, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "user-agent": "mailmon-worker/phase-6c",
                "x-mailmon-attempt": String(delivery.attemptCount),
                "x-mailmon-delivery-id": delivery.deliveryId,
                "x-mailmon-event-id": delivery.event.id,
                "x-mailmon-signature": createWebhookDeliverySignature(
                  delivery.signingSecret,
                  timestampSeconds,
                  body,
                ),
              },
              body,
              signal: abortController.signal,
            });

            return {
              statusCode: response.status,
            };
          } finally {
            globalThis.clearTimeout(timeout);
          }
        },
      }),
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
  Layer.scoped(
    WebhookDeliveryScheduler,
    Effect.acquireRelease(
      Effect.sync(() => {
        const now = options.now ?? Date.now;
        const timers = new Set<ReturnType<typeof globalThis.setTimeout>>();

        return {
          service: {
            scheduleWebhookDelivery: (request: WebhookDeliveryScheduleRequest) =>
              Effect.sync(() => {
                const delayMs = calculateWebhookDeliveryDelayMs(request.notBefore, now());
                let timer: ReturnType<typeof globalThis.setTimeout>;
                const dispatch = () => {
                  timers.delete(timer);
                  void options.dispatch(request).catch((error) => {
                    options.onDispatchError?.(error, request);
                  });
                };

                timer = globalThis.setTimeout(dispatch, delayMs);
                timers.add(timer);
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

export const createWorkerRuntimeLayer = (
  env: Pick<
    WorkerEnv,
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
  >,
) => {
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

  return Layer.mergeAll(
    persistenceLayer,
    gmailSyncProviderLayer,
    gmailWatchProviderLayer,
    webhookDeliverySenderLayer,
  );
};
