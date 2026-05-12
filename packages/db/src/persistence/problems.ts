import { makeProblem } from "@mailmon/core";

export const gmailMailboxCredentialEncryptionFailed = (connectSessionId: string) => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/gmail-mailbox-credential-encryption-failed",
    title: "Gmail mailbox credential encryption failed",
    status: 500,
    code: "gmail_mailbox_credential_encryption_failed",
    detail: "Persisting the Gmail refresh token securely failed.",
    resource: {
      connect_session_id: connectSessionId,
    },
    retryable: false,
  });
};

export const gmailMailboxCredentialUnreadable = (mailboxId: string) => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/gmail-mailbox-credential-unreadable",
    title: "Gmail mailbox credential unreadable",
    status: 409,
    code: "gmail_mailbox_credential_unreadable",
    detail: `Mailbox ${mailboxId} has a stored Gmail refresh token that could not be decrypted.`,
    resource: {
      mailbox_id: mailboxId,
    },
    retryable: false,
  });
};

export const gmailMailboxCredentialReadFailed = (mailboxId: string) => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/gmail-mailbox-credential-read-failed",
    title: "Gmail mailbox credential read failed",
    status: 500,
    code: "gmail_mailbox_credential_read_failed",
    detail: `Mailbox ${mailboxId} could not load its stored Gmail refresh token.`,
    resource: {
      mailbox_id: mailboxId,
    },
    retryable: true,
  });
};

export const isProblemDetails = (
  value: unknown,
): value is Readonly<{
  code: string;
  detail: string;
  retryable: boolean;
  status: number;
  title: string;
  type: string;
}> => {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "status" in value &&
    typeof value.status === "number" &&
    "code" in value &&
    typeof value.code === "string" &&
    "detail" in value &&
    typeof value.detail === "string" &&
    "retryable" in value &&
    typeof value.retryable === "boolean"
  );
};

type PostgresErrorShape = Readonly<{
  code: string;
  constraint_name?: string;
}>;

const replayActiveOverlapConstraintName = "replays_active_overlap_excl";
const exclusionViolationSqlState = "23P01";
const deadlockDetectedSqlState = "40P01";

const findPostgresError = (error: unknown): PostgresErrorShape | null => {
  let current = error;
  const seen = new Set<unknown>();

  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);

    if ("code" in current && typeof current.code === "string") {
      const constraintName =
        "constraint_name" in current && typeof current.constraint_name === "string"
          ? current.constraint_name
          : undefined;

      return constraintName === undefined
        ? { code: current.code }
        : { code: current.code, constraint_name: constraintName };
    }

    current = "cause" in current ? current.cause : null;
  }

  return null;
};

export const isReplayActiveOverlapConstraintViolation = (error: unknown) => {
  const postgresError = findPostgresError(error);

  return (
    postgresError?.code === exclusionViolationSqlState &&
    postgresError.constraint_name === replayActiveOverlapConstraintName
  );
};

export const isPostgresDeadlockDetected = (error: unknown) => {
  return findPostgresError(error)?.code === deadlockDetectedSqlState;
};
