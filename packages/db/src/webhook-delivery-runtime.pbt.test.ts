import { describe, expect, it } from "@effect/vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import {
  runWebhookDelivery,
  scheduleMailboxEventDeliveries,
  WebhookDeliveryScheduler,
  WebhookDeliverySender,
  WebhookDeliveryStore,
  type MailboxEventEnvelope,
  type MailboxEventType,
} from "@mailmon/core";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { asc, eq } from "drizzle-orm";
import { Effect, Layer, Option } from "effect";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";
import { createStableWebhookDeliveryId } from "./persistence/webhook-delivery-mappers.js";
import { WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS } from "./persistence/webhook-delivery-mappers.js";
import { hegelSettings, notePbtCase } from "./test-hegel.js";
import { withIsolatedDatabasePromise } from "./test-setup.js";

const workspaceId = "ws_webhook_runtime_pbt";
const mailboxId = "mbx_webhook_runtime_pbt";
const tenantExternalId = "tenant_webhook_runtime_pbt";
const eventTypeValues = ["message.created", "message.updated", "thread.updated"] as const;
const terminalResponseStatusValues = [300, 301, 308, 400, 401, 404, 409, 422, 429] as const;
const retryableResponseStatusValues = [500, 502, 503, 504, 599] as const;

const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});

const addMillisecondsToIsoTimestamp = (timestamp: string, milliseconds: number) =>
  new Date(Date.parse(timestamp) + milliseconds).toISOString();

const runtimeLayer = (connectionString: string) =>
  createCorePersistenceLayer(connectionString).pipe(
    Layer.provide(testGmailRefreshTokenCipherLayer),
  );

type SubscriptionFamily = "message-only" | "thread-only" | "all-events" | "created-and-thread";

const subscriptionEventTypesByFamily = {
  "message-only": ["message.created", "message.updated"],
  "thread-only": ["thread.updated"],
  "created-and-thread": ["message.created", "thread.updated"],
  "all-events": [...eventTypeValues],
} satisfies Record<SubscriptionFamily, ReadonlyArray<MailboxEventType>>;

const buildMailboxEventEnvelope = (
  eventId: string,
  eventType: MailboxEventType,
  index: number,
): MailboxEventEnvelope => {
  const occurredAt = `2026-04-09T10:0${index}:00.000Z`;

  if (eventType === "thread.updated") {
    return {
      id: eventId,
      type: eventType,
      occurredAt,
      workspaceId,
      tenantExternalId,
      mailboxId,
      schemaVersion: 1,
      data: {
        threadId: `thr_webhook_runtime_${index}`,
        providerThreadId: `gmail_thr_webhook_runtime_${index}`,
        subject: `Webhook runtime thread ${index}`,
        lastMessageAt: occurredAt,
      },
    };
  }

  return {
    id: eventId,
    type: eventType,
    occurredAt,
    workspaceId,
    tenantExternalId,
    mailboxId,
    schemaVersion: 1,
    data: {
      messageId: `msg_webhook_runtime_${index}`,
      threadId: `thr_webhook_runtime_${index}`,
      providerMessageId: `gmail_msg_webhook_runtime_${index}`,
      providerThreadId: `gmail_thr_webhook_runtime_${index}`,
      subject: `Webhook runtime message ${index}`,
      snippet: `Generated webhook runtime message ${index}`,
      receivedAt: occurredAt,
      labelIds: ["INBOX"],
    },
  };
};

const subscriptionEventTypesForFamily = (
  family: SubscriptionFamily,
): ReadonlyArray<MailboxEventType> => subscriptionEventTypesByFamily[family];

