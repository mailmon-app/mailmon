import {
  transitionForCompletedSyncRun,
  type CompletedSyncRun,
  type MailboxOperationalTransition,
  type StartedSyncRun,
} from "@mailmon/core";

import { mailboxes } from "../schema.js";
import { toDate } from "./common-mappers.js";

type MailboxRow = typeof mailboxes.$inferSelect;

export const createStartedSyncRun = (mailboxId: string): StartedSyncRun => {
  return {
    syncRunId: `sr_${globalThis.crypto.randomUUID()}`,
    mailboxId,
    startedAt: new Date().toISOString(),
  };
};

export const toMailboxOperationalTransitionUpdate = (
  transition: MailboxOperationalTransition,
): Partial<
  Pick<
    MailboxRow,
    | "lastErrorCode"
    | "lastErrorMessage"
    | "lastErrorOccurredAt"
    | "lastErrorRetryable"
    | "status"
    | "syncState"
  >
> => {
  return {
    ...(transition.lastError === null
      ? {
          lastErrorCode: null,
          lastErrorMessage: null,
          lastErrorOccurredAt: null,
          lastErrorRetryable: null,
        }
      : {
          lastErrorCode: transition.lastError.code,
          lastErrorMessage: transition.lastError.message,
          lastErrorOccurredAt: toDate(transition.lastError.occurredAt),
          lastErrorRetryable: transition.lastError.retryable,
        }),
    ...(transition.status === undefined ? {} : { status: transition.status }),
    ...(transition.syncState === undefined ? {} : { syncState: transition.syncState }),
    ...(transition.watchState === undefined ? {} : { watchState: transition.watchState }),
  };
};

export const toCompletedSyncRunMailboxTransitionUpdate = (result: CompletedSyncRun) => {
  const transition = transitionForCompletedSyncRun(result);

  return transition === null ? null : toMailboxOperationalTransitionUpdate(transition);
};
