import { Duration, Effect, Option } from "effect";

import type {
  CompletedSyncRun,
  MailboxResource,
  ProblemDetails,
  StartedSyncRun,
  SyncMailboxResult,
  SyncRunOutcome,
} from "./contracts.js";
import { scheduleMailboxEventDeliveries } from "./mailbox-event-delivery-scheduling.js";
import { mailboxNotFound, mailboxSyncLeaseLost } from "./problems.js";
import {
  MailboxCatalog,
  MailboxStateStore,
  MailboxSyncCoordinator,
  MailboxSyncProvider,
  SyncRunStore,
} from "./services.js";

const DEFAULT_MAILBOX_SYNC_LEASE_TTL_MS = 90_000;
const DEFAULT_MAILBOX_SYNC_LEASE_HEARTBEAT_INTERVAL_MS = 30_000;

const TERMINAL_MAILBOX_SYNC_PROBLEM_CODES = new Set([
  "gmail_mailbox_credentials_missing",
  "gmail_mailbox_credential_unreadable",
  "gmail_token_refresh_reconnect_required",
]);

interface AcquiredMailboxSyncExecution {
  readonly cursor: string | null;
  readonly leaseOwnerId: string;
  readonly mailbox: MailboxResource;
  readonly syncRun: StartedSyncRun;
}

const addMillisecondsToIsoTimestamp = (timestamp: string, milliseconds: number) => {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
};

const nowIso = () => new Date().toISOString();

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

const isTerminalMailboxSyncProblem = (code: string) => {
  return TERMINAL_MAILBOX_SYNC_PROBLEM_CODES.has(code);
};

const getMailboxOrFail = (mailboxId: string) =>
  Effect.gen(function* () {
    const catalog = yield* MailboxCatalog;
    const mailbox = yield* catalog.getMailbox(mailboxId);

    return yield* Option.match(mailbox, {
      onNone: () => Effect.fail(mailboxNotFound(mailboxId)),
      onSome: (value) => Effect.succeed(value),
    });
  });

const completeSyncRun = (
  syncRun: StartedSyncRun,
  params: Readonly<{
    completedAt: string;
    status: SyncRunOutcome;
    eventsEmitted: number;
    nextCursor: string | null;
    detail?: string | null;
  }>,
) =>
  Effect.gen(function* () {
    const syncRunStore = yield* SyncRunStore;
    const completionRequest =
      params.detail === undefined
        ? {
            syncRunId: syncRun.syncRunId,
            mailboxId: syncRun.mailboxId,
            completedAt: params.completedAt,
            status: params.status,
            eventsEmitted: params.eventsEmitted,
            nextCursor: params.nextCursor,
          }
        : {
            syncRunId: syncRun.syncRunId,
            mailboxId: syncRun.mailboxId,
            completedAt: params.completedAt,
            status: params.status,
            eventsEmitted: params.eventsEmitted,
            nextCursor: params.nextCursor,
            detail: params.detail,
          };

    yield* syncRunStore.completeSyncRun(createSyncRunCompletion(completionRequest));
  });

const toCompletedSyncMailboxResult = (
  syncRun: StartedSyncRun,
  params: Readonly<{
    completedAt: string;
    eventsEmitted: number;
    nextCursor: string | null;
  }>,
): SyncMailboxResult => ({
  ...syncRun,
  status: "completed",
  completedAt: params.completedAt,
  eventsEmitted: params.eventsEmitted,
  nextCursor: params.nextCursor,
});

const toReconnectRequiredSyncMailboxResult = (
  syncRun: StartedSyncRun,
  completedAt: string,
): SyncMailboxResult => ({
  ...syncRun,
  status: "reconnect_required",
  completedAt,
  eventsEmitted: 0,
  nextCursor: null,
});

const toSkippedSyncMailboxResult = (
  syncRun: StartedSyncRun,
  params: Readonly<{
    completedAt: string;
    leaseOwnerId: string | null;
  }>,
): SyncMailboxResult => ({
  ...syncRun,
  status: "skipped_due_to_active_lease",
  completedAt: params.completedAt,
  eventsEmitted: 0,
  leaseOwnerId: params.leaseOwnerId,
  nextCursor: null,
});

const completeReconnectRequiredMailbox = (mailbox: MailboxResource) =>
  Effect.gen(function* () {
    const syncRunStore = yield* SyncRunStore;
    const syncRun = yield* syncRunStore.startSyncRun(mailbox.id);
    const completedAt = nowIso();

    yield* completeSyncRun(syncRun, {
      completedAt,
      status: "reconnect_required",
      eventsEmitted: 0,
      nextCursor: null,
      detail: "mailbox_reconnect_required",
    });

    return toReconnectRequiredSyncMailboxResult(syncRun, completedAt);
  });

const acquireMailboxSyncExecution = (mailbox: MailboxResource) =>
  Effect.gen(function* () {
    const mailboxStateStore = yield* MailboxStateStore;
    const syncRunStore = yield* SyncRunStore;
    const syncCoordinator = yield* MailboxSyncCoordinator;
    const cursor = yield* mailboxStateStore.getMailboxCursor(mailbox.id);
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
      const completedAt = nowIso();

      yield* completeSyncRun(syncRun, {
        completedAt,
        status: "skipped_due_to_active_lease",
        eventsEmitted: 0,
        nextCursor: null,
      });

      return {
        kind: "Skipped" as const,
        result: toSkippedSyncMailboxResult(syncRun, {
          completedAt,
          leaseOwnerId: acquisition.leaseOwnerId,
        }),
      };
    }

    return {
      kind: "Acquired" as const,
      execution: {
        cursor,
        leaseOwnerId,
        mailbox,
        syncRun,
      } satisfies AcquiredMailboxSyncExecution,
    };
  });

