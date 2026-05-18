import { describe, expect, it } from "@effect/vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import {
  MailboxStateStore,
  MailboxSyncLeaseTiming,
  MailboxSyncProvider,
  WebhookDeliveryScheduler,
  runMailboxSync,
  type MailboxSyncSnapshot,
} from "@mailmon/core";
import { createAesGcmGmailRefreshTokenCipherLayer } from "@mailmon/gmail";
import { asc, eq } from "drizzle-orm";
import { Duration, Effect, Layer } from "effect";

import { createCorePersistenceLayer, createDb, schema } from "./index.js";
import { hegelSettings, notePbtCase } from "./test-hegel.js";
import { withIsolatedDatabasePromise } from "./test-setup.js";

const workspaceId = "ws_single_flight_pbt";
const mailboxId = "mbx_single_flight_pbt";
const tenantExternalId = "tenant_single_flight_pbt";
const staleSyncRunId = "sr_stale_single_flight_pbt";
const staleLeaseOwnerId = "lease_stale_single_flight_pbt";

const testGmailRefreshTokenCipherLayer = createAesGcmGmailRefreshTokenCipherLayer({
  allowPlaintextFallback: true,
  encryptionKey: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
});

const providerDelayMsGen = gs.sampledFrom([25, 50, 75] as const);

const buildProviderSnapshot = (providerCallIndex: number): MailboxSyncSnapshot => {
  const threadId = `thr_single_flight_${providerCallIndex}`;
  const providerThreadId = `gmail_thr_single_flight_${providerCallIndex}`;
  const messageId = `msg_single_flight_${providerCallIndex}`;
  const providerMessageId = `gmail_msg_single_flight_${providerCallIndex}`;

  return {
    deletedProviderMessageIds: [],
    threads: [
      {
        id: threadId,
        providerThreadId,
        subject: `Single flight ${providerCallIndex}`,
        lastMessageAt: "2026-04-12T11:00:00.000Z",
      },
    ],
    messages: [
      {
        id: messageId,
        threadId,
        providerMessageId,
        providerThreadId,
        subject: `Single flight ${providerCallIndex}`,
        from: {
          name: "Mailmon PBT",
          email: "pbt@mailmon.dev",
        },
        snippet: `Generated durable single-flight message ${providerCallIndex}`,
        receivedAt: "2026-04-12T11:00:00.000Z",
        labelIds: ["INBOX"],
      },
    ],
  };
};

const seedMailboxFixture = async (
  connectionString: string,
  options: Readonly<{
    expiredLease?: boolean;
  }> = {},
) => {
  const database = createDb(connectionString);

  try {
    await database.db.insert(schema.workspaces).values({
      id: workspaceId,
    });

    const expiredLeaseAt = new Date("2026-04-12T10:00:00.000Z");

    await database.db.insert(schema.mailboxes).values({
      id: mailboxId,
      workspaceId,
      provider: "gmail",
      tenantExternalId,
      mailboxExternalId: "mailbox_external_single_flight_pbt",
      emailAddress: "single-flight@mailmon.dev",
      cursor: "hist_0",
      status: "active",
      syncState: "healthy",
      watchState: "active",
      ...(options.expiredLease
        ? {
            activeSyncLeaseOwner: staleLeaseOwnerId,
            activeSyncLeaseAcquiredAt: expiredLeaseAt,
            activeSyncLeaseHeartbeatAt: expiredLeaseAt,
            activeSyncLeaseExpiresAt: expiredLeaseAt,
            activeSyncRunId: staleSyncRunId,
          }
        : {}),
    });

    if (options.expiredLease) {
      await database.db.insert(schema.syncRuns).values({
        id: staleSyncRunId,
        mailboxId,
        status: "running",
        leaseOwnerId: staleLeaseOwnerId,
        startedAt: expiredLeaseAt,
        previousCursor: "hist_0",
      });
    }
  } finally {
    await database.client.end();
  }
};

const fetchDurableState = async (connectionString: string) => {
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
      .orderBy(asc(schema.messages.id));
    const mailboxEvents = await database.db
      .select()
      .from(schema.mailboxEvents)
      .orderBy(asc(schema.mailboxEvents.id));

    return {
      mailbox,
      mailboxEvents,
      messages,
      syncRuns,
    };
  } finally {
    await database.client.end();
  }
};

