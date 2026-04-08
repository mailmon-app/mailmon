import { describe, expect, it } from "@effect/vitest";
import { Duration, Effect, Fiber, Layer, Option } from "effect";
import * as TestClock from "effect/TestClock";

import type { CompletedSyncRun, MailboxResource } from "./contracts.js";
import {
  MailboxCatalog,
  MailboxSyncCoordinator,
  MailboxSyncDispatcher,
  MailboxSyncProvider,
  MailboxStateStore,
  SyncRunStore,
} from "./services.js";
import { dispatchMailboxSync, getMailboxOrFail, runMailboxSync } from "./use-cases.js";

const mailboxFixture: MailboxResource = {
  id: "mbx_demo",
  object: "mailbox",
  provider: "gmail",
  emailAddress: "demo@mailmon.dev",
  status: "active",
  syncState: "healthy",
  watchState: "active",
  initializedAt: null,
  lastSuccessfulSyncAt: null,
  lastError: null,
};

const catalogLayer = Layer.succeed(MailboxCatalog, {
  getMailbox: (mailboxId: string) =>
    Effect.succeed(mailboxId === mailboxFixture.id ? Option.some(mailboxFixture) : Option.none()),
});

const createSyncRunStoreTestLayer = (completedSyncRuns: Array<CompletedSyncRun>) =>
  Layer.succeed(SyncRunStore, {
    startSyncRun: (mailboxId: string) =>
      Effect.succeed({
        syncRunId: `sr_${mailboxId}`,
        mailboxId,
        startedAt: "2026-03-24T00:00:00.000Z",
      }),
    completeSyncRun: (result) =>
      Effect.sync(() => {
        completedSyncRuns.push(result);
      }),
  });

const createSyncCoordinatorTestLayer = (
  params: Readonly<{
    acquisitionSucceeds?: boolean;
    releaseCalls?: Array<{
      mailboxId: string;
      leaseOwnerId: string;
    }>;
    renewCalls?: Array<{
      mailboxId: string;
      leaseOwnerId: string;
      heartbeatAt: string;
      expiresAt: string;
    }>;
    renewResults?: ReadonlyArray<boolean>;
  }> = {},
) =>
  Layer.succeed(MailboxSyncCoordinator, {
    acquireMailboxSyncLease: () =>
      Effect.succeed({
        acquired: params.acquisitionSucceeds ?? true,
        expiresAt: "2026-03-24T00:01:30.000Z",
      }),
    renewMailboxSyncLease: (lease) =>
      Effect.sync(() => {
        params.renewCalls?.push(lease);
        const renewAttempt = params.renewCalls?.length ?? 1;
        const renewed = params.renewResults?.[renewAttempt - 1] ?? true;

        return {
          renewed,
          expiresAt: renewed ? lease.expiresAt : null,
        };
      }),
    releaseMailboxSyncLease: (lease) =>
      Effect.sync(() => {
        params.releaseCalls?.push(lease);
      }),
  });

const createSyncProviderTestLayer = (
  observedCursors: Array<string | null>,
  options: Readonly<{
    delayMs?: number;
  }> = {},
) =>
  Layer.succeed(MailboxSyncProvider, {
    syncMailbox: ({ cursor }) =>
      Effect.sync(() => {
        observedCursors.push(cursor);
      }).pipe(
        Effect.zipRight(Effect.sleep(Duration.millis(options.delayMs ?? 0))),
        Effect.as({
          snapshot: {
            threads: [
              {
                id: "thr_demo",
                providerThreadId: "gmail_thr_demo",
                subject: "Demo thread",
                lastMessageAt: "2026-03-24T00:00:00.000Z",
              },
            ],
            messages: [
              {
                id: "msg_demo",
                threadId: "thr_demo",
                providerMessageId: "gmail_msg_demo",
                providerThreadId: "gmail_thr_demo",
                subject: "Demo thread",
                from: {
                  name: "Mailmon",
                  email: "hello@mailmon.dev",
                },
                snippet: "Baseline sync fixture",
                receivedAt: "2026-03-24T00:00:00.000Z",
                labelIds: ["INBOX"],
              },
            ],
            deletedProviderMessageIds: [],
          },
          eventsEmitted: 2,
          nextCursor: "hist_2",
        }),
      ),
  });

