import {
  MailboxSyncCoordinator,
  MailboxSyncDispatchExhaustionStore,
  type MailboxSyncDispatchExhaustedResult,
  type MailboxSyncLeaseAcquisition,
  type MailboxSyncLeaseRenewal,
} from "@mailmon/core";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { mailboxes, syncRuns } from "../schema.js";
import { MailmonDatabase } from "./database.js";
import { toDate, toIsoString } from "./mappers.js";

export const createMailboxSyncDispatchExhaustionStoreLayer = Layer.effect(
  MailboxSyncDispatchExhaustionStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      recordMailboxSyncDispatchExhausted: ({ mailboxId, recordedAt, syncRunId }) =>
        Effect.promise(async () => {
          const recordedAtDate = toDate(recordedAt);

          return database.db.transaction(async (transaction) => {
            const [mailbox] = await transaction
              .select({
                cursor: mailboxes.cursor,
              })
              .from(mailboxes)
              .where(eq(mailboxes.id, mailboxId))
              .limit(1);

            if (mailbox === undefined) {
              return {
                mailboxId,
                status: "mailbox_not_found",
                syncRunId: null,
                recordedAt,
                detail: "mailbox_not_found",
              } satisfies MailboxSyncDispatchExhaustedResult;
            }

            await transaction.insert(syncRuns).values({
              id: syncRunId,
              mailboxId,
              status: "dispatch_retry_exhausted",
              startedAt: recordedAtDate,
              completedAt: recordedAtDate,
              eventsEmitted: "0",
              previousCursor: mailbox.cursor,
              nextCursor: mailbox.cursor,
              detail: "mailbox_sync_dispatch_retry_exhausted",
            });

            await transaction
              .update(mailboxes)
              .set({
                lastErrorCode: "mailbox_sync_dispatch_retry_exhausted",
                lastErrorMessage:
                  "Mailbox sync dispatch exhausted transport retries before a worker could process it.",
                lastErrorOccurredAt: recordedAtDate,
                lastErrorRetryable: true,
                syncState: "failed",
                updatedAt: recordedAtDate,
              })
              .where(eq(mailboxes.id, mailboxId));

            return {
              mailboxId,
              status: "recorded",
              syncRunId,
              recordedAt,
              detail: "mailbox_sync_dispatch_retry_exhausted",
            } satisfies MailboxSyncDispatchExhaustedResult;
          });
        }),
    };
  }),
);

export const createMailboxSyncCoordinatorLayer = Layer.effect(
  MailboxSyncCoordinator,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      acquireMailboxSyncLease: (lease) =>
        Effect.promise(async () => {
          const acquiredAt = toDate(lease.acquiredAt);
          const expiresAt = toDate(lease.expiresAt);

          return database.db.transaction(async (transaction) => {
            const [updatedMailbox] = await transaction
              .update(mailboxes)
              .set({
                activeSyncLeaseAcquiredAt: acquiredAt,
                activeSyncLeaseExpiresAt: expiresAt,
                activeSyncLeaseHeartbeatAt: acquiredAt,
                activeSyncLeaseOwner: lease.leaseOwnerId,
                activeSyncRunId: lease.syncRunId,
                updatedAt: acquiredAt,
              })
              .where(
                and(
                  eq(mailboxes.id, lease.mailboxId),
                  or(
                    isNull(mailboxes.activeSyncLeaseExpiresAt),
                    lte(mailboxes.activeSyncLeaseExpiresAt, acquiredAt),
                  ),
                ),
              )
              .returning({
                expiresAt: mailboxes.activeSyncLeaseExpiresAt,
              });

            if (updatedMailbox === undefined) {
              const [currentMailbox] = await transaction
                .select({
                  expiresAt: mailboxes.activeSyncLeaseExpiresAt,
                  leaseOwnerId: mailboxes.activeSyncLeaseOwner,
                })
                .from(mailboxes)
                .where(eq(mailboxes.id, lease.mailboxId))
                .limit(1);

              const result: MailboxSyncLeaseAcquisition = {
                acquired: false,
                expiresAt: toIsoString(currentMailbox?.expiresAt ?? null),
                leaseOwnerId: currentMailbox?.leaseOwnerId ?? null,
              };

              return result;
            }

            await transaction
              .update(syncRuns)
              .set({
                leaseOwnerId: lease.leaseOwnerId,
              })
              .where(eq(syncRuns.id, lease.syncRunId));

            const result: MailboxSyncLeaseAcquisition = {
              acquired: true,
              expiresAt: toIsoString(updatedMailbox.expiresAt) ?? lease.expiresAt,
              leaseOwnerId: lease.leaseOwnerId,
            };

            return result;
          });
        }),
      renewMailboxSyncLease: (lease) =>
        Effect.promise(async () => {
          const heartbeatAt = toDate(lease.heartbeatAt);
          const expiresAt = toDate(lease.expiresAt);

          const [updatedMailbox] = await database.db
            .update(mailboxes)
            .set({
              activeSyncLeaseExpiresAt: expiresAt,
              activeSyncLeaseHeartbeatAt: heartbeatAt,
              updatedAt: heartbeatAt,
            })
            .where(
              and(
                eq(mailboxes.id, lease.mailboxId),
                eq(mailboxes.activeSyncLeaseOwner, lease.leaseOwnerId),
                gt(mailboxes.activeSyncLeaseExpiresAt, heartbeatAt),
              ),
            )
            .returning({
              expiresAt: mailboxes.activeSyncLeaseExpiresAt,
            });

          if (updatedMailbox === undefined) {
            const [currentMailbox] = await database.db
              .select({
                expiresAt: mailboxes.activeSyncLeaseExpiresAt,
              })
              .from(mailboxes)
              .where(eq(mailboxes.id, lease.mailboxId))
              .limit(1);

            const result: MailboxSyncLeaseRenewal = {
              renewed: false,
              expiresAt: toIsoString(currentMailbox?.expiresAt ?? null),
            };

            return result;
          }

          const result: MailboxSyncLeaseRenewal = {
            renewed: true,
            expiresAt: toIsoString(updatedMailbox.expiresAt) ?? lease.expiresAt,
          };

          return result;
        }),
      releaseMailboxSyncLease: (lease) =>
        Effect.promise(async () => {
          await database.db
            .update(mailboxes)
            .set({
              activeSyncLeaseAcquiredAt: null,
              activeSyncLeaseExpiresAt: null,
              activeSyncLeaseHeartbeatAt: null,
              activeSyncLeaseOwner: null,
              activeSyncRunId: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(mailboxes.id, lease.mailboxId),
                eq(mailboxes.activeSyncLeaseOwner, lease.leaseOwnerId),
              ),
            );
        }),
    };
  }),
);
