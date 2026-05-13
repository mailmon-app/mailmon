import { Effect, Option } from "effect";

import type {
  CompletedWebhookDeliveryAttempt,
  ProcessWebhookDeliveryResult,
  WebhookDeliverySendFailure,
} from "./contracts.js";
import { scheduleWebhookDeliveryRequests } from "./mailbox-event-delivery-scheduling.js";
import { WebhookDeliverySender, WebhookDeliveryStore } from "./services.js";

const DEFAULT_WEBHOOK_DELIVERY_MAX_ATTEMPTS = 5;
const DEFAULT_WEBHOOK_DELIVERY_RETRY_DELAY_MS = 5_000;
const MAX_WEBHOOK_DELIVERY_RETRY_DELAY_MS = 15 * 60_000;

interface DeliveryAttemptIdentity {
  readonly deliveryId: string;
  readonly attemptCount: number;
  readonly processingStartedAt: string;
}

interface ClassifiedWebhookDeliveryAttempt {
  readonly completion: CompletedWebhookDeliveryAttempt;
  readonly result: ProcessWebhookDeliveryResult;
}

const addMillisecondsToIsoTimestamp = (timestamp: string, milliseconds: number) => {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
};

export const calculateWebhookDeliveryRetryDelayMs = (attemptCount: number) => {
  return Math.min(
    MAX_WEBHOOK_DELIVERY_RETRY_DELAY_MS,
    DEFAULT_WEBHOOK_DELIVERY_RETRY_DELAY_MS * 2 ** Math.max(0, attemptCount - 1),
  );
};

const createWebhookDeliveryCompletion = (params: {
  readonly deliveryId: string;
  readonly attemptCount: number;
  readonly processingStartedAt: string;
  readonly state: CompletedWebhookDeliveryAttempt["state"];
  readonly completedAt: string;
  readonly nextAttemptAt?: string | null;
  readonly responseStatusCode?: number | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly retryable?: boolean | null;
}): CompletedWebhookDeliveryAttempt => {
  return {
    deliveryId: params.deliveryId,
    attemptCount: params.attemptCount,
    processingStartedAt: params.processingStartedAt,
    state: params.state,
    completedAt: params.completedAt,
    nextAttemptAt: params.nextAttemptAt ?? null,
    responseStatusCode: params.responseStatusCode ?? null,
    errorCode: params.errorCode ?? null,
    errorMessage: params.errorMessage ?? null,
    retryable: params.retryable ?? null,
  };
};

export const classifyWebhookDeliveryFailure = (
  delivery: DeliveryAttemptIdentity,
  completedAt: string,
  failure: WebhookDeliverySendFailure,
): ClassifiedWebhookDeliveryAttempt => {
  const retryExhausted =
    failure.retryable && delivery.attemptCount >= DEFAULT_WEBHOOK_DELIVERY_MAX_ATTEMPTS;
  const nextAttemptAt =
    failure.retryable && !retryExhausted
      ? addMillisecondsToIsoTimestamp(
          completedAt,
          calculateWebhookDeliveryRetryDelayMs(delivery.attemptCount),
        )
      : null;

  if (nextAttemptAt !== null) {
    return {
      completion: createWebhookDeliveryCompletion({
        deliveryId: delivery.deliveryId,
        attemptCount: delivery.attemptCount,
        processingStartedAt: delivery.processingStartedAt,
        state: "pending",
        completedAt,
        nextAttemptAt,
        errorCode: failure.code,
        errorMessage: failure.message,
        retryable: true,
      }),
      result: {
        deliveryId: delivery.deliveryId,
        status: "scheduled_for_retry",
        attemptCount: delivery.attemptCount,
        nextAttemptAt,
      },
    };
  }

  return {
    completion: createWebhookDeliveryCompletion({
      deliveryId: delivery.deliveryId,
      attemptCount: delivery.attemptCount,
      processingStartedAt: delivery.processingStartedAt,
      state: "failed",
      completedAt,
      errorCode: retryExhausted ? "webhook_delivery_retry_exhausted" : failure.code,
      errorMessage: retryExhausted
        ? `Webhook delivery exhausted application retries after ${delivery.attemptCount} attempts. Last failure: ${failure.message}`
        : failure.message,
      retryable: retryExhausted ? false : failure.retryable,
    }),
    result: {
      deliveryId: delivery.deliveryId,
      status: retryExhausted ? "retry_exhausted" : "failed",
      attemptCount: delivery.attemptCount,
      nextAttemptAt: null,
    },
  };
};

