import {
  MailboxStateStore,
  mailboxCursorRegressed,
  type CanonicalThreadRecord,
  type MailboxEventEnvelope,
} from "@mailmon/core";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { mailboxEvents, mailboxes, messages, syncRuns, threads } from "../schema.js";
import { MailmonDatabase } from "./database.js";
import {
  createMessageCreatedMailboxEvent,
  createMessageUpdatedMailboxEvent,
  createThreadUpdatedMailboxEvent,
  isMailboxCursorRegression,
  isSameCanonicalMessage,
  isSameCanonicalThread,
  toCanonicalThreadFromMessageRow,
  toDate,
  toMailboxEventInsert,
  toMessageInsert,
  toMessageUpdateSet,
  toThreadInsert,
  toThreadUpdateSet,
  type MailboxSyncApplyTransactionResult,
} from "./mappers.js";

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
      applySyncResult: ({ mailboxId, leaseOwnerId, nextCursor, snapshot, syncRunId, syncedAt }) => {
        const syncedAtDate = toDate(syncedAt);

        return Effect.promise(() =>
          database.db.transaction(async (transaction) => {
            const leaseCheckAt = new Date();
            const [row] = await transaction
              .select({
                activeSyncLeaseExpiresAt: mailboxes.activeSyncLeaseExpiresAt,
                activeSyncLeaseOwner: mailboxes.activeSyncLeaseOwner,
                cursor: mailboxes.cursor,
                initializedAt: mailboxes.initializedAt,
                tenantExternalId: mailboxes.tenantExternalId,
                workspaceId: mailboxes.workspaceId,
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
              return {
                kind: "committed",
                result: {
                  applied: false,
                  mailboxEventIds: [],
                },
              } satisfies MailboxSyncApplyTransactionResult;
            }

            if (row.workspaceId === null || row.tenantExternalId === null) {
              throw new Error(
                `Mailbox ${mailboxId} is missing the workspace or tenant identity required for mailbox event emission.`,
              );
            }

            if (row.cursor !== null && isMailboxCursorRegression(row.cursor, nextCursor)) {
              return {
                kind: "failed",
                problem: mailboxCursorRegressed(mailboxId, {
                  currentCursor: row.cursor,
                  nextCursor,
                  syncRunId,
                }),
              } satisfies MailboxSyncApplyTransactionResult;
            }

            const deletedMessageRows =
              snapshot.deletedProviderMessageIds.length === 0
                ? []
                : await transaction
                    .select()
                    .from(messages)
                    .where(
                      and(
                        eq(messages.mailboxId, mailboxId),
                        inArray(messages.providerMessageId, [
                          ...snapshot.deletedProviderMessageIds,
                        ]),
                      ),
                    );
            const existingMessageRows =
              snapshot.messages.length === 0
                ? []
                : await transaction
                    .select()
                    .from(messages)
                    .where(
                      and(
                        eq(messages.mailboxId, mailboxId),
                        inArray(messages.providerMessageId, [
                          ...new Set(snapshot.messages.map((message) => message.providerMessageId)),
                        ]),
                      ),
                    );
            const existingMessagesByProviderMessageId = new Map(
              existingMessageRows.map((message) => [message.providerMessageId, message]),
            );
            const affectedProviderThreadIds = [
              ...new Set([
                ...snapshot.threads.map((thread) => thread.providerThreadId),
                ...snapshot.messages.map((message) => message.providerThreadId),
                ...existingMessageRows.map((message) => message.providerThreadId),
                ...deletedMessageRows.map((message) => message.providerThreadId),
              ]),
            ];
            const existingThreadRows =
              affectedProviderThreadIds.length === 0
                ? []
                : await transaction
                    .select()
                    .from(threads)
                    .where(
                      and(
                        eq(threads.mailboxId, mailboxId),
                        inArray(threads.providerThreadId, affectedProviderThreadIds),
                      ),
                    );
            const existingThreadsByProviderThreadId = new Map(
              existingThreadRows.map((thread) => [thread.providerThreadId, thread]),
            );
            const emittedMailboxEvents: Array<MailboxEventEnvelope> = [];

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
              const existingMessage = existingMessagesByProviderMessageId.get(
                message.providerMessageId,
              );

              if (existingMessage === undefined) {
                emittedMailboxEvents.push(
                  createMessageCreatedMailboxEvent({
                    syncRunId,
                    occurredAt: syncedAt,
                    workspaceId: row.workspaceId,
                    tenantExternalId: row.tenantExternalId,
                    mailboxId,
                    message,
                  }),
                );
              } else if (!isSameCanonicalMessage(existingMessage, message)) {
                emittedMailboxEvents.push(
                  createMessageUpdatedMailboxEvent({
                    syncRunId,
                    occurredAt: syncedAt,
                    workspaceId: row.workspaceId,
                    tenantExternalId: row.tenantExternalId,
                    mailboxId,
                    message,
                  }),
                );
              }

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

            const recalculatedThreadRecordsByProviderThreadId =
              affectedProviderThreadIds.length === 0
                ? new Map<string, CanonicalThreadRecord>()
                : await transaction
                    .select({
                      providerThreadId: messages.providerThreadId,
                      receivedAt: messages.receivedAt,
                      subject: messages.subject,
                      threadId: messages.threadId,
                    })
                    .from(messages)
                    .where(
                      and(
                        eq(messages.mailboxId, mailboxId),
                        inArray(messages.providerThreadId, affectedProviderThreadIds),
                      ),
                    )
                    .orderBy(
                      asc(messages.providerThreadId),
                      desc(messages.receivedAt),
                      desc(messages.id),
                    )
                    .then((rows) => {
                      const recalculatedThreads = new Map<string, CanonicalThreadRecord>();

                      for (const message of rows) {
                        if (!recalculatedThreads.has(message.providerThreadId)) {
                          recalculatedThreads.set(
                            message.providerThreadId,
                            toCanonicalThreadFromMessageRow(message),
                          );
                        }
                      }

                      return recalculatedThreads;
                    });

            for (const providerThreadId of affectedProviderThreadIds) {
              const existingThread = existingThreadsByProviderThreadId.get(providerThreadId);
              const recalculatedThread =
                recalculatedThreadRecordsByProviderThreadId.get(providerThreadId);

              if (recalculatedThread === undefined) {
                continue;
              }

              if (
                existingThread === undefined ||
                !isSameCanonicalThread(existingThread, recalculatedThread)
              ) {
                emittedMailboxEvents.push(
                  createThreadUpdatedMailboxEvent({
                    syncRunId,
                    occurredAt: syncedAt,
                    workspaceId: row.workspaceId,
                    tenantExternalId: row.tenantExternalId,
                    mailboxId,
                    thread: recalculatedThread,
                  }),
                );
              }

              await transaction
                .insert(threads)
                .values(toThreadInsert(mailboxId, recalculatedThread))
                .onConflictDoUpdate({
                  target: [threads.mailboxId, threads.providerThreadId],
                  set: toThreadUpdateSet(recalculatedThread),
                });
            }

            if (emittedMailboxEvents.length > 0) {
              await transaction
                .insert(mailboxEvents)
                .values(emittedMailboxEvents.map((event) => toMailboxEventInsert(event)))
                .onConflictDoNothing({
                  target: mailboxEvents.id,
                });
            }

            const [updatedMailbox] = await transaction
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
              .where(eq(mailboxes.id, mailboxId))
              .returning({
                id: mailboxes.id,
              });

            if (updatedMailbox === undefined) {
              throw new Error(
                `Mailbox ${mailboxId} could not be finalized after sync application.`,
              );
            }

            const [updatedSyncRun] = await transaction
              .update(syncRuns)
              .set({
                completedAt: syncedAtDate,
                detail: null,
                eventsEmitted: String(emittedMailboxEvents.length),
                previousCursor: row.cursor,
                nextCursor,
                status: "completed",
              })
              .where(eq(syncRuns.id, syncRunId))
              .returning({
                id: syncRuns.id,
              });

            if (updatedSyncRun === undefined) {
              throw new Error(
                `Sync run ${syncRunId} could not be finalized after sync application.`,
              );
            }

            return {
              kind: "committed",
              result: {
                applied: true,
                mailboxEventIds: emittedMailboxEvents.map((event) => event.id),
              },
            } satisfies MailboxSyncApplyTransactionResult;
          }),
        ).pipe(
          Effect.flatMap((transactionResult) =>
            transactionResult.kind === "failed"
              ? Effect.fail(transactionResult.problem)
              : Effect.succeed(transactionResult.result),
          ),
        );
      },
    };
  }),
);
