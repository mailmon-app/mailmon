import { recordMailboxSyncDispatchExhausted } from "@mailmon/core";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";
import { withIsolatedDatabasePromise } from "./test-setup.js";

const workspaceId = "ws_sync_dispatch_exhaustion";
const mailboxId = "mbx_sync_dispatch_exhaustion";
const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});

describe("MailboxSyncDispatchExhaustionStore", () => {
  it("atomically records dispatch retry exhaustion as a completed sync run and mailbox Last Error", async () => {
    await withIsolatedDatabasePromise(async (database) => {
      const db = createDb(database.connectionString);

      try {
        await db.db.insert(schema.workspaces).values({
          id: workspaceId,
        });
        await db.db.insert(schema.mailboxes).values({
          id: mailboxId,
          workspaceId,
          provider: "gmail",
          tenantExternalId: "tenant_sync_dispatch_exhaustion",
          mailboxExternalId: "mailbox_sync_dispatch_exhaustion",
          emailAddress: "dispatch-exhaustion@mailmon.dev",
          status: "active",
          syncState: "healthy",
          watchState: "active",
          cursor: "hist_123",
          activeSyncLeaseOwner: "lease_existing",
          activeSyncRunId: "sr_existing",
        });

        const result = await Effect.runPromise(
          recordMailboxSyncDispatchExhausted(mailboxId).pipe(
            Effect.provide(
              createCorePersistenceLayer(database.connectionString).pipe(
                Layer.provide(testGmailRefreshTokenCipherLayer),
              ),
            ),
          ),
        );

        const [mailbox] = await db.db.select().from(schema.mailboxes);
        const [syncRun] = await db.db.select().from(schema.syncRuns);

        expect(result.status).toBe("recorded");
        expect(syncRun).toMatchObject({
          id: result.syncRunId,
          mailboxId,
          status: "dispatch_retry_exhausted",
          eventsEmitted: "0",
          previousCursor: "hist_123",
          nextCursor: "hist_123",
          detail: "mailbox_sync_dispatch_retry_exhausted",
        });
        expect(syncRun?.completedAt).toBeInstanceOf(Date);
        expect(mailbox).toMatchObject({
          id: mailboxId,
          status: "active",
          syncState: "failed",
          cursor: "hist_123",
          activeSyncLeaseOwner: "lease_existing",
          activeSyncRunId: "sr_existing",
          lastErrorCode: "mailbox_sync_dispatch_retry_exhausted",
          lastErrorRetryable: true,
        });
      } finally {
        await db.client.end();
      }
    });
  });
});