const createMailboxStateStoreTestLayer = (
  currentCursor: string | null,
  appliedSnapshots: Array<{
    eventsEmitted: number;
    mailboxId: string;
    leaseOwnerId: string;
    syncRunId: string;
    threadCount: number;
    messageCount: number;
    nextCursor: string | null;
  }>,
  options: Readonly<{
    applyDelayMs?: number;
    applied?: boolean;
  }> = {},
) => {
  let storedCursor = currentCursor;

  return Layer.succeed(MailboxStateStore, {
    getMailboxCursor: () => Effect.succeed(storedCursor),
    applySyncResult: ({
      eventsEmitted,
      mailboxId,
      leaseOwnerId,
      nextCursor,
      snapshot,
      syncRunId,
    }) =>
      Effect.sleep(Duration.millis(options.applyDelayMs ?? 0)).pipe(
        Effect.map(() => options.applied ?? true),
        Effect.tap((applied) =>
          applied
            ? Effect.sync(() => {
                storedCursor = nextCursor;
                appliedSnapshots.push({
                  eventsEmitted,
                  mailboxId,
                  leaseOwnerId,
                  syncRunId,
                  threadCount: snapshot.threads.length,
                  messageCount: snapshot.messages.length,
                  nextCursor,
                });
              })
            : Effect.void,
        ),
      ),
  });
};

const dispatchedMailboxIds: Array<string> = [];

const syncDispatcherLayer = Layer.succeed(MailboxSyncDispatcher, {
  dispatchMailboxSync: (mailboxId: string) =>
    Effect.sync(() => {
      dispatchedMailboxIds.push(mailboxId);
    }),
});

describe("getMailboxOrFail", () => {
  it.effect("fails with a structured problem when the mailbox is missing", () =>
    getMailboxOrFail("mbx_missing").pipe(
      Effect.flip,
      Effect.map((problem) => {
        expect(problem.code).toBe("mailbox_not_found");
        expect(problem.status).toBe(404);
      }),
      Effect.provide(catalogLayer),
    ),
  );
});

describe("dispatchMailboxSync", () => {
  it.effect(
    "verifies the mailbox exists before dispatching it through the shared transport boundary",
    () =>
      dispatchMailboxSync(mailboxFixture.id).pipe(
        Effect.map((mailbox) => {
          expect(mailbox.id).toBe(mailboxFixture.id);
          expect(dispatchedMailboxIds).toEqual([mailboxFixture.id]);
        }),
        Effect.tap(() => Effect.sync(() => dispatchedMailboxIds.splice(0))),
        Effect.provide(Layer.mergeAll(catalogLayer, syncDispatcherLayer)),
      ),
  );
});

