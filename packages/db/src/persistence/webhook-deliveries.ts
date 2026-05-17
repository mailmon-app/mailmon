import {
  WebhookDeliveryStore,
  type CompletedWebhookDeliveryAttempt,
  type WebhookDeliveryScheduleRequest,
} from "@mailmon/core";
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";

import {
  mailboxEvents,
  webhookDeliveries,
  webhookEndpointSubscriptions,
  webhookEndpoints,
} from "../schema.js";
import { toDate } from "./common-mappers.js";
import { MailmonDatabase } from "./database.js";
import {
  WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS,
  createStableWebhookDeliveryId,
  toPreparedWebhookDelivery,
  toWebhookDeliveryRecoverySchedule,
} from "./webhook-delivery-mappers.js";

export const createWebhookDeliveryStoreLayer = Layer.effect(
  WebhookDeliveryStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      createWebhookDeliveriesForMailboxEvents: (mailboxEventIds) =>
        Effect.promise(async () => {
          if (mailboxEventIds.length === 0) {
            return [];
          }

          const eventRows = await database.db
            .select({
              eventType: mailboxEvents.eventType,
              id: mailboxEvents.id,
              mailboxId: mailboxEvents.mailboxId,
            })
            .from(mailboxEvents)
            .where(inArray(mailboxEvents.id, [...new Set(mailboxEventIds)]));

          if (eventRows.length === 0) {
            return [];
          }

          const subscriptions = await database.db
            .select({
              eventTypes: webhookEndpointSubscriptions.eventTypes,
              mailboxId: webhookEndpointSubscriptions.mailboxId,
              webhookEndpointId: webhookEndpointSubscriptions.webhookEndpointId,
            })
            .from(webhookEndpointSubscriptions)
            .where(
              inArray(webhookEndpointSubscriptions.mailboxId, [
                ...new Set(eventRows.map((event) => event.mailboxId)),
              ]),
            );

          const createdAt = new Date();
          const deliveryRows = eventRows.flatMap((event) =>
            subscriptions
              .filter(
                (subscription) =>
                  subscription.mailboxId === event.mailboxId &&
                  subscription.eventTypes.includes(event.eventType),
              )
              .map((subscription) => ({
                id: createStableWebhookDeliveryId(event.id, subscription.webhookEndpointId),
                mailboxEventId: event.id,
                webhookEndpointId: subscription.webhookEndpointId,
                state: "pending",
                attemptCount: 0,
                processingStartedAt: null,
                lastAttemptedAt: null,
                nextAttemptAt: createdAt,
                deliveredAt: null,
                lastResponseStatus: null,
                lastErrorCode: null,
                lastErrorMessage: null,
                lastErrorOccurredAt: null,
                lastErrorRetryable: null,
                createdAt,
                updatedAt: createdAt,
              })),
          );

          if (deliveryRows.length === 0) {
            return [];
          }

          await database.db
            .insert(webhookDeliveries)
            .values(deliveryRows)
            .onConflictDoNothing({
              target: [webhookDeliveries.mailboxEventId, webhookDeliveries.webhookEndpointId],
            });

          return deliveryRows.map((row) => ({
            deliveryId: row.id,
            notBefore: row.nextAttemptAt.toISOString(),
          }));
        }),
      createWebhookDeliveriesForReplay: (params) =>
        Effect.promise(async () => {
          if (params.mailboxEventIds.length === 0) {
            return [];
          }

          const eventRows = await database.db
            .select({
              id: mailboxEvents.id,
            })
            .from(mailboxEvents)
            .where(inArray(mailboxEvents.id, [...new Set(params.mailboxEventIds)]));

          if (eventRows.length === 0) {
            return [];
          }

          const notBefore = toDate(params.notBefore);
          const eventRowsById = new Map(eventRows.map((event) => [event.id, event]));
          const deliveryRows = [...new Set(params.mailboxEventIds)].flatMap((eventId) => {
            const event = eventRowsById.get(eventId);

            if (event === undefined) {
              return [];
            }

            return [
              {
                id: createStableWebhookDeliveryId(event.id, params.webhookEndpointId),
                mailboxEventId: event.id,
                webhookEndpointId: params.webhookEndpointId,
                state: "pending",
                attemptCount: 0,
                processingStartedAt: null,
                lastAttemptedAt: null,
                nextAttemptAt: notBefore,
                deliveredAt: null,
                lastResponseStatus: null,
                lastErrorCode: null,
                lastErrorMessage: null,
                lastErrorOccurredAt: null,
                lastErrorRetryable: null,
                createdAt: notBefore,
                updatedAt: notBefore,
              },
            ];
          });

          await database.db
            .insert(webhookDeliveries)
            .values(deliveryRows)
            .onConflictDoUpdate({
              target: [webhookDeliveries.mailboxEventId, webhookDeliveries.webhookEndpointId],
              set: {
                attemptCount: 0,
                deliveredAt: null,
                lastAttemptedAt: null,
                lastErrorCode: null,
                lastErrorMessage: null,
                lastErrorOccurredAt: null,
                lastErrorRetryable: null,
                lastResponseStatus: null,
                nextAttemptAt: notBefore,
                processingStartedAt: null,
                state: "pending",
                updatedAt: notBefore,
              },
            });

          return deliveryRows.map((row) => ({
            deliveryId: row.id,
            notBefore: row.nextAttemptAt.toISOString(),
          }));
        }),
      listWebhookDeliveryRecoverySchedules: (recoveredAt: string) =>
        Effect.promise(async () => {
          const recoveryRows = await database.db
            .select({
              createdAt: webhookDeliveries.createdAt,
              id: webhookDeliveries.id,
              nextAttemptAt: webhookDeliveries.nextAttemptAt,
              processingStartedAt: webhookDeliveries.processingStartedAt,
              state: webhookDeliveries.state,
            })
            .from(webhookDeliveries)
            .where(inArray(webhookDeliveries.state, ["pending", "processing"]));

          return recoveryRows
            .map((delivery) => toWebhookDeliveryRecoverySchedule(delivery, recoveredAt))
            .filter((delivery): delivery is WebhookDeliveryScheduleRequest => delivery !== null)
            .toSorted((left, right) =>
              left.notBefore === right.notBefore
                ? left.deliveryId.localeCompare(right.deliveryId)
                : left.notBefore.localeCompare(right.notBefore),
            );
        }),
      prepareWebhookDeliveryAttempt: (deliveryId: string, attemptedAt: string) =>
        Effect.promise(async () => {
          const attemptedAtDate = toDate(attemptedAt);
          const staleProcessingCutoff = new Date(
            attemptedAtDate.getTime() - WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS,
          );

          return database.db.transaction(async (transaction) => {
            const [claimedDelivery] = await transaction
              .update(webhookDeliveries)
              .set({
                attemptCount: sql`${webhookDeliveries.attemptCount} + 1`,
                lastAttemptedAt: attemptedAtDate,
                processingStartedAt: attemptedAtDate,
                state: "processing",
                updatedAt: attemptedAtDate,
              })
              .where(
                and(
                  eq(webhookDeliveries.id, deliveryId),
                  or(
                    and(
                      eq(webhookDeliveries.state, "pending"),
                      lte(webhookDeliveries.nextAttemptAt, attemptedAtDate),
                    ),
                    and(
                      eq(webhookDeliveries.state, "processing"),
                      lte(webhookDeliveries.processingStartedAt, staleProcessingCutoff),
                    ),
                  ),
                ),
              )
              .returning();

            if (claimedDelivery === undefined) {
              return Option.none();
            }

            const [deliveryContext] = await transaction
              .select({
                endpoint: webhookEndpoints,
                payload: mailboxEvents.payload,
              })
              .from(webhookDeliveries)
              .innerJoin(
                webhookEndpoints,
                eq(webhookDeliveries.webhookEndpointId, webhookEndpoints.id),
              )
              .innerJoin(mailboxEvents, eq(webhookDeliveries.mailboxEventId, mailboxEvents.id))
              .where(eq(webhookDeliveries.id, deliveryId))
              .limit(1);

            if (deliveryContext === undefined) {
              throw new Error(`Webhook delivery ${deliveryId} could not be prepared.`);
            }

            return Option.some(
              toPreparedWebhookDelivery(
                claimedDelivery,
                deliveryContext.endpoint,
                deliveryContext.payload,
              ),
            );
          });
        }),
      completeWebhookDeliveryAttempt: (attempt: CompletedWebhookDeliveryAttempt) =>
        Effect.promise(async () => {
          const completedAt = toDate(attempt.completedAt);
          const processingStartedAt = toDate(attempt.processingStartedAt);

          return database.db.transaction(async (transaction) => {
            const [delivery] = await transaction
              .update(webhookDeliveries)
              .set({
                deliveredAt: attempt.state === "delivered" ? completedAt : null,
                lastErrorCode: attempt.errorCode,
                lastErrorMessage: attempt.errorMessage,
                lastErrorOccurredAt:
                  attempt.errorCode === null && attempt.errorMessage === null ? null : completedAt,
                lastErrorRetryable: attempt.retryable,
                lastResponseStatus: attempt.responseStatusCode,
                nextAttemptAt:
                  attempt.state === "pending" && attempt.nextAttemptAt !== null
                    ? toDate(attempt.nextAttemptAt)
                    : null,
                processingStartedAt: null,
                state: attempt.state,
                updatedAt: completedAt,
              })
              .where(
                and(
                  eq(webhookDeliveries.id, attempt.deliveryId),
                  eq(webhookDeliveries.state, "processing"),
                  eq(webhookDeliveries.attemptCount, attempt.attemptCount),
                  eq(webhookDeliveries.processingStartedAt, processingStartedAt),
                ),
              )
              .returning({
                webhookEndpointId: webhookDeliveries.webhookEndpointId,
              });

            if (delivery === undefined) {
              return false;
            }

            const [endpoint] = await transaction
              .select({
                consecutiveDeliveryFailures: webhookEndpoints.consecutiveDeliveryFailures,
              })
              .from(webhookEndpoints)
              .where(eq(webhookEndpoints.id, delivery.webhookEndpointId))
              .limit(1);

            if (endpoint === undefined) {
              throw new Error(
                `Webhook endpoint ${delivery.webhookEndpointId} referenced by delivery ${attempt.deliveryId} does not exist.`,
              );
            }

            if (attempt.state === "delivered") {
              await transaction
                .update(webhookEndpoints)
                .set({
                  consecutiveDeliveryFailures: 0,
                  deliveryState: "healthy",
                  lastDeliveryAt: completedAt,
                  lastErrorCode: null,
                  lastErrorMessage: null,
                  lastErrorOccurredAt: null,
                  lastErrorRetryable: null,
                  updatedAt: completedAt,
                })
                .where(eq(webhookEndpoints.id, delivery.webhookEndpointId));

              return true;
            }

            const consecutiveDeliveryFailures = endpoint.consecutiveDeliveryFailures + 1;

            await transaction
              .update(webhookEndpoints)
              .set({
                consecutiveDeliveryFailures,
                deliveryState: consecutiveDeliveryFailures >= 3 ? "failing" : "degraded",
                lastDeliveryAt: completedAt,
                lastErrorCode: attempt.errorCode,
                lastErrorMessage: attempt.errorMessage,
                lastErrorOccurredAt: completedAt,
                lastErrorRetryable: attempt.retryable,
                updatedAt: completedAt,
              })
              .where(eq(webhookEndpoints.id, delivery.webhookEndpointId));

            return true;
          });
        }),
    };
  }),
);