const createMailboxSyncHeartbeat = (execution: AcquiredMailboxSyncExecution) =>
  Effect.forever(
    Effect.sleep(Duration.millis(DEFAULT_MAILBOX_SYNC_LEASE_HEARTBEAT_INTERVAL_MS)).pipe(
      Effect.zipRight(
        Effect.gen(function* () {
          const syncCoordinator = yield* MailboxSyncCoordinator;
          const heartbeatAt = nowIso();

          return yield* syncCoordinator.renewMailboxSyncLease({
            mailboxId: execution.mailbox.id,
            leaseOwnerId: execution.leaseOwnerId,
            heartbeatAt,
            expiresAt: addMillisecondsToIsoTimestamp(
              heartbeatAt,
              DEFAULT_MAILBOX_SYNC_LEASE_TTL_MS,
            ),
          });
        }),
      ),
      Effect.flatMap((renewal) =>
        renewal.renewed
          ? Effect.void
          : Effect.fail(
              mailboxSyncLeaseLost(execution.mailbox.id, {
                leaseOwnerId: execution.leaseOwnerId,
                syncRunId: execution.syncRun.syncRunId,
              }),
            ),
      ),
    ),
  );

const commitProviderSyncResult = (execution: AcquiredMailboxSyncExecution) =>
  Effect.gen(function* () {
    const mailboxProvider = yield* MailboxSyncProvider;
    const mailboxStateStore = yield* MailboxStateStore;
    const providerResult = yield* mailboxProvider.syncMailbox({
      mailbox: execution.mailbox,
      cursor: execution.cursor,
    });
    const completedAt = nowIso();
    const commitResult = yield* mailboxStateStore.applySyncResult({
      eventsEmitted: providerResult.eventsEmitted,
      mailboxId: execution.mailbox.id,
      leaseOwnerId: execution.leaseOwnerId,
      syncRunId: execution.syncRun.syncRunId,
      snapshot: providerResult.snapshot,
      nextCursor: providerResult.nextCursor,
      syncedAt: completedAt,
    });

    if (!commitResult.applied) {
      return yield* Effect.fail(
        mailboxSyncLeaseLost(execution.mailbox.id, {
          leaseOwnerId: execution.leaseOwnerId,
          syncRunId: execution.syncRun.syncRunId,
        }),
      );
    }

    yield* scheduleMailboxEventDeliveries(commitResult.mailboxEventIds);

    return toCompletedSyncMailboxResult(execution.syncRun, {
      completedAt,
      eventsEmitted: commitResult.mailboxEventIds.length,
      nextCursor: providerResult.nextCursor,
    });
  });

const classifyAcquiredExecutionFailure = (problem: ProblemDetails): SyncRunOutcome => {
  if (isTerminalMailboxSyncProblem(problem.code)) {
    return "reconnect_required";
  }

  if (problem.code === "mailbox_sync_lease_lost") {
    return "lease_lost";
  }

  return "failed_after_lease_acquired";
};

const completeAcquiredExecutionFailure = (
  execution: AcquiredMailboxSyncExecution,
  problem: ProblemDetails,
) => {
  const completedAt = nowIso();

  return completeSyncRun(execution.syncRun, {
    completedAt,
    status: classifyAcquiredExecutionFailure(problem),
    eventsEmitted: 0,
    nextCursor: null,
    detail: problem.code,
  }).pipe(
    Effect.flatMap(() =>
      isTerminalMailboxSyncProblem(problem.code)
        ? Effect.succeed(toReconnectRequiredSyncMailboxResult(execution.syncRun, completedAt))
        : Effect.fail(problem),
    ),
  );
};

const runAcquiredMailboxSyncExecution = (execution: AcquiredMailboxSyncExecution) => {
  const syncWork = commitProviderSyncResult(execution);
  const heartbeat = createMailboxSyncHeartbeat(execution);

  return Effect.raceFirst(syncWork, heartbeat).pipe(
    Effect.catchAll((problem) => completeAcquiredExecutionFailure(execution, problem)),
    Effect.ensuring(
      Effect.gen(function* () {
        const syncCoordinator = yield* MailboxSyncCoordinator;

        yield* syncCoordinator.releaseMailboxSyncLease({
          mailboxId: execution.mailbox.id,
          leaseOwnerId: execution.leaseOwnerId,
        });
      }),
    ),
  );
};

export const runMailboxSync = (mailboxId: string) =>
  Effect.gen(function* () {
    const mailbox = yield* getMailboxOrFail(mailboxId);

    if (mailbox.status === "reconnect_required") {
      return yield* completeReconnectRequiredMailbox(mailbox);
    }

    const acquiredExecution = yield* acquireMailboxSyncExecution(mailbox);

    if (acquiredExecution.kind === "Skipped") {
      return acquiredExecution.result;
    }

    return yield* runAcquiredMailboxSyncExecution(acquiredExecution.execution);
  });
