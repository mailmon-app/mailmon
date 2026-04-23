import { describe, expect, it } from "@effect/vitest";
import {
  MailboxStateStore,
  type MailboxEventEnvelope,
  type MailboxSyncSnapshot,
} from "@mailmon/core";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { asc, eq } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";
import { withIsolatedDatabaseEffect } from "./test-setup.js";

const workspaceId = "ws_events";
const mailboxId = "mbx_events";
const tenantExternalId = "tenant_events";
const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});

const baselineSnapshot: MailboxSyncSnapshot = {
  deletedProviderMessageIds: [],
  threads: [
    {
      id: "thr_demo",
      providerThreadId: "gmail_thr_demo",
      subject: "Welcome to Mailmon",
      lastMessageAt: "2026-04-09T09:30:00.000Z",
    },
  ],
  messages: [
    {
      id: "msg_demo",
      threadId: "thr_demo",
      providerMessageId: "gmail_msg_demo",
      providerThreadId: "gmail_thr_demo",
      subject: "Welcome to Mailmon",
      from: {
        name: "Mailmon",
        email: "hello@mailmon.dev",
      },
      snippet: "Your mailbox baseline sync is now durable.",
      receivedAt: "2026-04-09T09:30:00.000Z",
      labelIds: ["INBOX"],
    },
  ],
};

const updatedMessageSnapshot: MailboxSyncSnapshot = {
  deletedProviderMessageIds: [],
  threads: [
    {
      id: "thr_demo",
      providerThreadId: "gmail_thr_demo",
      subject: "Welcome to Mailmon",
      lastMessageAt: "2026-04-09T09:30:00.000Z",
    },
  ],
  messages: [
    {
      id: "msg_demo",
      threadId: "thr_demo",
      providerMessageId: "gmail_msg_demo",
      providerThreadId: "gmail_thr_demo",
      subject: "Welcome to Mailmon",
      from: {
        name: "Mailmon",
        email: "hello@mailmon.dev",
      },
      snippet: "Your mailbox baseline sync is now durable.",
      receivedAt: "2026-04-09T09:30:00.000Z",
      labelIds: ["UNREAD", "INBOX"],
    },
  ],
};

const deletionRegressionBaselineSnapshot: MailboxSyncSnapshot = {
  deletedProviderMessageIds: [],
  threads: [
    {
      id: "thr_regression",
      providerThreadId: "gmail_thr_regression",
      subject: "Latest message",
      lastMessageAt: "2026-04-09T10:00:00.000Z",
    },
  ],
  messages: [
    {
      id: "msg_regression_old",
      threadId: "thr_regression",
      providerMessageId: "gmail_msg_regression_old",
      providerThreadId: "gmail_thr_regression",
      subject: "Earlier message",
      from: {
        name: "Mailmon",
        email: "hello@mailmon.dev",
      },
      snippet: "Earlier message in the thread.",
      receivedAt: "2026-04-09T09:00:00.000Z",
      labelIds: ["INBOX"],
    },
    {
      id: "msg_regression_new",
      threadId: "thr_regression",
      providerMessageId: "gmail_msg_regression_new",
      providerThreadId: "gmail_thr_regression",
      subject: "Latest message",
      from: {
        name: "Mailmon",
        email: "hello@mailmon.dev",
      },
      snippet: "Latest message in the thread.",
      receivedAt: "2026-04-09T10:00:00.000Z",
      labelIds: ["INBOX"],
    },
  ],
};

const deleteOnlySnapshot: MailboxSyncSnapshot = {
  deletedProviderMessageIds: ["gmail_msg_regression_new"],
  threads: [],
  messages: [],
};

const seedMailboxFixture = async (connectionString: string) => {
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
      mailboxExternalId: "mailbox_external_events",
      emailAddress: "events@mailmon.dev",
      status: "active",
      syncState: "healthy",
      watchState: "active",
    });
  } finally {
    await database.client.end();
  }
};

