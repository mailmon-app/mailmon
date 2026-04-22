import { describe, expect, it } from "@effect/vitest";
import { Duration, Effect, Fiber, Layer, Option } from "effect";
import * as TestClock from "effect/TestClock";

import type {
  CompletedSyncRun,
  MailboxResource,
  PreparedWebhookDelivery,
  WebhookEndpointResource,
} from "./contracts.js";
import { makeProblem } from "./problems.js";
import {
  MailboxCatalog,
  MailboxQueryCatalog,
  MailboxSyncCoordinator,
  MailboxSyncDispatcher,
  MailboxSyncProvider,
  MailboxStateStore,
  MailboxWatchProvider,
  MailboxWatchStore,
  SyncRunStore,
  WebhookDeliveryScheduler,
  WebhookDeliverySender,
  WebhookDeliveryStore,
  WebhookEndpointCatalog,
  WebhookEndpointStore,
  WebhookEndpointSubscriptionStore,
} from "./services.js";
import {
  createWebhookEndpoint,
  createWebhookEndpointSubscription,
  dispatchMailboxSync,
  getMailboxOrFail,
  getMessageOrFail,
  getThreadOrFail,
  listMailboxMessages,
  listMailboxThreads,
  recoverWebhookDeliveryScheduling,
  renewExpiringMailboxWatches,
  runControlJob,
  runMailboxSync,
  runWebhookDelivery,
} from "./use-cases.js";

const primaryWorkspaceId = "ws_123";
const foreignWorkspaceId = "ws_foreign";

const mailboxFixture: MailboxResource = {
  id: "mbx_demo",
  object: "mailbox",
  provider: "gmail",
  emailAddress: "demo@mailmon.dev",
  status: "active",
  syncState: "healthy",
  watchState: "active",
  initializedAt: null,
  lastSuccessfulSyncAt: null,
  lastError: null,
};

const foreignMailboxFixture: MailboxResource = {
  ...mailboxFixture,
  id: "mbx_foreign",
  emailAddress: "foreign@mailmon.dev",
};

const webhookEndpointFixture: WebhookEndpointResource = {
  id: "whe_demo",
  object: "webhook_endpoint",
  url: "https://app.example.com/webhooks/mailmon",
  description: "production inbox events",
  deliveryState: "healthy",
  lastDeliveryAt: null,
  lastDeliveryError: null,
  createdAt: "2026-03-24T00:00:00.000Z",
};

const foreignWebhookEndpointFixture: WebhookEndpointResource = {
  ...webhookEndpointFixture,
  id: "whe_foreign",
  url: "https://foreign.example.com/webhooks/mailmon",
};

const mailboxFixtures = new Map([
  [mailboxFixture.id, { mailbox: mailboxFixture, workspaceId: primaryWorkspaceId }],
  [foreignMailboxFixture.id, { mailbox: foreignMailboxFixture, workspaceId: foreignWorkspaceId }],
]);

const catalogLayer = Layer.succeed(MailboxCatalog, {
  getMailbox: (mailboxId: string, options?: Readonly<{ workspaceId?: string }>) =>
    Effect.succeed(
      Option.fromNullable(mailboxFixtures.get(mailboxId)).pipe(
        Option.filter(
          (value) =>
            options?.workspaceId === undefined || value.workspaceId === options.workspaceId,
        ),
        Option.map((value) => value.mailbox),
      ),
    ),
});

const webhookEndpointFixtures = new Map([
  [
    webhookEndpointFixture.id,
    {
      webhookEndpoint: webhookEndpointFixture,
      workspaceId: primaryWorkspaceId,
    },
  ],
  [
    foreignWebhookEndpointFixture.id,
    {
      webhookEndpoint: foreignWebhookEndpointFixture,
      workspaceId: foreignWorkspaceId,
    },
  ],
]);

const webhookEndpointCatalogLayer = Layer.succeed(WebhookEndpointCatalog, {
  getWebhookEndpoint: (webhookEndpointId: string, options?: Readonly<{ workspaceId?: string }>) =>
    Effect.succeed(
      Option.fromNullable(webhookEndpointFixtures.get(webhookEndpointId)).pipe(
        Option.filter(
          (value) =>
            options?.workspaceId === undefined || value.workspaceId === options.workspaceId,
        ),
        Option.map((value) => value.webhookEndpoint),
      ),
    ),
});

const createSyncRunStoreTestLayer = (completedSyncRuns: Array<CompletedSyncRun>) =>
  Layer.succeed(SyncRunStore, {
    startSyncRun: (mailboxId: string) =>
      Effect.succeed({
        syncRunId: `sr_${mailboxId}`,
        mailboxId,
        startedAt: "2026-03-24T00:00:00.000Z",
      }),
    completeSyncRun: (result) =>
      Effect.sync(() => {
        completedSyncRuns.push(result);
      }),
  });

const createWebhookEndpointStoreTestLayer = (
  observedCreates: Array<{
    createdAt: string;
    description: string | null;
    id: string;
    secret: string;
    url: string;
    workspaceId: string;
  }>,
) =>
  Layer.succeed(WebhookEndpointStore, {
    createWebhookEndpoint: (params) =>
      Effect.sync(() => {
        observedCreates.push(params);

        return {
          id: params.id,
          object: "webhook_endpoint" as const,
          url: params.url,
          description: params.description,
          deliveryState: "healthy" as const,
          lastDeliveryAt: null,
          lastDeliveryError: null,
          createdAt: params.createdAt,
          secret: params.secret,
        };
      }),
  });

const createWebhookEndpointSubscriptionStoreTestLayer = (
  observedCreates: Array<{
    createdAt: string;
    eventTypes: ReadonlyArray<string>;
    mailboxIds: ReadonlyArray<string>;
    webhookEndpointId: string;
    workspaceId: string;
  }>,
) =>
  Layer.succeed(WebhookEndpointSubscriptionStore, {
    createWebhookEndpointSubscription: (params) =>
      Effect.sync(() => {
        observedCreates.push(params);

        return {
          object: "list" as const,
          data: params.mailboxIds.map((mailboxId) => ({
            id: `whsub_${mailboxId}`,
            object: "webhook_endpoint_subscription" as const,
            webhookEndpointId: params.webhookEndpointId,
            mailboxId,
            eventTypes: [...params.eventTypes],
            createdAt: params.createdAt,
          })),
          nextCursor: null,
        };
      }),
  });

const createSyncCoordinatorTestLayer = (
  params: Readonly<{
    acquisitionSucceeds?: boolean;
    acquisitionCalls?: Array<{
      acquiredAt: string;
      expiresAt: string;
      leaseOwnerId: string;
      mailboxId: string;
      syncRunId: string;
    }>;
    releaseCalls?: Array<{
      mailboxId: string;
      leaseOwnerId: string;
    }>;
    renewCalls?: Array<{
      mailboxId: string;
      leaseOwnerId: string;
      heartbeatAt: string;
      expiresAt: string;
    }>;
    renewResults?: ReadonlyArray<boolean>;
  }> = {},
) =>
  Layer.succeed(MailboxSyncCoordinator, {
    acquireMailboxSyncLease: (lease) =>
      Effect.sync(() => {
        params.acquisitionCalls?.push(lease);

        return {
          acquired: params.acquisitionSucceeds ?? true,
          expiresAt: "2026-03-24T00:01:30.000Z",
        };
      }),
    renewMailboxSyncLease: (lease) =>
      Effect.sync(() => {
        params.renewCalls?.push(lease);
        const renewAttempt = params.renewCalls?.length ?? 1;
        const renewed = params.renewResults?.[renewAttempt - 1] ?? true;

        return {
          renewed,
          expiresAt: renewed ? lease.expiresAt : null,
        };
      }),
    releaseMailboxSyncLease: (lease) =>
      Effect.sync(() => {
        params.releaseCalls?.push(lease);
      }),
  });

