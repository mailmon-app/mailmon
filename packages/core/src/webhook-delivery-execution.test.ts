import { describe, expect, it } from "@effect/vitest";

import {
  calculateWebhookDeliveryRetryDelayMs,
  classifyWebhookDeliveryFailure,
  classifyWebhookDeliveryResponse,
} from "./webhook-delivery-execution.js";

const deliveryAttempt = {
  deliveryId: "del_demo",
  attemptCount: 1,
  processingStartedAt: "2026-03-24T00:00:05.000Z",
};

const completedAt = "2026-03-24T00:00:10.000Z";

describe("Webhook Delivery execution policy", () => {
  it("uses capped exponential retry delays", () => {
    expect(calculateWebhookDeliveryRetryDelayMs(1)).toBe(5_000);
    expect(calculateWebhookDeliveryRetryDelayMs(2)).toBe(10_000);
    expect(calculateWebhookDeliveryRetryDelayMs(10)).toBe(15 * 60_000);
  });

  it("classifies successful endpoint responses as delivered", () => {
    const classified = classifyWebhookDeliveryResponse(deliveryAttempt, completedAt, 202);

    expect(classified.result).toEqual({
      deliveryId: deliveryAttempt.deliveryId,
      status: "delivered",
      attemptCount: 1,
      nextAttemptAt: null,
    });
    expect(classified.completion).toEqual({
      deliveryId: deliveryAttempt.deliveryId,
      attemptCount: 1,
      processingStartedAt: deliveryAttempt.processingStartedAt,
      state: "delivered",
      completedAt,
      nextAttemptAt: null,
      responseStatusCode: 202,
      errorCode: null,
      errorMessage: null,
      retryable: null,
    });
  });

  it("classifies retryable 5xx endpoint responses as pending retries", () => {
    const classified = classifyWebhookDeliveryResponse(deliveryAttempt, completedAt, 503);

    expect(classified.result).toEqual({
      deliveryId: deliveryAttempt.deliveryId,
      status: "scheduled_for_retry",
      attemptCount: 1,
      nextAttemptAt: "2026-03-24T00:00:15.000Z",
    });
    expect(classified.completion).toMatchObject({
      state: "pending",
      nextAttemptAt: "2026-03-24T00:00:15.000Z",
      responseStatusCode: 503,
      errorCode: "webhook_endpoint_http_503",
      errorMessage: "Webhook endpoint responded with HTTP 503.",
      retryable: true,
    });
  });

  it("classifies max-attempt retryable 5xx endpoint responses as retry exhausted", () => {
    const classified = classifyWebhookDeliveryResponse(
      {
        ...deliveryAttempt,
        attemptCount: 5,
      },
      completedAt,
      503,
    );

    expect(classified.result).toEqual({
      deliveryId: deliveryAttempt.deliveryId,
      status: "retry_exhausted",
      attemptCount: 5,
      nextAttemptAt: null,
    });
    expect(classified.completion).toMatchObject({
      state: "failed",
      responseStatusCode: 503,
      errorCode: "webhook_delivery_retry_exhausted",
      errorMessage:
        "Webhook delivery exhausted application retries after 5 attempts. Last response: HTTP 503.",
      retryable: false,
    });
  });

  it("classifies non-retryable endpoint responses as failed", () => {
    const classified = classifyWebhookDeliveryResponse(deliveryAttempt, completedAt, 422);

    expect(classified.result).toEqual({
      deliveryId: deliveryAttempt.deliveryId,
      status: "failed",
      attemptCount: 1,
      nextAttemptAt: null,
    });
    expect(classified.completion).toMatchObject({
      state: "failed",
      responseStatusCode: 422,
      errorCode: "webhook_endpoint_http_422",
      errorMessage: "Webhook endpoint responded with HTTP 422.",
      retryable: false,
    });
  });

  it("classifies retryable transport failures as pending retries", () => {
    const classified = classifyWebhookDeliveryFailure(deliveryAttempt, completedAt, {
      code: "webhook_delivery_timeout",
      message: "Webhook delivery timed out after 5 seconds.",
      retryable: true,
    });

    expect(classified.result).toEqual({
      deliveryId: deliveryAttempt.deliveryId,
      status: "scheduled_for_retry",
      attemptCount: 1,
      nextAttemptAt: "2026-03-24T00:00:15.000Z",
    });
    expect(classified.completion).toMatchObject({
      state: "pending",
      nextAttemptAt: "2026-03-24T00:00:15.000Z",
      errorCode: "webhook_delivery_timeout",
      errorMessage: "Webhook delivery timed out after 5 seconds.",
      retryable: true,
    });
  });

  it("classifies max-attempt retryable transport failures as retry exhausted", () => {
    const classified = classifyWebhookDeliveryFailure(
      {
        ...deliveryAttempt,
        attemptCount: 5,
      },
      completedAt,
      {
        code: "webhook_delivery_timeout",
        message: "Webhook delivery timed out after 5 seconds.",
        retryable: true,
      },
    );

    expect(classified.result).toEqual({
      deliveryId: deliveryAttempt.deliveryId,
      status: "retry_exhausted",
      attemptCount: 5,
      nextAttemptAt: null,
    });
    expect(classified.completion).toMatchObject({
      state: "failed",
      errorCode: "webhook_delivery_retry_exhausted",
      errorMessage:
        "Webhook delivery exhausted application retries after 5 attempts. Last failure: Webhook delivery timed out after 5 seconds.",
      retryable: false,
    });
  });
});
