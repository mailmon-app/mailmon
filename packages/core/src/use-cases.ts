import { Duration, Effect, Option } from "effect";

import type {
  CompletedSyncRun,
  MailboxResource,
  SyncMailboxResult,
  SyncRunOutcome,
} from "./contracts.js";
import { mailboxNotFound, mailboxSyncLeaseLost } from "./problems.js";
import {
  MailboxCatalog,
  MailboxSyncCoordinator,
  MailboxSyncDispatcher,
  MailboxSyncProvider,
  SyncRunStore,
} from "./services.js";

const DEFAULT_MAILBOX_SYNC_LEASE_TTL_MS = 90_000;
const DEFAULT_MAILBOX_SYNC_LEASE_HEARTBEAT_INTERVAL_MS = 30_000;

const addMillisecondsToIsoTimestamp = (timestamp: string, milliseconds: number) => {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
};

const createSyncRunCompletion = (
  params: Readonly<{
    syncRunId: string;
    mailboxId: string;
    completedAt: string;
    status: SyncRunOutcome;
    eventsEmitted: number;
    nextCursor: string | null;
    detail?: string | null;
  }>,
): CompletedSyncRun => {
  return {
    syncRunId: params.syncRunId,
    mailboxId: params.mailboxId,
    completedAt: params.completedAt,
    status: params.status,
    eventsEmitted: params.eventsEmitted,
    nextCursor: params.nextCursor,
    detail: params.detail ?? null,
  };
};

export const getMailboxById = (mailboxId: string) =>
  Effect.gen(function* () {
    const catalog = yield* MailboxCatalog;

    return yield* catalog.getMailbox(mailboxId);
  });

export const getMailboxOrFail = (mailboxId: string) =>
  getMailboxById(mailboxId).pipe(
    Effect.flatMap((mailbox) =>
      Option.match(mailbox, {
        onNone: () => Effect.fail(mailboxNotFound(mailboxId)),
        onSome: (value) => Effect.succeed(value),
      }),
    ),
  );

export const runMailboxSync = (mailboxId: string) =>
  Effect.gen(function* () {
    const mailbox = yield* getMailboxOrFail(mailboxId);
    const syncRunStore = yield* SyncRunStore;
    const syncCoordinator = yield* MailboxSyncCoordinator;
    const mailboxProvider = yield* MailboxSyncProvider;
    const syncRun = yield* syncRunStore.startSyncRun(mailbox.id);
    const leaseOwnerId = globalThis.crypto.randomUUID();
    const acquisition = yield* syncCoordinator.acquireMailboxSyncLease({
      mailboxId: mailbox.id,
      syncRunId: syncRun.syncRunId,
      leaseOwnerId,
      acquiredAt: syncRun.startedAt,
      expiresAt: addMillisecondsToIsoTimestamp(
        syncRun.startedAt,
        DEFAULT_MAILBOX_SYNC_LEASE_TTL_MS,
      ),
    });

    if (!acquisition.acquired) {
      const completedAt = new Date().toISOString();
      const completion = createSyncRunCompletion({
        syncRunId: syncRun.syncRunId,
        mailboxId: mailbox.id,
        completedAt,
        status: "skipped_due_to_active_lease",
        eventsEmitted: 0,
        nextCursor: null,
      });

      yield* syncRunStore.completeSyncRun(completion);

      const skipped: SyncMailboxResult = {
        ...syncRun,
        status: "skipped_due_to_active_lease",
        completedAt,
        eventsEmitted: 0,
        nextCursor: null,
      };

      return skipped;
    }

    const heartbeat = Effect.forever(
      Effect.sleep(Duration.millis(DEFAULT_MAILBOX_SYNC_LEASE_HEARTBEAT_INTERVAL_MS)).pipe(
        Effect.zipRight(
          syncCoordinator.renewMailboxSyncLease({
            mailboxId: mailbox.id,
            leaseOwnerId,
            heartbeatAt: new Date().toISOString(),
            expiresAt: addMillisecondsToIsoTimestamp(
              new Date().toISOString(),
              DEFAULT_MAILBOX_SYNC_LEASE_TTL_MS,
            ),
          }),
        ),
        Effect.flatMap((renewal) =>
          renewal.renewed ? Effect.void : Effect.fail(mailboxSyncLeaseLost(mailbox.id)),
        ),
      ),
    );

    return yield* Effect.raceFirst(mailboxProvider.syncMailbox(mailbox), heartbeat).pipe(
      Effect.flatMap((providerResult) => {
        const completedAt = new Date().toISOString();
        const completion = createSyncRunCompletion({
          syncRunId: syncRun.syncRunId,
          mailboxId: mailbox.id,
          completedAt,
          status: "completed",
          eventsEmitted: providerResult.eventsEmitted,
          nextCursor: providerResult.nextCursor,
        });
        const result: SyncMailboxResult = {
          ...syncRun,
          status: "completed",
          completedAt,
          eventsEmitted: providerResult.eventsEmitted,
          nextCursor: providerResult.nextCursor,
        };

        return syncRunStore.completeSyncRun(completion).pipe(Effect.as(result));
      }),
      Effect.catchAll((problem) => {
        const completedAt = new Date().toISOString();
        const completion = createSyncRunCompletion({
          syncRunId: syncRun.syncRunId,
          mailboxId: mailbox.id,
          completedAt,
          status:
            problem.code === "mailbox_sync_lease_lost"
              ? "lease_lost"
              : "failed_after_lease_acquired",
          eventsEmitted: 0,
          nextCursor: null,
          detail: problem.code,
        });

        return syncRunStore.completeSyncRun(completion).pipe(Effect.zipRight(Effect.fail(problem)));
      }),
      Effect.ensuring(
        syncCoordinator.releaseMailboxSyncLease({
          mailboxId: mailbox.id,
          leaseOwnerId,
        }),
      ),
    );
  });

export const dispatchMailboxSync = (mailboxId: string) =>
  Effect.gen(function* () {
    const mailbox = yield* getMailboxOrFail(mailboxId);
    const dispatcher = yield* MailboxSyncDispatcher;

    yield* dispatcher.dispatchMailboxSync(mailbox.id);

    return mailbox;
  });

export const createHealthyMailboxSnapshot = (
  mailbox: Readonly<Pick<MailboxResource, "emailAddress" | "id">>,
): MailboxResource => {
  return {
    id: mailbox.id,
    object: "mailbox",
    provider: "gmail",
    emailAddress: mailbox.emailAddress,
    status: "active",
    syncState: "healthy",
    watchState: "active",
    initializedAt: null,
    lastSuccessfulSyncAt: null,
    lastError: null,
  };
};