const createWebhookDeliveryStoreTestLayer = (
  params: Readonly<{
    deliveryRequestsByEventId?: Readonly<
      Record<
        string,
        ReadonlyArray<
          Readonly<{
            deliveryId: string;
            notBefore?: string;
          }>
        >
      >
    >;
    recoveredDeliveryRequests?: ReadonlyArray<
      Readonly<{
        deliveryId: string;
        notBefore: string;
      }>
    >;
    observedMailboxEventIds?: Array<ReadonlyArray<string>>;
    observedRecoveredAt?: Array<string>;
    preparedDelivery?: PreparedWebhookDelivery | null;
    prepareCalls?: Array<{
      deliveryId: string;
      attemptedAt: string;
    }>;
    completedAttempts?: Array<{
      deliveryId: string;
      attemptCount: number;
      processingStartedAt: string;
      state: "pending" | "delivered" | "failed";
      nextAttemptAt: string | null;
      responseStatusCode: number | null;
      errorCode: string | null;
      errorMessage: string | null;
      retryable: boolean | null;
    }>;
    completeAttemptResult?: boolean;
  }> = {},
) =>
  Layer.succeed(WebhookDeliveryStore, {
    createWebhookDeliveriesForMailboxEvents: (mailboxEventIds) =>
      Effect.sync(() => {
        params.observedMailboxEventIds?.push([...mailboxEventIds]);

        return mailboxEventIds.flatMap((mailboxEventId) =>
          (params.deliveryRequestsByEventId?.[mailboxEventId] ?? []).map((request) => ({
            deliveryId: request.deliveryId,
            notBefore: request.notBefore ?? "2026-03-24T00:00:00.000Z",
          })),
        );
      }),
    listWebhookDeliveryRecoverySchedules: (recoveredAt) =>
      Effect.sync(() => {
        params.observedRecoveredAt?.push(recoveredAt);

        return [...(params.recoveredDeliveryRequests ?? [])];
      }),
    prepareWebhookDeliveryAttempt: (deliveryId, attemptedAt) =>
      Effect.sync(() => {
        params.prepareCalls?.push({
          deliveryId,
          attemptedAt,
        });

        return Option.fromNullable(params.preparedDelivery).pipe(
          Option.filter((delivery) => delivery.deliveryId === deliveryId),
        );
      }),
    completeWebhookDeliveryAttempt: (attempt) =>
      Effect.sync(() => {
        params.completedAttempts?.push({
          deliveryId: attempt.deliveryId,
          attemptCount: attempt.attemptCount,
          processingStartedAt: attempt.processingStartedAt,
          state: attempt.state,
          nextAttemptAt: attempt.nextAttemptAt,
          responseStatusCode: attempt.responseStatusCode,
          errorCode: attempt.errorCode,
          errorMessage: attempt.errorMessage,
          retryable: attempt.retryable,
        });

        return params.completeAttemptResult ?? true;
      }),
  });

const createWebhookDeliverySchedulerTestLayer = (
  scheduledRequests: Array<{
    deliveryId: string;
    notBefore: string;
  }> = [],
) =>
  Layer.succeed(WebhookDeliveryScheduler, {
    scheduleWebhookDelivery: ({ deliveryId, notBefore }) =>
      Effect.sync(() => {
        scheduledRequests.push({
          deliveryId,
          notBefore,
        });
      }),
  });

const createWebhookDeliverySenderTestLayer = (
  send: (
    delivery: PreparedWebhookDelivery,
    attemptedAt: string,
  ) => Effect.Effect<{ statusCode: number }, { code: string; message: string; retryable: boolean }>,
) =>
  Layer.succeed(WebhookDeliverySender, {
    send,
  });

const noopWebhookDeliverySchedulingLayer = Layer.mergeAll(
  createWebhookDeliveryStoreTestLayer(),
  createWebhookDeliverySchedulerTestLayer(),
);

const createSyncProviderTestLayer = (
  observedCursors: Array<string | null>,
  options: Readonly<{
    delayMs?: number;
  }> = {},
) =>
  Layer.succeed(MailboxSyncProvider, {
    syncMailbox: ({ cursor }) =>
      Effect.sync(() => {
        observedCursors.push(cursor);
      }).pipe(
        Effect.zipRight(Effect.sleep(Duration.millis(options.delayMs ?? 0))),
        Effect.as({
          snapshot: {
            threads: [
              {
                id: "thr_demo",
                providerThreadId: "gmail_thr_demo",
                subject: "Demo thread",
                lastMessageAt: "2026-03-24T00:00:00.000Z",
              },
            ],
            messages: [
              {
                id: "msg_demo",
                threadId: "thr_demo",
                providerMessageId: "gmail_msg_demo",
                providerThreadId: "gmail_thr_demo",
                subject: "Demo thread",
                from: {
                  name: "Mailmon",
                  email: "hello@mailmon.dev",
                },
                snippet: "Baseline sync fixture",
                receivedAt: "2026-03-24T00:00:00.000Z",
                labelIds: ["INBOX"],
              },
            ],
            deletedProviderMessageIds: [],
          },
          eventsEmitted: 2,
          nextCursor: "hist_2",
        }),
      ),
  });

const createMailboxStateStoreTestLayer = (
  currentCursor: string | null,
  appliedSnapshots: Array<{
    eventsEmitted: number;
    mailboxId: string;
    leaseOwnerId: string;
    syncRunId: string;
    threadCount: number;
    messageCount: number;
    nextCursor: string | null;
  }>,
  options: Readonly<{
    applyDelayMs?: number;
    applied?: boolean;
    mailboxEventCount?: number;
  }> = {},
) => {
  let storedCursor = currentCursor;

  return Layer.succeed(MailboxStateStore, {
    getMailboxCursor: () => Effect.succeed(storedCursor),
    applySyncResult: ({
      eventsEmitted,
      mailboxId,
      leaseOwnerId,
      nextCursor,
      snapshot,
      syncRunId,
    }) =>
      Effect.sleep(Duration.millis(options.applyDelayMs ?? 0)).pipe(
        Effect.map(() => {
          const applied = options.applied ?? true;

          return {
            applied,
            mailboxEventIds: applied
              ? Array.from(
                  { length: options.mailboxEventCount ?? eventsEmitted },
                  (_, index) => `evt_${syncRunId}_${index}`,
                )
              : [],
          };
        }),
        Effect.tap((commitResult) =>
          commitResult.applied
            ? Effect.sync(() => {
                storedCursor = nextCursor;
                appliedSnapshots.push({
                  eventsEmitted,
                  mailboxId,
                  leaseOwnerId,
                  syncRunId,
                  threadCount: snapshot.threads.length,
                  messageCount: snapshot.messages.length,
                  nextCursor,
                });
              })
            : Effect.void,
        ),
      ),
  });
};

const dispatchedMailboxIds: Array<string> = [];

const syncDispatcherLayer = Layer.succeed(MailboxSyncDispatcher, {
  dispatchMailboxSync: (mailboxId: string) =>
    Effect.sync(() => {
      dispatchedMailboxIds.push(mailboxId);
    }),
});

