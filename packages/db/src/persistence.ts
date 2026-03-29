import {
  MailboxCatalog,
  MailboxSyncCoordinator,
  MailboxStateStore,
  SyncRunStore,
  type CanonicalMessageRecord,
  type CanonicalThreadRecord,
  type CompletedSyncRun,
  type MailboxOperationalError,
  type MailboxResource,
  type MailboxSyncLeaseAcquisition,
  type MailboxSyncLeaseRenewal,
  type StartedSyncRun,
} from "@mailmon/core";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";

import { createDb } from "./client.js";
import { mailboxes, messages, syncRuns, threads } from "./schema.js";

type DatabaseHandle = ReturnType<typeof createDb>;
type MailboxRow = typeof mailboxes.$inferSelect;

const toMailboxProvider = (provider: string): MailboxResource["provider"] => {
  switch (provider) {
    case "gmail":
      return provider;
    default:
      throw new Error(`Unsupported mailbox provider: ${provider}`);
  }
};

const toMailboxStatus = (status: string): MailboxResource["status"] => {
  switch (status) {
    case "active":
    case "disabled":
    case "reconnect_required":
      return status;
    default:
      throw new Error(`Unsupported mailbox status: ${status}`);
  }
};

const toMailboxSyncState = (syncState: string): MailboxResource["syncState"] => {
  switch (syncState) {
    case "failed":
    case "healthy":
    case "initializing":
    case "lagging":
      return syncState;
    default:
      throw new Error(`Unsupported mailbox sync state: ${syncState}`);
  }
};

const toMailboxWatchState = (watchState: string): MailboxResource["watchState"] => {
  switch (watchState) {
    case "active":
    case "expired":
    case "expiring":
    case "unhealthy":
      return watchState;
    default:
      throw new Error(`Unsupported mailbox watch state: ${watchState}`);
  }
};

const toDate = (value: string) => {
  return new Date(value);
};

const toIsoString = (value: Date | null) => {
  return value === null ? null : value.toISOString();
};

const toMailboxOperationalError = (row: MailboxRow): MailboxOperationalError | null => {
  if (
    row.lastErrorCode === null ||
    row.lastErrorMessage === null ||
    row.lastErrorOccurredAt === null ||
    row.lastErrorRetryable === null
  ) {
    return null;
  }

  return {
    code: row.lastErrorCode,
    message: row.lastErrorMessage,
    occurredAt: row.lastErrorOccurredAt.toISOString(),
    retryable: row.lastErrorRetryable,
  };
};

const toMailboxResource = (row: MailboxRow): MailboxResource => {
  return {
    id: row.id,
    object: "mailbox",
    provider: toMailboxProvider(row.provider),
    emailAddress: row.emailAddress,
    status: toMailboxStatus(row.status),
    syncState: toMailboxSyncState(row.syncState),
    watchState: toMailboxWatchState(row.watchState),
    initializedAt: toIsoString(row.initializedAt),
    lastSuccessfulSyncAt: toIsoString(row.lastSuccessfulSyncAt),
    lastError: toMailboxOperationalError(row),
  };
};

const createStartedSyncRun = (mailboxId: string): StartedSyncRun => {
  return {
    syncRunId: `sr_${globalThis.crypto.randomUUID()}`,
    mailboxId,
    startedAt: new Date().toISOString(),
  };
};

const toThreadInsert = (mailboxId: string, thread: CanonicalThreadRecord) => {
  const timestamp = new Date();

  return {
    id: thread.id,
    mailboxId,
    providerThreadId: thread.providerThreadId,
    subject: thread.subject,
    lastMessageAt: toDate(thread.lastMessageAt),
    updatedAt: timestamp,
  };
};

const toThreadUpdateSet = (thread: CanonicalThreadRecord) => {
  return {
    subject: thread.subject,
    lastMessageAt: toDate(thread.lastMessageAt),
    updatedAt: new Date(),
  };
};

const toMessageInsert = (mailboxId: string, message: CanonicalMessageRecord) => {
  const timestamp = new Date();

  return {
    id: message.id,
    mailboxId,
    threadId: message.threadId,
    providerMessageId: message.providerMessageId,
    providerThreadId: message.providerThreadId,
    subject: message.subject,
    fromName: message.from.name,
    fromEmail: message.from.email,
    snippet: message.snippet,
    receivedAt: toDate(message.receivedAt),
    labelIds: [...message.labelIds],
    updatedAt: timestamp,
  };
};

const toMessageUpdateSet = (message: CanonicalMessageRecord) => {
  return {
    threadId: message.threadId,
    providerThreadId: message.providerThreadId,
    subject: message.subject,
    fromName: message.from.name,
    fromEmail: message.from.email,
    snippet: message.snippet,
    receivedAt: toDate(message.receivedAt),
    labelIds: [...message.labelIds],
    updatedAt: new Date(),
  };
};

