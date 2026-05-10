import { Cause, Effect } from "effect";

import type { WebhookDeliveryScheduleRequest } from "./contracts.js";
import { WebhookDeliveryScheduler, WebhookDeliveryStore } from "./services.js";

const ignoreSchedulingFailure = <E>(cause: Cause.Cause<E>) =>
  Cause.isInterruptedOnly(cause) ? Effect.failCause(cause) : Effect.void;

export const scheduleWebhookDeliveryRequests = (
  deliveryRequests: ReadonlyArray<WebhookDeliveryScheduleRequest>,
  options: Readonly<{
    continueOnSchedulingFailure?: boolean;
  }> = {},
) =>
  Effect.gen(function* () {
    const webhookDeliveryScheduler = yield* WebhookDeliveryScheduler;

    yield* Effect.forEach(
      deliveryRequests,
      (request) => {
        const schedule = webhookDeliveryScheduler.scheduleWebhookDelivery(request);

        return options.continueOnSchedulingFailure === true
          ? schedule.pipe(Effect.catchAllCause(ignoreSchedulingFailure))
          : schedule;
      },
      { discard: true },
    );

    return deliveryRequests;
  });

export const scheduleMailboxEventDeliveries = (mailboxEventIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    if (mailboxEventIds.length === 0) {
      return [] as const;
    }

    const webhookDeliveryStore = yield* WebhookDeliveryStore;
    const deliveryRequests =
      yield* webhookDeliveryStore.createWebhookDeliveriesForMailboxEvents(mailboxEventIds);

    return yield* scheduleWebhookDeliveryRequests(deliveryRequests, {
      continueOnSchedulingFailure: true,
    });
  });