const queryCatalogLayer = Layer.succeed(MailboxQueryCatalog, {
  listMessages: ({ mailboxId, cursor, limit }) =>
    Effect.succeed({
      object: "list" as const,
      data:
        mailboxId === mailboxFixture.id
          ? [
              {
                id: "msg_demo",
                mailboxId,
                threadId: "thr_demo",
                providerMessageId: "gmail_msg_demo",
                subject: "Demo message",
                from: {
                  name: "Mailmon",
                  email: "hello@mailmon.dev",
                },
                snippet: "Mailbox message fixture",
                receivedAt: "2026-03-24T00:00:00.000Z",
                labelIds: ["INBOX"],
              },
            ].slice(0, limit)
          : [],
      nextCursor: cursor === null && mailboxId === mailboxFixture.id ? "cur_2" : null,
    }),
  getMessage: (messageId: string) =>
    Effect.succeed(
      messageId === "msg_demo"
        ? Option.some({
            id: "msg_demo",
            mailboxId: mailboxFixture.id,
            threadId: "thr_demo",
            providerMessageId: "gmail_msg_demo",
            subject: "Demo message",
            from: {
              name: "Mailmon",
              email: "hello@mailmon.dev",
            },
            snippet: "Mailbox message fixture",
            receivedAt: "2026-03-24T00:00:00.000Z",
            labelIds: ["INBOX"],
          })
        : Option.none(),
    ),
  listThreads: ({ mailboxId }) =>
    Effect.succeed({
      object: "list" as const,
      data:
        mailboxId === mailboxFixture.id
          ? [
              {
                id: "thr_demo",
                object: "thread" as const,
                mailboxId,
                providerThreadId: "gmail_thr_demo",
                subject: "Demo thread",
                lastMessageAt: "2026-03-24T00:00:00.000Z",
              },
            ]
          : [],
      nextCursor: null,
    }),
  getThread: (threadId: string) =>
    Effect.succeed(
      threadId === "thr_demo"
        ? Option.some({
            id: "thr_demo",
            object: "thread" as const,
            mailboxId: mailboxFixture.id,
            providerThreadId: "gmail_thr_demo",
            subject: "Demo thread",
            lastMessageAt: "2026-03-24T00:00:00.000Z",
            messages: [
              {
                id: "msg_demo",
                subject: "Demo message",
                receivedAt: "2026-03-24T00:00:00.000Z",
              },
            ],
          })
        : Option.none(),
    ),
});

describe("getMailboxOrFail", () => {
  it.effect("fails with a structured problem when the mailbox is missing", () =>
    getMailboxOrFail("mbx_missing").pipe(
      Effect.flip,
      Effect.map((problem) => {
        expect(problem.code).toBe("mailbox_not_found");
        expect(problem.status).toBe(404);
      }),
      Effect.provide(catalogLayer),
    ),
  );
});

describe("dispatchMailboxSync", () => {
  it.effect(
    "verifies the mailbox exists before dispatching it through the shared transport boundary",
    () =>
      dispatchMailboxSync(mailboxFixture.id).pipe(
        Effect.map((mailbox) => {
          expect(mailbox.id).toBe(mailboxFixture.id);
          expect(dispatchedMailboxIds).toEqual([mailboxFixture.id]);
        }),
        Effect.tap(() => Effect.sync(() => dispatchedMailboxIds.splice(0))),
        Effect.provide(Layer.mergeAll(catalogLayer, syncDispatcherLayer)),
      ),
  );
});

describe("message and thread query use cases", () => {
  it.effect("lists messages after verifying mailbox ownership", () =>
    listMailboxMessages(mailboxFixture.id, {
      limit: 10,
      workspaceId: primaryWorkspaceId,
    }).pipe(
      Effect.map((result) => {
        expect(result.object).toBe("list");
        expect(result.data).toHaveLength(1);
        expect(result.data[0]?.id).toBe("msg_demo");
        expect(result.nextCursor).toBe("cur_2");
      }),
      Effect.provide(Layer.mergeAll(catalogLayer, queryCatalogLayer)),
    ),
  );

  it.effect("gets a single message and maps missing resources to a problem", () =>
    Effect.gen(function* () {
      const message = yield* getMessageOrFail("msg_demo");
      expect(message.id).toBe("msg_demo");

      const problem = yield* getMessageOrFail("msg_missing").pipe(Effect.flip);
      expect(problem.code).toBe("message_not_found");
    }).pipe(Effect.provide(queryCatalogLayer)),
  );

  it.effect("lists threads and returns a thread with message summaries", () =>
    Effect.gen(function* () {
      const threads = yield* listMailboxThreads(mailboxFixture.id, {
        limit: 10,
        workspaceId: primaryWorkspaceId,
      });
      expect(threads.data[0]?.id).toBe("thr_demo");

      const thread = yield* getThreadOrFail("thr_demo");
      expect(thread.messages).toEqual([
        {
          id: "msg_demo",
          subject: "Demo message",
          receivedAt: "2026-03-24T00:00:00.000Z",
        },
      ]);
    }).pipe(Effect.provide(Layer.mergeAll(catalogLayer, queryCatalogLayer))),
  );
});

describe("webhook endpoint use cases", () => {
  it.effect("creates a webhook endpoint and returns its secret once", () => {
    const observedCreates: Array<{
      createdAt: string;
      description: string | null;
      id: string;
      secret: string;
      url: string;
      workspaceId: string;
    }> = [];

    return Effect.gen(function* () {
      const createdWebhookEndpoint = yield* createWebhookEndpoint(primaryWorkspaceId, {
        url: "https://app.example.com/webhooks/mailmon",
        description: "production inbox events",
      });

      expect(createdWebhookEndpoint.id).toMatch(/^whe_/);
      expect(createdWebhookEndpoint.secret).toMatch(/^whsec_/);
      expect(createdWebhookEndpoint.url).toBe("https://app.example.com/webhooks/mailmon");
      expect(createdWebhookEndpoint.description).toBe("production inbox events");
      expect(createdWebhookEndpoint.deliveryState).toBe("healthy");
      expect(observedCreates).toEqual([
        {
          createdAt: expect.any(String),
          description: "production inbox events",
          id: expect.stringMatching(/^whe_/),
          secret: expect.stringMatching(/^whsec_/),
          url: "https://app.example.com/webhooks/mailmon",
          workspaceId: primaryWorkspaceId,
        },
      ]);
    }).pipe(Effect.provide(createWebhookEndpointStoreTestLayer(observedCreates)));
  });

  it.effect("creates mailbox-scoped subscriptions for an owned endpoint", () => {
    const observedCreates: Array<{
      createdAt: string;
      eventTypes: ReadonlyArray<string>;
      mailboxIds: ReadonlyArray<string>;
      webhookEndpointId: string;
      workspaceId: string;
    }> = [];

    return Effect.gen(function* () {
      const subscriptions = yield* createWebhookEndpointSubscription(
        primaryWorkspaceId,
        webhookEndpointFixture.id,
        {
          mailboxIds: [mailboxFixture.id, mailboxFixture.id],
          eventTypes: ["thread.updated", "message.created"],
        },
      );

      expect(subscriptions.object).toBe("list");
      expect(subscriptions.data).toEqual([
        {
          id: `whsub_${mailboxFixture.id}`,
          object: "webhook_endpoint_subscription",
          webhookEndpointId: webhookEndpointFixture.id,
          mailboxId: mailboxFixture.id,
          eventTypes: ["message.created", "thread.updated"],
          createdAt: expect.any(String),
        },
      ]);
      expect(observedCreates).toEqual([
        {
          createdAt: expect.any(String),
          eventTypes: ["message.created", "thread.updated"],
          mailboxIds: [mailboxFixture.id],
          webhookEndpointId: webhookEndpointFixture.id,
          workspaceId: primaryWorkspaceId,
        },
      ]);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          catalogLayer,
          webhookEndpointCatalogLayer,
          createWebhookEndpointSubscriptionStoreTestLayer(observedCreates),
        ),
      ),
    );
  });

  it.effect("collapses foreign-owned webhook endpoints to not found", () =>
    createWebhookEndpointSubscription(primaryWorkspaceId, foreignWebhookEndpointFixture.id, {
      mailboxIds: [mailboxFixture.id],
      eventTypes: ["message.created"],
    }).pipe(
      Effect.flip,
      Effect.map((problem) => {
        expect(problem.code).toBe("webhook_endpoint_not_found");
        expect(problem.status).toBe(404);
        expect(problem.resource).toEqual({
          webhook_endpoint_id: foreignWebhookEndpointFixture.id,
        });
      }),
      Effect.provide(
        Layer.mergeAll(
          catalogLayer,
          webhookEndpointCatalogLayer,
          createWebhookEndpointSubscriptionStoreTestLayer([]),
        ),
      ),
    ),
  );

  it.effect("fails when the webhook endpoint is missing", () =>
    createWebhookEndpointSubscription(primaryWorkspaceId, "whe_missing", {
      mailboxIds: [mailboxFixture.id],
      eventTypes: ["message.created"],
    }).pipe(
      Effect.flip,
      Effect.map((problem) => {
        expect(problem.code).toBe("webhook_endpoint_not_found");
        expect(problem.status).toBe(404);
      }),
      Effect.provide(
        Layer.mergeAll(
          catalogLayer,
          webhookEndpointCatalogLayer,
          createWebhookEndpointSubscriptionStoreTestLayer([]),
        ),
      ),
    ),
  );

  it.effect("collapses foreign-owned mailboxes to not found", () =>
    createWebhookEndpointSubscription(primaryWorkspaceId, webhookEndpointFixture.id, {
      mailboxIds: [foreignMailboxFixture.id],
      eventTypes: ["message.created"],
    }).pipe(
      Effect.flip,
      Effect.map((problem) => {
        expect(problem.code).toBe("mailbox_not_found");
        expect(problem.status).toBe(404);
        expect(problem.resource).toEqual({
          mailbox_id: foreignMailboxFixture.id,
        });
      }),
      Effect.provide(
        Layer.mergeAll(
          catalogLayer,
          webhookEndpointCatalogLayer,
          createWebhookEndpointSubscriptionStoreTestLayer([]),
        ),
      ),
    ),
  );
});

