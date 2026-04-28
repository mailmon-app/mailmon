import { describe, expect, it } from "@effect/vitest";
import { MailboxExecutionRecoveryStore, MailboxRepairStore, SyncRunStore } from "@mailmon/core";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { createDb, createWorkerPersistenceLayer, schema } from "./index.js";
import { withIsolatedDatabaseEffect } from "./test-setup.js";

const workspaceId = "ws_mailbox_repair";
const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});

const seedMailboxRepairFixtures = async (connectionString: string) => {
  const database = createDb(connectionString);
  const createdAt = new Date("2026-04-22T00:00:00.000Z");

  try {
    await database.db.insert(schema.workspaces).values({
      id: workspaceId,
    });

    await database.db.insert(schema.mailboxes).values([
      {
        id: "mbx_invalid_cursor",
        workspaceId,
        provider: "gmail",
        tenantExternalId: "tenant_invalid_cursor",
        mailboxExternalId: "mailbox_invalid_cursor",
        emailAddress: "invalid-cursor@mailmon.dev",
        status: "active",
        syncState: "failed",
        watchState: "active",
        cursor: "hist_invalid",
        lastErrorCode: "gmail_history_cursor_invalid",
        lastErrorMessage: "Stored Gmail history cursor is invalid.",
        lastErrorOccurredAt: new Date("2026-04-22T00:01:00.000Z"),
        lastErrorRetryable: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "mbx_watch_expired",
        workspaceId,
        provider: "gmail",
        tenantExternalId: "tenant_watch_expired",
        mailboxExternalId: "mailbox_watch_expired",
        emailAddress: "watch-expired@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "expired",
        watchExpirationAt: new Date("2026-04-21T23:59:00.000Z"),
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "mbx_watch_unhealthy",
        workspaceId,
        provider: "gmail",
        tenantExternalId: "tenant_watch_unhealthy",
        mailboxExternalId: "mailbox_watch_unhealthy",
        emailAddress: "watch-unhealthy@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "unhealthy",
        watchExpirationAt: new Date("2026-04-23T00:00:00.000Z"),
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "mbx_healthy",
        workspaceId,
        provider: "gmail",
        tenantExternalId: "tenant_healthy",
        mailboxExternalId: "mailbox_healthy",
        emailAddress: "healthy@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
        cursor: "hist_healthy",
        createdAt,
        updatedAt: createdAt,
      },
    ]);
  } finally {
    await database.client.end();
  }
};

const seedStuckMailboxSyncExecutionFixtures = async (connectionString: string) => {
  const database = createDb(connectionString);
  const createdAt = new Date("2026-04-22T00:00:00.000Z");

  try {
    await database.db.insert(schema.workspaces).values({
      id: workspaceId,
    });

    await database.db.insert(schema.mailboxes).values([
      {
        id: "mbx_stuck",
        workspaceId,
        provider: "gmail",
        tenantExternalId: "tenant_stuck",
        mailboxExternalId: "mailbox_stuck",
        emailAddress: "stuck@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
        activeSyncLeaseOwner: "worker_dead",
        activeSyncRunId: "sr_stuck",
        activeSyncLeaseAcquiredAt: new Date("2026-04-22T00:01:00.000Z"),
        activeSyncLeaseHeartbeatAt: new Date("2026-04-22T00:01:30.000Z"),
        activeSyncLeaseExpiresAt: new Date("2026-04-22T00:02:00.000Z"),
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "mbx_active_lease",
        workspaceId,
        provider: "gmail",
        tenantExternalId: "tenant_active_lease",
        mailboxExternalId: "mailbox_active_lease",
        emailAddress: "active-lease@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
        activeSyncLeaseOwner: "worker_alive",
        activeSyncRunId: "sr_active_lease",
        activeSyncLeaseAcquiredAt: new Date("2026-04-22T00:09:00.000Z"),
        activeSyncLeaseHeartbeatAt: new Date("2026-04-22T00:09:30.000Z"),
        activeSyncLeaseExpiresAt: new Date("2026-04-22T00:20:00.000Z"),
        createdAt,
        updatedAt: createdAt,
      },
    ]);

    await database.db.insert(schema.syncRuns).values([
      {
        id: "sr_stuck",
        mailboxId: "mbx_stuck",
        status: "running",
        leaseOwnerId: "worker_dead",
        startedAt: new Date("2026-04-22T00:01:00.000Z"),
      },
      {
        id: "sr_active_lease",
        mailboxId: "mbx_active_lease",
        status: "running",
        leaseOwnerId: "worker_alive",
        startedAt: new Date("2026-04-22T00:09:00.000Z"),
      },
    ]);
  } finally {
    await database.client.end();
  }
};

