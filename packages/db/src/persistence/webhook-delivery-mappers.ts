import { createHash } from "node:crypto";

import {
  type MailboxEventEnvelope,
  type PreparedWebhookDelivery,
  type WebhookDeliveryScheduleRequest,
} from "@mailmon/core";

import { webhookDeliveries, webhookEndpoints } from "../schema.js";
import { addMillisecondsToIsoTimestamp } from "./common-mappers.js";

type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect;

export const WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS = 30_000;

export const createStableWebhookDeliveryId = (
  mailboxEventId: string,
  webhookEndpointId: string,
) => {
  const hash = createHash("sha256")
    .update(mailboxEventId)
    .update("\0")
    .update(webhookEndpointId)
    .digest("hex");

  return `del_${hash}`;
};

export const toPreparedWebhookDelivery = (
  delivery: Pick<
    WebhookDeliveryRow,
    "attemptCount" | "id" | "mailboxEventId" | "processingStartedAt" | "webhookEndpointId"
  >,
  endpoint: Pick<WebhookEndpointRow, "id" | "signingSecret" | "url">,
  event: MailboxEventEnvelope,
): PreparedWebhookDelivery => {
  if (delivery.processingStartedAt === null) {
    throw new Error(`Webhook delivery ${delivery.id} is missing its processing start timestamp.`);
  }

  return {
    deliveryId: delivery.id,
    mailboxEventId: delivery.mailboxEventId,
    webhookEndpointId: delivery.webhookEndpointId,
    attemptCount: delivery.attemptCount,
    processingStartedAt: delivery.processingStartedAt.toISOString(),
    url: endpoint.url,
    signingSecret: endpoint.signingSecret,
    event,
  };
};

const maxIsoTimestamp = (left: string, right: string) => {
  return Date.parse(left) >= Date.parse(right) ? left : right;
};

export const toWebhookDeliveryRecoverySchedule = (
  delivery: Pick<
    WebhookDeliveryRow,
    "createdAt" | "id" | "nextAttemptAt" | "processingStartedAt" | "state"
  >,
  recoveredAt: string,
): WebhookDeliveryScheduleRequest | null => {
  switch (delivery.state) {
    case "pending":
      return {
        deliveryId: delivery.id,
        notBefore: delivery.nextAttemptAt?.toISOString() ?? delivery.createdAt.toISOString(),
      };
    case "processing":
      if (delivery.processingStartedAt === null) {
        return null;
      }

      return {
        deliveryId: delivery.id,
        notBefore: maxIsoTimestamp(
          addMillisecondsToIsoTimestamp(
            delivery.processingStartedAt.toISOString(),
            WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS,
          ),
          recoveredAt,
        ),
      };
    default:
      return null;
  }
};
