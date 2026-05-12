import { MailboxWatchStore } from "@mailmon/core";
import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { mailboxes } from "../schema.js";
import { MailmonDatabase } from "./database.js";
import {
  isTerminalGmailCredentialProblem,
  toDate,
  toMailboxWatchRenewalTarget,
} from "./mappers.js";

export const createMailboxWatchStoreLayer = Layer.effect(
  MailboxWatchStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      listMailboxWatchesNeedingRenewal: ({ limit, observedAt, renewalWindowMs }) =>
        Effect.promise(async () => {
          const observedAtDate = toDate(observedAt);
          const renewalCutoff = new Date(observedAtDate.getTime() + renewalWindowMs);
          const rows = await database.db
            .select()
            .from(mailboxes)
            .where(
              and(
                eq(mailboxes.provider, "gmail"),
                eq(mailboxes.status, "active"),
                or(
                  isNull(mailboxes.watchExpirationAt),
                  lte(mailboxes.watchExpirationAt, renewalCutoff),
                  inArray(mailboxes.watchState, ["expired", "expiring", "unhealthy"]),
                ),
              ),
            )
            .orderBy(asc(mailboxes.watchExpirationAt), asc(mailboxes.id))
            .limit(limit)
            .for("update", { skipLocked: true });

          return rows.map((row) => toMailboxWatchRenewalTarget(row));
        }),
      markMailboxWatchRenewalStarted: ({ mailboxId, observedAt }) =>
        Effect.promise(async () => {
          const observedAtDate = toDate(observedAt);
          const [row] = await database.db
            .select({
              watchExpirationAt: mailboxes.watchExpirationAt,
            })
            .from(mailboxes)
            .where(eq(mailboxes.id, mailboxId))
            .limit(1);
          const watchState =
            row?.watchExpirationAt !== null &&
            row?.watchExpirationAt !== undefined &&
            row.watchExpirationAt <= observedAtDate
              ? "expired"
              : "expiring";

          await database.db
            .update(mailboxes)
            .set({
              watchState,
              updatedAt: observedAtDate,
            })
            .where(eq(mailboxes.id, mailboxId));
        }),
      completeMailboxWatchRenewal: ({ historyId, mailboxId, renewedAt, watchExpiresAt }) =>
        Effect.promise(async () => {
          const renewedAtDate = toDate(renewedAt);
          const watchExpiresAtDate = toDate(watchExpiresAt);
          const [row] = await database.db
            .select({
              lastErrorCode: mailboxes.lastErrorCode,
            })
            .from(mailboxes)
            .where(eq(mailboxes.id, mailboxId))
            .limit(1);
          const clearLastError = row?.lastErrorCode?.startsWith("gmail_watch_") ?? false;

          await database.db
            .update(mailboxes)
            .set({
              ...(clearLastError
                ? {
                    lastErrorCode: null,
                    lastErrorMessage: null,
                    lastErrorOccurredAt: null,
                    lastErrorRetryable: null,
                  }
                : {}),
              watchExpirationAt: watchExpiresAtDate,
              watchLastHistoryId: historyId,
              watchLastRenewedAt: renewedAtDate,
              watchState: "active",
              updatedAt: renewedAtDate,
            })
            .where(eq(mailboxes.id, mailboxId));
        }),
      failMailboxWatchRenewal: ({ mailboxId, observedAt, problem }) =>
        Effect.promise(async () => {
          const observedAtDate = toDate(observedAt);
          const [row] = await database.db
            .select({
              watchExpirationAt: mailboxes.watchExpirationAt,
            })
            .from(mailboxes)
            .where(eq(mailboxes.id, mailboxId))
            .limit(1);
          const watchState =
            row?.watchExpirationAt !== null &&
            row?.watchExpirationAt !== undefined &&
            row.watchExpirationAt <= observedAtDate
              ? "expired"
              : "unhealthy";

          await database.db
            .update(mailboxes)
            .set({
              lastErrorCode: problem.code,
              lastErrorMessage: problem.detail,
              lastErrorOccurredAt: observedAtDate,
              lastErrorRetryable: problem.retryable,
              ...(isTerminalGmailCredentialProblem(problem.code)
                ? {
                    status: "reconnect_required",
                    syncState: "failed",
                  }
                : {}),
              watchState,
              updatedAt: observedAtDate,
            })
            .where(eq(mailboxes.id, mailboxId));
        }),
    };
  }),
);
