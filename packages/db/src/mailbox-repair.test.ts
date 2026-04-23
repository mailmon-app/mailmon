import { describe, expect, it } from "@effect/vitest";
import { MailboxRepairStore, SyncRunStore } from "@mailmon/core";
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
