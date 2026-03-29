import { describe, expect, it } from "@effect/vitest";
import { Either, Effect, Layer, Option } from "effect";

import type { MailboxResource } from "./contracts.js";
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

const syncRunStoreLayer = Layer.succeed(SyncRunStore, {
  startSyncRun: (mailboxId: string) =>
    Effect.succeed({
      syncRunId: `sr_${mailboxId}`,
      mailboxId,
      startedAt: "2026-03-24T00:00:00.000Z",
    }),
  completeSyncRun: () => Effect.void,
});

const syncCoordinatorLayer = Layer.succeed(MailboxSyncCoordinator, {
  acquireMailboxSyncLease: () =>
    Effect.succeed({
      acquired: true,
      expiresAt: "2026-03-24T00:01:30.000Z",
    }),
  renewMailboxSyncLease: () =>
    Effect.succeed({
      renewed: true,
      expiresAt: "2026-03-24T00:01:30.000Z",
    }),
  releaseMailboxSyncLease: () => Effect.void,
});

const busySyncCoordinatorLayer = Layer.succeed(MailboxSyncCoordinator, {
  acquireMailboxSyncLease: () =>
    Effect.succeed({
      acquired: false,
      expiresAt: "2026-03-24T00:01:30.000Z",
    }),
  renewMailboxSyncLease: () =>
    Effect.succeed({
      renewed: false,
      expiresAt: null,
    }),
  releaseMailboxSyncLease: () => Effect.void,
});

const createSyncProviderTestLayer = (observedCursors: Array<string | null>) =>
  Layer.succeed(MailboxSyncProvider, {
    syncMailbox: ({ cursor }) =>
      Effect.sync(() => {
        observedCursors.push(cursor);

        return {
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
          },
          eventsEmitted: 2,
          nextCursor: "hist_2",
        };
      }),
  });

const createMailboxStateStoreTestLayer = (
  currentCursor: string | null,
  appliedSnapshots: Array<{
    mailboxId: string;
    threadCount: number;
    messageCount: number;
    nextCursor: string | null;
  }>,
) =>
  Layer.succeed(MailboxStateStore, {
    getMailboxCursor: () => Effect.succeed(currentCursor),
    applySyncResult: ({ mailboxId, nextCursor, snapshot }) =>
      Effect.sync(() => {
        appliedSnapshots.push({
          mailboxId,
          threadCount: snapshot.threads.length,
          messageCount: snapshot.messages.length,
          nextCursor,
        });
      }),
  });

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
      Effect.either,
      Effect.map((result) => {
        expect(Either.isLeft(result)).toBe(true);

        if (Either.isLeft(result)) {
          expect(result.left.code).toBe("mailbox_not_found");
          expect(result.left.status).toBe(404);
        }
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
    Effect.sync(() => {
      const appliedSnapshots: Array<{
        mailboxId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];

      return runMailboxSync(mailboxFixture.id).pipe(
        Effect.map((result) => {
          expect(result.mailboxId).toBe(mailboxFixture.id);
          expect(result.syncRunId).toBe("sr_mbx_demo");
          expect(result.eventsEmitted).toBe(2);
          expect(result.nextCursor).toBe("hist_2");
          expect(observedCursors).toEqual([null]);
          expect(appliedSnapshots).toEqual([
            {
              mailboxId: mailboxFixture.id,
              threadCount: 1,
              messageCount: 1,
              nextCursor: "hist_2",
            },
          ]);
        }),
        Effect.provide(
          Layer.mergeAll(
            catalogLayer,
            createMailboxStateStoreTestLayer(null, appliedSnapshots),
            syncRunStoreLayer,
            syncCoordinatorLayer,
            createSyncProviderTestLayer(observedCursors),
          ),
        ),
      );
    }).pipe(Effect.flatten),
  );

  it.effect("passes the stored cursor into the provider for incremental sync", () =>
    Effect.sync(() => {
      const appliedSnapshots: Array<{
        mailboxId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];

      return runMailboxSync(mailboxFixture.id).pipe(
        Effect.map((result) => {
          expect(result.status).toBe("completed");
          expect(result.nextCursor).toBe("hist_2");
          expect(observedCursors).toEqual(["hist_1"]);
          expect(appliedSnapshots).toEqual([
            {
              mailboxId: mailboxFixture.id,
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
            syncRunStoreLayer,
            syncCoordinatorLayer,
            createSyncProviderTestLayer(observedCursors),
          ),
        ),
      );
    }).pipe(Effect.flatten),
  );

  it.effect("returns a skipped result when another worker holds the mailbox lease", () =>
    Effect.sync(() => {
      const appliedSnapshots: Array<{
        mailboxId: string;
        threadCount: number;
        messageCount: number;
        nextCursor: string | null;
      }> = [];
      const observedCursors: Array<string | null> = [];

      return runMailboxSync(mailboxFixture.id).pipe(
        Effect.map((result) => {
          expect(result.mailboxId).toBe(mailboxFixture.id);
          expect(result.syncRunId).toBe("sr_mbx_demo");
          expect(result.status).toBe("skipped_due_to_active_lease");
          expect(result.eventsEmitted).toBe(0);
          expect(result.nextCursor).toBeNull();
          expect(observedCursors).toEqual([]);
          expect(appliedSnapshots).toEqual([]);
        }),
        Effect.provide(
          Layer.mergeAll(
            catalogLayer,
            createMailboxStateStoreTestLayer("hist_1", appliedSnapshots),
            syncRunStoreLayer,
            busySyncCoordinatorLayer,
            createSyncProviderTestLayer(observedCursors),
          ),
        ),
      );
    }).pipe(Effect.flatten),
  );
});
