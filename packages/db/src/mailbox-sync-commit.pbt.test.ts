import { describe, expect, it } from "@effect/vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import {
  MailboxStateStore,
  type MailboxSyncCommitResult,
  type MailboxSyncSnapshot,
} from "@mailmon/core";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { asc, eq } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";
import { hegelSettings, notePbtCase } from "./test-hegel.js";
import { withIsolatedDatabasePromise } from "./test-setup.js";

const workspaceId = "ws_commit_pbt";
const mailboxId = "mbx_commit_pbt";
const tenantExternalId = "tenant_commit_pbt";
const activeLeaseOwnerId = "lease_commit_active";
const staleLeaseOwnerId = "lease_commit_stale";

const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});

const cursorGen = gs.sampledFrom([
  null,
  "0",
  "1",
  "2",
  "9",
  "10",
  "99",
  "100",
  "hist_0",
  "hist_1",
  "hist_2",
  "page-01",
  "page-02",
  "alpha",
  "zeta",
] as const);

const labelIdGen = gs.sampledFrom([
  "INBOX",
  "UNREAD",
  "STARRED",
  "IMPORTANT",
  "CATEGORY_PROMOTIONS",
  "Label/custom",
] as const);

const providerMessageIdIndexes = [0, 1, 2, 3, 4, 5] as const;
const receivedAtValues = [
  "2026-04-09T09:00:00.000Z",
  "2026-04-09T09:01:00.000Z",
  "2026-04-09T09:02:00.000Z",
  "2026-04-09T09:03:00.000Z",
  "2026-04-09T09:04:00.000Z",
  "2026-04-09T09:05:00.000Z",
] as const;

const parseDecimalHistoryCursor = (cursor: string): bigint | null => {
  if (!/^\d+$/.test(cursor)) {
    return null;
  }

  return BigInt(cursor);
};

const parseTrailingOrdinalCursor = (cursor: string) => {
  const match = /^(.*\D)(\d+)$/.exec(cursor);

  if (match === null) {
    return null;
  }
  const [, prefix, value] = match;

  if (prefix === undefined || value === undefined) {
    return null;
  }

  return {
    prefix,
    value: BigInt(value),
  };
};

const expectedCursorRegression = (currentCursor: string | null, nextCursor: string | null) => {
  if (currentCursor === null || currentCursor === nextCursor) {
    return false;
  }

  if (nextCursor === null) {
    return true;
  }

  const currentDecimal = parseDecimalHistoryCursor(currentCursor);
  const nextDecimal = parseDecimalHistoryCursor(nextCursor);

  if (currentDecimal !== null && nextDecimal !== null) {
    return nextDecimal < currentDecimal;
  }

  if (currentDecimal !== null) {
    return true;
  }

  const currentOrdinal = parseTrailingOrdinalCursor(currentCursor);
  const nextOrdinal = parseTrailingOrdinalCursor(nextCursor);

  return (
    currentOrdinal !== null &&
    nextOrdinal !== null &&
    currentOrdinal.prefix === nextOrdinal.prefix &&
    nextOrdinal.value < currentOrdinal.value
  );
};

const normalizeLabelIds = (labelIds: ReadonlyArray<string>) => {
  const normalized = [...new Set(labelIds)];

  normalized.sort((left, right) => left.localeCompare(right));

  return normalized;
};

const reverseCopy = <T>(values: ReadonlyArray<T>) =>
  values.reduceRight<T[]>((reversed, value) => {
    reversed.push(value);

    return reversed;
  }, []);

