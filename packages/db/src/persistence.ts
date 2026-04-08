import { createHash } from "node:crypto";

import {
  MailboxCatalog,
  MailboxConnectSessionStore,
  MailboxQueryCatalog,
  MailboxSyncCoordinator,
  MailboxStateStore,
  SyncRunStore,
  WorkspaceApiKeyStore,
  invalidPaginationCursor,
  mailboxAlreadyConnected,
  type CanonicalMessageRecord,
  type CanonicalThreadRecord,
  type CompletedMailboxConnectSession,
  type CompletedSyncRun,
  type ListMailboxMessagesRequest,
  type ListMailboxThreadsRequest,
  type ListResource,
  type MailboxOperationalError,
  type MailboxResource,
  type MailboxSyncLeaseAcquisition,
  type MailboxSyncLeaseRenewal,
  type MessageResource,
  type StartedSyncRun,
  type StoredConnectSession,
  type ThreadListItemResource,
  type ThreadMessageSummaryResource,
  type ThreadResource,
  type WorkspaceApiKeyIdentity,
} from "@mailmon/core";
import { GmailMailboxCredentialStore } from "@mailmon/gmail";
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";

import { createDb } from "./client.js";
import {
  gmailMailboxCredentials,
  mailboxConnectSessions,
  mailboxes,
  messages,
  syncRuns,
  threads,
  workspaceApiKeys,
} from "./schema.js";

type DatabaseHandle = ReturnType<typeof createDb>;
type MailboxRow = typeof mailboxes.$inferSelect;
type ConnectSessionRow = typeof mailboxConnectSessions.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type ThreadRow = typeof threads.$inferSelect;

const hashApiKey = (apiKey: string) => {
  return createHash("sha256").update(apiKey).digest("hex");
};

const normalizeEmailAddress = (emailAddress: string) => {
  return emailAddress.trim().toLowerCase();
};

const createMailboxId = () => {
  return `mbx_${globalThis.crypto.randomUUID()}`;
};

const isProblemDetails = (
  value: unknown,
): value is Readonly<{
  code: string;
  detail: string;
  retryable: boolean;
  status: number;
  title: string;
  type: string;
}> => {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "status" in value &&
    typeof value.status === "number" &&
    "code" in value &&
    typeof value.code === "string" &&
    "detail" in value &&
    typeof value.detail === "string" &&
    "retryable" in value &&
    typeof value.retryable === "boolean"
  );
};

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

const toMessageResource = (row: MessageRow): MessageResource => {
  return {
    id: row.id,
    mailboxId: row.mailboxId,
    threadId: row.threadId,
    providerMessageId: row.providerMessageId,
    subject: row.subject,
    from: {
      name: row.fromName,
      email: row.fromEmail,
    },
    snippet: row.snippet,
    receivedAt: row.receivedAt.toISOString(),
    labelIds: [...row.labelIds],
  };
};

const toThreadListItemResource = (row: ThreadRow): ThreadListItemResource => {
  return {
    id: row.id,
    object: "thread",
    mailboxId: row.mailboxId,
    providerThreadId: row.providerThreadId,
    subject: row.subject,
    lastMessageAt: row.lastMessageAt.toISOString(),
  };
};

const toThreadMessageSummaryResource = (
  row: Pick<MessageRow, "id" | "receivedAt" | "subject">,
): ThreadMessageSummaryResource => {
  return {
    id: row.id,
    subject: row.subject,
    receivedAt: row.receivedAt.toISOString(),
  };
};

const toThreadResource = (row: ThreadRow, threadMessages: ReadonlyArray<MessageRow>): ThreadResource => {
  return {
    ...toThreadListItemResource(row),
    messages: threadMessages.map((message) => toThreadMessageSummaryResource(message)),
  };
};

interface PaginationCursor {
  readonly id: string;
  readonly timestamp: string;
}

const encodePaginationCursor = (cursor: PaginationCursor) => {
  const payload = JSON.stringify({
    id: cursor.id,
    timestamp: cursor.timestamp,
  });

  return `cur_${Buffer.from(payload, "utf8").toString("base64url")}`;
};

const decodePaginationCursor = (
  resourceType: "messages" | "threads",
  cursor: string,
): PaginationCursor => {
  if (!cursor.startsWith("cur_")) {
    throw invalidPaginationCursor(resourceType);
  }

  try {
    const decoded = Buffer.from(cursor.slice(4), "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as unknown;

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("id" in payload) ||
      typeof payload.id !== "string" ||
      payload.id.length === 0 ||
      !("timestamp" in payload) ||
      typeof payload.timestamp !== "string" ||
      Number.isNaN(Date.parse(payload.timestamp))
    ) {
      throw invalidPaginationCursor(resourceType);
    }

    return {
      id: payload.id,
      timestamp: payload.timestamp,
    };
  } catch (error) {
    if (isProblemDetails(error)) {
      throw error;
    }

    throw invalidPaginationCursor(resourceType);
  }
};

