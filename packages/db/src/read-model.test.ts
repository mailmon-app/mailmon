import { describe, expect, it } from "@effect/vitest";
import {
  getMailboxObservability,
  MailboxPushNotificationStore,
  getMessageOrFail,
  getThreadOrFail,
  listMailboxMessages,
  listMailboxSyncRuns,
  listMailboxThreads,
} from "@mailmon/core";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { Effect, Layer } from "effect";
import postgres from "postgres";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";
import { withIsolatedDatabaseEffect } from "./test-setup.js";

const primaryWorkspaceId = "ws_primary";
const foreignWorkspaceId = "ws_foreign";
const primaryMailboxId = "mbx_primary";
const secondaryPrimaryMailboxId = "mbx_primary_secondary";
const foreignMailboxId = "mbx_foreign";
const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});

const seedReadModelFixtures = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    await database.db.insert(schema.workspaces).values([
      {
        id: primaryWorkspaceId,
      },
      {
        id: foreignWorkspaceId,
      },
    ]);

    await database.db.insert(schema.mailboxes).values([
      {
        id: primaryMailboxId,
        workspaceId: primaryWorkspaceId,
        provider: "gmail",
        emailAddress: "primary@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
      },
      {
        id: foreignMailboxId,
        workspaceId: foreignWorkspaceId,
        provider: "gmail",
        emailAddress: "primary@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
      },
    ]);

    await database.db.insert(schema.threads).values([
      {
        id: "thr_400",
        mailboxId: primaryMailboxId,
        providerThreadId: "gmail_thr_400",
        subject: "Primary newest thread",
        lastMessageAt: new Date("2026-04-04T12:00:00.000Z"),
      },
      {
        id: "thr_300",
        mailboxId: primaryMailboxId,
        providerThreadId: "gmail_thr_300",
        subject: "Primary same-timestamp thread high id",
        lastMessageAt: new Date("2026-04-03T12:00:00.000Z"),
      },
      {
        id: "thr_250",
        mailboxId: primaryMailboxId,
        providerThreadId: "gmail_thr_250",
        subject: "Primary same-timestamp thread low id",
        lastMessageAt: new Date("2026-04-03T12:00:00.000Z"),
      },
      {
        id: "thr_100",
        mailboxId: primaryMailboxId,
        providerThreadId: "gmail_thr_100",
        subject: "Primary oldest thread",
        lastMessageAt: new Date("2026-04-01T12:00:00.000Z"),
      },
      {
        id: "thr_foreign",
        mailboxId: foreignMailboxId,
        providerThreadId: "gmail_thr_foreign",
        subject: "Foreign workspace thread",
        lastMessageAt: new Date("2026-04-05T12:00:00.000Z"),
      },
    ]);

    await database.db.insert(schema.messages).values([
      {
        id: "msg_400",
        mailboxId: primaryMailboxId,
        threadId: "thr_400",
        providerMessageId: "gmail_msg_400",
        providerThreadId: "gmail_thr_400",
        subject: "Primary newest message",
        fromName: "Alex",
        fromEmail: "alex@example.com",
        snippet: "Newest primary mailbox message",
        receivedAt: new Date("2026-04-04T10:00:00.000Z"),
        labelIds: ["INBOX"],
      },
      {
        id: "msg_300",
        mailboxId: primaryMailboxId,
        threadId: "thr_300",
        providerMessageId: "gmail_msg_300",
        providerThreadId: "gmail_thr_300",
        subject: "Primary same-timestamp message high id",
        fromName: "Blake",
        fromEmail: "blake@example.com",
        snippet: "High id message on same timestamp",
        receivedAt: new Date("2026-04-03T10:00:00.000Z"),
        labelIds: ["INBOX", "UNREAD"],
      },
      {
        id: "msg_250",
        mailboxId: primaryMailboxId,
        threadId: "thr_250",
        providerMessageId: "gmail_msg_250",
        providerThreadId: "gmail_thr_250",
        subject: "Primary same-timestamp message low id",
        fromName: "Casey",
        fromEmail: "casey@example.com",
        snippet: "Low id message on same timestamp",
        receivedAt: new Date("2026-04-03T10:00:00.000Z"),
        labelIds: ["INBOX"],
      },
      {
        id: "msg_100",
        mailboxId: primaryMailboxId,
        threadId: "thr_100",
        providerMessageId: "gmail_msg_100",
        providerThreadId: "gmail_thr_100",
        subject: "Primary oldest message",
        fromName: "Devon",
        fromEmail: "devon@example.com",
        snippet: "Oldest primary mailbox message",
        receivedAt: new Date("2026-04-01T10:00:00.000Z"),
        labelIds: ["INBOX"],
      },
      {
        id: "msg_foreign",
        mailboxId: foreignMailboxId,
        threadId: "thr_foreign",
        providerMessageId: "gmail_msg_foreign",
        providerThreadId: "gmail_thr_foreign",
        subject: "Foreign workspace message",
        fromName: "Erin",
        fromEmail: "erin@example.com",
        snippet: "Foreign mailbox message",
        receivedAt: new Date("2026-04-05T10:00:00.000Z"),
        labelIds: ["INBOX"],
      },
    ]);
  } finally {
    await database.client.end();
  }
};

