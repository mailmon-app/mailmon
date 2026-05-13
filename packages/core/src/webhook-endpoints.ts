import { Effect } from "effect";

import type {
  CreateWebhookEndpointRequest,
  CreateWebhookEndpointSubscriptionRequest,
  WebhookEventType,
} from "./contracts.js";
import { getMailboxOrFail, getWebhookEndpointOrFail } from "./resource-queries.js";
import { WebhookEndpointStore, WebhookEndpointSubscriptionStore } from "./services.js";

const createWebhookEndpointId = () => {
  return `whe_${globalThis.crypto.randomUUID()}`;
};

const createWebhookEndpointSecret = () => {
  return `whsec_${globalThis.crypto.randomUUID()}${globalThis.crypto.randomUUID()}`;
};

const WEBHOOK_EVENT_TYPE_ORDER: ReadonlyArray<WebhookEventType> = [
  "message.created",
  "message.updated",
  "thread.updated",
];

const normalizeWebhookEventTypes = (
  eventTypes: ReadonlyArray<WebhookEventType>,
): ReadonlyArray<WebhookEventType> => {
  const requestedEventTypes = new Set(eventTypes);

  return WEBHOOK_EVENT_TYPE_ORDER.filter((eventType) => requestedEventTypes.has(eventType));
};

export const createWebhookEndpoint = (workspaceId: string, request: CreateWebhookEndpointRequest) =>
  Effect.gen(function* () {
    const webhookEndpointStore = yield* WebhookEndpointStore;
    const createdAt = new Date().toISOString();

    return yield* webhookEndpointStore.createWebhookEndpoint({
      id: createWebhookEndpointId(),
      workspaceId,
      url: request.url,
      description: request.description ?? null,
      secret: createWebhookEndpointSecret(),
      createdAt,
    });
  });

export const createWebhookEndpointSubscription = (
  workspaceId: string,
  webhookEndpointId: string,
  request: CreateWebhookEndpointSubscriptionRequest,
) =>
  Effect.gen(function* () {
    const mailboxIds = [...new Set(request.mailboxIds)];
    const eventTypes = normalizeWebhookEventTypes(request.eventTypes);

    yield* getWebhookEndpointOrFail(webhookEndpointId, { workspaceId });
    yield* Effect.forEach(mailboxIds, (mailboxId) => getMailboxOrFail(mailboxId, { workspaceId }));

    const webhookEndpointSubscriptionStore = yield* WebhookEndpointSubscriptionStore;

    return yield* webhookEndpointSubscriptionStore.createWebhookEndpointSubscription({
      webhookEndpointId,
      workspaceId,
      mailboxIds,
      eventTypes,
      createdAt: new Date().toISOString(),
    });
  });
