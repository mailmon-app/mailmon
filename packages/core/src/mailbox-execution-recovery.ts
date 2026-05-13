import { Effect } from "effect";

import type {
  RecoveredStuckMailboxSyncExecution,
  RecoverStuckMailboxSyncExecutionsResult,
} from "./contracts.js";
import { MailboxExecutionRecoveryStore, MailboxSyncDispatcher } from "./services.js";

const DEFAULT_STUCK_MAILBOX_SYNC_RECOVERY_BATCH_SIZE = 100;

interface StuckMailboxSyncRecoveryOutcome {
  readonly dispatched: boolean;
  readonly recovered: boolean;
  readonly recoveredExecution: RecoveredStuckMailboxSyncExecution | null;
  readonly skippedReconnectRequired: boolean;
}

export const recoverStuckMailboxSyncExecutions = (
  options: Readonly<{
    limit?: number;
    observedAt?: string;
    staleThresholdMs?: number;
  }> = {},
) =>
  Effect.gen(function* () {
    const observedAt = options.observedAt ?? new Date().toISOString();
    const limit = options.limit ?? DEFAULT_STUCK_MAILBOX_SYNC_RECOVERY_BATCH_SIZE;
    const staleThresholdMs = options.staleThresholdMs ?? 0;
    const recoveryStore = yield* MailboxExecutionRecoveryStore;
    const dispatcher = yield* MailboxSyncDispatcher;
    const targets = yield* recoveryStore.listStuckMailboxSyncExecutions({
      limit,
      observedAt,
      staleThresholdMs,
    });

    const outcomes = yield* Effect.forEach(
      targets,
      (target): Effect.Effect<StuckMailboxSyncRecoveryOutcome> =>
        recoveryStore
          .recoverStuckMailboxSyncExecution({
            mailboxId: target.mailbox.id,
            observedAt,
            syncRunId: target.syncRunId,
          })
          .pipe(
            Effect.flatMap((recovered): Effect.Effect<StuckMailboxSyncRecoveryOutcome> => {
              if (!recovered) {
                return Effect.succeed({
                  dispatched: false,
                  recovered: false,
                  recoveredExecution: null,
                  skippedReconnectRequired: false,
                } satisfies StuckMailboxSyncRecoveryOutcome);
              }

              const recoveredExecution = {
                mailboxId: target.mailbox.id,
                leaseOwnerId: target.leaseOwnerId,
                syncRunId: target.syncRunId,
              };

              if (target.mailbox.status === "reconnect_required") {
                return Effect.succeed({
                  dispatched: false,
                  recovered: true,
                  recoveredExecution,
                  skippedReconnectRequired: true,
                } satisfies StuckMailboxSyncRecoveryOutcome);
              }

              return dispatcher.dispatchMailboxSync(target.mailbox.id).pipe(
                Effect.as({
                  dispatched: true,
                  recovered: true,
                  recoveredExecution,
                  skippedReconnectRequired: false,
                } satisfies StuckMailboxSyncRecoveryOutcome),
              );
            }),
          ),
      { concurrency: 10 },
    );

    return {
      completedAt: observedAt,
      dispatched: outcomes.filter((item) => item.dispatched).length,
      kind: "recover_stuck_syncs",
      recovered: outcomes.filter((item) => item.recovered).length,
      recoveredExecutions: outcomes
        .map((item) => item.recoveredExecution)
        .filter((item): item is RecoveredStuckMailboxSyncExecution => item !== null),
      scanned: targets.length,
      skippedReconnectRequired: outcomes.filter((item) => item.skippedReconnectRequired).length,
      status: "completed",
    } satisfies RecoverStuckMailboxSyncExecutionsResult;
  });