describe("mailbox repair store", () => {
  it.effect("lists repair candidates and resets invalid cursors for repair", () =>
    withIsolatedDatabaseEffect((database) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedMailboxRepairFixtures(database.connectionString));

        const persistenceLayer = createWorkerPersistenceLayer(database.connectionString).pipe(
          Layer.provide(testGmailRefreshTokenCipherLayer),
        );

        const targets = yield* Effect.gen(function* () {
          const repairStore = yield* MailboxRepairStore;

          return yield* repairStore.listMailboxesNeedingRepair({
            limit: 10,
            observedAt: "2026-04-22T02:00:00.000Z",
          });
        }).pipe(Effect.provide(persistenceLayer));

        expect(targets.map((target) => target.mailbox.id)).toEqual([
          "mbx_invalid_cursor",
          "mbx_watch_expired",
          "mbx_watch_unhealthy",
        ]);
        expect(targets.map((target) => target.reason)).toEqual([
          "invalid_cursor",
          "watch_expired",
          "watch_unhealthy",
        ]);
        expect(targets.map((target) => target.requiresCursorReset)).toEqual([true, false, false]);

        const prepared = yield* Effect.gen(function* () {
          const repairStore = yield* MailboxRepairStore;

          return yield* repairStore.prepareMailboxForRepair({
            mailboxId: "mbx_invalid_cursor",
            observedAt: "2026-04-22T02:05:00.000Z",
            resetCursor: true,
          });
        }).pipe(Effect.provide(persistenceLayer));

        expect(prepared).toBe(true);

        const repairedMailbox = yield* Effect.promise(async () => {
          const verificationDatabase = createDb(database.connectionString);

          try {
            const [row] = await verificationDatabase.db
              .select({
                cursor: schema.mailboxes.cursor,
                syncState: schema.mailboxes.syncState,
              })
              .from(schema.mailboxes)
              .where(eq(schema.mailboxes.id, "mbx_invalid_cursor"))
              .limit(1);

            return row;
          } finally {
            await verificationDatabase.client.end();
          }
        });

        expect(repairedMailbox).toEqual({
          cursor: null,
          syncState: "lagging",
        });
      }),
    ),
  );

  it.effect("marks invalid Gmail history cursor failures as lagging mailbox state", () =>
    withIsolatedDatabaseEffect((database) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedMailboxRepairFixtures(database.connectionString));

        const persistenceLayer = createWorkerPersistenceLayer(database.connectionString).pipe(
          Layer.provide(testGmailRefreshTokenCipherLayer),
        );

        yield* Effect.gen(function* () {
          const syncRunStore = yield* SyncRunStore;
          const started = yield* syncRunStore.startSyncRun("mbx_healthy");

          yield* syncRunStore.completeSyncRun({
            syncRunId: started.syncRunId,
            mailboxId: started.mailboxId,
            completedAt: "2026-04-22T03:00:00.000Z",
            status: "failed_after_lease_acquired",
            eventsEmitted: 0,
            nextCursor: null,
            detail: "gmail_history_cursor_invalid",
          });
        }).pipe(Effect.provide(persistenceLayer));

        const unhealthyMailbox = yield* Effect.promise(async () => {
          const verificationDatabase = createDb(database.connectionString);

          try {
            const [row] = await verificationDatabase.db
              .select({
                lastErrorCode: schema.mailboxes.lastErrorCode,
                lastErrorRetryable: schema.mailboxes.lastErrorRetryable,
                syncState: schema.mailboxes.syncState,
              })
              .from(schema.mailboxes)
              .where(eq(schema.mailboxes.id, "mbx_healthy"))
              .limit(1);

            return row;
          } finally {
            await verificationDatabase.client.end();
          }
        });

        expect(unhealthyMailbox).toEqual({
          lastErrorCode: "gmail_history_cursor_invalid",
          lastErrorRetryable: true,
          syncState: "lagging",
        });
      }),
    ),
  );

  it.effect("marks Gmail rate-limited sync failures as lagging mailbox state", () =>
    withIsolatedDatabaseEffect((database) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => seedMailboxRepairFixtures(database.connectionString));

        const persistenceLayer = createWorkerPersistenceLayer(database.connectionString).pipe(
          Layer.provide(testGmailRefreshTokenCipherLayer),
        );

        yield* Effect.gen(function* () {
          const syncRunStore = yield* SyncRunStore;
          const started = yield* syncRunStore.startSyncRun("mbx_healthy");

          yield* syncRunStore.completeSyncRun({
            syncRunId: started.syncRunId,
            mailboxId: started.mailboxId,
            completedAt: "2026-04-22T03:30:00.000Z",
            status: "failed_after_lease_acquired",
            eventsEmitted: 0,
            nextCursor: null,
            detail: "gmail_rate_limited",
          });
        }).pipe(Effect.provide(persistenceLayer));

        const unhealthyMailbox = yield* Effect.promise(async () => {
          const verificationDatabase = createDb(database.connectionString);

          try {
            const [row] = await verificationDatabase.db
              .select({
                lastErrorCode: schema.mailboxes.lastErrorCode,
                lastErrorMessage: schema.mailboxes.lastErrorMessage,
                lastErrorRetryable: schema.mailboxes.lastErrorRetryable,
                syncState: schema.mailboxes.syncState,
              })
              .from(schema.mailboxes)
              .where(eq(schema.mailboxes.id, "mbx_healthy"))
              .limit(1);

            return row;
          } finally {
            await verificationDatabase.client.end();
          }
        });

        expect(unhealthyMailbox).toEqual({
          lastErrorCode: "gmail_rate_limited",
          lastErrorMessage: "Gmail temporarily rate-limited sync operations for this mailbox.",
          lastErrorRetryable: true,
          syncState: "lagging",
        });
      }),
    ),
  );
});