describe("recoverWebhookDeliveryScheduling", () => {
  it.effect("re-arms durable webhook deliveries from store recovery schedules", () =>
    Effect.gen(function* () {
      const observedRecoveredAt: string[] = [];
      const scheduledDeliveryRequests: Array<{
        deliveryId: string;
        notBefore: string;
      }> = [];
      const recoveredAt = "2026-03-24T00:05:00.000Z";

      const result = yield* recoverWebhookDeliveryScheduling(recoveredAt).pipe(
        Effect.provide(
          Layer.mergeAll(
            createWebhookDeliveryStoreTestLayer({
              recoveredDeliveryRequests: [
                {
                  deliveryId: "del_recover_1",
                  notBefore: "2026-03-24T00:05:05.000Z",
                },
                {
                  deliveryId: "del_recover_2",
                  notBefore: "2026-03-24T00:05:30.000Z",
                },
              ],
              observedRecoveredAt,
            }),
            createWebhookDeliverySchedulerTestLayer(scheduledDeliveryRequests),
          ),
        ),
      );

      expect(observedRecoveredAt).toEqual([recoveredAt]);
      expect(result).toEqual([
        {
          deliveryId: "del_recover_1",
          notBefore: "2026-03-24T00:05:05.000Z",
        },
        {
          deliveryId: "del_recover_2",
          notBefore: "2026-03-24T00:05:30.000Z",
        },
      ]);
      expect(scheduledDeliveryRequests).toEqual(result);
    }),
  );
});

describe("renewExpiringMailboxWatches", () => {
  it.effect("marks expiring and expired watches before renewing them", () =>
    Effect.gen(function* () {
      const started: Array<{ mailboxId: string; observedAt: string }> = [];
      const completed: Array<{
        historyId: string;
        mailboxId: string;
        renewedAt: string;
        watchExpiresAt: string;
      }> = [];
      const observedAt = "2026-04-22T00:00:00.000Z";
      const expiringMailbox = {
        mailbox: mailboxFixture,
        watchExpiresAt: "2026-04-22T12:00:00.000Z",
      };
      const expiredMailbox = {
        mailbox: {
          ...mailboxFixture,
          id: "mbx_expired",
          watchState: "expired" as const,
        },
        watchExpiresAt: "2026-04-21T23:59:00.000Z",
      };

      const result = yield* renewExpiringMailboxWatches({
        limit: 10,
        observedAt,
        renewalWindowMs: 24 * 60 * 60_000,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(MailboxWatchStore, {
              listMailboxWatchesNeedingRenewal: () =>
                Effect.succeed([expiringMailbox, expiredMailbox]),
              markMailboxWatchRenewalStarted: (params) =>
                Effect.sync(() => {
                  started.push(params);
                }),
              completeMailboxWatchRenewal: (params) =>
                Effect.sync(() => {
                  completed.push(params);
                }),
              failMailboxWatchRenewal: () => Effect.void,
            }),
            Layer.succeed(MailboxWatchProvider, {
              renewMailboxWatch: ({ mailbox }) =>
                Effect.succeed({
                  historyId: `hist_${mailbox.id}`,
                  watchExpiresAt: "2026-04-28T00:00:00.000Z",
                }),
            }),
          ),
        ),
      );

      expect(result).toEqual({
        completedAt: observedAt,
        expired: 1,
        expiring: 1,
        failed: 0,
        kind: "renew_watches",
        renewed: 2,
        scanned: 2,
        status: "completed",
      });
      expect(started).toEqual([
        {
          mailboxId: mailboxFixture.id,
          observedAt,
        },
        {
          mailboxId: "mbx_expired",
          observedAt,
        },
      ]);
      expect(completed).toEqual([
        {
          historyId: "hist_mbx_demo",
          mailboxId: mailboxFixture.id,
          renewedAt: observedAt,
          watchExpiresAt: "2026-04-28T00:00:00.000Z",
        },
        {
          historyId: "hist_mbx_expired",
          mailboxId: "mbx_expired",
          renewedAt: observedAt,
          watchExpiresAt: "2026-04-28T00:00:00.000Z",
        },
      ]);
    }),
  );

  it.effect("records individual renewal failures without failing the control job", () =>
    Effect.gen(function* () {
      const failures: Array<{
        mailboxId: string;
        observedAt: string;
        problemCode: string;
      }> = [];
      const renewalProblem = makeProblem({
        type: "https://api.mailmon.dev/problems/gmail-watch-renewal-failed",
        title: "Gmail watch renewal failed",
        status: 503,
        code: "gmail_watch_renewal_failed",
        detail: "Gmail temporarily rejected the watch renewal.",
        retryable: true,
      });

      const result = yield* runControlJob({ kind: "renew_watches" }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(MailboxWatchStore, {
              listMailboxWatchesNeedingRenewal: () =>
                Effect.succeed([
                  {
                    mailbox: mailboxFixture,
                    watchExpiresAt: "2026-04-21T23:59:00.000Z",
                  },
                ]),
              markMailboxWatchRenewalStarted: () => Effect.void,
              completeMailboxWatchRenewal: () => Effect.void,
              failMailboxWatchRenewal: ({ mailboxId, observedAt: failedAt, problem }) =>
                Effect.sync(() => {
                  failures.push({
                    mailboxId,
                    observedAt: failedAt,
                    problemCode: problem.code,
                  });
                }),
            }),
            Layer.succeed(MailboxWatchProvider, {
              renewMailboxWatch: () => Effect.fail(renewalProblem),
            }),
          ),
        ),
      );

      expect(result).toMatchObject({
        expired: 1,
        failed: 1,
        kind: "renew_watches",
        renewed: 0,
        scanned: 1,
        status: "completed",
      });
      expect(Date.parse(result.completedAt)).not.toBeNaN();
      expect(failures).toEqual([
        {
          mailboxId: mailboxFixture.id,
          observedAt: result.completedAt,
          problemCode: "gmail_watch_renewal_failed",
        },
      ]);
    }),
  );
});