const armMailboxSync = async (
  connectionString: string,
  params: Readonly<{
    syncRunId: string;
    leaseOwnerId: string;
    insertSyncRun?: boolean;
  }>,
) => {
  const database = createDb(connectionString);

  try {
    const heartbeatAt = new Date();
    const expiresAt = new Date(heartbeatAt.getTime() + 5 * 60_000);

    await database.db
      .update(schema.mailboxes)
      .set({
        activeSyncLeaseOwner: params.leaseOwnerId,
        activeSyncLeaseAcquiredAt: heartbeatAt,
        activeSyncLeaseHeartbeatAt: heartbeatAt,
        activeSyncLeaseExpiresAt: expiresAt,
        activeSyncRunId: params.syncRunId,
        updatedAt: heartbeatAt,
      })
      .where(eq(schema.mailboxes.id, mailboxId));

    if (params.insertSyncRun ?? true) {
      await database.db.insert(schema.syncRuns).values({
        id: params.syncRunId,
        mailboxId,
        status: "running",
        leaseOwnerId: params.leaseOwnerId,
        startedAt: heartbeatAt,
      });
    }
  } finally {
    await database.client.end();
  }
};

const applyMailboxSyncResult = (
  connectionString: string,
  params: Readonly<{
    mailboxId: string;
    leaseOwnerId: string;
    nextCursor: string | null;
    snapshot: MailboxSyncSnapshot;
    syncRunId: string;
    syncedAt: string;
  }>,
) => {
  return Effect.gen(function* () {
    const mailboxStateStore = yield* MailboxStateStore;

    return yield* mailboxStateStore.applySyncResult({
      eventsEmitted: params.snapshot.messages.length,
      mailboxId: params.mailboxId,
      leaseOwnerId: params.leaseOwnerId,
      nextCursor: params.nextCursor,
      snapshot: params.snapshot,
      syncRunId: params.syncRunId,
      syncedAt: params.syncedAt,
    });
  }).pipe(
    Effect.provide(
      createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      ),
    ),
  );
};

const fetchMailboxEvents = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    return await database.db
      .select()
      .from(schema.mailboxEvents)
      .orderBy(asc(schema.mailboxEvents.occurredAt), asc(schema.mailboxEvents.id));
  } finally {
    await database.client.end();
  }
};

const fetchMailboxRow = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    const [row] = await database.db
      .select()
      .from(schema.mailboxes)
      .where(eq(schema.mailboxes.id, mailboxId))
      .limit(1);

    return row;
  } finally {
    await database.client.end();
  }
};

const fetchSyncRunRow = async (connectionString: string, syncRunId: string) => {
  const database = createDb(connectionString);

  try {
    const [row] = await database.db
      .select()
      .from(schema.syncRuns)
      .where(eq(schema.syncRuns.id, syncRunId))
      .limit(1);

    return row;
  } finally {
    await database.client.end();
  }
};

const fetchCanonicalStateCounts = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    const storedMessages = await database.db.select().from(schema.messages);
    const storedThreads = await database.db.select().from(schema.threads);

    return {
      messages: storedMessages.length,
      threads: storedThreads.length,
    };
  } finally {
    await database.client.end();
  }
};

const findMailboxEvent = (
  events: ReadonlyArray<typeof schema.mailboxEvents.$inferSelect>,
  id: string,
) => {
  const event = events.find((candidate) => candidate.id === id);

  if (event === undefined) {
    throw new Error(`Expected mailbox event ${id} to exist.`);
  }

  return event;
};

const expectMailboxEventPayload = (
  payload: MailboxEventEnvelope,
  expected: Readonly<{
    id: string;
    type: MailboxEventEnvelope["type"];
    occurredAt: string;
    data: MailboxEventEnvelope["data"];
  }>,
) => {
  expect(payload).toEqual({
    id: expected.id,
    type: expected.type,
    schemaVersion: 1,
    occurredAt: expected.occurredAt,
    workspaceId,
    tenantExternalId,
    mailboxId,
    data: expected.data,
  });
};

