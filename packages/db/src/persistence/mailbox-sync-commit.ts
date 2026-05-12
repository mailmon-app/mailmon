import {
  mailboxCursorRegressed,
  type CanonicalThreadRecord,
  type MailboxEventEnvelope,
  type MailboxSyncSnapshot,
} from "@mailmon/core";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { mailboxEvents, mailboxes, messages, syncRuns, threads } from "../schema.js";
import type { DatabaseHandle } from "./database.js";
import {
  createMessageCreatedMailboxEvent,
  createMessageUpdatedMailboxEvent,
  createThreadUpdatedMailboxEvent,
  isMailboxCursorRegression,
  isSameCanonicalMessage,
  isSameCanonicalThread,
  toCanonicalThreadFromMessageRow,
  toMailboxEventInsert,
  toMessageInsert,
  toMessageUpdateSet,
  toThreadInsert,
  toThreadUpdateSet,
  type MailboxSyncApplyTransactionResult,
} from "./mappers.js";

type MailboxSyncCommitTransaction = Parameters<
  Parameters<DatabaseHandle["db"]["transaction"]>[0]
>[0];

type MailboxCommitIdentity = Readonly<{
  mailboxId: string;
  syncRunId: string;
  syncedAt: string;
  tenantExternalId: string;
  workspaceId: string;
}>;

type MailboxSyncCommitMailboxRow = NonNullable<Awaited<ReturnType<typeof loadMailboxForCommit>>>;

const loadMailboxForCommit = async (
  transaction: MailboxSyncCommitTransaction,
  mailboxId: string,
) => {
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

  return row;
};

const guardActiveLease = (
  row: MailboxSyncCommitMailboxRow | undefined,
  leaseOwnerId: string,
  leaseCheckAt: Date,
): row is MailboxSyncCommitMailboxRow => {
  return (
    row !== undefined &&
    row.activeSyncLeaseOwner === leaseOwnerId &&
    row.activeSyncLeaseExpiresAt !== null &&
    row.activeSyncLeaseExpiresAt > leaseCheckAt
  );
};

const guardMailboxEventIdentity = (mailboxId: string, row: MailboxSyncCommitMailboxRow) => {
  if (row.workspaceId === null || row.tenantExternalId === null) {
    throw new Error(
      `Mailbox ${mailboxId} is missing the workspace or tenant identity required for mailbox event emission.`,
    );
  }

  return {
    tenantExternalId: row.tenantExternalId,
    workspaceId: row.workspaceId,
  };
};

const guardCursorProgression = (
  params: Readonly<{
    mailboxId: string;
    nextCursor: string | null;
    row: MailboxSyncCommitMailboxRow;
    syncRunId: string;
  }>,
): MailboxSyncApplyTransactionResult | null => {
  if (
    params.row.cursor === null ||
    !isMailboxCursorRegression(params.row.cursor, params.nextCursor)
  ) {
    return null;
  }

  return {
    kind: "failed",
    problem: mailboxCursorRegressed(params.mailboxId, {
      currentCursor: params.row.cursor,
      nextCursor: params.nextCursor,
      syncRunId: params.syncRunId,
    }),
  };
};

const committedWithoutApplying = (): MailboxSyncApplyTransactionResult => ({
  kind: "committed",
  result: {
    applied: false,
    mailboxEventIds: [],
  },
});

const loadMessageRowsForCommit = async (
  transaction: MailboxSyncCommitTransaction,
  mailboxId: string,
  snapshot: MailboxSyncSnapshot,
) => {
  const deletedMessageRows =
    snapshot.deletedProviderMessageIds.length === 0
      ? []
      : await transaction
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.mailboxId, mailboxId),
              inArray(messages.providerMessageId, [...snapshot.deletedProviderMessageIds]),
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

  return { deletedMessageRows, existingMessageRows };
};

const getAffectedProviderThreadIds = (
  snapshot: MailboxSyncSnapshot,
  rows: Awaited<ReturnType<typeof loadMessageRowsForCommit>>,
) => [
  ...new Set([
    ...snapshot.threads.map((thread) => thread.providerThreadId),
    ...snapshot.messages.map((message) => message.providerThreadId),
    ...rows.existingMessageRows.map((message) => message.providerThreadId),
    ...rows.deletedMessageRows.map((message) => message.providerThreadId),
  ]),
];

const loadExistingThreadsByProviderThreadId = async (
  transaction: MailboxSyncCommitTransaction,
  mailboxId: string,
  affectedProviderThreadIds: ReadonlyArray<string>,
) => {
  const existingThreadRows =
    affectedProviderThreadIds.length === 0
      ? []
      : await transaction
          .select()
          .from(threads)
          .where(
            and(
              eq(threads.mailboxId, mailboxId),
              inArray(threads.providerThreadId, [...affectedProviderThreadIds]),
            ),
          );

  return new Map(existingThreadRows.map((thread) => [thread.providerThreadId, thread]));
};