export const classifyWebhookDeliveryResponse = (
  delivery: DeliveryAttemptIdentity,
  completedAt: string,
  statusCode: number,
): ClassifiedWebhookDeliveryAttempt => {
  if (statusCode >= 200 && statusCode < 300) {
    return {
      completion: createWebhookDeliveryCompletion({
        deliveryId: delivery.deliveryId,
        attemptCount: delivery.attemptCount,
        processingStartedAt: delivery.processingStartedAt,
        state: "delivered",
        completedAt,
        responseStatusCode: statusCode,
      }),
      result: {
        deliveryId: delivery.deliveryId,
        status: "delivered",
        attemptCount: delivery.attemptCount,
        nextAttemptAt: null,
      },
    };
  }

  const retryExhausted =
    statusCode >= 500 && delivery.attemptCount >= DEFAULT_WEBHOOK_DELIVERY_MAX_ATTEMPTS;
  const nextAttemptAt =
    statusCode >= 500 && !retryExhausted
      ? addMillisecondsToIsoTimestamp(
          completedAt,
          calculateWebhookDeliveryRetryDelayMs(delivery.attemptCount),
        )
      : null;

  if (nextAttemptAt !== null) {
    return {
      completion: createWebhookDeliveryCompletion({
        deliveryId: delivery.deliveryId,
        attemptCount: delivery.attemptCount,
        processingStartedAt: delivery.processingStartedAt,
        state: "pending",
        completedAt,
        nextAttemptAt,
        responseStatusCode: statusCode,
        errorCode: `webhook_endpoint_http_${statusCode}`,
        errorMessage: `Webhook endpoint responded with HTTP ${statusCode}.`,
        retryable: true,
      }),
      result: {
        deliveryId: delivery.deliveryId,
        status: "scheduled_for_retry",
        attemptCount: delivery.attemptCount,
        nextAttemptAt,
      },
    };
  }

  return {
    completion: createWebhookDeliveryCompletion({
      deliveryId: delivery.deliveryId,
      attemptCount: delivery.attemptCount,
      processingStartedAt: delivery.processingStartedAt,
      state: "failed",
      completedAt,
      responseStatusCode: statusCode,
      errorCode: retryExhausted
        ? "webhook_delivery_retry_exhausted"
        : `webhook_endpoint_http_${statusCode}`,
      errorMessage: retryExhausted
        ? `Webhook delivery exhausted application retries after ${delivery.attemptCount} attempts. Last response: HTTP ${statusCode}.`
        : `Webhook endpoint responded with HTTP ${statusCode}.`,
      retryable: retryExhausted ? false : statusCode >= 500,
    }),
    result: {
      deliveryId: delivery.deliveryId,
      status: retryExhausted ? "retry_exhausted" : "failed",
      attemptCount: delivery.attemptCount,
      nextAttemptAt: null,
    },
  };
};

const finalizeWebhookDelivery = (
  completion: CompletedWebhookDeliveryAttempt,
  result: ProcessWebhookDeliveryResult,
) =>
  Effect.gen(function* () {
    const webhookDeliveryStore = yield* WebhookDeliveryStore;
    const applied = yield* webhookDeliveryStore.completeWebhookDeliveryAttempt(completion);

    if (!applied) {
      return {
        deliveryId: completion.deliveryId,
        status: "noop",
        attemptCount: null,
        nextAttemptAt: null,
      } satisfies ProcessWebhookDeliveryResult;
    }

    if (completion.state === "pending") {
      yield* scheduleWebhookDeliveryRequests(
        [
          {
            deliveryId: completion.deliveryId,
            notBefore: completion.nextAttemptAt ?? completion.completedAt,
          },
        ],
        {
          continueOnSchedulingFailure: true,
        },
      );
    }

    return result;
  });

export const runWebhookDelivery = (deliveryId: string) =>
  Effect.gen(function* () {
    const webhookDeliveryStore = yield* WebhookDeliveryStore;
    const webhookDeliverySender = yield* WebhookDeliverySender;
    const attemptedAt = new Date().toISOString();
    const preparedDelivery = yield* webhookDeliveryStore.prepareWebhookDeliveryAttempt(
      deliveryId,
      attemptedAt,
    );

    return yield* Option.match(preparedDelivery, {
      onNone: () =>
        Effect.succeed({
          deliveryId,
          status: "noop",
          attemptCount: null,
          nextAttemptAt: null,
        } satisfies ProcessWebhookDeliveryResult),
      onSome: (delivery) =>
        webhookDeliverySender.send(delivery, attemptedAt).pipe(
          Effect.match({
            onFailure: (failure) =>
              classifyWebhookDeliveryFailure(delivery, new Date().toISOString(), failure),
            onSuccess: (response) =>
              classifyWebhookDeliveryResponse(
                delivery,
                new Date().toISOString(),
                response.statusCode,
              ),
          }),
          Effect.flatMap(({ completion, result }) => finalizeWebhookDelivery(completion, result)),
        ),
    });
  });