const toStoredConnectSession = (row: ConnectSessionRow): StoredConnectSession => {
  return {
    id: row.id,
    provider: toMailboxProvider(row.provider),
    workspaceId: row.workspaceId,
    tenantExternalId: row.tenantExternalId,
    mailboxExternalId: row.mailboxExternalId,
    redirectUrl: row.redirectUrl,
    codeVerifier: row.codeVerifier,
    expiresAt: row.expiresAt.toISOString(),
    mailboxId: row.mailboxId,
    completedAt: toIsoString(row.completedAt),
  };
};

const toWorkspaceApiKeyIdentity = (workspaceId: string): WorkspaceApiKeyIdentity => {
  return {
    workspaceId,
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
      getMailbox: (
        mailboxId: string,
        options: Readonly<{
          workspaceId?: string;
        }> = {},
      ) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select()
            .from(mailboxes)
            .where(
              options.workspaceId === undefined
                ? eq(mailboxes.id, mailboxId)
                : and(eq(mailboxes.id, mailboxId), eq(mailboxes.workspaceId, options.workspaceId)),
            )
            .limit(1);

          return Option.fromNullable(row).pipe(Option.map(toMailboxResource));
        }),
    };
  }),
);

export const createWorkspaceApiKeyStoreLayer = Layer.effect(
  WorkspaceApiKeyStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      getWorkspaceForApiKey: (apiKey: string) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select({
              workspaceId: workspaceApiKeys.workspaceId,
            })
            .from(workspaceApiKeys)
            .where(eq(workspaceApiKeys.apiKeyHash, hashApiKey(apiKey)))
            .limit(1);

          return Option.fromNullable(row).pipe(
            Option.map((value) => toWorkspaceApiKeyIdentity(value.workspaceId)),
          );
        }),
    };
  }),
);

export const createMailboxQueryCatalogLayer = Layer.effect(
  MailboxQueryCatalog,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      listMessages: (request: ListMailboxMessagesRequest) =>
        Effect.tryPromise({
          catch: (error) => {
            if (isProblemDetails(error)) {
              return error;
            }

            throw error;
          },
          try: async () => {
            const paginationCursor =
              request.cursor === null ? null : decodePaginationCursor("messages", request.cursor);
            const whereClause =
              paginationCursor === null
                ? eq(messages.mailboxId, request.mailboxId)
                : and(
                    eq(messages.mailboxId, request.mailboxId),
                    or(
                      lt(messages.receivedAt, toDate(paginationCursor.timestamp)),
                      and(
                        eq(messages.receivedAt, toDate(paginationCursor.timestamp)),
                        lt(messages.id, paginationCursor.id),
                      ),
                    ),
                  );
            const rows = await database.db
              .select()
              .from(messages)
              .where(whereClause)
              .orderBy(desc(messages.receivedAt), desc(messages.id))
              .limit(request.limit + 1);
            const pageRows = rows.slice(0, request.limit);
            const nextCursor =
              rows.length > request.limit
                ? encodePaginationCursor({
                    id: pageRows[pageRows.length - 1]?.id ?? rows[request.limit - 1]!.id,
                    timestamp:
                      pageRows[pageRows.length - 1]?.receivedAt.toISOString() ??
                      rows[request.limit - 1]!.receivedAt.toISOString(),
                  })
                : null;

            return {
              object: "list",
              data: pageRows.map((row) => toMessageResource(row)),
              nextCursor,
            } satisfies ListResource<MessageResource>;
          },
        }),
      getMessage: (
        messageId: string,
        options: Readonly<{
          workspaceId?: string;
        }> = {},
      ) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select({
              message: messages,
            })
            .from(messages)
            .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
            .where(
              options.workspaceId === undefined
                ? eq(messages.id, messageId)
                : and(eq(messages.id, messageId), eq(mailboxes.workspaceId, options.workspaceId)),
            )
            .limit(1);

          return Option.fromNullable(row?.message).pipe(Option.map((message) => toMessageResource(message)));
        }),
      listThreads: (request: ListMailboxThreadsRequest) =>
        Effect.tryPromise({
          catch: (error) => {
            if (isProblemDetails(error)) {
              return error;
            }

            throw error;
          },
          try: async () => {
            const paginationCursor =
              request.cursor === null ? null : decodePaginationCursor("threads", request.cursor);
            const whereClause =
              paginationCursor === null
                ? eq(threads.mailboxId, request.mailboxId)
                : and(
                    eq(threads.mailboxId, request.mailboxId),
                    or(
                      lt(threads.lastMessageAt, toDate(paginationCursor.timestamp)),
                      and(
                        eq(threads.lastMessageAt, toDate(paginationCursor.timestamp)),
                        lt(threads.id, paginationCursor.id),
                      ),
                    ),
                  );
            const rows = await database.db
              .select()
              .from(threads)
              .where(whereClause)
              .orderBy(desc(threads.lastMessageAt), desc(threads.id))
              .limit(request.limit + 1);
            const pageRows = rows.slice(0, request.limit);
            const nextCursor =
              rows.length > request.limit
                ? encodePaginationCursor({
                    id: pageRows[pageRows.length - 1]?.id ?? rows[request.limit - 1]!.id,
                    timestamp:
                      pageRows[pageRows.length - 1]?.lastMessageAt.toISOString() ??
                      rows[request.limit - 1]!.lastMessageAt.toISOString(),
                  })
                : null;

            return {
              object: "list",
              data: pageRows.map((row) => toThreadListItemResource(row)),
              nextCursor,
            } satisfies ListResource<ThreadListItemResource>;
          },
        }),
      getThread: (
        threadId: string,
        options: Readonly<{
          workspaceId?: string;
        }> = {},
      ) =>
        Effect.promise(async () => {
          const [threadRow] = await database.db
            .select({
              thread: threads,
            })
            .from(threads)
            .innerJoin(mailboxes, eq(threads.mailboxId, mailboxes.id))
            .where(
              options.workspaceId === undefined
                ? eq(threads.id, threadId)
                : and(eq(threads.id, threadId), eq(mailboxes.workspaceId, options.workspaceId)),
            )
            .limit(1);

          if (threadRow === undefined) {
            return Option.none();
          }

          const threadMessages = await database.db
            .select()
            .from(messages)
            .where(eq(messages.threadId, threadRow.thread.id))
            .orderBy(asc(messages.receivedAt), asc(messages.id));

          return Option.some(toThreadResource(threadRow.thread, threadMessages));
        }),
    };
  }),
);

