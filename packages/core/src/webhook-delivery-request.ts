import { createHmac } from "node:crypto";

import { Schema } from "effect";

import type { PreparedWebhookDelivery, WebhookDeliverySendFailure } from "./contracts.js";

export interface WebhookDeliveryHttpRequest {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
}

export const createWebhookDeliverySignature = (
  signingSecret: string,
  timestampSeconds: string,
  body: string,
) => {
  const signature = createHmac("sha256", signingSecret)
    .update(`${timestampSeconds}.${body}`)
    .digest("hex");

  return `t=${timestampSeconds},v1=${signature}`;
};

export const buildWebhookDeliveryHttpRequest = (params: {
  readonly delivery: PreparedWebhookDelivery;
  readonly attemptedAt: string;
  readonly userAgent: string;
}): WebhookDeliveryHttpRequest => {
  const body = Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(params.delivery.event);
  const timestampSeconds = String(Math.floor(Date.parse(params.attemptedAt) / 1000));

  return {
    body,
    headers: {
      "content-type": "application/json",
      "user-agent": params.userAgent,
      "x-mailmon-attempt": String(params.delivery.attemptCount),
      "x-mailmon-delivery-id": params.delivery.deliveryId,
      "x-mailmon-event-id": params.delivery.event.id,
      "x-mailmon-signature": createWebhookDeliverySignature(
        params.delivery.signingSecret,
        timestampSeconds,
        body,
      ),
    },
  };
};

export const classifyWebhookDeliveryTransportFailure = (
  error: unknown,
  options: Readonly<{
    timeoutMessage: string;
  }>,
): WebhookDeliverySendFailure => {
  if (error instanceof Error && error.name === "AbortError") {
    return {
      code: "webhook_delivery_timeout",
      message: options.timeoutMessage,
      retryable: true,
    };
  }

  return {
    code: "webhook_delivery_transport_error",
    message: error instanceof Error ? error.message : "Webhook delivery failed before a response.",
    retryable: true,
  };
};