const seedGeneratedSchedulingFixture = async (
  connectionString: string,
  scenario: Readonly<{
    endpointSubscriptionFamilies: ReadonlyArray<SubscriptionFamily>;
    eventIndexes: ReadonlyArray<number>;
    eventTypes: ReadonlyArray<MailboxEventType>;
  }>,
) => {
  const database = createDb(connectionString);

  try {
    await database.db.insert(schema.workspaces).values({
      id: workspaceId,
    });

    await database.db.insert(schema.mailboxes).values({
      id: mailboxId,
      workspaceId,
      provider: "gmail",
      tenantExternalId,
      mailboxExternalId: "mailbox_webhook_runtime_pbt",
      emailAddress: "webhook-runtime-pbt@mailmon.dev",
      status: "active",
      syncState: "healthy",
      watchState: "active",
    });

    await database.db.insert(schema.webhookEndpoints).values(
      scenario.endpointSubscriptionFamilies.map((_, index) => ({
        id: `whe_webhook_runtime_pbt_${index}`,
        workspaceId,
        url: `https://app.example.com/webhooks/runtime-pbt/${index}`,
        description: `webhook runtime pbt ${index}`,
        signingSecret: `whsec_webhook_runtime_pbt_${index}`,
        deliveryState: "healthy",
      })),
    );

    await database.db.insert(schema.webhookEndpointSubscriptions).values(
      scenario.endpointSubscriptionFamilies.map((family, index) => ({
        id: `whsub_webhook_runtime_pbt_${index}`,
        workspaceId,
        webhookEndpointId: `whe_webhook_runtime_pbt_${index}`,
        mailboxId,
        eventTypes: [...subscriptionEventTypesForFamily(family)],
      })),
    );

    await database.db.insert(schema.mailboxEvents).values(
      scenario.eventTypes.map((eventType, index) => {
        const eventIndex = scenario.eventIndexes[index] ?? index;
        const id = `evt_webhook_runtime_pbt_${eventIndex}`;
        const payload = buildMailboxEventEnvelope(id, eventType, eventIndex);

        return {
          id,
          mailboxId,
          eventType,
          occurredAt: new Date(payload.occurredAt),
          payload,
        };
      }),
    );
  } finally {
    await database.client.end();
  }
};

const seedSingleWebhookDeliveryFixture = async (
  connectionString: string,
  options: Readonly<{
    attemptCount?: number;
    nextAttemptAt?: string | null;
    processingStartedAt?: string | null;
    state: "pending" | "processing";
  }>,
) => {
  const eventId = "evt_webhook_runtime_claim_pbt";
  const webhookEndpointId = "whe_webhook_runtime_claim_pbt";
  const deliveryId = createStableWebhookDeliveryId(eventId, webhookEndpointId);
  const eventType = "message.created" satisfies MailboxEventType;
  const payload = buildMailboxEventEnvelope(eventId, eventType, 0);
  const database = createDb(connectionString);

  try {
    await database.db.insert(schema.workspaces).values({
      id: workspaceId,
    });

    await database.db.insert(schema.mailboxes).values({
      id: mailboxId,
      workspaceId,
      provider: "gmail",
      tenantExternalId,
      mailboxExternalId: "mailbox_webhook_runtime_claim_pbt",
      emailAddress: "webhook-runtime-claim-pbt@mailmon.dev",
      status: "active",
      syncState: "healthy",
      watchState: "active",
    });

    await database.db.insert(schema.webhookEndpoints).values({
      id: webhookEndpointId,
      workspaceId,
      url: "https://app.example.com/webhooks/runtime-claim-pbt",
      description: "webhook runtime claim pbt",
      signingSecret: "whsec_webhook_runtime_claim_pbt",
      deliveryState: "healthy",
    });

    await database.db.insert(schema.mailboxEvents).values({
      id: eventId,
      mailboxId,
      eventType,
      occurredAt: new Date(payload.occurredAt),
      payload,
    });

    await database.db.insert(schema.webhookDeliveries).values({
      id: deliveryId,
      mailboxEventId: eventId,
      webhookEndpointId,
      state: options.state,
      attemptCount: options.attemptCount ?? 0,
      processingStartedAt:
        options.processingStartedAt === undefined || options.processingStartedAt === null
          ? null
          : new Date(options.processingStartedAt),
      lastAttemptedAt: null,
      nextAttemptAt:
        options.nextAttemptAt === undefined || options.nextAttemptAt === null
          ? null
          : new Date(options.nextAttemptAt),
      deliveredAt: null,
      lastResponseStatus: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastErrorOccurredAt: null,
      lastErrorRetryable: null,
    });

    return deliveryId;
  } finally {
    await database.client.end();
  }
};

