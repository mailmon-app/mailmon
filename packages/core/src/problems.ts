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