const applySnapshotThreads = async (
  transaction: MailboxSyncCommitTransaction,
  mailboxId: string,
  snapshot: MailboxSyncSnapshot,
) => {
  for (const thread of snapshot.threads) {
    await transaction
      .insert(threads)
      .values(toThreadInsert(mailboxId, thread))
      .onConflictDoUpdate({
        target: [threads.mailboxId, threads.providerThreadId],
        set: toThreadUpdateSet(thread),
      });
  }
};

const applySnapshotMessages = async (
  transaction: MailboxSyncCommitTransaction,
  params: Readonly<{
    existingMessageRows: Awaited<
      ReturnType<typeof loadMessageRowsForCommit>
    >["existingMessageRows"];
    identity: MailboxCommitIdentity;
    snapshot: MailboxSyncSnapshot;
  }>,
) => {
  const existingMessagesByProviderMessageId = new Map(
    params.existingMessageRows.map((message) => [message.providerMessageId, message]),
  );
  const emittedMailboxEvents: Array<MailboxEventEnvelope> = [];

  for (const message of params.snapshot.messages) {
    const existingMessage = existingMessagesByProviderMessageId.get(message.providerMessageId);

    if (existingMessage === undefined) {
      emittedMailboxEvents.push(
        createMessageCreatedMailboxEvent({
          ...params.identity,
          message,
          occurredAt: params.identity.syncedAt,
        }),
      );
    } else if (!isSameCanonicalMessage(existingMessage, message)) {
      emittedMailboxEvents.push(
        createMessageUpdatedMailboxEvent({
          ...params.identity,
          message,
          occurredAt: params.identity.syncedAt,
        }),
      );
    }

    await transaction
      .insert(messages)
      .values(toMessageInsert(params.identity.mailboxId, message))
      .onConflictDoUpdate({
        target: [messages.mailboxId, messages.providerMessageId],
        set: toMessageUpdateSet(message),
      });
  }

  return emittedMailboxEvents;
};

const applyMessageDeletions = async (
  transaction: MailboxSyncCommitTransaction,
  mailboxId: string,
  snapshot: MailboxSyncSnapshot,
) => {
  if (snapshot.deletedProviderMessageIds.length === 0) {
    return;
  }

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
};

const recalculateThreadsByProviderThreadId = async (
  transaction: MailboxSyncCommitTransaction,
  mailboxId: string,
  affectedProviderThreadIds: ReadonlyArray<string>,
) => {
  if (affectedProviderThreadIds.length === 0) {
    return new Map<string, CanonicalThreadRecord>();
  }

  const rows = await transaction
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
        inArray(messages.providerThreadId, [...affectedProviderThreadIds]),
      ),
    )
    .orderBy(asc(messages.providerThreadId), desc(messages.receivedAt), desc(messages.id));
  const recalculatedThreads = new Map<string, CanonicalThreadRecord>();

  for (const message of rows) {
    if (!recalculatedThreads.has(message.providerThreadId)) {
      recalculatedThreads.set(message.providerThreadId, toCanonicalThreadFromMessageRow(message));
    }
  }

  return recalculatedThreads;
};

const applyRecalculatedThreads = async (
  transaction: MailboxSyncCommitTransaction,
  params: Readonly<{
    affectedProviderThreadIds: ReadonlyArray<string>;
    existingThreadsByProviderThreadId: Awaited<
      ReturnType<typeof loadExistingThreadsByProviderThreadId>
    >;
    identity: MailboxCommitIdentity;
    recalculatedThreadRecordsByProviderThreadId: Awaited<
      ReturnType<typeof recalculateThreadsByProviderThreadId>
    >;
  }>,
) => {
  const emittedMailboxEvents: Array<MailboxEventEnvelope> = [];

  for (const providerThreadId of params.affectedProviderThreadIds) {
    const existingThread = params.existingThreadsByProviderThreadId.get(providerThreadId);
    const recalculatedThread =
      params.recalculatedThreadRecordsByProviderThreadId.get(providerThreadId);

    if (recalculatedThread === undefined) {
      continue;
    }

    if (
      existingThread === undefined ||
      !isSameCanonicalThread(existingThread, recalculatedThread)
    ) {
      emittedMailboxEvents.push(
        createThreadUpdatedMailboxEvent({
          ...params.identity,
          occurredAt: params.identity.syncedAt,
          thread: recalculatedThread,
        }),
      );
    }

    await transaction
      .insert(threads)
      .values(toThreadInsert(params.identity.mailboxId, recalculatedThread))
      .onConflictDoUpdate({
        target: [threads.mailboxId, threads.providerThreadId],
        set: toThreadUpdateSet(recalculatedThread),
      });
  }

  return emittedMailboxEvents;
};

const insertMailboxEvents = async (
  transaction: MailboxSyncCommitTransaction,
  emittedMailboxEvents: ReadonlyArray<MailboxEventEnvelope>,
) => {
  if (emittedMailboxEvents.length === 0) {
    return;
  }

  await transaction
    .insert(mailboxEvents)
    .values(emittedMailboxEvents.map((event) => toMailboxEventInsert(event)))
    .onConflictDoNothing({
      target: mailboxEvents.id,
    });
};