const seedObservabilityFixtures = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    await database.db.insert(schema.workspaces).values([
      {
        id: primaryWorkspaceId,
      },
      {
        id: foreignWorkspaceId,
      },
    ]);

    await database.db.insert(schema.mailboxes).values([
      {
        id: primaryMailboxId,
        workspaceId: primaryWorkspaceId,
        provider: "gmail",
        emailAddress: "primary@mailmon.dev",
        status: "active",
        syncState: "lagging",
        watchState: "expiring",
        cursor: "hist_205",
        lastSuccessfulSyncAt: new Date("2026-04-22T09:59:00.000Z"),
        activeSyncLeaseOwner: "lease_active",
        activeSyncLeaseHeartbeatAt: new Date("2026-04-22T10:04:40.000Z"),
        activeSyncLeaseExpiresAt: new Date("2026-04-22T10:05:30.000Z"),
      },
      {
        id: secondaryPrimaryMailboxId,
        workspaceId: primaryWorkspaceId,
        provider: "gmail",
        emailAddress: "secondary@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
        cursor: "hist_secondary_10",
        lastSuccessfulSyncAt: new Date("2026-04-22T10:01:05.000Z"),
      },
      {
        id: foreignMailboxId,
        workspaceId: foreignWorkspaceId,
        provider: "gmail",
        emailAddress: "foreign@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
      },
    ]);

    await database.db.insert(schema.syncRuns).values([
      {
        id: "sr_newest",
        mailboxId: primaryMailboxId,
        status: "completed",
        leaseOwnerId: "lease_newest",
        startedAt: new Date("2026-04-22T10:00:00.000Z"),
        completedAt: new Date("2026-04-22T10:00:10.000Z"),
        eventsEmitted: "2",
        previousCursor: "hist_200",
        nextCursor: "hist_205",
        detail: null,
      },
      {
        id: "sr_contention_recent",
        mailboxId: primaryMailboxId,
        status: "skipped_due_to_active_lease",
        leaseOwnerId: null,
        startedAt: new Date("2026-04-22T09:50:00.000Z"),
        completedAt: new Date("2026-04-22T09:50:02.000Z"),
        eventsEmitted: "0",
        previousCursor: null,
        nextCursor: null,
        detail: null,
      },
      {
        id: "sr_lease_lost_recent",
        mailboxId: primaryMailboxId,
        status: "lease_lost",
        leaseOwnerId: "lease_lost_owner",
        startedAt: new Date("2026-04-22T09:40:00.000Z"),
        completedAt: new Date("2026-04-22T09:40:20.000Z"),
        eventsEmitted: "0",
        previousCursor: null,
        nextCursor: null,
        detail: "mailbox_sync_lease_lost",
      },
      {
        id: "sr_old_contention",
        mailboxId: primaryMailboxId,
        status: "skipped_due_to_active_lease",
        leaseOwnerId: null,
        startedAt: new Date("2026-04-20T10:00:00.000Z"),
        completedAt: new Date("2026-04-20T10:00:01.000Z"),
        eventsEmitted: "0",
        previousCursor: null,
        nextCursor: null,
        detail: null,
      },
      {
        id: "sr_foreign",
        mailboxId: foreignMailboxId,
        status: "completed",
        leaseOwnerId: "lease_foreign",
        startedAt: new Date("2026-04-22T10:00:00.000Z"),
        completedAt: new Date("2026-04-22T10:00:05.000Z"),
        eventsEmitted: "1",
        previousCursor: "hist_foreign_1",
        nextCursor: "hist_foreign_2",
        detail: null,
      },
      {
        id: "sr_secondary_stable",
        mailboxId: secondaryPrimaryMailboxId,
        status: "completed",
        leaseOwnerId: "lease_secondary",
        startedAt: new Date("2026-04-22T10:01:00.000Z"),
        completedAt: new Date("2026-04-22T10:01:05.000Z"),
        eventsEmitted: "0",
        previousCursor: "hist_secondary_10",
        nextCursor: "hist_secondary_10",
        detail: null,
      },
      {
        id: "sr_secondary_contention_boundary",
        mailboxId: secondaryPrimaryMailboxId,
        status: "skipped_due_to_active_lease",
        leaseOwnerId: null,
        startedAt: new Date("2026-04-21T10:04:59.000Z"),
        completedAt: new Date("2026-04-21T10:05:01.000Z"),
        eventsEmitted: "0",
        previousCursor: null,
        nextCursor: null,
        detail: null,
      },
    ]);

    await database.db.insert(schema.webhookEndpoints).values([
      {
        id: "whe_primary_1",
        workspaceId: primaryWorkspaceId,
        url: "https://app.example.com/webhooks/mailmon",
        description: "primary endpoint",
        signingSecret: "whsec_primary_1",
        deliveryState: "degraded",
        lastDeliveryAt: new Date("2026-04-22T10:04:00.000Z"),
        lastErrorCode: "webhook_delivery_timeout",
        lastErrorMessage: "Webhook delivery timed out before the endpoint responded.",
        lastErrorOccurredAt: new Date("2026-04-22T10:04:00.000Z"),
        lastErrorRetryable: true,
        consecutiveDeliveryFailures: 2,
      },
      {
        id: "whe_primary_2",
        workspaceId: primaryWorkspaceId,
        url: "https://app.example.com/webhooks/secondary",
        description: "secondary endpoint",
        signingSecret: "whsec_primary_2",
        deliveryState: "healthy",
        lastDeliveryAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastErrorOccurredAt: null,
        lastErrorRetryable: null,
        consecutiveDeliveryFailures: 0,
      },
      {
        id: "whe_foreign",
        workspaceId: foreignWorkspaceId,
        url: "https://foreign.example.com/webhooks/mailmon",
        description: "foreign endpoint",
        signingSecret: "whsec_foreign",
        deliveryState: "failing",
        lastDeliveryAt: new Date("2026-04-22T10:00:00.000Z"),
        lastErrorCode: "webhook_delivery_5xx",
        lastErrorMessage: "Endpoint failed",
        lastErrorOccurredAt: new Date("2026-04-22T10:00:00.000Z"),
        lastErrorRetryable: true,
        consecutiveDeliveryFailures: 5,
      },
    ]);

    await database.db.insert(schema.webhookEndpointSubscriptions).values([
      {
        id: "whsub_primary_1",
        workspaceId: primaryWorkspaceId,
        webhookEndpointId: "whe_primary_1",
        mailboxId: primaryMailboxId,
        eventTypes: ["message.created"],
      },
      {
        id: "whsub_primary_2",
        workspaceId: primaryWorkspaceId,
        webhookEndpointId: "whe_primary_2",
        mailboxId: primaryMailboxId,
        eventTypes: ["thread.updated"],
      },
      {
        id: "whsub_primary_shared",
        workspaceId: primaryWorkspaceId,
        webhookEndpointId: "whe_primary_1",
        mailboxId: secondaryPrimaryMailboxId,
        eventTypes: ["message.updated"],
      },
      {
        id: "whsub_foreign",
        workspaceId: foreignWorkspaceId,
        webhookEndpointId: "whe_foreign",
        mailboxId: foreignMailboxId,
        eventTypes: ["message.updated"],
      },
    ]);

    await database.db.insert(schema.mailboxEvents).values([
      {
        id: "evt_1",
        mailboxId: primaryMailboxId,
        eventType: "message.created",
        occurredAt: new Date("2026-04-22T10:03:00.000Z"),
        payload: {
          id: "evt_1",
          type: "message.created",
          schemaVersion: 1,
          occurredAt: "2026-04-22T10:03:00.000Z",
          workspaceId: primaryWorkspaceId,
          tenantExternalId: "tenant_primary",
          mailboxId: primaryMailboxId,
          data: {
            messageId: "msg_evt_1",
            threadId: "thr_evt_1",
            providerMessageId: "gmail_msg_evt_1",
            providerThreadId: "gmail_thr_evt_1",
            subject: "Event one",
            snippet: "snippet one",
            receivedAt: "2026-04-22T10:03:00.000Z",
            labelIds: ["INBOX"],
          },
        },
      },
      {
        id: "evt_2",
        mailboxId: primaryMailboxId,
        eventType: "thread.updated",
        occurredAt: new Date("2026-04-22T10:03:30.000Z"),
        payload: {
          id: "evt_2",
          type: "thread.updated",
          schemaVersion: 1,
          occurredAt: "2026-04-22T10:03:30.000Z",
          workspaceId: primaryWorkspaceId,
          tenantExternalId: "tenant_primary",
          mailboxId: primaryMailboxId,
          data: {
            threadId: "thr_evt_2",
            providerThreadId: "gmail_thr_evt_2",
            subject: "Event two",
            lastMessageAt: "2026-04-22T10:03:30.000Z",
          },
        },
      },
      {
        id: "evt_3",
        mailboxId: primaryMailboxId,
        eventType: "message.updated",
        occurredAt: new Date("2026-04-22T10:03:45.000Z"),
        payload: {
          id: "evt_3",
          type: "message.updated",
          schemaVersion: 1,
          occurredAt: "2026-04-22T10:03:45.000Z",
          workspaceId: primaryWorkspaceId,
          tenantExternalId: "tenant_primary",
          mailboxId: primaryMailboxId,
          data: {
            messageId: "msg_evt_3",
            threadId: "thr_evt_2",
            providerMessageId: "gmail_msg_evt_3",
            providerThreadId: "gmail_thr_evt_2",
            subject: "Event three",
            snippet: "snippet three",
            receivedAt: "2026-04-22T10:03:45.000Z",
            labelIds: ["INBOX", "IMPORTANT"],
          },
        },
      },
      {
        id: "evt_foreign",
        mailboxId: foreignMailboxId,
        eventType: "message.updated",
        occurredAt: new Date("2026-04-22T10:02:00.000Z"),
        payload: {
          id: "evt_foreign",
          type: "message.updated",
          schemaVersion: 1,
          occurredAt: "2026-04-22T10:02:00.000Z",
          workspaceId: foreignWorkspaceId,
          tenantExternalId: "tenant_foreign",
          mailboxId: foreignMailboxId,
          data: {
            messageId: "msg_foreign_evt",
            threadId: "thr_foreign_evt",
            providerMessageId: "gmail_msg_foreign_evt",
            providerThreadId: "gmail_thr_foreign_evt",
            subject: "Foreign event",
            snippet: "foreign snippet",
            receivedAt: "2026-04-22T10:02:00.000Z",
            labelIds: ["INBOX"],
          },
        },
      },
      {
        id: "evt_shared_1",
        mailboxId: secondaryPrimaryMailboxId,
        eventType: "message.updated",
        occurredAt: new Date("2026-04-22T10:04:15.000Z"),
        payload: {
          id: "evt_shared_1",
          type: "message.updated",
          schemaVersion: 1,
          occurredAt: "2026-04-22T10:04:15.000Z",
          workspaceId: primaryWorkspaceId,
          tenantExternalId: "tenant_primary_secondary",
          mailboxId: secondaryPrimaryMailboxId,
          data: {
            messageId: "msg_shared_evt",
            threadId: "thr_shared_evt",
            providerMessageId: "gmail_msg_shared_evt",
            providerThreadId: "gmail_thr_shared_evt",
            subject: "Shared endpoint event",
            snippet: "shared snippet",
            receivedAt: "2026-04-22T10:04:15.000Z",
            labelIds: ["INBOX"],
          },
        },
      },
    ]);

    await database.db.insert(schema.webhookDeliveries).values([
      {
        id: "wdel_pending",
        mailboxEventId: "evt_1",
        webhookEndpointId: "whe_primary_1",
        state: "pending",
        attemptCount: 1,
        nextAttemptAt: new Date("2026-04-22T10:05:10.000Z"),
      },
      {
        id: "wdel_processing",
        mailboxEventId: "evt_2",
        webhookEndpointId: "whe_primary_1",
        state: "processing",
        attemptCount: 2,
        processingStartedAt: new Date("2026-04-22T10:04:50.000Z"),
      },
      {
        id: "wdel_failed",
        mailboxEventId: "evt_3",
        webhookEndpointId: "whe_primary_1",
        state: "failed",
        attemptCount: 3,
        lastAttemptedAt: new Date("2026-04-22T10:04:00.000Z"),
      },
      {
        id: "wdel_foreign_failed",
        mailboxEventId: "evt_foreign",
        webhookEndpointId: "whe_foreign",
        state: "failed",
        attemptCount: 1,
      },
      {
        id: "wdel_shared_failed",
        mailboxEventId: "evt_shared_1",
        webhookEndpointId: "whe_primary_1",
        state: "failed",
        attemptCount: 1,
        lastAttemptedAt: new Date("2026-04-22T10:04:30.000Z"),
      },
    ]);
  } finally {
    await database.client.end();
  }
};