const waitForGeneratedSyncRuns = async (connectionString: string, expectedSyncRunCount: number) => {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const durableState = await fetchDurableState(connectionString);
    const generatedSyncRuns = durableState.syncRuns.filter(
      (syncRun) => syncRun.id !== staleSyncRunId,
    );

    if (generatedSyncRuns.length >= expectedSyncRunCount) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(
    `Timed out waiting for ${expectedSyncRunCount} generated sync runs before releasing provider.`,
  );
};

const applyMailboxSyncResult = (
  connectionString: string,
  params: Readonly<{
    leaseOwnerId: string;
    nextCursor: string | null;
    snapshot: MailboxSyncSnapshot;
    syncRunId: string;
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
      syncedAt: "2026-04-12T11:05:00.000Z",
    });
  }).pipe(
    Effect.provide(
      createCorePersistenceLayer(connectionString).pipe(
        Layer.provide(testGmailRefreshTokenCipherLayer),
      ),
    ),
  );

const createGeneratedProviderLayer = (
  providerCalls: Array<{
    cursor: string | null;
    providerCallIndex: number;
  }>,
  options: Readonly<{
    beforeSnapshot?: () => Promise<void>;
    providerDelayMs: number;
  }>,
) =>
  Layer.succeed(MailboxSyncProvider, {
    syncMailbox: ({ cursor }) =>
      Effect.gen(function* () {
        const providerCallIndex = providerCalls.length;
        providerCalls.push({
          cursor,
          providerCallIndex,
        });

        if (options.beforeSnapshot !== undefined) {
          yield* Effect.promise(options.beforeSnapshot);
        }

        yield* Effect.sleep(Duration.millis(options.providerDelayMs));

        return {
          snapshot: buildProviderSnapshot(providerCallIndex),
          eventsEmitted: 2,
          nextCursor: `hist_provider_${providerCallIndex}`,
        };
      }),
  });

const createRecordingSchedulerLayer = (
  scheduledDeliveryRequests: Array<{
    deliveryId: string;
    notBefore: string;
  }>,
) =>
  Layer.succeed(WebhookDeliveryScheduler, {
    scheduleWebhookDelivery: (request) =>
      Effect.sync(() => {
        scheduledDeliveryRequests.push(request);
      }),
  });