export const createMailboxConnectSessionStoreLayer = Layer.effect(
  MailboxConnectSessionStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      createConnectSession: (params) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .insert(mailboxConnectSessions)
            .values({
              id: params.id,
              provider: params.provider,
              workspaceId: params.workspaceId,
              tenantExternalId: params.tenantExternalId,
              mailboxExternalId: params.mailboxExternalId,
              redirectUrl: params.redirectUrl,
              codeVerifier: params.codeVerifier,
              expiresAt: toDate(params.expiresAt),
            })
            .returning();

          if (row === undefined) {
            throw new Error(`Connect session ${params.id} was not created.`);
          }

          return toStoredConnectSession(row);
        }),
      getConnectSession: (connectSessionId: string) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select()
            .from(mailboxConnectSessions)
            .where(eq(mailboxConnectSessions.id, connectSessionId))
            .limit(1);

          return Option.fromNullable(row).pipe(Option.map(toStoredConnectSession));
        }),
      completeConnectSession: (params) =>
        Effect.tryPromise({
          catch: (error) => {
            if (isProblemDetails(error)) {
              return error;
            }

            throw error;
          },
          try: async () => {
            return database.db.transaction(async (transaction) => {
              const [connectSession] = await transaction
                .select()
                .from(mailboxConnectSessions)
                .where(eq(mailboxConnectSessions.id, params.connectSessionId))
                .limit(1);

              if (connectSession === undefined) {
                throw new Error(`Connect session ${params.connectSessionId} does not exist.`);
              }

              if (connectSession.mailboxId !== null) {
                const [existingMailbox] = await transaction
                  .select()
                  .from(mailboxes)
                  .where(eq(mailboxes.id, connectSession.mailboxId))
                  .limit(1);

                if (existingMailbox === undefined) {
                  throw new Error(
                    `Mailbox ${connectSession.mailboxId} referenced by connect session ${connectSession.id} does not exist.`,
                  );
                }

                return {
                  mailbox: toMailboxResource(existingMailbox),
                  redirectUrl: connectSession.redirectUrl,
                  created: false,
                } satisfies CompletedMailboxConnectSession;
              }

              const normalizedEmailAddress = normalizeEmailAddress(params.providerAccountEmail);
              const [existingMailbox] = await transaction
                .select()
                .from(mailboxes)
                .where(
                  and(
                    eq(mailboxes.workspaceId, connectSession.workspaceId),
                    eq(mailboxes.provider, connectSession.provider),
                    or(
                      eq(mailboxes.emailAddress, normalizedEmailAddress),
                      and(
                        eq(mailboxes.tenantExternalId, connectSession.tenantExternalId),
                        eq(mailboxes.mailboxExternalId, connectSession.mailboxExternalId),
                      ),
                    ),
                  ),
                )
                .limit(1);

              if (existingMailbox !== undefined) {
                throw mailboxAlreadyConnected(existingMailbox.id);
              }

              const createdAt = toDate(params.connectedAt);
              const mailboxId = createMailboxId();

              const [createdMailbox] = await transaction
                .insert(mailboxes)
                .values({
                  id: mailboxId,
                  workspaceId: connectSession.workspaceId,
                  provider: connectSession.provider,
                  tenantExternalId: connectSession.tenantExternalId,
                  mailboxExternalId: connectSession.mailboxExternalId,
                  emailAddress: normalizedEmailAddress,
                  status: "active",
                  syncState: "initializing",
                  watchState: "active",
                  createdAt,
                  updatedAt: createdAt,
                })
                .returning();

              if (createdMailbox === undefined) {
                throw new Error(`Mailbox ${mailboxId} was not created.`);
              }

              await transaction.insert(gmailMailboxCredentials).values({
                mailboxId,
                refreshToken: params.refreshToken,
                createdAt,
                updatedAt: createdAt,
              });

              await transaction
                .update(mailboxConnectSessions)
                .set({
                  mailboxId,
                  completedAt: createdAt,
                  updatedAt: createdAt,
                })
                .where(eq(mailboxConnectSessions.id, connectSession.id));

              return {
                mailbox: toMailboxResource(createdMailbox),
                redirectUrl: connectSession.redirectUrl,
                created: true,
              } satisfies CompletedMailboxConnectSession;
            });
          },
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
      applySyncResult: ({
        eventsEmitted,
        mailboxId,
        leaseOwnerId,
        nextCursor,
        snapshot,
        syncRunId,
        syncedAt,
      }) =>
        Effect.promise(async () => {
          const syncedAtDate = toDate(syncedAt);

          return database.db.transaction(async (transaction) => {
            const leaseCheckAt = new Date();
            const [row] = await transaction
              .select({
                activeSyncLeaseExpiresAt: mailboxes.activeSyncLeaseExpiresAt,
                activeSyncLeaseOwner: mailboxes.activeSyncLeaseOwner,
                initializedAt: mailboxes.initializedAt,
              })
              .from(mailboxes)
              .where(eq(mailboxes.id, mailboxId))
              .limit(1);

            if (
              row === undefined ||
              row.activeSyncLeaseOwner !== leaseOwnerId ||
              row.activeSyncLeaseExpiresAt === null ||
              row.activeSyncLeaseExpiresAt <= leaseCheckAt
            ) {
              return false;
            }

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

            if (snapshot.deletedProviderMessageIds.length > 0) {
              await transaction
                .delete(messages)
                .where(
                  and(
                    eq(messages.mailboxId, mailboxId),
                    inArray(messages.providerMessageId, [...snapshot.deletedProviderMessageIds]),
                  ),
                );

              await transaction.execute(sql`
                DELETE FROM ${threads}
                WHERE ${threads.mailboxId} = ${mailboxId}
                  AND NOT EXISTS (
                    SELECT 1
                    FROM ${messages}
                    WHERE ${messages.threadId} = ${threads.id}
                  )
              `);
            }

            await transaction
              .update(mailboxes)
              .set({
                activeSyncLeaseAcquiredAt: null,
                activeSyncLeaseExpiresAt: null,
                activeSyncLeaseHeartbeatAt: null,
                activeSyncLeaseOwner: null,
                activeSyncRunId: null,
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

            await transaction
              .update(syncRuns)
              .set({
                completedAt: syncedAtDate,
                detail: null,
                eventsEmitted: String(eventsEmitted),
                nextCursor,
                status: "completed",
              })
              .where(eq(syncRuns.id, syncRunId));

            return true;
          });
        }),
    };
  }),
);

