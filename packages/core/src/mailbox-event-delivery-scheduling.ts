import { Effect } from "effect";

import { WebhookDeliveryScheduler, WebhookDeliveryStore } from "./services.js";

export const scheduleMailboxEventDeliveries = (mailboxEventIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    if (mailboxEventIds.length === 0) {
      return [] as const;
    }

    const webhookDeliveryStore = yield* WebhookDeliveryStore;
    const webhookDeliveryScheduler = yield* WebhookDeliveryScheduler;
    const deliveryRequests =
      yield* webhookDeliveryStore.createWebhookDeliveriesForMailboxEvents(mailboxEventIds);

    yield* Effect.forEach(
      deliveryRequests,
      (request) => webhookDeliveryScheduler.scheduleWebhookDelivery(request),
      { discard: true },
    );

    return deliveryRequests;
  });