const finalizeMailboxSyncCommit = async (
  transaction: MailboxSyncCommitTransaction,
  params: Readonly<{
    emittedMailboxEvents: ReadonlyArray<MailboxEventEnvelope>;
    mailboxId: string;
    nextCursor: string | null;
    previousCursor: string | null;
    syncRunId: string;
    syncedAtDate: Date;
    initializedAt: Date | null;
  }>,
) => {
  const [updatedMailbox] = await transaction
    .update(mailboxes)
    .set({
      activeSyncLeaseAcquiredAt: null,
      activeSyncLeaseExpiresAt: null,
      activeSyncLeaseHeartbeatAt: null,
      activeSyncLeaseOwner: null,
      activeSyncRunId: null,
      cursor: params.nextCursor,
      initializedAt: params.initializedAt ?? params.syncedAtDate,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastErrorOccurredAt: null,
      lastErrorRetryable: null,
      lastSuccessfulSyncAt: params.syncedAtDate,
      syncState: "healthy",
      updatedAt: params.syncedAtDate,
    })
    .where(eq(mailboxes.id, params.mailboxId))
    .returning({
      id: mailboxes.id,
    });

  if (updatedMailbox === undefined) {
    throw new Error(`Mailbox ${params.mailboxId} could not be finalized after sync application.`);
  }

  const [updatedSyncRun] = await transaction
    .update(syncRuns)
    .set({
      completedAt: params.syncedAtDate,
      detail: null,
      eventsEmitted: String(params.emittedMailboxEvents.length),
      previousCursor: params.previousCursor,
      nextCursor: params.nextCursor,
      status: "completed",
    })
    .where(eq(syncRuns.id, params.syncRunId))
    .returning({
      id: syncRuns.id,
    });

  if (updatedSyncRun === undefined) {
    throw new Error(`Sync run ${params.syncRunId} could not be finalized after sync application.`);
  }
};

export const applyMailboxSyncCommit = async (
  transaction: MailboxSyncCommitTransaction,
  params: Readonly<{
    mailboxId: string;
    leaseOwnerId: string;
    nextCursor: string | null;
    snapshot: MailboxSyncSnapshot;
    syncRunId: string;
    syncedAt: string;
    syncedAtDate: Date;
  }>,
): Promise<MailboxSyncApplyTransactionResult> => {
  const leaseCheckAt = new Date();
  const row = await loadMailboxForCommit(transaction, params.mailboxId);

  if (!guardActiveLease(row, params.leaseOwnerId, leaseCheckAt)) {
    return committedWithoutApplying();
  }

  const identityParts = guardMailboxEventIdentity(params.mailboxId, row);
  const cursorRegression = guardCursorProgression({
    mailboxId: params.mailboxId,
    nextCursor: params.nextCursor,
    row,
    syncRunId: params.syncRunId,
  });

  if (cursorRegression !== null) {
    return cursorRegression;
  }

  const identity = {
    ...identityParts,
    mailboxId: params.mailboxId,
    syncRunId: params.syncRunId,
    syncedAt: params.syncedAt,
  };
  const messageRows = await loadMessageRowsForCommit(
    transaction,
    params.mailboxId,
    params.snapshot,
  );
  const affectedProviderThreadIds = getAffectedProviderThreadIds(params.snapshot, messageRows);
  const existingThreadsByProviderThreadId = await loadExistingThreadsByProviderThreadId(
    transaction,
    params.mailboxId,
    affectedProviderThreadIds,
  );
  const emittedMailboxEvents: Array<MailboxEventEnvelope> = [];

  await applySnapshotThreads(transaction, params.mailboxId, params.snapshot);
  emittedMailboxEvents.push(
    ...(await applySnapshotMessages(transaction, {
      existingMessageRows: messageRows.existingMessageRows,
      identity,
      snapshot: params.snapshot,
    })),
  );
  await applyMessageDeletions(transaction, params.mailboxId, params.snapshot);

  const recalculatedThreadRecordsByProviderThreadId = await recalculateThreadsByProviderThreadId(
    transaction,
    params.mailboxId,
    affectedProviderThreadIds,
  );

  emittedMailboxEvents.push(
    ...(await applyRecalculatedThreads(transaction, {
      affectedProviderThreadIds,
      existingThreadsByProviderThreadId,
      identity,
      recalculatedThreadRecordsByProviderThreadId,
    })),
  );

  await insertMailboxEvents(transaction, emittedMailboxEvents);
  await finalizeMailboxSyncCommit(transaction, {
    emittedMailboxEvents,
    initializedAt: row.initializedAt,
    mailboxId: params.mailboxId,
    nextCursor: params.nextCursor,
    previousCursor: row.cursor,
    syncRunId: params.syncRunId,
    syncedAtDate: params.syncedAtDate,
  });

  return {
    kind: "committed",
    result: {
      applied: true,
      mailboxEventIds: emittedMailboxEvents.map((event) => event.id),
    },
  };
};