const listReadIndexes = async (connectionString: string) => {
  const client = postgres(connectionString, { max: 1 });

  try {
    return await client<{ indexdef: string; indexname: string }[]>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('messages', 'threads')
      ORDER BY indexname
    `;
  } finally {
    await client.end();
  }
};

describe("DB-backed mailbox read hardening", () => {
  it.effect("creates mailbox newest-first indexes in the migrated schema", () =>
    withIsolatedDatabaseEffect(({ connectionString }) =>
      Effect.gen(function* () {
        const indexes = yield* Effect.promise(() => listReadIndexes(connectionString));
        const messageIndex = indexes.find(
          (index) => index.indexname === "messages_mailbox_received_at_id_idx",
        );
        const threadIndex = indexes.find(
          (index) => index.indexname === "threads_mailbox_last_message_at_id_idx",
        );

        expect(messageIndex?.indexdef).toContain(
          "(mailbox_id, received_at DESC NULLS LAST, id DESC NULLS LAST)",
        );
        expect(threadIndex?.indexdef).toContain(
          "(mailbox_id, last_message_at DESC NULLS LAST, id DESC NULLS LAST)",
        );
      }),
    ),
  );

  it.effect("paginates mailbox messages newest-first with opaque cursors", () =>
    withIsolatedDatabaseEffect(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      );

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedReadModelFixtures(connectionString));

        const firstPage = yield* listMailboxMessages(primaryMailboxId, {
          limit: 2,
          workspaceId: primaryWorkspaceId,
        });
        const firstCursor = firstPage.nextCursor;

        expect(firstPage.data.map((message) => message.id)).toEqual(["msg_400", "msg_300"]);
        expect(firstCursor).toMatch(/^cur_/);
        expect(firstCursor).not.toBe("msg_300");

        if (firstCursor === null) {
          throw new Error("Expected a second page cursor for mailbox messages.");
        }

        const secondPage = yield* listMailboxMessages(primaryMailboxId, {
          cursor: firstCursor,
          limit: 2,
          workspaceId: primaryWorkspaceId,
        });

        expect(secondPage.data.map((message) => message.id)).toEqual(["msg_250", "msg_100"]);
        expect(secondPage.nextCursor).toBeNull();
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );

  it.effect("lists every active mailbox matching a Gmail Push Notification address", () =>
    withIsolatedDatabaseEffect(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      );

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedReadModelFixtures(connectionString));

        const pushNotificationStore = yield* MailboxPushNotificationStore;
        const mailboxes = yield* pushNotificationStore.listMailboxesForGmailPushNotification({
          emailAddress: " Primary@Mailmon.Dev ",
          historyId: "hist_push_123",
          messageId: "pubsub_msg_123",
          subscription: "projects/mailmon-staging/subscriptions/gmail-push-worker",
        });

        expect(mailboxes.map((mailbox) => mailbox.id)).toEqual([
          foreignMailboxId,
          primaryMailboxId,
        ]);
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );

  it.effect("paginates mailbox threads newest-first with opaque cursors", () =>
    withIsolatedDatabaseEffect(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      );

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedReadModelFixtures(connectionString));

        const firstPage = yield* listMailboxThreads(primaryMailboxId, {
          limit: 2,
          workspaceId: primaryWorkspaceId,
        });
        const firstCursor = firstPage.nextCursor;

        expect(firstPage.data.map((thread) => thread.id)).toEqual(["thr_400", "thr_300"]);
        expect(firstCursor).toMatch(/^cur_/);
        expect(firstCursor).not.toBe("thr_300");

        if (firstCursor === null) {
          throw new Error("Expected a second page cursor for mailbox threads.");
        }

        const secondPage = yield* listMailboxThreads(primaryMailboxId, {
          cursor: firstCursor,
          limit: 2,
          workspaceId: primaryWorkspaceId,
        });

        expect(secondPage.data.map((thread) => thread.id)).toEqual(["thr_250", "thr_100"]);
        expect(secondPage.nextCursor).toBeNull();
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );

  it.effect("enforces workspace ownership for mailbox message reads", () =>
    withIsolatedDatabaseEffect(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      );

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedReadModelFixtures(connectionString));

        const message = yield* getMessageOrFail("msg_400", {
          workspaceId: primaryWorkspaceId,
        });
        const listProblem = yield* listMailboxMessages(primaryMailboxId, {
          limit: 10,
          workspaceId: foreignWorkspaceId,
        }).pipe(Effect.flip);
        const messageProblem = yield* getMessageOrFail("msg_400", {
          workspaceId: foreignWorkspaceId,
        }).pipe(Effect.flip);

        expect(message.id).toBe("msg_400");
        expect(listProblem.code).toBe("mailbox_not_found");
        expect(messageProblem.code).toBe("message_not_found");
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );

  it.effect("enforces workspace ownership for mailbox thread reads", () =>
    withIsolatedDatabaseEffect(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      );

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedReadModelFixtures(connectionString));

        const thread = yield* getThreadOrFail("thr_400", {
          workspaceId: primaryWorkspaceId,
        });
        const listProblem = yield* listMailboxThreads(primaryMailboxId, {
          limit: 10,
          workspaceId: foreignWorkspaceId,
        }).pipe(Effect.flip);
        const threadProblem = yield* getThreadOrFail("thr_400", {
          workspaceId: foreignWorkspaceId,
        }).pipe(Effect.flip);

        expect(thread.messages).toEqual([
          {
            id: "msg_400",
            receivedAt: "2026-04-04T10:00:00.000Z",
            subject: "Primary newest message",
          },
        ]);
        expect(listProblem.code).toBe("mailbox_not_found");
        expect(threadProblem.code).toBe("thread_not_found");
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );

  it.effect("lists mailbox sync runs newest-first with opaque cursors", () =>
    withIsolatedDatabaseEffect(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      );

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedObservabilityFixtures(connectionString));

        const firstPage = yield* listMailboxSyncRuns(primaryMailboxId, {
          limit: 2,
          workspaceId: primaryWorkspaceId,
        });
        const firstCursor = firstPage.nextCursor;

        expect(firstPage.data.map((run) => run.syncRunId)).toEqual([
          "sr_newest",
          "sr_contention_recent",
        ]);
        expect(firstPage.data[0]?.previousCursor).toBe("hist_200");
        expect(firstPage.data[0]?.cursorAdvanced).toBe(true);
        expect(firstCursor).toMatch(/^cur_/);

        if (firstCursor === null) {
          throw new Error("Expected a second page cursor for mailbox sync runs.");
        }

        const secondPage = yield* listMailboxSyncRuns(primaryMailboxId, {
          cursor: firstCursor,
          limit: 2,
          workspaceId: primaryWorkspaceId,
        });

        expect(secondPage.data.map((run) => run.syncRunId)).toEqual([
          "sr_lease_lost_recent",
          "sr_old_contention",
        ]);
        expect(secondPage.nextCursor).toBeNull();
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );

  it.effect(
    "returns mailbox observability snapshot with lag, cursor, lease, and delivery signals",
    () =>
      withIsolatedDatabaseEffect(({ connectionString }) => {
        const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
          Layer.provide(testGmailRefreshTokenCipherLayer),
        );

        return Effect.gen(function* () {
          yield* Effect.promise(() => seedObservabilityFixtures(connectionString));

          const snapshot = yield* getMailboxObservability(primaryMailboxId, {
            workspaceId: primaryWorkspaceId,
            observedAt: "2026-04-22T10:05:00.000Z",
          });

          expect(snapshot.object).toBe("mailbox_observability");
          expect(snapshot.mailboxId).toBe(primaryMailboxId);
          expect(snapshot.generatedAt).toBe("2026-04-22T10:05:00.000Z");

          expect(snapshot.lag).toEqual({
            status: "active",
            syncState: "lagging",
            watchState: "expiring",
            lastSuccessfulSyncAt: "2026-04-22T09:59:00.000Z",
            lagSeconds: 360,
          });

          expect(snapshot.cursor).toEqual({
            currentCursor: "hist_205",
            previousCursor: "hist_200",
            nextCursor: "hist_205",
            advanced: true,
            advancedAt: "2026-04-22T10:00:10.000Z",
          });

          expect(snapshot.lease).toEqual({
            activeLeaseOwner: "lease_active",
            activeLeaseHeartbeatAt: "2026-04-22T10:04:40.000Z",
            activeLeaseExpiresAt: "2026-04-22T10:05:30.000Z",
            contentionCount24h: 1,
            latestContentionAt: "2026-04-22T09:50:02.000Z",
            leaseLossCount24h: 1,
            latestLeaseLossAt: "2026-04-22T09:40:20.000Z",
          });

          expect(snapshot.webhookDeliveries).toEqual([
            {
              webhookEndpointId: "whe_primary_1",
              webhookEndpointUrl: "https://app.example.com/webhooks/mailmon",
              deliveryState: "degraded",
              consecutiveFailures: 2,
              pendingDeliveries: 1,
              processingDeliveries: 1,
              failedDeliveries: 2,
              lastDeliveryAt: "2026-04-22T10:04:00.000Z",
              lastDeliveryError: {
                code: "webhook_delivery_timeout",
                message: "Webhook delivery timed out before the endpoint responded.",
                occurredAt: "2026-04-22T10:04:00.000Z",
                retryable: true,
              },
            },
            {
              webhookEndpointId: "whe_primary_2",
              webhookEndpointUrl: "https://app.example.com/webhooks/secondary",
              deliveryState: "healthy",
              consecutiveFailures: 0,
              pendingDeliveries: 0,
              processingDeliveries: 0,
              failedDeliveries: 0,
              lastDeliveryAt: null,
              lastDeliveryError: null,
            },
          ]);

          expect(snapshot.latestSyncRun).toMatchObject({
            syncRunId: "sr_newest",
            mailboxId: primaryMailboxId,
            status: "completed",
            previousCursor: "hist_200",
            nextCursor: "hist_205",
            cursorAdvanced: true,
          });
        }).pipe(Effect.provide(persistenceLayer));
      }),
  );

  it.effect(
    "keeps shared endpoint counts consistent and omits advancedAt when the latest sync did not move the cursor",
    () =>
      withIsolatedDatabaseEffect(({ connectionString }) => {
        const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
          Layer.provide(testGmailRefreshTokenCipherLayer),
        );

        return Effect.gen(function* () {
          yield* Effect.promise(() => seedObservabilityFixtures(connectionString));

          const snapshot = yield* getMailboxObservability(secondaryPrimaryMailboxId, {
            workspaceId: primaryWorkspaceId,
            observedAt: "2026-04-22T10:05:00.000Z",
          });

          expect(snapshot.cursor).toEqual({
            currentCursor: "hist_secondary_10",
            previousCursor: "hist_secondary_10",
            nextCursor: "hist_secondary_10",
            advanced: false,
            advancedAt: null,
          });

          expect(snapshot.lease).toEqual({
            activeLeaseOwner: null,
            activeLeaseHeartbeatAt: null,
            activeLeaseExpiresAt: null,
            contentionCount24h: 1,
            latestContentionAt: "2026-04-21T10:05:01.000Z",
            leaseLossCount24h: 0,
            latestLeaseLossAt: null,
          });

          expect(snapshot.webhookDeliveries).toEqual([
            {
              webhookEndpointId: "whe_primary_1",
              webhookEndpointUrl: "https://app.example.com/webhooks/mailmon",
              deliveryState: "degraded",
              consecutiveFailures: 2,
              pendingDeliveries: 1,
              processingDeliveries: 1,
              failedDeliveries: 2,
              lastDeliveryAt: "2026-04-22T10:04:00.000Z",
              lastDeliveryError: {
                code: "webhook_delivery_timeout",
                message: "Webhook delivery timed out before the endpoint responded.",
                occurredAt: "2026-04-22T10:04:00.000Z",
                retryable: true,
              },
            },
          ]);

          expect(snapshot.latestSyncRun).toMatchObject({
            syncRunId: "sr_secondary_stable",
            mailboxId: secondaryPrimaryMailboxId,
            status: "completed",
            previousCursor: "hist_secondary_10",
            nextCursor: "hist_secondary_10",
            cursorAdvanced: false,
          });
        }).pipe(Effect.provide(persistenceLayer));
      }),
  );

  it.effect("enforces workspace ownership for mailbox observability reads", () =>
    withIsolatedDatabaseEffect(({ connectionString }) => {
      const persistenceLayer = createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      );

      return Effect.gen(function* () {
        yield* Effect.promise(() => seedObservabilityFixtures(connectionString));

        const listProblem = yield* listMailboxSyncRuns(primaryMailboxId, {
          limit: 10,
          workspaceId: foreignWorkspaceId,
        }).pipe(Effect.flip);

        const snapshotProblem = yield* getMailboxObservability(primaryMailboxId, {
          workspaceId: foreignWorkspaceId,
          observedAt: "2026-04-22T10:05:00.000Z",
        }).pipe(Effect.flip);

        expect(listProblem.code).toBe("mailbox_not_found");
        expect(snapshotProblem.code).toBe("mailbox_not_found");
      }).pipe(Effect.provide(persistenceLayer));
    }),
  );
});
