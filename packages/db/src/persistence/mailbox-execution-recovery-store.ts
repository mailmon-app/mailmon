import { MailboxExecutionRecoveryStore, transitionForStuckExecutionRecovery } from "@mailmon/core";
import { and, asc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { mailboxes, syncRuns } from "../schema.js";
import { toDate } from "./common-mappers.js";
import { MailmonDatabase } from "./database.js";
import { toMailboxOperationalTransitionUpdate } from "./operational-state-mappers.js";
import { toStuckMailboxSyncExecution } from "./public-resource-mappers.js";

export const createMailboxExecutionRecoveryStoreLayer = Layer.effect(
  MailboxExecutionRecoveryStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      listStuckMailboxSyncExecutions: ({ limit, observedAt, staleThresholdMs }) =>
        Effect.promise(async () => {
          const staleBefore = new Date(toDate(observedAt).getTime() - staleThresholdMs);
          const rows = await database.db
            .select()
            .from(mailboxes)
            .where(
              and(
                eq(mailboxes.provider, "gmail"),
                inArray(mailboxes.status, ["active", "reconnect_required"]),
                isNotNull(mailboxes.activeSyncLeaseExpiresAt),
                lte(mailboxes.activeSyncLeaseExpiresAt, staleBefore),
              ),
            )
            .orderBy(asc(mailboxes.activeSyncLeaseExpiresAt), asc(mailboxes.id))
            .limit(limit)
            .for("update", { skipLocked: true });

          return rows.map((row) => toStuckMailboxSyncExecution(row));
        }),
      recoverStuckMailboxSyncExecution: ({ mailboxId, observedAt, syncRunId }) =>
        Effect.promise(async () => {
          const observedAtDate = toDate(observedAt);
          const mailboxTransitionUpdate = toMailboxOperationalTransitionUpdate(
            transitionForStuckExecutionRecovery({ occurredAt: observedAt }),
          );

          return database.db.transaction(async (transaction) => {
            const [lockedMailbox] = await transaction
              .select({
                activeSyncLeaseExpiresAt: mailboxes.activeSyncLeaseExpiresAt,
                activeSyncRunId: mailboxes.activeSyncRunId,
                id: mailboxes.id,
              })
              .from(mailboxes)
              .where(
                and(
                  eq(mailboxes.id, mailboxId),
                  isNotNull(mailboxes.activeSyncLeaseExpiresAt),
                  lte(mailboxes.activeSyncLeaseExpiresAt, observedAtDate),
                  syncRunId === null
                    ? isNull(mailboxes.activeSyncRunId)
                    : eq(mailboxes.activeSyncRunId, syncRunId),
                ),
              )
              .limit(1)
              .for("update", { skipLocked: true });

            if (lockedMailbox === undefined) {
              return false;
            }

            if (lockedMailbox.activeSyncRunId !== null) {
              await transaction
                .update(syncRuns)
                .set({
                  completedAt: observedAtDate,
                  detail: "stuck_mailbox_execution_recovered",
                  eventsEmitted: "0",
                  nextCursor: null,
                  status: "lease_lost",
                })
                .where(
                  and(
                    eq(syncRuns.id, lockedMailbox.activeSyncRunId),
                    eq(syncRuns.mailboxId, mailboxId),
                    eq(syncRuns.status, "running"),
                  ),
                );
            }

            await transaction
              .update(mailboxes)
              .set({
                activeSyncLeaseAcquiredAt: null,
                activeSyncLeaseExpiresAt: null,
                activeSyncLeaseHeartbeatAt: null,
                activeSyncLeaseOwner: null,
                activeSyncRunId: null,
                ...mailboxTransitionUpdate,
                updatedAt: observedAtDate,
              })
              .where(eq(mailboxes.id, mailboxId));

            return true;
          });
        }),
    };
  }),
);