export const createGmailMailboxCredentialStoreLayer = Layer.effect(
  GmailMailboxCredentialStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      getGmailMailboxCredential: (mailboxId: string) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select({
              mailboxId: gmailMailboxCredentials.mailboxId,
              refreshToken: gmailMailboxCredentials.refreshToken,
            })
            .from(gmailMailboxCredentials)
            .where(eq(gmailMailboxCredentials.mailboxId, mailboxId))
            .limit(1);

          return row ?? null;
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

export const createPersistenceServicesLayer = Layer.mergeAll(
  createMailboxCatalogLayer,
  createMailboxConnectSessionStoreLayer,
  createMailboxQueryCatalogLayer,
  createMailboxStateStoreLayer,
  createMailboxSyncCoordinatorLayer,
  createSyncRunStoreLayer,
  createWorkspaceApiKeyStoreLayer,
);

export const createCorePersistenceLayer = (connectionString: string) =>
  createPersistenceServicesLayer.pipe(Layer.provide(createDatabaseLayer(connectionString)));

export const createWorkerPersistenceLayer = (connectionString: string) =>
  Layer.mergeAll(createPersistenceServicesLayer, createGmailMailboxCredentialStoreLayer).pipe(
    Layer.provide(createDatabaseLayer(connectionString)),
  );