describe("runMailboxSync", () => {
  it.effect("coordinates mailbox lookup, provider sync, and sync run completion", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];
      const completedSyncRuns: Array<CompletedSyncRun> = [];

      return yield* runMailboxSync(mailboxFixture.id).pipe(
        Effect.map((result) => {
          expect(result.mailboxId).toBe(mailboxFixture.id);
          expect(result.syncRunId).toBe("sr_mbx_demo");
          expect(result.eventsEmitted).toBe(2);
          expect(result.nextCursor).toBe("hist_2");
          expect(observedCursors).toEqual([null]);
          expect(appliedSnapshots).toEqual([
            {
              mailboxId: mailboxFixture.id,
              eventsEmitted: 2,
              leaseOwnerId: expect.any(String),
              syncRunId: "sr_mbx_demo",
              threadCount: 1,
              messageCount: 1,
              nextCursor: "hist_2",
            },
          ]);
          expect(completedSyncRuns).toEqual([]);
        }),
        Effect.provide(
          Layer.mergeAll(
            catalogLayer,
            createMailboxStateStoreTestLayer(null, appliedSnapshots),
            createSyncRunStoreTestLayer(completedSyncRuns),
            createSyncCoordinatorTestLayer(),
            createSyncProviderTestLayer(observedCursors),
          ),
        ),
      );
    }),
  );

  it.effect("passes the stored cursor into the provider for incremental sync", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];

      return yield* runMailboxSync(mailboxFixture.id).pipe(
        Effect.map((result) => {
          expect(result.status).toBe("completed");
          expect(result.nextCursor).toBe("hist_2");
          expect(observedCursors).toEqual(["hist_1"]);
          expect(appliedSnapshots).toEqual([
            {
              mailboxId: mailboxFixture.id,
              eventsEmitted: 2,
              leaseOwnerId: expect.any(String),
              syncRunId: "sr_mbx_demo",
              threadCount: 1,
              messageCount: 1,
              nextCursor: "hist_2",
            },
          ]);
        }),
        Effect.provide(
          Layer.mergeAll(
            catalogLayer,
            createMailboxStateStoreTestLayer("hist_1", appliedSnapshots),
            createSyncRunStoreTestLayer([]),
            createSyncCoordinatorTestLayer(),
            createSyncProviderTestLayer(observedCursors),
          ),
        ),
      );
    }),
  );

  it.effect(
    "uses the advanced cursor on a follow-up wake-up so duplicate dispatches stay idempotent",
    () =>
      Effect.gen(function* () {
        const appliedSnapshots: Array<{
          eventsEmitted: number;
          mailboxId: string;
          leaseOwnerId: string;
          syncRunId: string;
          threadCount: number;
          messageCount: number;
          nextCursor: string | null;
        }> = [];
        const observedCursors: Array<string | null> = [];

        const providerLayer = Layer.succeed(MailboxSyncProvider, {
          syncMailbox: ({ cursor }) =>
            Effect.sync(() => {
              observedCursors.push(cursor);

              if (cursor === "hist_1") {
                return {
                  snapshot: {
                    deletedProviderMessageIds: [],
                    threads: [
                      {
                        id: "thr_demo",
                        providerThreadId: "gmail_thr_demo",
                        subject: "Demo thread",
                        lastMessageAt: "2026-03-24T00:01:00.000Z",
                      },
                    ],
                    messages: [
                      {
                        id: "msg_demo_2",
                        threadId: "thr_demo",
                        providerMessageId: "gmail_msg_demo_2",
                        providerThreadId: "gmail_thr_demo",
                        subject: "Demo thread",
                        from: {
                          name: "Mailmon",
                          email: "hello@mailmon.dev",
                        },
                        snippet: "Incremental message",
                        receivedAt: "2026-03-24T00:01:00.000Z",
                        labelIds: ["INBOX"],
                      },
                    ],
                  },
                  eventsEmitted: 1,
                  nextCursor: "hist_2",
                };
              }

              return {
                snapshot: {
                  deletedProviderMessageIds: [],
                  threads: [],
                  messages: [],
                },
                eventsEmitted: 0,
                nextCursor: "hist_2",
              };
            }),
        });

        const testLayer = Layer.mergeAll(
          catalogLayer,
          createMailboxStateStoreTestLayer("hist_1", appliedSnapshots),
          createSyncRunStoreTestLayer([]),
          createSyncCoordinatorTestLayer(),
          providerLayer,
        );

        const firstResult = yield* runMailboxSync(mailboxFixture.id).pipe(
          Effect.provide(testLayer),
        );
        const secondResult = yield* runMailboxSync(mailboxFixture.id).pipe(
          Effect.provide(testLayer),
        );

        expect(firstResult.status).toBe("completed");
        expect(firstResult.eventsEmitted).toBe(1);
        expect(firstResult.nextCursor).toBe("hist_2");
        expect(secondResult.status).toBe("completed");
        expect(secondResult.eventsEmitted).toBe(0);
        expect(secondResult.nextCursor).toBe("hist_2");
        expect(observedCursors).toEqual(["hist_1", "hist_2"]);
        expect(appliedSnapshots).toEqual([
          {
            mailboxId: mailboxFixture.id,
            eventsEmitted: 1,
            leaseOwnerId: expect.any(String),
            syncRunId: "sr_mbx_demo",
            threadCount: 1,
            messageCount: 1,
            nextCursor: "hist_2",
          },
          {
            mailboxId: mailboxFixture.id,
            eventsEmitted: 0,
            leaseOwnerId: expect.any(String),
            syncRunId: "sr_mbx_demo",
            threadCount: 0,
            messageCount: 0,
            nextCursor: "hist_2",
          },
        ]);
      }),
  );

  it.effect("returns a skipped result when another worker holds the mailbox lease", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];
      const completedSyncRuns: Array<CompletedSyncRun> = [];

      return yield* runMailboxSync(mailboxFixture.id).pipe(
        Effect.map((result) => {
          expect(result.mailboxId).toBe(mailboxFixture.id);
          expect(result.syncRunId).toBe("sr_mbx_demo");
          expect(result.status).toBe("skipped_due_to_active_lease");
          expect(result.eventsEmitted).toBe(0);
          expect(result.nextCursor).toBeNull();
          expect(observedCursors).toEqual([]);
          expect(appliedSnapshots).toEqual([]);
          expect(completedSyncRuns).toEqual([
            expect.objectContaining({
              mailboxId: mailboxFixture.id,
              status: "skipped_due_to_active_lease",
              eventsEmitted: 0,
              nextCursor: null,
            }),
          ]);
        }),
        Effect.provide(
          Layer.mergeAll(
            catalogLayer,
            createMailboxStateStoreTestLayer("hist_1", appliedSnapshots),
            createSyncRunStoreTestLayer(completedSyncRuns),
            createSyncCoordinatorTestLayer({
              acquisitionSucceeds: false,
            }),
            createSyncProviderTestLayer(observedCursors),
          ),
        ),
      );
    }),
  );

  it.effect("keeps heartbeating the mailbox lease until state writes finish", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];
      const completedSyncRuns: Array<CompletedSyncRun> = [];
      const renewCalls: Array<{
        mailboxId: string;
        leaseOwnerId: string;
        heartbeatAt: string;
        expiresAt: string;
      }> = [];
      const releaseCalls: Array<{
        mailboxId: string;
        leaseOwnerId: string;
      }> = [];

      const fiber = yield* Effect.fork(
        runMailboxSync(mailboxFixture.id).pipe(
          Effect.provide(
            Layer.mergeAll(
              catalogLayer,
              createMailboxStateStoreTestLayer(null, appliedSnapshots, {
                applyDelayMs: 31_000,
              }),
              createSyncRunStoreTestLayer(completedSyncRuns),
              createSyncCoordinatorTestLayer({
                releaseCalls,
                renewCalls,
              }),
              createSyncProviderTestLayer(observedCursors),
            ),
          ),
        ),
      );

      yield* TestClock.adjust(Duration.millis(31_000));

      const result = yield* Fiber.join(fiber);

      expect(result.status).toBe("completed");
      expect(observedCursors).toEqual([null]);
      expect(renewCalls).toHaveLength(1);
      expect(appliedSnapshots).toEqual([
        {
          mailboxId: mailboxFixture.id,
          eventsEmitted: 2,
          leaseOwnerId: expect.any(String),
          syncRunId: "sr_mbx_demo",
          threadCount: 1,
          messageCount: 1,
          nextCursor: "hist_2",
        },
      ]);
      expect(completedSyncRuns).toEqual([]);
      expect(releaseCalls).toHaveLength(1);
    }),
  );

  it.effect("stops execution and records lease_lost when heartbeat renewal fails mid-run", () =>
    Effect.gen(function* () {
      const appliedSnapshots: Array<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];
      const completedSyncRuns: Array<CompletedSyncRun> = [];
      const renewCalls: Array<{
        mailboxId: string;
        leaseOwnerId: string;
        heartbeatAt: string;
        expiresAt: string;
      }> = [];
      const releaseCalls: Array<{
        mailboxId: string;
        leaseOwnerId: string;
      }> = [];

      const fiber = yield* Effect.fork(
        runMailboxSync(mailboxFixture.id).pipe(
          Effect.provide(
            Layer.mergeAll(
              catalogLayer,
              createMailboxStateStoreTestLayer(null, appliedSnapshots, {
                applyDelayMs: 31_000,
              }),
              createSyncRunStoreTestLayer(completedSyncRuns),
              createSyncCoordinatorTestLayer({
                releaseCalls,
                renewCalls,
                renewResults: [false],
              }),
              createSyncProviderTestLayer(observedCursors),
            ),
          ),
          Effect.either,
        ),
      );

      yield* TestClock.adjust(Duration.millis(30_000));

      const result = yield* Fiber.join(fiber);

      expect(result._tag).toBe("Left");

      if (result._tag === "Left") {
        expect(result.left.code).toBe("mailbox_sync_lease_lost");
      }

      expect(observedCursors).toEqual([null]);
      expect(renewCalls).toHaveLength(1);
      expect(appliedSnapshots).toEqual([]);
      expect(completedSyncRuns).toEqual([
        expect.objectContaining({
          mailboxId: mailboxFixture.id,
          status: "lease_lost",
          eventsEmitted: 0,
          nextCursor: null,
          detail: "mailbox_sync_lease_lost",
        }),
      ]);
      expect(releaseCalls).toHaveLength(1);
    }),
  );
});