describe("runMailboxSync", () => {
  it.effect("coordinates mailbox lookup, provider sync, and sync run completion", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];
      const completedSyncRuns: Array<CompletedSyncRun> = [];

      return yield* runMailboxSync(mailboxFixture.id).pipe(
        Effect.map((result) => {
          expect(result.mailboxId).toBe(mailboxFixture.id);
          expect(result.syncRunId).toBe("sr_mbx_demo");
          expect(result.eventsEmitted).toBe(2);
          expect(result.nextCursor).toBe("hist_2");
          expect(observedCursors).toEqual([null]);
          expect(appliedSnapshots).toEqual([
            {
              mailboxId: mailboxFixture.id,
              eventsEmitted: 2,
              leaseOwnerId: expect.any(String),
              syncRunId: "sr_mbx_demo",
              threadCount: 1,
              messageCount: 1,
              nextCursor: "hist_2",
            },
          ]);
          expect(completedSyncRuns).toEqual([]);
        }),
        Effect.provide(
          Layer.mergeAll(
            catalogLayer,
            createMailboxStateStoreTestLayer(null, appliedSnapshots),
            createSyncRunStoreTestLayer(completedSyncRuns),
            createSyncCoordinatorTestLayer(),
            createSyncProviderTestLayer(observedCursors),
            noopWebhookDeliverySchedulingLayer,
          ),
        ),
      );
    }),
  );

  it.effect("reports the durable mailbox-event count returned by the commit path", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];

      const providerLayer = Layer.succeed(MailboxSyncProvider, {
        syncMailbox: ({ cursor }) =>
          Effect.sync(() => {
            observedCursors.push(cursor);

            return {
              snapshot: {
                deletedProviderMessageIds: [],
                threads: [
                  {
                    id: "thr_demo",
                    providerThreadId: "gmail_thr_demo",
                    subject: "Demo thread",
                    lastMessageAt: "2026-03-24T00:00:00.000Z",
                  },
                ],
                messages: [
                  {
                    id: "msg_demo",
                    threadId: "thr_demo",
                    providerMessageId: "gmail_msg_demo",
                    providerThreadId: "gmail_thr_demo",
                    subject: "Demo thread",
                    from: {
                      name: "Mailmon",
                      email: "hello@mailmon.dev",
                    },
                    snippet: "Baseline sync fixture",
                    receivedAt: "2026-03-24T00:00:00.000Z",
                    labelIds: ["INBOX"],
                  },
                ],
              },
              eventsEmitted: 7,
              nextCursor: "hist_2",
            };
          }),
      });

      const result = yield* runMailboxSync(mailboxFixture.id).pipe(
        Effect.provide(
          Layer.mergeAll(
            catalogLayer,
            createMailboxStateStoreTestLayer(null, appliedSnapshots, {
              mailboxEventCount: 2,
            }),
            createSyncRunStoreTestLayer([]),
            createSyncCoordinatorTestLayer(),
            providerLayer,
            noopWebhookDeliverySchedulingLayer,
          ),
        ),
      );

      expect(result.status).toBe("completed");
      expect(result.eventsEmitted).toBe(2);
      expect(observedCursors).toEqual([null]);
      expect(appliedSnapshots).toEqual([
        {
          mailboxId: mailboxFixture.id,
          eventsEmitted: 7,
          leaseOwnerId: expect.any(String),
          syncRunId: "sr_mbx_demo",
          threadCount: 1,
          messageCount: 1,
          nextCursor: "hist_2",
        },
      ]);
    }),
  );

  it.effect("schedules durable webhook deliveries from committed mailbox events", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedMailboxEventIds: Array<ReadonlyArray<string>> = [];
      const scheduledDeliveryRequests: Array<{
        deliveryId: string;
        notBefore: string;
      }> = [];

      const result = yield* runMailboxSync(mailboxFixture.id).pipe(
        Effect.provide(
          Layer.mergeAll(
            catalogLayer,
            createMailboxStateStoreTestLayer(null, appliedSnapshots, {
              mailboxEventCount: 2,
            }),
            createSyncRunStoreTestLayer([]),
            createSyncCoordinatorTestLayer(),
            createSyncProviderTestLayer([]),
            createWebhookDeliveryStoreTestLayer({
              deliveryRequestsByEventId: {
                evt_sr_mbx_demo_0: [
                  { deliveryId: "del_evt_0_whe_0" },
                  { deliveryId: "del_evt_0_whe_1" },
                ],
                evt_sr_mbx_demo_1: [{ deliveryId: "del_evt_1_whe_0" }],
              },
              observedMailboxEventIds,
            }),
            createWebhookDeliverySchedulerTestLayer(scheduledDeliveryRequests),
          ),
        ),
      );

      expect(result.status).toBe("completed");
      expect(observedMailboxEventIds).toEqual([["evt_sr_mbx_demo_0", "evt_sr_mbx_demo_1"]]);
      expect(scheduledDeliveryRequests).toEqual([
        {
          deliveryId: "del_evt_0_whe_0",
          notBefore: "2026-03-24T00:00:00.000Z",
        },
        {
          deliveryId: "del_evt_0_whe_1",
          notBefore: "2026-03-24T00:00:00.000Z",
        },
        {
          deliveryId: "del_evt_1_whe_0",
          notBefore: "2026-03-24T00:00:00.000Z",
        },
      ]);
    }),
  );

  it.effect("passes the stored cursor into the provider for incremental sync", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];

      return yield* runMailboxSync(mailboxFixture.id).pipe(
        Effect.map((result) => {
          expect(result.status).toBe("completed");
          expect(result.nextCursor).toBe("hist_2");
          expect(observedCursors).toEqual(["hist_1"]);
          expect(appliedSnapshots).toEqual([
            {
              mailboxId: mailboxFixture.id,
              eventsEmitted: 2,
              leaseOwnerId: expect.any(String),
              syncRunId: "sr_mbx_demo",
              threadCount: 1,
              messageCount: 1,
              nextCursor: "hist_2",
            },
          ]);
        }),
        Effect.provide(
          Layer.mergeAll(
            catalogLayer,
            createMailboxStateStoreTestLayer("hist_1", appliedSnapshots),
            createSyncRunStoreTestLayer([]),
            createSyncCoordinatorTestLayer(),
            createSyncProviderTestLayer(observedCursors),
            noopWebhookDeliverySchedulingLayer,
          ),
        ),
      );
    }),
  );

  it.effect(
    "uses the advanced cursor on a follow-up wake-up so duplicate dispatches stay idempotent",
    () =>
      Effect.gen(function* () {
        const appliedSnapshots: Array<{
          eventsEmitted: number;
          mailboxId: string;
          leaseOwnerId: string;
          syncRunId: string;
          threadCount: number;
          messageCount: number;
          nextCursor: string | null;
        }> = [];
        const observedCursors: Array<string | null> = [];

        const providerLayer = Layer.succeed(MailboxSyncProvider, {
          syncMailbox: ({ cursor }) =>
            Effect.sync(() => {
              observedCursors.push(cursor);

              if (cursor === "hist_1") {
                return {
                  snapshot: {
                    deletedProviderMessageIds: [],
                    threads: [
                      {
                        id: "thr_demo",
                        providerThreadId: "gmail_thr_demo",
                        subject: "Demo thread",
                        lastMessageAt: "2026-03-24T00:01:00.000Z",
                      },
                    ],
                    messages: [
                      {
                        id: "msg_demo_2",
                        threadId: "thr_demo",
                        providerMessageId: "gmail_msg_demo_2",
                        providerThreadId: "gmail_thr_demo",
                        subject: "Demo thread",
                        from: {
                          name: "Mailmon",
                          email: "hello@mailmon.dev",
                        },
                        snippet: "Incremental message",
                        receivedAt: "2026-03-24T00:01:00.000Z",
                        labelIds: ["INBOX"],
                      },
                    ],
                  },
                  eventsEmitted: 1,
                  nextCursor: "hist_2",
                };
              }

              return {
                snapshot: {
                  deletedProviderMessageIds: [],
                  threads: [],
                  messages: [],
                },
                eventsEmitted: 0,
                nextCursor: "hist_2",
              };
            }),
        });

        const testLayer = Layer.mergeAll(
          catalogLayer,
          createMailboxStateStoreTestLayer("hist_1", appliedSnapshots),
          createSyncRunStoreTestLayer([]),
          createSyncCoordinatorTestLayer(),
          providerLayer,
          noopWebhookDeliverySchedulingLayer,
        );

        const firstResult = yield* runMailboxSync(mailboxFixture.id).pipe(
          Effect.provide(testLayer),
        );
        const secondResult = yield* runMailboxSync(mailboxFixture.id).pipe(
          Effect.provide(testLayer),
        );

        expect(firstResult.status).toBe("completed");
        expect(firstResult.eventsEmitted).toBe(1);
        expect(firstResult.nextCursor).toBe("hist_2");
        expect(secondResult.status).toBe("completed");
        expect(secondResult.eventsEmitted).toBe(0);
        expect(secondResult.nextCursor).toBe("hist_2");
        expect(observedCursors).toEqual(["hist_1", "hist_2"]);
        expect(appliedSnapshots).toEqual([
          {
            mailboxId: mailboxFixture.id,
            eventsEmitted: 1,
            leaseOwnerId: expect.any(String),
            syncRunId: "sr_mbx_demo",
            threadCount: 1,
            messageCount: 1,
            nextCursor: "hist_2",
          },
          {
            mailboxId: mailboxFixture.id,
            eventsEmitted: 0,
            leaseOwnerId: expect.any(String),
            syncRunId: "sr_mbx_demo",
            threadCount: 0,
            messageCount: 0,
            nextCursor: "hist_2",
          },
        ]);
      }),
  );

  it.effect("returns a skipped result when another worker holds the mailbox lease", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];
      const completedSyncRuns: Array<CompletedSyncRun> = [];

      return yield* runMailboxSync(mailboxFixture.id).pipe(
        Effect.map((result) => {
          expect(result.mailboxId).toBe(mailboxFixture.id);
          expect(result.syncRunId).toBe("sr_mbx_demo");
          expect(result.status).toBe("skipped_due_to_active_lease");
          expect(result.eventsEmitted).toBe(0);
          expect(result.nextCursor).toBeNull();
          expect(observedCursors).toEqual([]);
          expect(appliedSnapshots).toEqual([]);
          expect(completedSyncRuns).toEqual([
            expect.objectContaining({
              mailboxId: mailboxFixture.id,
              status: "skipped_due_to_active_lease",
              eventsEmitted: 0,
              nextCursor: null,
            }),
          ]);
        }),
        Effect.provide(
          Layer.mergeAll(
            catalogLayer,
            createMailboxStateStoreTestLayer("hist_1", appliedSnapshots),
            createSyncRunStoreTestLayer(completedSyncRuns),
            createSyncCoordinatorTestLayer({
              acquisitionSucceeds: false,
            }),
            createSyncProviderTestLayer(observedCursors),
            noopWebhookDeliverySchedulingLayer,
          ),
        ),
      );
    }),
  );

  it.effect(
    "returns reconnect_required without running provider work for mailboxes already awaiting reconnect",
    () =>
      Effect.gen(function* () {
        const appliedSnapshots: Array<{
          eventsEmitted: number;
          mailboxId: string;
          leaseOwnerId: string;
          syncRunId: string;
          threadCount: number;
          messageCount: number;
          nextCursor: string | null;
        }> = [];
        const observedCursors: Array<string | null> = [];
        const completedSyncRuns: Array<CompletedSyncRun> = [];
        const acquisitionCalls: Array<{
          acquiredAt: string;
          expiresAt: string;
          leaseOwnerId: string;
          mailboxId: string;
          syncRunId: string;
        }> = [];
        const reconnectRequiredCatalogLayer = Layer.succeed(MailboxCatalog, {
          getMailbox: () =>
            Effect.succeed(
              Option.some({
                ...mailboxFixture,
                status: "reconnect_required" as const,
                syncState: "failed" as const,
                lastError: {
                  code: "gmail_token_refresh_reconnect_required",
                  message: "Reconnect is required before mailbox sync can continue.",
                  occurredAt: "2026-03-24T00:00:00.000Z",
                  retryable: false,
                },
              }),
            ),
        });

        return yield* runMailboxSync(mailboxFixture.id).pipe(
          Effect.map((result) => {
            expect(result.mailboxId).toBe(mailboxFixture.id);
            expect(result.syncRunId).toBe("sr_mbx_demo");
            expect(result.status).toBe("reconnect_required");
            expect(result.eventsEmitted).toBe(0);
            expect(result.nextCursor).toBeNull();
            expect(acquisitionCalls).toEqual([]);
            expect(completedSyncRuns).toEqual([
              expect.objectContaining({
                mailboxId: mailboxFixture.id,
                status: "reconnect_required",
                detail: "mailbox_reconnect_required",
                eventsEmitted: 0,
                nextCursor: null,
              }),
            ]);
          }),
          Effect.provide(
            Layer.mergeAll(
              reconnectRequiredCatalogLayer,
              createMailboxStateStoreTestLayer("hist_1", appliedSnapshots),
              createSyncRunStoreTestLayer(completedSyncRuns),
              createSyncCoordinatorTestLayer({
                acquisitionCalls,
              }),
              createSyncProviderTestLayer(observedCursors),
              noopWebhookDeliverySchedulingLayer,
            ),
          ),
        );
      }),
  );

  it.effect("returns reconnect_required when provider reports a terminal Gmail auth failure", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const completedSyncRuns: Array<CompletedSyncRun> = [];

      const providerLayer = Layer.succeed(MailboxSyncProvider, {
        syncMailbox: () =>
          Effect.fail({
            type: "https://api.mailmon.dev/problems/gmail-token-refresh-reconnect-required",
            title: "Gmail reconnect required",
            status: 401,
            code: "gmail_token_refresh_reconnect_required",
            detail:
              "Refreshing the Gmail access token failed because the stored refresh token is invalid or revoked.",
            retryable: false,
            resource: {
              mailbox_id: mailboxFixture.id,
            },
          }),
      });

      return yield* runMailboxSync(mailboxFixture.id).pipe(
        Effect.map((result) => {
          expect(result.mailboxId).toBe(mailboxFixture.id);
          expect(result.syncRunId).toBe("sr_mbx_demo");
          expect(result.status).toBe("reconnect_required");
          expect(result.eventsEmitted).toBe(0);
          expect(result.nextCursor).toBeNull();
          expect(appliedSnapshots).toEqual([]);
          expect(completedSyncRuns).toEqual([
            expect.objectContaining({
              mailboxId: mailboxFixture.id,
              status: "reconnect_required",
              detail: "gmail_token_refresh_reconnect_required",
              eventsEmitted: 0,
              nextCursor: null,
            }),
          ]);
        }),
        Effect.provide(
          Layer.mergeAll(
            catalogLayer,
            createMailboxStateStoreTestLayer("hist_1", appliedSnapshots),
            createSyncRunStoreTestLayer(completedSyncRuns),
            createSyncCoordinatorTestLayer(),
            providerLayer,
            noopWebhookDeliverySchedulingLayer,
          ),
        ),
      );
    }),
  );

  it.effect(
    "returns reconnect_required when provider reports missing Gmail mailbox credentials",
    () =>
      Effect.gen(function* () {
        const appliedSnapshots: Array<{
          eventsEmitted: number;
          mailboxId: string;
          leaseOwnerId: string;
          syncRunId: string;
          threadCount: number;
          messageCount: number;
          nextCursor: string | null;
        }> = [];
        const completedSyncRuns: Array<CompletedSyncRun> = [];

        const providerLayer = Layer.succeed(MailboxSyncProvider, {
          syncMailbox: () =>
            Effect.fail({
              type: "https://api.mailmon.dev/problems/gmail-mailbox-credentials-missing",
              title: "Gmail mailbox credentials missing",
              status: 409,
              code: "gmail_mailbox_credentials_missing",
              detail: `Mailbox ${mailboxFixture.id} has no stored Gmail refresh token.`,
              retryable: false,
              resource: {
                mailbox_id: mailboxFixture.id,
              },
            }),
        });

        return yield* runMailboxSync(mailboxFixture.id).pipe(
          Effect.map((result) => {
            expect(result.mailboxId).toBe(mailboxFixture.id);
            expect(result.syncRunId).toBe("sr_mbx_demo");
            expect(result.status).toBe("reconnect_required");
            expect(result.eventsEmitted).toBe(0);
            expect(result.nextCursor).toBeNull();
            expect(appliedSnapshots).toEqual([]);
            expect(completedSyncRuns).toEqual([
              expect.objectContaining({
                mailboxId: mailboxFixture.id,
                status: "reconnect_required",
                detail: "gmail_mailbox_credentials_missing",
                eventsEmitted: 0,
                nextCursor: null,
              }),
            ]);
          }),
          Effect.provide(
            Layer.mergeAll(
              catalogLayer,
              createMailboxStateStoreTestLayer("hist_1", appliedSnapshots),
              createSyncRunStoreTestLayer(completedSyncRuns),
              createSyncCoordinatorTestLayer(),
              providerLayer,
              noopWebhookDeliverySchedulingLayer,
            ),
          ),
        );
      }),
  );

  it.effect("keeps heartbeating the mailbox lease until state writes finish", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];
      const completedSyncRuns: Array<CompletedSyncRun> = [];
      const renewCalls: Array<{
        mailboxId: string;
        leaseOwnerId: string;
        heartbeatAt: string;
        expiresAt: string;
      }> = [];
      const releaseCalls: Array<{
        mailboxId: string;
        leaseOwnerId: string;
      }> = [];

      const fiber = yield* Effect.fork(
        runMailboxSync(mailboxFixture.id).pipe(
          Effect.provide(
            Layer.mergeAll(
              catalogLayer,
              createMailboxStateStoreTestLayer(null, appliedSnapshots, {
                applyDelayMs: 31_000,
              }),
              createSyncRunStoreTestLayer(completedSyncRuns),
              createSyncCoordinatorTestLayer({
                releaseCalls,
                renewCalls,
              }),
              createSyncProviderTestLayer(observedCursors),
              noopWebhookDeliverySchedulingLayer,
            ),
          ),
        ),
      );

      yield* TestClock.adjust(Duration.millis(31_000));

      const result = yield* Fiber.join(fiber);

      expect(result.status).toBe("completed");
      expect(observedCursors).toEqual([null]);
      expect(renewCalls).toHaveLength(1);
      expect(appliedSnapshots).toEqual([
        {
          mailboxId: mailboxFixture.id,
          eventsEmitted: 2,
          leaseOwnerId: expect.any(String),
          syncRunId: "sr_mbx_demo",
          threadCount: 1,
          messageCount: 1,
          nextCursor: "hist_2",
        },
      ]);
      expect(completedSyncRuns).toEqual([]);
      expect(releaseCalls).toHaveLength(1);
    }),
  );

  it.effect("stops execution and records lease_lost when heartbeat renewal fails mid-run", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];
      const completedSyncRuns: Array<CompletedSyncRun> = [];
      const renewCalls: Array<{
        mailboxId: string;
        leaseOwnerId: string;
        heartbeatAt: string;
        expiresAt: string;
      }> = [];
      const releaseCalls: Array<{
        mailboxId: string;
        leaseOwnerId: string;
      }> = [];

      const fiber = yield* Effect.fork(
        runMailboxSync(mailboxFixture.id).pipe(
          Effect.provide(
            Layer.mergeAll(
              catalogLayer,
              createMailboxStateStoreTestLayer(null, appliedSnapshots, {
                applyDelayMs: 31_000,
              }),
              createSyncRunStoreTestLayer(completedSyncRuns),
              createSyncCoordinatorTestLayer({
                releaseCalls,
                renewCalls,
                renewResults: [false],
              }),
              createSyncProviderTestLayer(observedCursors),
              noopWebhookDeliverySchedulingLayer,
            ),
          ),
          Effect.either,
        ),
      );

      yield* TestClock.adjust(Duration.millis(30_000));

      const result = yield* Fiber.join(fiber);

      expect(result._tag).toBe("Left");

      if (result._tag === "Left") {
        expect(result.left.code).toBe("mailbox_sync_lease_lost");
      }

      expect(observedCursors).toEqual([null]);
      expect(renewCalls).toHaveLength(1);
      expect(appliedSnapshots).toEqual([]);
      expect(completedSyncRuns).toEqual([
        expect.objectContaining({
          mailboxId: mailboxFixture.id,
          status: "lease_lost",
          eventsEmitted: 0,
          nextCursor: null,
          detail: "mailbox_sync_lease_lost",
        }),
      ]);
      expect(releaseCalls).toHaveLength(1);
    }),
  );
});

