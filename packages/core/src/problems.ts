import type { ProblemDetails } from "./contracts.js";

export const makeProblem = (problem: ProblemDetails): ProblemDetails => {
  return problem;
};

export const mailboxNotFound = (mailboxId: string): ProblemDetails => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/mailbox-not-found",
    title: "Mailbox not found",
    status: 404,
    code: "mailbox_not_found",
    detail: `Mailbox ${mailboxId} does not exist in the current workspace.`,
    resource: {
      mailbox_id: mailboxId,
    },
    retryable: false,
  });
};

export const mailboxSyncLeaseLost = (mailboxId: string): ProblemDetails => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/mailbox-sync-lease-lost",
    title: "Mailbox sync lease lost",
    status: 409,
    code: "mailbox_sync_lease_lost",
    detail: `Mailbox ${mailboxId} lost its active sync lease while processing.`,
    resource: {
      mailbox_id: mailboxId,
    },
    retryable: true,
  });
};