const buildGeneratedSnapshot = (
  tc: hegel.TestCase,
  options: Readonly<{
    minMessages?: number;
  }> = {},
) => {
  const threadCount = tc.draw(gs.integers({ minValue: 1, maxValue: 3 }));
  const messageIndexes = tc.draw(
    gs.arrays(gs.sampledFrom(providerMessageIdIndexes), {
      minSize: options.minMessages ?? 0,
      maxSize: 6,
      unique: true,
    }),
  );
  const messages = messageIndexes.map((messageIndex) => {
    const threadIndex = tc.draw(gs.sampledFrom(providerMessageIdIndexes.slice(0, threadCount)));
    const receivedAt = tc.draw(gs.sampledFrom(receivedAtValues));
    const labelIds = tc.draw(gs.arrays(labelIdGen, { maxSize: 6 }));

    return {
      id: `msg_${messageIndex}`,
      threadId: `thr_${threadIndex}`,
      providerMessageId: `gmail_msg_${messageIndex}`,
      providerThreadId: `gmail_thr_${threadIndex}`,
      subject: `Subject ${threadIndex}.${messageIndex}`,
      from: {
        name: "Mailmon PBT",
        email: "pbt@mailmon.dev",
      },
      snippet: `Generated message ${messageIndex}`,
      receivedAt,
      labelIds,
    };
  });
  const latestMessageByProviderThreadId = new Map<string, (typeof messages)[number]>();

  for (const message of messages) {
    const existing = latestMessageByProviderThreadId.get(message.providerThreadId);

    if (
      existing === undefined ||
      Date.parse(message.receivedAt) > Date.parse(existing.receivedAt) ||
      (message.receivedAt === existing.receivedAt && message.id > existing.id)
    ) {
      latestMessageByProviderThreadId.set(message.providerThreadId, message);
    }
  }

  const threads = [...latestMessageByProviderThreadId.values()].map((message) => ({
    id: message.threadId,
    providerThreadId: message.providerThreadId,
    subject: message.subject,
    lastMessageAt: message.receivedAt,
  }));

  threads.sort((left, right) => left.providerThreadId.localeCompare(right.providerThreadId));
  const selectedProviderMessageIds = new Set(messages.map((message) => message.providerMessageId));
  const unusedProviderMessageIds = providerMessageIdIndexes
    .map((index) => `gmail_msg_${index}`)
    .filter((providerMessageId) => !selectedProviderMessageIds.has(providerMessageId));
  const deletedProviderMessageIds =
    unusedProviderMessageIds.length === 0
      ? []
      : tc.draw(
          gs.arrays(gs.sampledFrom(unusedProviderMessageIds), {
            maxSize: unusedProviderMessageIds.length,
            unique: true,
          }),
        );

  return {
    deletedProviderMessageIds,
    messages,
    threads,
  } satisfies MailboxSyncSnapshot;
};

const toEquivalentSnapshotWithLabelNoise = (
  snapshot: MailboxSyncSnapshot,
): MailboxSyncSnapshot => ({
  deletedProviderMessageIds: reverseCopy(snapshot.deletedProviderMessageIds),
  threads: reverseCopy(snapshot.threads),
  messages: reverseCopy(snapshot.messages).map((message) => ({
    ...message,
    labelIds: reverseCopy(message.labelIds).flatMap((labelId, index) =>
      index % 2 === 0 ? [labelId, labelId] : [labelId],
    ),
  })),
});

