import { Effect } from "effect";

import type { RenewMailboxWatchesResult } from "./contracts.js";
import { MailboxSyncDispatcher, MailboxWatchProvider, MailboxWatchStore } from "./services.js";

const DEFAULT_GMAIL_WATCH_RENEWAL_WINDOW_MS = 24 * 60 * 60_000;
const DEFAULT_GMAIL_WATCH_RENEWAL_BATCH_SIZE = 100;

const isMailboxWatchExpired = (watchExpiresAt: string | null, observedAt: string): boolean =>
  watchExpiresAt !== null && Date.parse(watchExpiresAt) <= Date.parse(observedAt);

const parseGmailHistoryId = (historyId: string): bigint | null => {
  if (!/^\d+$/.test(historyId)) {
    return null;
  }

  return BigInt(historyId);
};

const isWatchHistoryAheadOfMailboxCursor = (
  mailboxCursor: string | null,
  watchHistoryId: string,
): boolean => {
  if (mailboxCursor === null) {
    return true;
  }

  const parsedMailboxCursor = parseGmailHistoryId(mailboxCursor);
  const parsedWatchHistoryId = parseGmailHistoryId(watchHistoryId);

  if (parsedMailboxCursor !== null && parsedWatchHistoryId !== null) {
    return parsedWatchHistoryId > parsedMailboxCursor;
  }

  return watchHistoryId !== mailboxCursor;
};

export const renewExpiringMailboxWatches = (
  options: Readonly<{
    limit?: number;
    observedAt?: string;
    renewalWindowMs?: number;
  }> = {},
) =>
  Effect.gen(function* () {
    const observedAt = options.observedAt ?? new Date().toISOString();
    const renewalWindowMs = options.renewalWindowMs ?? DEFAULT_GMAIL_WATCH_RENEWAL_WINDOW_MS;
    const limit = options.limit ?? DEFAULT_GMAIL_WATCH_RENEWAL_BATCH_SIZE;
    const mailboxWatchStore = yield* MailboxWatchStore;
    const mailboxWatchProvider = yield* MailboxWatchProvider;
    const dispatcher = yield* MailboxSyncDispatcher;
    const targets = yield* mailboxWatchStore.listMailboxWatchesNeedingRenewal({
      limit,
      observedAt,
      renewalWindowMs,
    });

    const outcomes = yield* Effect.forEach(
      targets,
      (target) => {
        const expired =
          target.mailbox.watchState === "expired" ||
          isMailboxWatchExpired(target.watchExpiresAt, observedAt);

        return Effect.gen(function* () {
          yield* mailboxWatchStore.markMailboxWatchRenewalStarted({
            mailboxId: target.mailbox.id,
            observedAt,
          });

          const renewal = yield* mailboxWatchProvider.renewMailboxWatch({
            mailbox: target.mailbox,
          });

          yield* mailboxWatchStore.completeMailboxWatchRenewal({
            historyId: renewal.historyId,
            mailboxId: target.mailbox.id,
            renewedAt: observedAt,
            watchExpiresAt: renewal.watchExpiresAt,
          });

          if (expired || isWatchHistoryAheadOfMailboxCursor(target.cursor, renewal.historyId)) {
            yield* dispatcher.dispatchMailboxSync(target.mailbox.id);
          }

          return {
            expired,
            status: "renewed" as const,
          };
        }).pipe(
          Effect.catch((problem) =>
            mailboxWatchStore
              .failMailboxWatchRenewal({
                mailboxId: target.mailbox.id,
                observedAt,
                problem,
              })
              .pipe(
                Effect.as({
                  expired,
                  status: "failed" as const,
                }),
              ),
          ),
        );
      },
      { concurrency: 10 },
    );

    return {
      completedAt: observedAt,
      expired: outcomes.filter((outcome) => outcome.expired).length,
      expiring: outcomes.filter((outcome) => !outcome.expired).length,
      failed: outcomes.filter((outcome) => outcome.status === "failed").length,
      kind: "renew_watches",
      renewed: outcomes.filter((outcome) => outcome.status === "renewed").length,
      scanned: targets.length,
      status: "completed",
    } satisfies RenewMailboxWatchesResult;
  });