describe("mailbox execution recovery store", () => {
  it.effect("claims stuck mailbox executions once and recovers stale running sync runs", () =>
    withIsolatedDatabaseEffect((database) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          seedStuckMailboxSyncExecutionFixtures(database.connectionString),
        );

        const persistenceLayer = createWorkerPersistenceLayer(database.connectionString).pipe(
          Layer.provide(testGmailRefreshTokenCipherLayer),
        );

        const targets = yield* Effect.gen(function* () {
          const recoveryStore = yield* MailboxExecutionRecoveryStore;

          return yield* recoveryStore.listStuckMailboxSyncExecutions({
            limit: 10,
            observedAt: "2026-04-22T00:10:00.000Z",
            staleThresholdMs: 0,
          });
        }).pipe(Effect.provide(persistenceLayer));

        expect(targets.map((target) => target.mailbox.id)).toEqual(["mbx_stuck"]);
        expect(targets.map((target) => target.syncRunId)).toEqual(["sr_stuck"]);

        const recoverOnce = Effect.gen(function* () {
          const recoveryStore = yield* MailboxExecutionRecoveryStore;

          return yield* recoveryStore.recoverStuckMailboxSyncExecution({
            mailboxId: "mbx_stuck",
            observedAt: "2026-04-22T00:10:00.000Z",
            syncRunId: "sr_stuck",
          });
        }).pipe(Effect.provide(persistenceLayer));

        const results = yield* Effect.promise(() =>
          Promise.all([Effect.runPromise(recoverOnce), Effect.runPromise(recoverOnce)]),
        );

        expect(results.filter(Boolean)).toHaveLength(1);

        const recoveredState = yield* Effect.promise(async () => {
          const verificationDatabase = createDb(database.connectionString);

          try {
            const [mailbox] = await verificationDatabase.db
              .select({
                activeSyncLeaseAcquiredAt: schema.mailboxes.activeSyncLeaseAcquiredAt,
                activeSyncLeaseExpiresAt: schema.mailboxes.activeSyncLeaseExpiresAt,
                activeSyncLeaseHeartbeatAt: schema.mailboxes.activeSyncLeaseHeartbeatAt,
                activeSyncLeaseOwner: schema.mailboxes.activeSyncLeaseOwner,
                activeSyncRunId: schema.mailboxes.activeSyncRunId,
                lastErrorCode: schema.mailboxes.lastErrorCode,
                lastErrorRetryable: schema.mailboxes.lastErrorRetryable,
                syncState: schema.mailboxes.syncState,
              })
              .from(schema.mailboxes)
              .where(eq(schema.mailboxes.id, "mbx_stuck"))
              .limit(1);
            const [syncRun] = await verificationDatabase.db
              .select({
                completedAt: schema.syncRuns.completedAt,
                detail: schema.syncRuns.detail,
                eventsEmitted: schema.syncRuns.eventsEmitted,
                status: schema.syncRuns.status,
              })
              .from(schema.syncRuns)
              .where(eq(schema.syncRuns.id, "sr_stuck"))
              .limit(1);

            return { mailbox, syncRun };
          } finally {
            await verificationDatabase.client.end();
          }
        });

        expect(recoveredState.mailbox).toEqual({
          activeSyncLeaseAcquiredAt: null,
          activeSyncLeaseExpiresAt: null,
          activeSyncLeaseHeartbeatAt: null,
          activeSyncLeaseOwner: null,
          activeSyncRunId: null,
          lastErrorCode: "stuck_mailbox_execution_recovered",
          lastErrorRetryable: true,
          syncState: "lagging",
        });
        expect(recoveredState.syncRun).toMatchObject({
          detail: "stuck_mailbox_execution_recovered",
          eventsEmitted: "0",
          status: "lease_lost",
        });
        expect(recoveredState.syncRun?.completedAt).toEqual(new Date("2026-04-22T00:10:00.000Z"));
      }),
    ),
  );

  it.effect("does not recover a mailbox whose active lease has not expired", () =>
    withIsolatedDatabaseEffect((database) =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          seedStuckMailboxSyncExecutionFixtures(database.connectionString),
        );

        const persistenceLayer = createWorkerPersistenceLayer(database.connectionString).pipe(
          Layer.provide(testGmailRefreshTokenCipherLayer),
        );

        const recovered = yield* Effect.gen(function* () {
          const recoveryStore = yield* MailboxExecutionRecoveryStore;

          return yield* recoveryStore.recoverStuckMailboxSyncExecution({
            mailboxId: "mbx_active_lease",
            observedAt: "2026-04-22T00:10:00.000Z",
            syncRunId: "sr_active_lease",
          });
        }).pipe(Effect.provide(persistenceLayer));

        expect(recovered).toBe(false);
      }),
    ),
  );
});