const seedMailboxFixture = async (
  connectionString: string,
  options: Readonly<{
    cursor?: string | null;
  }> = {},
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
      mailboxExternalId: "mailbox_external_commit_pbt",
      emailAddress: "commit-pbt@mailmon.dev",
      ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
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
    expiresAt?: Date;
    insertSyncRun?: boolean;
  }>,
) => {
  const database = createDb(connectionString);

  try {
    const heartbeatAt = new Date();
    const expiresAt = params.expiresAt ?? new Date(heartbeatAt.getTime() + 5 * 60_000);

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
    leaseOwnerId: string;
    nextCursor: string | null;
    snapshot: MailboxSyncSnapshot;
    syncRunId: string;
    syncedAt: string;
  }>,
) =>
  Effect.gen(function* () {
    const mailboxStateStore = yield* MailboxStateStore;

    return yield* mailboxStateStore.applySyncResult({
      eventsEmitted: params.snapshot.messages.length,
      mailboxId,
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

const fetchCommitState = async (connectionString: string) => {
  const database = createDb(connectionString);

  try {
    const [mailbox] = await database.db
      .select()
      .from(schema.mailboxes)
      .where(eq(schema.mailboxes.id, mailboxId))
      .limit(1);
    const syncRuns = await database.db
      .select()
      .from(schema.syncRuns)
      .orderBy(asc(schema.syncRuns.startedAt), asc(schema.syncRuns.id));
    const messages = await database.db
      .select()
      .from(schema.messages)
      .orderBy(asc(schema.messages.providerMessageId));
    const threads = await database.db
      .select()
      .from(schema.threads)
      .orderBy(asc(schema.threads.providerThreadId));
    const mailboxEvents = await database.db
      .select()
      .from(schema.mailboxEvents)
      .orderBy(asc(schema.mailboxEvents.occurredAt), asc(schema.mailboxEvents.id));

    return {
      mailbox,
      mailboxEvents,
      messages,
      syncRuns,
      threads,
    };
  } finally {
    await database.client.end();
  }
};

const expectNoCanonicalRowsOrEvents = (state: Awaited<ReturnType<typeof fetchCommitState>>) => {
  expect(state.mailboxEvents).toEqual([]);
  expect(state.messages).toEqual([]);
  expect(state.threads).toEqual([]);
};

const expectCommittedSnapshotState = (
  state: Awaited<ReturnType<typeof fetchCommitState>>,
  params: Readonly<{
    commitResult: MailboxSyncCommitResult;
    nextCursor: string | null;
    snapshot: MailboxSyncSnapshot;
    syncRunId: string;
    syncedAt: string;
  }>,
) => {
  expect(params.commitResult.applied).toBe(true);
  expect(state.mailbox?.cursor).toBe(params.nextCursor);
  expect(state.mailbox?.initializedAt?.toISOString()).toBe(params.syncedAt);
  expect(state.mailbox?.lastSuccessfulSyncAt?.toISOString()).toBe(params.syncedAt);
  expect(state.mailbox?.activeSyncLeaseOwner).toBeNull();
  expect(state.mailbox?.activeSyncRunId).toBeNull();

  const syncRun = state.syncRuns.find((candidate) => candidate.id === params.syncRunId);

  expect(syncRun).toEqual(
    expect.objectContaining({
      id: params.syncRunId,
      status: "completed",
      eventsEmitted: String(state.mailboxEvents.length),
      nextCursor: params.nextCursor,
      detail: null,
    }),
  );
  expect(new Set(state.mailboxEvents.map((event) => event.id))).toEqual(
    new Set(params.commitResult.mailboxEventIds),
  );
  expect(params.commitResult.mailboxEventIds).toHaveLength(state.mailboxEvents.length);
  expect(state.mailboxEvents).toHaveLength(
    params.snapshot.messages.length + params.snapshot.threads.length,
  );
  expect(state.messages).toHaveLength(params.snapshot.messages.length);
  expect(state.threads).toHaveLength(params.snapshot.threads.length);

  for (const message of params.snapshot.messages) {
    const storedMessage = state.messages.find(
      (candidate) => candidate.providerMessageId === message.providerMessageId,
    );

    expect(storedMessage).toEqual(
      expect.objectContaining({
        id: message.id,
        threadId: message.threadId,
        providerThreadId: message.providerThreadId,
        subject: message.subject,
        snippet: message.snippet,
        labelIds: normalizeLabelIds(message.labelIds),
      }),
    );
    expect(storedMessage?.receivedAt.toISOString()).toBe(message.receivedAt);
  }

  for (const thread of params.snapshot.threads) {
    const storedThread = state.threads.find(
      (candidate) => candidate.providerThreadId === thread.providerThreadId,
    );

    expect(storedThread).toEqual(
      expect.objectContaining({
        id: thread.id,
        subject: thread.subject,
      }),
    );
    expect(storedThread?.lastMessageAt.toISOString()).toBe(thread.lastMessageAt);
  }

  for (const event of state.mailboxEvents) {
    expect(event.payload.id).toBe(event.id);
    expect(event.payload.schemaVersion).toBe(1);
    expect(event.payload.workspaceId).toBe(workspaceId);
    expect(event.payload.tenantExternalId).toBe(tenantExternalId);
    expect(event.payload.mailboxId).toBe(mailboxId);

    if ("labelIds" in event.payload.data) {
      expect(event.payload.data.labelIds).toEqual(normalizeLabelIds(event.payload.data.labelIds));
    }
  }
};

describe("DB-backed mailbox sync commit properties", () => {
  it(
    "cursor-never-regresses keeps generated cursor commits monotonic",
    () =>
      hegel.testAsync(async (tc) => {
        const currentCursor = tc.draw(cursorGen);
        const nextCursor = tc.draw(cursorGen);
        const snapshot = buildGeneratedSnapshot(tc);
        const shouldRegress = expectedCursorRegression(currentCursor, nextCursor);

        notePbtCase(tc, "cursor-never-regresses", {
          family: "db-mailbox-commit-cursor-pair",
          currentCursor,
          nextCursor,
          shouldRegress,
          messageCount: snapshot.messages.length,
          threadCount: snapshot.threads.length,
          deletedProviderMessageIds: snapshot.deletedProviderMessageIds,
        });

        await withIsolatedDatabasePromise(async ({ connectionString }) => {
          const syncRunId = "sr_cursor_pbt";

          await seedMailboxFixture(connectionString, { cursor: currentCursor });
          await armMailboxSync(connectionString, { syncRunId, leaseOwnerId: activeLeaseOwnerId });
          const stateBeforeCommit = await fetchCommitState(connectionString);

          if (shouldRegress) {
            const problem = await Effect.runPromise(
              applyMailboxSyncResult(connectionString, {
                leaseOwnerId: activeLeaseOwnerId,
                nextCursor,
                snapshot,
                syncRunId,
                syncedAt: "2026-04-09T09:30:00.000Z",
              }).pipe(Effect.flip),
            );
            const stateAfterCommit = await fetchCommitState(connectionString);

            expect(problem.code).toBe("mailbox_cursor_regressed");
            expect(stateAfterCommit).toEqual(stateBeforeCommit);
            return;
          }

          const commitResult = await Effect.runPromise(
            applyMailboxSyncResult(connectionString, {
              leaseOwnerId: activeLeaseOwnerId,
              nextCursor,
              snapshot,
              syncRunId,
              syncedAt: "2026-04-09T09:30:00.000Z",
            }),
          );
          const stateAfterCommit = await fetchCommitState(connectionString);

          expectCommittedSnapshotState(stateAfterCommit, {
            commitResult,
            nextCursor,
            snapshot,
            syncRunId,
            syncedAt: "2026-04-09T09:30:00.000Z",
          });
        });
      }, hegelSettings),
    120_000,
  );

  it(
    "lease-loss-prevents-stale-commit rejects generated stale owners and expired leases",
    () =>
      hegel.testAsync(async (tc) => {
        const staleFamily = tc.draw(
          gs.sampledFrom(["wrong-owner", "expired-owner", "wrong-and-expired"] as const),
        );
        const currentCursor = tc.draw(cursorGen);
        const nextCursor = tc.draw(cursorGen);
        const snapshot = buildGeneratedSnapshot(tc);

        notePbtCase(tc, "lease-loss-prevents-stale-commit", {
          family: staleFamily,
          currentCursor,
          nextCursor,
          messageCount: snapshot.messages.length,
          threadCount: snapshot.threads.length,
          deletedProviderMessageIds: snapshot.deletedProviderMessageIds,
        });

        await withIsolatedDatabasePromise(async ({ connectionString }) => {
          const syncRunId = "sr_stale_lease_pbt";
          const leaseOwnerId =
            staleFamily === "wrong-owner" || staleFamily === "wrong-and-expired"
              ? staleLeaseOwnerId
              : activeLeaseOwnerId;
          const expiresAt =
            staleFamily === "expired-owner" || staleFamily === "wrong-and-expired"
              ? new Date("2000-01-01T00:00:00.000Z")
              : undefined;

          await seedMailboxFixture(connectionString, { cursor: currentCursor });
          await armMailboxSync(connectionString, {
            syncRunId,
            leaseOwnerId: activeLeaseOwnerId,
            expiresAt,
          });
          const commitResult = await Effect.runPromise(
            applyMailboxSyncResult(connectionString, {
              leaseOwnerId,
              nextCursor,
              snapshot,
              syncRunId,
              syncedAt: "2026-04-09T09:31:00.000Z",
            }),
          );
          const stateAfterCommit = await fetchCommitState(connectionString);
          const syncRun = stateAfterCommit.syncRuns.find((candidate) => candidate.id === syncRunId);

          expect(commitResult).toEqual({
            applied: false,
            mailboxEventIds: [],
          });
          expect(stateAfterCommit.mailbox?.cursor).toBe(currentCursor);
          expect(stateAfterCommit.mailbox?.activeSyncLeaseOwner).toBe(activeLeaseOwnerId);
          expect(stateAfterCommit.mailbox?.activeSyncRunId).toBe(syncRunId);
          expect(stateAfterCommit.mailbox?.lastSuccessfulSyncAt).toBeNull();
          expect(syncRun).toEqual(
            expect.objectContaining({
              id: syncRunId,
              status: "running",
              nextCursor: null,
            }),
          );
          expectNoCanonicalRowsOrEvents(stateAfterCommit);
        });
      }, hegelSettings),
    120_000,
  );

  it(
    "state-cursor-events-commit-atomically applies generated snapshots and rolls back failed finalization",
    () =>
      hegel.testAsync(async (tc) => {
        const nextCursor = tc.draw(cursorGen);
        const snapshot = buildGeneratedSnapshot(tc);
        const rollbackSnapshot = buildGeneratedSnapshot(tc);

        notePbtCase(tc, "state-cursor-events-commit-atomically", {
          family: "db-mailbox-commit-success-and-missing-sync-run-rollback",
          nextCursor,
          messageCount: snapshot.messages.length,
          threadCount: snapshot.threads.length,
          rollbackMessageCount: rollbackSnapshot.messages.length,
          rollbackThreadCount: rollbackSnapshot.threads.length,
        });

        await withIsolatedDatabasePromise(async ({ connectionString }) => {
          const syncRunId = "sr_atomic_pbt";
          const missingSyncRunId = "sr_atomic_missing_pbt";

          await seedMailboxFixture(connectionString);
          await armMailboxSync(connectionString, { syncRunId, leaseOwnerId: activeLeaseOwnerId });
          const commitResult = await Effect.runPromise(
            applyMailboxSyncResult(connectionString, {
              leaseOwnerId: activeLeaseOwnerId,
              nextCursor,
              snapshot,
              syncRunId,
              syncedAt: "2026-04-09T09:32:00.000Z",
            }),
          );
          const stateAfterSuccess = await fetchCommitState(connectionString);

          expectCommittedSnapshotState(stateAfterSuccess, {
            commitResult,
            nextCursor,
            snapshot,
            syncRunId,
            syncedAt: "2026-04-09T09:32:00.000Z",
          });

          await armMailboxSync(connectionString, {
            syncRunId: missingSyncRunId,
            leaseOwnerId: activeLeaseOwnerId,
            insertSyncRun: false,
          });
          const stateBeforeRollbackCommit = await fetchCommitState(connectionString);
          const rollbackExit = await Effect.runPromise(
            applyMailboxSyncResult(connectionString, {
              leaseOwnerId: activeLeaseOwnerId,
              nextCursor,
              snapshot: rollbackSnapshot,
              syncRunId: missingSyncRunId,
              syncedAt: "2026-04-09T09:33:00.000Z",
            }).pipe(Effect.exit),
          );
          const stateAfterRollbackCommit = await fetchCommitState(connectionString);

          expect(rollbackExit._tag).toBe("Failure");
          expect(stateAfterRollbackCommit).toEqual(stateBeforeRollbackCommit);
        });
      }, hegelSettings),
    120_000,
  );

  it(
    "sync-snapshot-application-is-idempotent and label-ids-are-normalized reapply equivalent snapshots without false events",
    () =>
      hegel.testAsync(async (tc) => {
        const firstCursor = tc.draw(cursorGen);
        const secondCursor = tc.draw(cursorGen);
        const snapshot = buildGeneratedSnapshot(tc, { minMessages: 1 });
        const equivalentSnapshot = toEquivalentSnapshotWithLabelNoise(snapshot);

        notePbtCase(tc, "sync-snapshot-application-is-idempotent", {
          family: "db-equivalent-snapshot-label-noise",
          firstCursor,
          secondCursor,
          messageLabelIds: snapshot.messages.map((message) => message.labelIds),
          equivalentMessageLabelIds: equivalentSnapshot.messages.map((message) => message.labelIds),
        });
        notePbtCase(tc, "label-ids-are-normalized", {
          family: "db-equivalent-snapshot-label-noise",
          messageLabelIds: snapshot.messages.map((message) => message.labelIds),
          equivalentMessageLabelIds: equivalentSnapshot.messages.map((message) => message.labelIds),
        });

        await withIsolatedDatabasePromise(async ({ connectionString }) => {
          const initialSyncRunId = "sr_idempotent_initial_pbt";
          const duplicateSyncRunId = "sr_idempotent_duplicate_pbt";
          const duplicateCursor = expectedCursorRegression(firstCursor, secondCursor)
            ? firstCursor
            : secondCursor;

          await seedMailboxFixture(connectionString);
          await armMailboxSync(connectionString, {
            syncRunId: initialSyncRunId,
            leaseOwnerId: activeLeaseOwnerId,
          });
          await Effect.runPromise(
            applyMailboxSyncResult(connectionString, {
              leaseOwnerId: activeLeaseOwnerId,
              nextCursor: firstCursor,
              snapshot,
              syncRunId: initialSyncRunId,
              syncedAt: "2026-04-09T09:34:00.000Z",
            }),
          );
          const stateAfterInitialCommit = await fetchCommitState(connectionString);

          await armMailboxSync(connectionString, {
            syncRunId: duplicateSyncRunId,
            leaseOwnerId: activeLeaseOwnerId,
          });
          const duplicateCommitResult = await Effect.runPromise(
            applyMailboxSyncResult(connectionString, {
              leaseOwnerId: activeLeaseOwnerId,
              nextCursor: duplicateCursor,
              snapshot: equivalentSnapshot,
              syncRunId: duplicateSyncRunId,
              syncedAt: "2026-04-09T09:35:00.000Z",
            }),
          );
          const stateAfterDuplicateCommit = await fetchCommitState(connectionString);

          expect(duplicateCommitResult).toEqual({
            applied: true,
            mailboxEventIds: [],
          });
          expect(stateAfterDuplicateCommit.mailboxEvents).toEqual(
            stateAfterInitialCommit.mailboxEvents,
          );
          expect(stateAfterDuplicateCommit.messages).toHaveLength(
            stateAfterInitialCommit.messages.length,
          );
          expect(stateAfterDuplicateCommit.threads).toHaveLength(
            stateAfterInitialCommit.threads.length,
          );

          for (const message of stateAfterDuplicateCommit.messages) {
            expect(message.labelIds).toEqual(normalizeLabelIds(message.labelIds));
          }

          const duplicateSyncRun = stateAfterDuplicateCommit.syncRuns.find(
            (candidate) => candidate.id === duplicateSyncRunId,
          );

          expect(duplicateSyncRun).toEqual(
            expect.objectContaining({
              id: duplicateSyncRunId,
              status: "completed",
              eventsEmitted: "0",
              nextCursor: duplicateCursor,
            }),
          );
        });
      }, hegelSettings),
    120_000,
  );
});