const getMailboxSyncFailureState = (
  result: CompletedSyncRun,
): Pick<
  MailboxRow,
  "lastErrorCode" | "lastErrorMessage" | "lastErrorOccurredAt" | "lastErrorRetryable" | "syncState"
> | null => {
  if (result.status === "completed" || result.status === "skipped_due_to_active_lease") {
    return null;
  }

  return {
    lastErrorCode: result.detail ?? result.status,
    lastErrorMessage:
      result.status === "lease_lost"
        ? "Mailbox sync lost the active mailbox lease while processing."
        : "Mailbox sync failed after the mailbox lease was acquired.",
    lastErrorOccurredAt: toDate(result.completedAt),
    lastErrorRetryable: true,
    syncState: "failed",
  };
};

export class MailmonDatabase extends Context.Tag("@mailmon/db/MailmonDatabase")<
  MailmonDatabase,
  DatabaseHandle
>() {}

export const createDatabaseLayer = (connectionString: string) =>
  Layer.scoped(
    MailmonDatabase,
    Effect.acquireRelease(
      Effect.sync(() => createDb(connectionString)),
      ({ client }) => Effect.promise(() => client.end()),
    ),
  );

export const createMailboxCatalogLayer = Layer.effect(
  MailboxCatalog,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      getMailbox: (mailboxId: string) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select()
            .from(mailboxes)
            .where(eq(mailboxes.id, mailboxId))
            .limit(1);

          return Option.fromNullable(row).pipe(Option.map(toMailboxResource));
        }),
    };
  }),
);

export const createMailboxStateStoreLayer = Layer.effect(
  MailboxStateStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      getMailboxCursor: (mailboxId: string) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select({
              cursor: mailboxes.cursor,
            })
            .from(mailboxes)
            .where(eq(mailboxes.id, mailboxId))
            .limit(1);

          return row?.cursor ?? null;
        }),
      applySyncResult: ({ mailboxId, nextCursor, snapshot, syncedAt }) =>
        Effect.promise(async () => {
          const syncedAtDate = toDate(syncedAt);

          await database.db.transaction(async (transaction) => {
            for (const thread of snapshot.threads) {
              await transaction
                .insert(threads)
                .values(toThreadInsert(mailboxId, thread))
                .onConflictDoUpdate({
                  target: [threads.mailboxId, threads.providerThreadId],
                  set: toThreadUpdateSet(thread),
                });
            }

            for (const message of snapshot.messages) {
              await transaction
                .insert(messages)
                .values(toMessageInsert(mailboxId, message))
                .onConflictDoUpdate({
                  target: [messages.mailboxId, messages.providerMessageId],
                  set: toMessageUpdateSet(message),
                });
            }

            const [row] = await transaction
              .select({
                initializedAt: mailboxes.initializedAt,
              })
              .from(mailboxes)
              .where(eq(mailboxes.id, mailboxId))
              .limit(1);

            await transaction
              .update(mailboxes)
              .set({
                cursor: nextCursor,
                initializedAt: row?.initializedAt ?? syncedAtDate,
                lastErrorCode: null,
                lastErrorMessage: null,
                lastErrorOccurredAt: null,
                lastErrorRetryable: null,
                lastSuccessfulSyncAt: syncedAtDate,
                syncState: "healthy",
                updatedAt: syncedAtDate,
              })
              .where(eq(mailboxes.id, mailboxId));
          });
        }),
    };
  }),
);

export const createSyncRunStoreLayer = Layer.effect(
  SyncRunStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      startSyncRun: (mailboxId: string) =>
        Effect.promise(async () => {
          const startedSyncRun = createStartedSyncRun(mailboxId);

          await database.db.insert(syncRuns).values({
            id: startedSyncRun.syncRunId,
            mailboxId: startedSyncRun.mailboxId,
            status: "running",
            startedAt: toDate(startedSyncRun.startedAt),
          });

          return startedSyncRun;
        }),
      completeSyncRun: (result: CompletedSyncRun) =>
        Effect.promise(async () => {
          const completedAt = toDate(result.completedAt);
          const mailboxFailureState = getMailboxSyncFailureState(result);

          await database.db.transaction(async (transaction) => {
            await transaction
              .update(syncRuns)
              .set({
                completedAt,
                detail: result.detail,
                eventsEmitted: String(result.eventsEmitted),
                nextCursor: result.nextCursor,
                status: result.status,
              })
              .where(eq(syncRuns.id, result.syncRunId));

            if (result.status === "skipped_due_to_active_lease") {
              return;
            }

            if (mailboxFailureState !== null) {
              await transaction
                .update(mailboxes)
                .set({
                  ...mailboxFailureState,
                  updatedAt: completedAt,
                })
                .where(eq(mailboxes.id, result.mailboxId));
            }
          });
        }),
    };
  }),
);