const fetchWebhookDeliveries = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    return await database.db
      .select()
      .from(schema.webhookDeliveries)
      .orderBy(asc(schema.webhookDeliveries.mailboxEventId), asc(schema.webhookDeliveries.id));
  } finally {
    await database.client.end();
  }
};

const fetchWebhookDelivery = async (connectionString: string, deliveryId: string) => {
  const database = createDb(connectionString);

  try {
    const [delivery] = await database.db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.id, deliveryId))
      .limit(1);

    return delivery ?? null;
  } finally {
    await database.client.end();
  }
};

const scheduleGeneratedMailboxEventDeliveries = (
  connectionString: string,
  mailboxEventIds: ReadonlyArray<string>,
  scheduledDeliveryRequests: Array<{
    deliveryId: string;
    notBefore: string;
  }>,
) =>
  Effect.runPromise(
    scheduleMailboxEventDeliveries(mailboxEventIds).pipe(
      Effect.provide(
        Layer.mergeAll(
          runtimeLayer(connectionString),
          Layer.succeed(WebhookDeliveryScheduler, {
            scheduleWebhookDelivery: (request) =>
              Effect.sync(() => {
                scheduledDeliveryRequests.push(request);
              }),
          }),
        ),
      ),
    ),
  );

const prepareWebhookDeliveryAttempts = (
  connectionString: string,
  deliveryId: string,
  attemptedAtValues: ReadonlyArray<string>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const webhookDeliveryStore = yield* WebhookDeliveryStore;

      return yield* Effect.all(
        attemptedAtValues.map((attemptedAt) =>
          webhookDeliveryStore.prepareWebhookDeliveryAttempt(deliveryId, attemptedAt),
        ),
        { concurrency: "unbounded" },
      );
    }).pipe(Effect.provide(runtimeLayer(connectionString))),
  );

const unwrapPreparedDelivery = <
  T extends {
    readonly attemptCount: number;
    readonly processingStartedAt: string;
  },
>(
  value: Option.Option<T>,
) =>
  Option.match(value, {
    onNone: () => null,
    onSome: (delivery) => delivery,
  });

