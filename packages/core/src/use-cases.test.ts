import { describe, expect, it } from "@effect/vitest";
import { Either, Effect, Layer, Option } from "effect";

import type { MailboxResource } from "./contracts.js";
import {
  MailboxCatalog,
  MailboxSyncCoordinator,
  MailboxSyncProvider,
  SyncRunStore,
} from "./services.js";
import { getMailboxOrFail, runMailboxSync } from "./use-cases.js";

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

const syncProviderLayer = Layer.succeed(MailboxSyncProvider, {
  syncMailbox: () =>
    Effect.succeed({
      eventsEmitted: 2,
      nextCursor: "hist_2",
    }),
});

const runtimeLayer = Layer.mergeAll(
  catalogLayer,
  syncRunStoreLayer,
  syncCoordinatorLayer,
  syncProviderLayer,
);

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

describe("runMailboxSync", () => {
  it.effect("coordinates mailbox lookup, provider sync, and sync run completion", () =>
    runMailboxSync(mailboxFixture.id).pipe(
      Effect.map((result) => {
        expect(result.mailboxId).toBe(mailboxFixture.id);
        expect(result.syncRunId).toBe("sr_mbx_demo");
        expect(result.eventsEmitted).toBe(2);
        expect(result.nextCursor).toBe("hist_2");
      }),
      Effect.provide(runtimeLayer),
    ),
  );

  it.effect("returns a skipped result when another worker holds the mailbox lease", () =>
    runMailboxSync(mailboxFixture.id).pipe(
      Effect.map((result) => {
        expect(result.mailboxId).toBe(mailboxFixture.id);
        expect(result.syncRunId).toBe("sr_mbx_demo");
        expect(result.status).toBe("skipped_due_to_active_lease");
        expect(result.eventsEmitted).toBe(0);
        expect(result.nextCursor).toBeNull();
      }),
      Effect.provide(
        Layer.mergeAll(
          catalogLayer,
          syncRunStoreLayer,
          busySyncCoordinatorLayer,
          syncProviderLayer,
        ),
      ),
    ),
  );
});