export const createMailboxSyncCoordinatorLayer = Layer.effect(
  MailboxSyncCoordinator,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      acquireMailboxSyncLease: (lease) =>
        Effect.promise(async () => {
          const acquiredAt = toDate(lease.acquiredAt);
          const expiresAt = toDate(lease.expiresAt);

          return database.db.transaction(async (transaction) => {
            const [updatedMailbox] = await transaction
              .update(mailboxes)
              .set({
                activeSyncLeaseAcquiredAt: acquiredAt,
                activeSyncLeaseExpiresAt: expiresAt,
                activeSyncLeaseHeartbeatAt: acquiredAt,
                activeSyncLeaseOwner: lease.leaseOwnerId,
                activeSyncRunId: lease.syncRunId,
                updatedAt: acquiredAt,
              })
              .where(
                and(
                  eq(mailboxes.id, lease.mailboxId),
                  or(
                    isNull(mailboxes.activeSyncLeaseExpiresAt),
                    lte(mailboxes.activeSyncLeaseExpiresAt, acquiredAt),
                  ),
                ),
              )
              .returning({
                expiresAt: mailboxes.activeSyncLeaseExpiresAt,
              });

            if (updatedMailbox === undefined) {
              const [currentMailbox] = await transaction
                .select({
                  expiresAt: mailboxes.activeSyncLeaseExpiresAt,
                })
                .from(mailboxes)
                .where(eq(mailboxes.id, lease.mailboxId))
                .limit(1);

              const result: MailboxSyncLeaseAcquisition = {
                acquired: false,
                expiresAt: toIsoString(currentMailbox?.expiresAt ?? null),
              };

              return result;
            }

            await transaction
              .update(syncRuns)
              .set({
                leaseOwnerId: lease.leaseOwnerId,
              })
              .where(eq(syncRuns.id, lease.syncRunId));

            const result: MailboxSyncLeaseAcquisition = {
              acquired: true,
              expiresAt: toIsoString(updatedMailbox.expiresAt) ?? lease.expiresAt,
            };

            return result;
          });
        }),
      renewMailboxSyncLease: (lease) =>
        Effect.promise(async () => {
          const heartbeatAt = toDate(lease.heartbeatAt);
          const expiresAt = toDate(lease.expiresAt);

          const [updatedMailbox] = await database.db
            .update(mailboxes)
            .set({
              activeSyncLeaseExpiresAt: expiresAt,
              activeSyncLeaseHeartbeatAt: heartbeatAt,
              updatedAt: heartbeatAt,
            })
            .where(
              and(
                eq(mailboxes.id, lease.mailboxId),
                eq(mailboxes.activeSyncLeaseOwner, lease.leaseOwnerId),
                gt(mailboxes.activeSyncLeaseExpiresAt, heartbeatAt),
              ),
            )
            .returning({
              expiresAt: mailboxes.activeSyncLeaseExpiresAt,
            });

          if (updatedMailbox === undefined) {
            const [currentMailbox] = await database.db
              .select({
                expiresAt: mailboxes.activeSyncLeaseExpiresAt,
              })
              .from(mailboxes)
              .where(eq(mailboxes.id, lease.mailboxId))
              .limit(1);

            const result: MailboxSyncLeaseRenewal = {
              renewed: false,
              expiresAt: toIsoString(currentMailbox?.expiresAt ?? null),
            };

            return result;
          }

          const result: MailboxSyncLeaseRenewal = {
            renewed: true,
            expiresAt: toIsoString(updatedMailbox.expiresAt) ?? lease.expiresAt,
          };

          return result;
        }),
      releaseMailboxSyncLease: (lease) =>
        Effect.promise(async () => {
          await database.db
            .update(mailboxes)
            .set({
              activeSyncLeaseAcquiredAt: null,
              activeSyncLeaseExpiresAt: null,
              activeSyncLeaseHeartbeatAt: null,
              activeSyncLeaseOwner: null,
              activeSyncRunId: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(mailboxes.id, lease.mailboxId),
                eq(mailboxes.activeSyncLeaseOwner, lease.leaseOwnerId),
              ),
            );
        }),
    };
  }),
);

export const createCorePersistenceLayer = (connectionString: string) =>
  Layer.mergeAll(
    createMailboxCatalogLayer,
    createMailboxStateStoreLayer,
    createMailboxSyncCoordinatorLayer,
    createSyncRunStoreLayer,
  ).pipe(Layer.provide(createDatabaseLayer(connectionString)));