describe("DB-backed webhook delivery runtime properties", () => {
  it(
    "webhook-delivery-id-stable-dedupes-scheduling creates one stable durable row per event endpoint pair",
    () =>
      hegel.testAsync(async (tc) => {
        const eventIndexes = tc.draw(
          gs.arrays(gs.sampledFrom([0, 1, 2, 3] as const), {
            minSize: 1,
            maxSize: 4,
            unique: true,
          }),
        );
        const endpointFamilies = tc.draw(
          gs.arrays(
            gs.sampledFrom([
              "message-only",
              "thread-only",
              "all-events",
              "created-and-thread",
            ] as const),
            {
              minSize: 1,
              maxSize: 4,
            },
          ),
        );
        const duplicateInputIndexes = tc.draw(
          gs.arrays(gs.sampledFrom(eventIndexes), {
            minSize: 1,
            maxSize: 8,
          }),
        );
        const repeatCount = tc.draw(gs.integers({ minValue: 1, maxValue: 3 }));
        const eventTypes = eventIndexes.map(
          (index) => eventTypeValues[index % eventTypeValues.length],
        );
        const mailboxEventIds = duplicateInputIndexes.map(
          (index) => `evt_webhook_runtime_pbt_${index}`,
        );
        const requestedMailboxEventIds = new Set(mailboxEventIds);
        const expectedPairs = eventTypes.flatMap((eventType, eventPosition) =>
          endpointFamilies
            .map((family, endpointIndex) => ({
              eventId: `evt_webhook_runtime_pbt_${eventIndexes[eventPosition] ?? eventPosition}`,
              eventType,
              endpointId: `whe_webhook_runtime_pbt_${endpointIndex}`,
              subscriptionEventTypes: subscriptionEventTypesForFamily(family),
            }))
            .filter(
              (pair) =>
                requestedMailboxEventIds.has(pair.eventId) &&
                pair.subscriptionEventTypes.includes(pair.eventType),
            ),
        );

        notePbtCase(tc, "webhook-delivery-id-stable-dedupes-scheduling", {
          family: "db-generated-scheduling-dedupe",
          eventTypes,
          endpointFamilies,
          mailboxEventIds,
          repeatCount,
          expectedPairCount: expectedPairs.length,
        });

        await withIsolatedDatabasePromise(async ({ connectionString }) => {
          const scheduledDeliveryRequests: Array<{
            deliveryId: string;
            notBefore: string;
          }> = [];

          await seedGeneratedSchedulingFixture(connectionString, {
            endpointSubscriptionFamilies: endpointFamilies,
            eventIndexes,
            eventTypes,
          });

          for (let index = 0; index < repeatCount; index += 1) {
            const returnedRequests = await scheduleGeneratedMailboxEventDeliveries(
              connectionString,
              mailboxEventIds,
              scheduledDeliveryRequests,
            );
            const returnedRequestIds = returnedRequests.map((request) => request.deliveryId);

            expect(new Set(returnedRequestIds)).toEqual(
              new Set(
                expectedPairs.map((pair) =>
                  createStableWebhookDeliveryId(pair.eventId, pair.endpointId),
                ),
              ),
            );
          }

          const durableDeliveries = await fetchWebhookDeliveries(connectionString);

          expect(durableDeliveries).toHaveLength(expectedPairs.length);
          expect(new Set(durableDeliveries.map((delivery) => delivery.id))).toEqual(
            new Set(
              expectedPairs.map((pair) =>
                createStableWebhookDeliveryId(pair.eventId, pair.endpointId),
              ),
            ),
          );
          expect(
            new Set(
              durableDeliveries.map(
                (delivery) => `${delivery.mailboxEventId}:${delivery.webhookEndpointId}`,
              ),
            ).size,
          ).toBe(durableDeliveries.length);

          for (const delivery of durableDeliveries) {
            expect(delivery.id).toBe(
              createStableWebhookDeliveryId(delivery.mailboxEventId, delivery.webhookEndpointId),
            );
            expect(delivery.state).toBe("pending");
            expect(delivery.attemptCount).toBe(0);
          }

          expect(new Set(scheduledDeliveryRequests.map((request) => request.deliveryId))).toEqual(
            new Set(durableDeliveries.map((delivery) => delivery.id)),
          );
        });
      }, hegelSettings),
    120_000,
  );

  it(
    "webhook-claim-is-exclusive-and-stale-recoverable allows one generated concurrent pending claim",
    () =>
      hegel.testAsync(async (tc) => {
        const claimCount = tc.draw(gs.integers({ minValue: 2, maxValue: 6 }));
        const attemptedAt = "2026-04-09T10:30:00.000Z";
        const attemptedAtValues = Array.from({ length: claimCount }, (_, index) =>
          addMillisecondsToIsoTimestamp(attemptedAt, index),
        );

        notePbtCase(tc, "webhook-claim-is-exclusive-and-stale-recoverable", {
          family: "db-concurrent-pending-claim",
          claimCount,
          attemptedAtValues,
        });

        await withIsolatedDatabasePromise(async ({ connectionString }) => {
          const deliveryId = await seedSingleWebhookDeliveryFixture(connectionString, {
            state: "pending",
            nextAttemptAt: addMillisecondsToIsoTimestamp(attemptedAt, -1_000),
          });
          const claimResults = await prepareWebhookDeliveryAttempts(
            connectionString,
            deliveryId,
            attemptedAtValues,
          );
          const successfulClaims = claimResults
            .map(unwrapPreparedDelivery)
            .filter((claim) => claim !== null);
          const durableDelivery = await fetchWebhookDelivery(connectionString, deliveryId);

          expect(successfulClaims).toHaveLength(1);
          expect(successfulClaims[0]?.attemptCount).toBe(1);
          expect(durableDelivery).toMatchObject({
            id: deliveryId,
            state: "processing",
            attemptCount: 1,
          });
          expect(durableDelivery?.processingStartedAt?.toISOString()).toBe(
            successfulClaims[0]?.processingStartedAt,
          );
          expect(durableDelivery?.lastAttemptedAt?.toISOString()).toBe(
            successfulClaims[0]?.processingStartedAt,
          );
        });
      }, hegelSettings),
    120_000,
  );

  it(
    "webhook-claim-is-exclusive-and-stale-recoverable reclaims only generated stale processing rows",
    () =>
      hegel.testAsync(async (tc) => {
        const recoveryFamily = tc.draw(
          gs.sampledFrom(["non-stale", "exact-timeout", "stale"] as const),
        );
        const initialAttemptCount = tc.draw(gs.integers({ minValue: 1, maxValue: 4 }));
        const claimCount = tc.draw(gs.integers({ minValue: 2, maxValue: 6 }));
        const marginMs = tc.draw(gs.sampledFrom([1, 100, 1_000, 5_000] as const));
        const attemptedAt = "2026-04-09T10:45:00.000Z";
        const processingStartedAt =
          recoveryFamily === "non-stale"
            ? addMillisecondsToIsoTimestamp(
                attemptedAt,
                -WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS + marginMs,
              )
            : recoveryFamily === "exact-timeout"
              ? addMillisecondsToIsoTimestamp(attemptedAt, -WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS)
              : addMillisecondsToIsoTimestamp(
                  attemptedAt,
                  -WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS - marginMs,
                );
        const attemptedAtValues = Array.from({ length: claimCount }, () => attemptedAt);
        const shouldReclaim = recoveryFamily !== "non-stale";

        notePbtCase(tc, "webhook-claim-is-exclusive-and-stale-recoverable", {
          family: "db-processing-stale-recovery",
          recoveryFamily,
          initialAttemptCount,
          claimCount,
          marginMs,
          processingStartedAt,
          attemptedAt,
          shouldReclaim,
        });

        await withIsolatedDatabasePromise(async ({ connectionString }) => {
          const deliveryId = await seedSingleWebhookDeliveryFixture(connectionString, {
            state: "processing",
            attemptCount: initialAttemptCount,
            processingStartedAt,
          });
          const claimResults = await prepareWebhookDeliveryAttempts(
            connectionString,
            deliveryId,
            attemptedAtValues,
          );
          const successfulClaims = claimResults
            .map(unwrapPreparedDelivery)
            .filter((claim) => claim !== null);
          const durableDelivery = await fetchWebhookDelivery(connectionString, deliveryId);

          expect(successfulClaims).toHaveLength(shouldReclaim ? 1 : 0);
          expect(durableDelivery?.state).toBe("processing");

          if (shouldReclaim) {
            expect(successfulClaims[0]?.attemptCount).toBe(initialAttemptCount + 1);
            expect(successfulClaims[0]?.processingStartedAt).toBe(attemptedAt);
            expect(durableDelivery?.attemptCount).toBe(initialAttemptCount + 1);
            expect(durableDelivery?.processingStartedAt?.toISOString()).toBe(attemptedAt);
            expect(durableDelivery?.lastAttemptedAt?.toISOString()).toBe(attemptedAt);
            return;
          }

          expect(durableDelivery?.attemptCount).toBe(initialAttemptCount);
          expect(durableDelivery?.processingStartedAt?.toISOString()).toBe(processingStartedAt);
          expect(durableDelivery?.lastAttemptedAt).toBeNull();
        });
      }, hegelSettings),
    120_000,
  );

  it(
    "terminal-webhook-outcomes-do-not-reschedule makes zero scheduler calls from service execution",
    () =>
      hegel.testAsync(async (tc) => {
        const terminalKind = tc.draw(
          gs.sampledFrom([
            "delivered-response",
            "terminal-response",
            "nonretryable-failure",
            "exhausted-response",
            "exhausted-failure",
          ] as const),
        );
        const responseStatus =
          terminalKind === "delivered-response"
            ? tc.draw(gs.sampledFrom([200, 201, 204, 299] as const))
            : terminalKind === "terminal-response"
              ? tc.draw(gs.sampledFrom(terminalResponseStatusValues))
              : terminalKind === "exhausted-response"
                ? tc.draw(gs.sampledFrom(retryableResponseStatusValues))
                : null;
        const initialAttemptCount =
          terminalKind === "exhausted-response" || terminalKind === "exhausted-failure" ? 4 : 0;
        const expectedStatus =
          terminalKind === "delivered-response"
            ? "delivered"
            : terminalKind === "exhausted-response" || terminalKind === "exhausted-failure"
              ? "retry_exhausted"
              : "failed";

        notePbtCase(tc, "terminal-webhook-outcomes-do-not-reschedule", {
          family: "db-service-terminal-no-scheduler-call",
          terminalKind,
          responseStatus,
          initialAttemptCount,
          expectedStatus,
        });

        await withIsolatedDatabasePromise(async ({ connectionString }) => {
          const scheduledDeliveryRequests: Array<{
            deliveryId: string;
            notBefore: string;
          }> = [];
          const deliveryId = await seedSingleWebhookDeliveryFixture(connectionString, {
            state: "pending",
            attemptCount: initialAttemptCount,
            nextAttemptAt: "2000-01-01T00:00:00.000Z",
          });
          const sender =
            terminalKind === "nonretryable-failure"
              ? {
                  send: () =>
                    Effect.fail({
                      code: "webhook_delivery_nonretryable_property_failure",
                      message: "Generated nonretryable sender failure",
                      retryable: false,
                    }),
                }
              : terminalKind === "exhausted-failure"
                ? {
                    send: () =>
                      Effect.fail({
                        code: "webhook_delivery_timeout",
                        message: "Generated exhausted sender failure",
                        retryable: true,
                      }),
                  }
                : {
                    send: () =>
                      Effect.succeed({
                        statusCode: responseStatus ?? 204,
                      }),
                  };

          const result = await Effect.runPromise(
            runWebhookDelivery(deliveryId).pipe(
              Effect.provide(
                Layer.mergeAll(
                  runtimeLayer(connectionString),
                  Layer.succeed(WebhookDeliveryScheduler, {
                    scheduleWebhookDelivery: (request) =>
                      Effect.sync(() => {
                        scheduledDeliveryRequests.push(request);
                      }),
                  }),
                  Layer.succeed(WebhookDeliverySender, sender),
                ),
              ),
            ),
          );
          const durableDelivery = await fetchWebhookDelivery(connectionString, deliveryId);

          expect(result.status).toBe(expectedStatus);
          expect(result.nextAttemptAt).toBeNull();
          expect(result.attemptCount).toBe(initialAttemptCount + 1);
          expect(scheduledDeliveryRequests).toEqual([]);
          expect(durableDelivery?.attemptCount).toBe(initialAttemptCount + 1);
          expect(durableDelivery?.state).toBe(
            expectedStatus === "delivered" ? "delivered" : "failed",
          );
          expect(durableDelivery?.nextAttemptAt).toBeNull();
        });
      }, hegelSettings),
    120_000,
  );
});