describe("DB-backed mailbox sync execution properties", () => {
  it(
    "mailbox-lease-single-flight enforces generated concurrent acquisition with durable mailbox state",
    () =>
      hegel.testAsync(async (tc) => {
        const attemptCount = tc.draw(gs.integers({ minValue: 2, maxValue: 6 }));
        const providerDelayMs = tc.draw(providerDelayMsGen);
        const leaseFamily = tc.draw(gs.sampledFrom(["empty-lease", "expired-lease"] as const));
        const startDelayMs = Array.from({ length: attemptCount }, () =>
          tc.draw(gs.integers({ minValue: 0, maxValue: 5 })),
        );

        notePbtCase(tc, "mailbox-lease-single-flight", {
          family: "db-backed-concurrent-lease-acquisition",
          attemptCount,
          leaseFamily,
          providerDelayMs,
          startDelayMs,
        });

        await withIsolatedDatabasePromise(async ({ connectionString }) => {
          const providerCalls: Array<{
            cursor: string | null;
            providerCallIndex: number;
          }> = [];
          const scheduledDeliveryRequests: Array<{
            deliveryId: string;
            notBefore: string;
          }> = [];
          let releaseProvider!: () => void;
          const providerGate = new Promise<void>((resolve) => {
            releaseProvider = resolve;
          });
          const runtimeLayer = Layer.mergeAll(
            createCorePersistenceLayer(connectionString).pipe(
              Layer.provide(testGmailRefreshTokenCipherLayer),
            ),
            MailboxSyncLeaseTiming.defaultLayer,
            createGeneratedProviderLayer(providerCalls, {
              beforeSnapshot: () => providerGate,
              providerDelayMs,
            }),
            createRecordingSchedulerLayer(scheduledDeliveryRequests),
          );

          await seedMailboxFixture(connectionString, {
            expiredLease: leaseFamily === "expired-lease",
          });

          const resultsPromise = Effect.runPromise(
            Effect.all(
              startDelayMs.map((delayMs) =>
                Effect.sleep(Duration.millis(delayMs)).pipe(
                  Effect.andThen(runMailboxSync(mailboxId)),
                ),
              ),
              { concurrency: "unbounded" },
            ).pipe(Effect.provide(runtimeLayer)),
          );

          try {
            await waitForGeneratedSyncRuns(connectionString, attemptCount);
          } finally {
            releaseProvider();
          }

          const results = await resultsPromise;
          const durableState = await fetchDurableState(connectionString);
          const generatedSyncRuns = durableState.syncRuns.filter(
            (syncRun) => syncRun.id !== staleSyncRunId,
          );
          const completedRuns = generatedSyncRuns.filter(
            (syncRun) => syncRun.status === "completed",
          );
          const skippedRuns = generatedSyncRuns.filter(
            (syncRun) => syncRun.status === "skipped_due_to_active_lease",
          );

          expect(results).toHaveLength(attemptCount);
          expect(providerCalls.length).toBeLessThanOrEqual(1);
          expect(completedRuns.length).toBeLessThanOrEqual(1);
          expect(skippedRuns).toHaveLength(attemptCount - completedRuns.length);

          for (const syncRun of skippedRuns) {
            expect(syncRun.eventsEmitted).toBe("0");
            expect(syncRun.nextCursor).toBeNull();
          }

          if (completedRuns.length === 0) {
            expect(durableState.mailbox?.cursor).toBe("hist_0");
            expect(durableState.messages).toEqual([]);
            expect(durableState.mailboxEvents).toEqual([]);
          } else {
            expect(providerCalls).toHaveLength(1);
            expect(durableState.mailbox?.cursor).toBe("hist_provider_0");
            expect(durableState.messages).toHaveLength(1);
            expect(durableState.messages[0]?.providerMessageId).toBe("gmail_msg_single_flight_0");
            expect(durableState.mailboxEvents).toHaveLength(2);
          }

          expect(durableState.mailbox?.activeSyncLeaseOwner).toBeNull();
          expect(durableState.mailbox?.activeSyncRunId).toBeNull();
          expect(scheduledDeliveryRequests).toEqual([]);
        });
      }, hegelSettings),
    120_000,
  );

  it(
    "mailbox-lease-single-flight allows expired lease takeover and rejects the stale owner afterward",
    () =>
      hegel.testAsync(async (tc) => {
        const providerDelayMs = tc.draw(providerDelayMsGen);

        notePbtCase(tc, "mailbox-lease-single-flight", {
          family: "db-backed-expired-lease-takeover-stale-commit",
          providerDelayMs,
        });

        await withIsolatedDatabasePromise(async ({ connectionString }) => {
          const providerCalls: Array<{
            cursor: string | null;
            providerCallIndex: number;
          }> = [];
          const runtimeLayer = Layer.mergeAll(
            createCorePersistenceLayer(connectionString).pipe(
              Layer.provide(testGmailRefreshTokenCipherLayer),
            ),
            MailboxSyncLeaseTiming.defaultLayer,
            createGeneratedProviderLayer(providerCalls, { providerDelayMs }),
            createRecordingSchedulerLayer([]),
          );

          await seedMailboxFixture(connectionString, { expiredLease: true });

          const result = await Effect.runPromise(
            runMailboxSync(mailboxId).pipe(Effect.provide(runtimeLayer)),
          );
          const stateAfterTakeover = await fetchDurableState(connectionString);
          const staleCommitResult = await Effect.runPromise(
            applyMailboxSyncResult(connectionString, {
              leaseOwnerId: staleLeaseOwnerId,
              nextCursor: "hist_stale_owner",
              snapshot: buildProviderSnapshot(99),
              syncRunId: staleSyncRunId,
            }),
          );
          const stateAfterStaleCommit = await fetchDurableState(connectionString);

          expect(result.status).toBe("completed");
          expect(providerCalls).toHaveLength(1);
          expect(staleCommitResult).toEqual({
            applied: false,
            mailboxEventIds: [],
          });
          expect(stateAfterTakeover.mailbox?.cursor).toBe("hist_provider_0");
          expect(stateAfterStaleCommit.mailbox?.cursor).toBe("hist_provider_0");
          expect(stateAfterStaleCommit.messages).toEqual(stateAfterTakeover.messages);
          expect(stateAfterStaleCommit.mailboxEvents).toEqual(stateAfterTakeover.mailboxEvents);
          expect(
            stateAfterStaleCommit.syncRuns.find((syncRun) => syncRun.id === staleSyncRunId),
          ).toEqual(
            expect.objectContaining({
              status: "running",
              nextCursor: null,
            }),
          );
        });
      }, hegelSettings),
    120_000,
  );
});