describe("runWebhookDelivery", () => {
  const deliveryFixture: PreparedWebhookDelivery = {
    deliveryId: "del_demo",
    mailboxEventId: "evt_demo",
    webhookEndpointId: "whe_demo",
    attemptCount: 1,
    processingStartedAt: "2026-03-24T00:00:05.000Z",
    url: "https://app.example.com/webhooks/mailmon",
    signingSecret: "whsec_demo",
    event: {
      id: "evt_demo",
      type: "message.created",
      occurredAt: "2026-03-24T00:00:00.000Z",
      workspaceId: primaryWorkspaceId,
      tenantExternalId: "tenant_123",
      mailboxId: mailboxFixture.id,
      schemaVersion: 1,
      data: {
        messageId: "msg_demo",
        threadId: "thr_demo",
        providerMessageId: "gmail_msg_demo",
        providerThreadId: "gmail_thr_demo",
        subject: "Demo thread",
        snippet: "Mailbox message fixture",
        receivedAt: "2026-03-24T00:00:00.000Z",
        labelIds: ["INBOX"],
      },
    },
  };

  it.effect("marks successful deliveries as delivered without scheduling a retry", () =>
    Effect.gen(function* () {
      const completedAttempts: Array<{
        deliveryId: string;
        attemptCount: number;
        processingStartedAt: string;
        state: "pending" | "delivered" | "failed";
        nextAttemptAt: string | null;
        responseStatusCode: number | null;
        errorCode: string | null;
        errorMessage: string | null;
        retryable: boolean | null;
      }> = [];
      const scheduledDeliveryRequests: Array<{
        deliveryId: string;
        notBefore: string;
      }> = [];

      const result = yield* runWebhookDelivery(deliveryFixture.deliveryId).pipe(
        Effect.provide(
          Layer.mergeAll(
            createWebhookDeliveryStoreTestLayer({
              preparedDelivery: deliveryFixture,
              completedAttempts,
            }),
            createWebhookDeliverySchedulerTestLayer(scheduledDeliveryRequests),
            createWebhookDeliverySenderTestLayer(() =>
              Effect.succeed({
                statusCode: 202,
              }),
            ),
          ),
        ),
      );

      expect(result).toEqual({
        deliveryId: deliveryFixture.deliveryId,
        status: "delivered",
        attemptCount: 1,
        nextAttemptAt: null,
      });
      expect(completedAttempts).toEqual([
        {
          deliveryId: deliveryFixture.deliveryId,
          attemptCount: deliveryFixture.attemptCount,
          processingStartedAt: deliveryFixture.processingStartedAt,
          state: "delivered",
          nextAttemptAt: null,
          responseStatusCode: 202,
          errorCode: null,
          errorMessage: null,
          retryable: null,
        },
      ]);
      expect(scheduledDeliveryRequests).toEqual([]);
    }),
  );

  it.effect("retries timeout failures by rescheduling the durable delivery", () =>
    Effect.gen(function* () {
      const completedAttempts: Array<{
        deliveryId: string;
        attemptCount: number;
        processingStartedAt: string;
        state: "pending" | "delivered" | "failed";
        nextAttemptAt: string | null;
        responseStatusCode: number | null;
        errorCode: string | null;
        errorMessage: string | null;
        retryable: boolean | null;
      }> = [];
      const scheduledDeliveryRequests: Array<{
        deliveryId: string;
        notBefore: string;
      }> = [];

      const result = yield* runWebhookDelivery(deliveryFixture.deliveryId).pipe(
        Effect.provide(
          Layer.mergeAll(
            createWebhookDeliveryStoreTestLayer({
              preparedDelivery: deliveryFixture,
              completedAttempts,
            }),
            createWebhookDeliverySchedulerTestLayer(scheduledDeliveryRequests),
            createWebhookDeliverySenderTestLayer(() =>
              Effect.fail({
                code: "webhook_delivery_timeout",
                message: "Webhook delivery timed out after 5 seconds.",
                retryable: true,
              }),
            ),
          ),
        ),
      );

      expect(result.deliveryId).toBe(deliveryFixture.deliveryId);
      expect(result.status).toBe("scheduled_for_retry");
      expect(result.attemptCount).toBe(1);
      expect(result.nextAttemptAt).toEqual(expect.any(String));
      expect(completedAttempts).toEqual([
        {
          deliveryId: deliveryFixture.deliveryId,
          attemptCount: deliveryFixture.attemptCount,
          processingStartedAt: deliveryFixture.processingStartedAt,
          state: "pending",
          nextAttemptAt: expect.any(String),
          responseStatusCode: null,
          errorCode: "webhook_delivery_timeout",
          errorMessage: "Webhook delivery timed out after 5 seconds.",
          retryable: true,
        },
      ]);
      expect(scheduledDeliveryRequests).toEqual([
        {
          deliveryId: deliveryFixture.deliveryId,
          notBefore: completedAttempts[0].nextAttemptAt!,
        },
      ]);
    }),
  );

  it.effect("fails non-retryable endpoint responses without rescheduling", () =>
    Effect.gen(function* () {
      const completedAttempts: Array<{
        deliveryId: string;
        attemptCount: number;
        processingStartedAt: string;
        state: "pending" | "delivered" | "failed";
        nextAttemptAt: string | null;
        responseStatusCode: number | null;
        errorCode: string | null;
        errorMessage: string | null;
        retryable: boolean | null;
      }> = [];
      const scheduledDeliveryRequests: Array<{
        deliveryId: string;
        notBefore: string;
      }> = [];

      const result = yield* runWebhookDelivery(deliveryFixture.deliveryId).pipe(
        Effect.provide(
          Layer.mergeAll(
            createWebhookDeliveryStoreTestLayer({
              preparedDelivery: deliveryFixture,
              completedAttempts,
            }),
            createWebhookDeliverySchedulerTestLayer(scheduledDeliveryRequests),
            createWebhookDeliverySenderTestLayer(() =>
              Effect.succeed({
                statusCode: 422,
              }),
            ),
          ),
        ),
      );

      expect(result).toEqual({
        deliveryId: deliveryFixture.deliveryId,
        status: "failed",
        attemptCount: 1,
        nextAttemptAt: null,
      });
      expect(completedAttempts).toEqual([
        {
          deliveryId: deliveryFixture.deliveryId,
          attemptCount: deliveryFixture.attemptCount,
          processingStartedAt: deliveryFixture.processingStartedAt,
          state: "failed",
          nextAttemptAt: null,
          responseStatusCode: 422,
          errorCode: "webhook_endpoint_http_422",
          errorMessage: "Webhook endpoint responded with HTTP 422.",
          retryable: false,
        },
      ]);
      expect(scheduledDeliveryRequests).toEqual([]);
    }),
  );

  it.effect("no-ops when the delivery is no longer pending", () =>
    runWebhookDelivery("del_missing").pipe(
      Effect.provide(
        Layer.mergeAll(
          createWebhookDeliveryStoreTestLayer({
            preparedDelivery: null,
          }),
          createWebhookDeliverySchedulerTestLayer(),
          createWebhookDeliverySenderTestLayer(() =>
            Effect.succeed({
              statusCode: 200,
            }),
          ),
        ),
      ),
      Effect.map((result) => {
        expect(result).toEqual({
          deliveryId: "del_missing",
          status: "noop",
          attemptCount: null,
          nextAttemptAt: null,
        });
      }),
    ),
  );

  it.effect("returns noop when a stale completion loses the compare-and-swap race", () =>
    Effect.gen(function* () {
      const completedAttempts: Array<{
        deliveryId: string;
        attemptCount: number;
        processingStartedAt: string;
        state: "pending" | "delivered" | "failed";
        nextAttemptAt: string | null;
        responseStatusCode: number | null;
        errorCode: string | null;
        errorMessage: string | null;
        retryable: boolean | null;
      }> = [];
      const scheduledDeliveryRequests: Array<{
        deliveryId: string;
        notBefore: string;
      }> = [];

      const result = yield* runWebhookDelivery(deliveryFixture.deliveryId).pipe(
        Effect.provide(
          Layer.mergeAll(
            createWebhookDeliveryStoreTestLayer({
              preparedDelivery: deliveryFixture,
              completedAttempts,
              completeAttemptResult: false,
            }),
            createWebhookDeliverySchedulerTestLayer(scheduledDeliveryRequests),
            createWebhookDeliverySenderTestLayer(() =>
              Effect.succeed({
                statusCode: 204,
              }),
            ),
          ),
        ),
      );

      expect(result).toEqual({
        deliveryId: deliveryFixture.deliveryId,
        status: "noop",
        attemptCount: null,
        nextAttemptAt: null,
      });
      expect(completedAttempts).toEqual([
        {
          deliveryId: deliveryFixture.deliveryId,
          attemptCount: deliveryFixture.attemptCount,
          processingStartedAt: deliveryFixture.processingStartedAt,
          state: "delivered",
          nextAttemptAt: null,
          responseStatusCode: 204,
          errorCode: null,
          errorMessage: null,
          retryable: null,
        },
      ]);
      expect(scheduledDeliveryRequests).toEqual([]);
    }),
  );
});