describe("DB-backed durable mailbox event emission", () => {
  it.effect(
    "emits baseline created and updated events in the sync finalization transaction",
    () =>
      withIsolatedDatabaseEffect(({ connectionString }) => {
        const syncedAt = "2026-04-09T09:30:05.000Z";
        const syncRunId = "sr_initial";
        const leaseOwnerId = "lease_initial";

        return Effect.gen(function* () {
          yield* Effect.promise(() => seedMailboxFixture(connectionString));
          yield* Effect.promise(() =>
            armMailboxSync(connectionString, { syncRunId, leaseOwnerId }),
          );

          const commitResult = yield* applyMailboxSyncResult(connectionString, {
            mailboxId,
            leaseOwnerId,
            nextCursor: "hist_1",
            snapshot: baselineSnapshot,
            syncRunId,
            syncedAt,
          });
          const storedEvents = yield* Effect.promise(() => fetchMailboxEvents(connectionString));
          const mailbox = yield* Effect.promise(() => fetchMailboxRow(connectionString));
          const syncRun = yield* Effect.promise(() => fetchSyncRunRow(connectionString, syncRunId));

          expect(commitResult).toEqual({
            applied: true,
            mailboxEventIds: expect.arrayContaining([expect.stringMatching(/^evt_/)]),
          });
          expect(commitResult.mailboxEventIds).toHaveLength(2);
          expect(storedEvents).toHaveLength(2);
          expect(new Set(storedEvents.map((event) => event.id))).toEqual(
            new Set(commitResult.mailboxEventIds),
          );
          const storedEventTypes = storedEvents.map((event) => event.eventType);
          // oxlint-disable-next-line unicorn/no-array-sort
          storedEventTypes.sort((left, right) => left.localeCompare(right));
          expect(storedEventTypes).toEqual(["message.created", "thread.updated"]);

          const messageCreatedId = commitResult.mailboxEventIds.find((eventId) => {
            return findMailboxEvent(storedEvents, eventId).eventType === "message.created";
          });
          const threadUpdatedId = commitResult.mailboxEventIds.find((eventId) => {
            return findMailboxEvent(storedEvents, eventId).eventType === "thread.updated";
          });

          if (messageCreatedId === undefined || threadUpdatedId === undefined) {
            throw new Error("Expected both baseline mailbox event IDs to be returned.");
          }

          expectMailboxEventPayload(findMailboxEvent(storedEvents, messageCreatedId).payload, {
            id: messageCreatedId,
            type: "message.created",
            occurredAt: syncedAt,
            data: {
              messageId: "msg_demo",
              threadId: "thr_demo",
              providerMessageId: "gmail_msg_demo",
              providerThreadId: "gmail_thr_demo",
              subject: "Welcome to Mailmon",
              snippet: "Your mailbox baseline sync is now durable.",
              receivedAt: "2026-04-09T09:30:00.000Z",
              labelIds: ["INBOX"],
            },
          });
          expectMailboxEventPayload(findMailboxEvent(storedEvents, threadUpdatedId).payload, {
            id: threadUpdatedId,
            type: "thread.updated",
            occurredAt: syncedAt,
            data: {
              threadId: "thr_demo",
              providerThreadId: "gmail_thr_demo",
              subject: "Welcome to Mailmon",
              lastMessageAt: "2026-04-09T09:30:00.000Z",
            },
          });

          expect(mailbox?.cursor).toBe("hist_1");
          expect(mailbox?.initializedAt?.toISOString()).toBe(syncedAt);
          expect(mailbox?.lastSuccessfulSyncAt?.toISOString()).toBe(syncedAt);
          expect(mailbox?.activeSyncLeaseOwner).toBeNull();
          expect(mailbox?.activeSyncRunId).toBeNull();
          expect(syncRun).toEqual(
            expect.objectContaining({
              id: syncRunId,
              status: "completed",
              eventsEmitted: "2",
              nextCursor: "hist_1",
              detail: null,
            }),
          );
        });
      }),
    15_000,
  );

  it.effect(
    "emits only real canonical changes during incremental sync finalization",
    () =>
      withIsolatedDatabaseEffect(({ connectionString }) => {
        const initialSyncRunId = "sr_initial";
        const incrementalSyncRunId = "sr_incremental";

        return Effect.gen(function* () {
          yield* Effect.promise(() => seedMailboxFixture(connectionString));
          yield* Effect.promise(() =>
            armMailboxSync(connectionString, {
              syncRunId: initialSyncRunId,
              leaseOwnerId: "lease_initial",
            }),
          );
          yield* applyMailboxSyncResult(connectionString, {
            mailboxId,
            leaseOwnerId: "lease_initial",
            nextCursor: "hist_1",
            snapshot: baselineSnapshot,
            syncRunId: initialSyncRunId,
            syncedAt: "2026-04-09T09:30:05.000Z",
          });
          yield* Effect.promise(() =>
            armMailboxSync(connectionString, {
              syncRunId: incrementalSyncRunId,
              leaseOwnerId: "lease_incremental",
            }),
          );

          const commitResult = yield* applyMailboxSyncResult(connectionString, {
            mailboxId,
            leaseOwnerId: "lease_incremental",
            nextCursor: "hist_2",
            snapshot: updatedMessageSnapshot,
            syncRunId: incrementalSyncRunId,
            syncedAt: "2026-04-09T09:31:00.000Z",
          });
          const storedEvents = yield* Effect.promise(() => fetchMailboxEvents(connectionString));
          const [incrementalEventId] = commitResult.mailboxEventIds;

          if (incrementalEventId === undefined) {
            throw new Error("Expected the incremental sync to emit a mailbox event.");
          }

          const incrementalEvent = findMailboxEvent(storedEvents, incrementalEventId);

          expect(commitResult).toEqual({
            applied: true,
            mailboxEventIds: [expect.stringMatching(/^evt_/)],
          });
          expect(incrementalEvent.eventType).toBe("message.updated");
          expectMailboxEventPayload(incrementalEvent.payload, {
            id: incrementalEvent.id,
            type: "message.updated",
            occurredAt: "2026-04-09T09:31:00.000Z",
            data: {
              messageId: "msg_demo",
              threadId: "thr_demo",
              providerMessageId: "gmail_msg_demo",
              providerThreadId: "gmail_thr_demo",
              subject: "Welcome to Mailmon",
              snippet: "Your mailbox baseline sync is now durable.",
              receivedAt: "2026-04-09T09:30:00.000Z",
              labelIds: ["INBOX", "UNREAD"],
            },
          });
          const storedEventTypes = storedEvents.map((event) => event.eventType);
          // oxlint-disable-next-line unicorn/no-array-sort
          storedEventTypes.sort((left, right) => left.localeCompare(right));
          expect(storedEventTypes).toEqual([
            "message.created",
            "message.updated",
            "thread.updated",
          ]);
        });
      }),
    15_000,
  );

  it.effect(
    "does not create duplicate mailbox events for duplicate wake-ups",
    () =>
      withIsolatedDatabaseEffect(({ connectionString }) => {
        return Effect.gen(function* () {
          yield* Effect.promise(() => seedMailboxFixture(connectionString));
          yield* Effect.promise(() =>
            armMailboxSync(connectionString, {
              syncRunId: "sr_initial",
              leaseOwnerId: "lease_initial",
            }),
          );
          yield* applyMailboxSyncResult(connectionString, {
            mailboxId,
            leaseOwnerId: "lease_initial",
            nextCursor: "hist_1",
            snapshot: baselineSnapshot,
            syncRunId: "sr_initial",
            syncedAt: "2026-04-09T09:30:05.000Z",
          });
          yield* Effect.promise(() =>
            armMailboxSync(connectionString, {
              syncRunId: "sr_incremental",
              leaseOwnerId: "lease_incremental",
            }),
          );
          yield* applyMailboxSyncResult(connectionString, {
            mailboxId,
            leaseOwnerId: "lease_incremental",
            nextCursor: "hist_2",
            snapshot: updatedMessageSnapshot,
            syncRunId: "sr_incremental",
            syncedAt: "2026-04-09T09:31:00.000Z",
          });
          const eventIdsBeforeDuplicate = new Set(
            (yield* Effect.promise(() => fetchMailboxEvents(connectionString))).map(
              (event) => event.id,
            ),
          );

          yield* Effect.promise(() =>
            armMailboxSync(connectionString, {
              syncRunId: "sr_duplicate",
              leaseOwnerId: "lease_duplicate",
            }),
          );

          const duplicateCommit = yield* applyMailboxSyncResult(connectionString, {
            mailboxId,
            leaseOwnerId: "lease_duplicate",
            nextCursor: "hist_2",
            snapshot: updatedMessageSnapshot,
            syncRunId: "sr_duplicate",
            syncedAt: "2026-04-09T09:31:30.000Z",
          });
          const storedEvents = yield* Effect.promise(() => fetchMailboxEvents(connectionString));

          expect(duplicateCommit).toEqual({
            applied: true,
            mailboxEventIds: [],
          });
          expect(new Set(storedEvents.map((event) => event.id))).toEqual(eventIdsBeforeDuplicate);
          expect(storedEvents).toHaveLength(eventIdsBeforeDuplicate.size);
        });
      }),
    15_000,
  );

  it.effect(
    "recomputes a surviving thread when a delete-only sync removes its latest message",
    () =>
      withIsolatedDatabaseEffect(({ connectionString }) => {
        return Effect.gen(function* () {
          yield* Effect.promise(() => seedMailboxFixture(connectionString));
          yield* Effect.promise(() =>
            armMailboxSync(connectionString, {
              syncRunId: "sr_regression_initial",
              leaseOwnerId: "lease_regression_initial",
            }),
          );
          yield* applyMailboxSyncResult(connectionString, {
            mailboxId,
            leaseOwnerId: "lease_regression_initial",
            nextCursor: "hist_regression_1",
            snapshot: deletionRegressionBaselineSnapshot,
            syncRunId: "sr_regression_initial",
            syncedAt: "2026-04-09T10:00:05.000Z",
          });
          yield* Effect.promise(() =>
            armMailboxSync(connectionString, {
              syncRunId: "sr_regression_delete",
              leaseOwnerId: "lease_regression_delete",
            }),
          );

          const commitResult = yield* applyMailboxSyncResult(connectionString, {
            mailboxId,
            leaseOwnerId: "lease_regression_delete",
            nextCursor: "hist_regression_2",
            snapshot: deleteOnlySnapshot,
            syncRunId: "sr_regression_delete",
            syncedAt: "2026-04-09T10:01:00.000Z",
          });
          const storedEvents = yield* Effect.promise(() => fetchMailboxEvents(connectionString));
          const database = createDb(connectionString);

          const [threadRow, remainingMessages, deletedMessage] = yield* Effect.promise(async () => {
            try {
              const [thread] = await database.db
                .select()
                .from(schema.threads)
                .where(eq(schema.threads.id, "thr_regression"))
                .limit(1);
              const messages = await database.db
                .select()
                .from(schema.messages)
                .where(eq(schema.messages.threadId, "thr_regression"))
                .orderBy(asc(schema.messages.receivedAt), asc(schema.messages.id));
              const [deleted] = await database.db
                .select()
                .from(schema.messages)
                .where(eq(schema.messages.providerMessageId, "gmail_msg_regression_new"))
                .limit(1);

              return [thread, messages, deleted] as const;
            } finally {
              await database.client.end();
            }
          });
          const [threadEventId] = commitResult.mailboxEventIds;

          if (threadEventId === undefined) {
            throw new Error("Expected the delete-only sync to emit a thread.updated event.");
          }

          expect(commitResult).toEqual({
            applied: true,
            mailboxEventIds: [expect.stringMatching(/^evt_/)],
          });
          expect(findMailboxEvent(storedEvents, threadEventId).eventType).toBe("thread.updated");
          expectMailboxEventPayload(findMailboxEvent(storedEvents, threadEventId).payload, {
            id: threadEventId,
            type: "thread.updated",
            occurredAt: "2026-04-09T10:01:00.000Z",
            data: {
              threadId: "thr_regression",
              providerThreadId: "gmail_thr_regression",
              subject: "Earlier message",
              lastMessageAt: "2026-04-09T09:00:00.000Z",
            },
          });
          expect(threadRow?.subject).toBe("Earlier message");
          expect(threadRow?.lastMessageAt.toISOString()).toBe("2026-04-09T09:00:00.000Z");
          expect(remainingMessages.map((message) => message.providerMessageId)).toEqual([
            "gmail_msg_regression_old",
          ]);
          expect(deletedMessage).toBeUndefined();
        });
      }),
    15_000,
  );

  it.effect(
    "rolls back mailbox events when sync finalization cannot complete",
    () =>
      withIsolatedDatabaseEffect(({ connectionString }) => {
        return Effect.gen(function* () {
          yield* Effect.promise(() => seedMailboxFixture(connectionString));
          yield* Effect.promise(() =>
            armMailboxSync(connectionString, {
              syncRunId: "sr_missing",
              leaseOwnerId: "lease_missing",
              insertSyncRun: false,
            }),
          );

          const exit = yield* applyMailboxSyncResult(connectionString, {
            mailboxId,
            leaseOwnerId: "lease_missing",
            nextCursor: "hist_1",
            snapshot: baselineSnapshot,
            syncRunId: "sr_missing",
            syncedAt: "2026-04-09T09:30:05.000Z",
          }).pipe(Effect.exit);
          const mailbox = yield* Effect.promise(() => fetchMailboxRow(connectionString));
          const storedEvents = yield* Effect.promise(() => fetchMailboxEvents(connectionString));
          const canonicalStateCounts = yield* Effect.promise(() =>
            fetchCanonicalStateCounts(connectionString),
          );

          expect(exit._tag).toBe("Failure");
          expect(storedEvents).toEqual([]);
          expect(canonicalStateCounts).toEqual({
            messages: 0,
            threads: 0,
          });
          expect(mailbox?.activeSyncLeaseOwner).toBe("lease_missing");
          expect(mailbox?.cursor).toBeNull();
          expect(mailbox?.lastSuccessfulSyncAt).toBeNull();
        });
      }),
    15_000,
  );
});
