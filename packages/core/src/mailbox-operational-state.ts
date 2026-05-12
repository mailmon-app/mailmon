import type {
  CompletedSyncRun,
  MailboxOperationalError,
  MailboxStatus,
  MailboxSyncState,
  MailboxWatchState,
  ProblemDetails,
} from "./contracts.js";

const TERMINAL_MAILBOX_CREDENTIAL_PROBLEM_CODES = new Set([
  "gmail_mailbox_credentials_missing",
  "gmail_mailbox_credential_unreadable",
  "gmail_token_refresh_reconnect_required",
]);

export interface MailboxOperationalTransition {
  readonly lastError: MailboxOperationalError | null;
  readonly status?: MailboxStatus;
  readonly syncState?: MailboxSyncState;
  readonly watchState?: MailboxWatchState;
}

const lastError = (
  code: string,
  message: string,
  occurredAt: string,
  retryable: boolean,
): MailboxOperationalError => ({
  code,
  message,
  occurredAt,
  retryable,
});

export const isTerminalMailboxCredentialProblem = (code: string) => {
  return TERMINAL_MAILBOX_CREDENTIAL_PROBLEM_CODES.has(code);
};

export const isTerminalMailboxSyncProblem = (code: string) => {
  return isTerminalMailboxCredentialProblem(code);
};

export const transitionForCredentialUnreadable = (
  params: Readonly<{
    occurredAt: string;
  }>,
): MailboxOperationalTransition => ({
  lastError: lastError(
    "gmail_mailbox_credential_unreadable",
    "Mailbox has a stored Gmail refresh token that could not be decrypted or migrated. The mailbox must be reconnected.",
    params.occurredAt,
    false,
  ),
  status: "reconnect_required",
  syncState: "failed",
});

export const transitionForDispatchRetryExhausted = (
  params: Readonly<{
    occurredAt: string;
  }>,
): MailboxOperationalTransition => ({
  lastError: lastError(
    "mailbox_sync_dispatch_retry_exhausted",
    "Mailbox sync dispatch exhausted transport retries before a worker could process it.",
    params.occurredAt,
    true,
  ),
  syncState: "failed",
});

export const transitionForStuckExecutionRecovery = (
  params: Readonly<{
    occurredAt: string;
  }>,
): MailboxOperationalTransition => ({
  lastError: lastError(
    "stuck_mailbox_execution_recovered",
    "Mailbox sync execution was recovered after its active lease expired.",
    params.occurredAt,
    true,
  ),
  syncState: "lagging",
});

export const transitionForWatchRenewalFailure = (
  params: Readonly<{
    observedAt: string;
    problem: ProblemDetails;
    watchExpiresAt: string | null;
  }>,
): MailboxOperationalTransition => {
  const watchState =
    params.watchExpiresAt !== null &&
    Date.parse(params.watchExpiresAt) <= Date.parse(params.observedAt)
      ? "expired"
      : "unhealthy";

  return {
    lastError: lastError(
      params.problem.code,
      params.problem.detail,
      params.observedAt,
      params.problem.retryable,
    ),
    ...(isTerminalMailboxCredentialProblem(params.problem.code)
      ? {
          status: "reconnect_required" as const,
          syncState: "failed" as const,
        }
      : {}),
    watchState,
  };
};

export const transitionForCompletedSyncRun = (
  result: CompletedSyncRun,
): MailboxOperationalTransition | null => {
  if (
    result.status === "completed" ||
    result.status === "skipped_due_to_active_lease" ||
    (result.status === "reconnect_required" && result.detail === "mailbox_reconnect_required")
  ) {
    return null;
  }

  if (result.detail === "gmail_token_refresh_reconnect_required") {
    return {
      lastError: lastError(
        result.detail,
        "Refreshing the Gmail access token failed because the stored Gmail refresh token is invalid or revoked. The mailbox must be reconnected.",
        result.completedAt,
        false,
      ),
      status: "reconnect_required",
      syncState: "failed",
    };
  }

  if (result.detail === "gmail_mailbox_credential_unreadable") {
    return {
      lastError: lastError(
        result.detail,
        "Mailbox has a stored Gmail refresh token that could not be decrypted. The mailbox must be reconnected.",
        result.completedAt,
        false,
      ),
      status: "reconnect_required",
      syncState: "failed",
    };
  }

  if (result.detail === "gmail_mailbox_credentials_missing") {
    return {
      lastError: lastError(
        result.detail,
        "Mailbox has no stored Gmail refresh token. The mailbox must be reconnected.",
        result.completedAt,
        false,
      ),
      status: "reconnect_required",
      syncState: "failed",
    };
  }

  if (result.detail === "gmail_history_cursor_invalid") {
    return {
      lastError: lastError(
        result.detail,
        "Mailbox requires a repair sync because the stored Gmail history cursor is invalid or expired.",
        result.completedAt,
        true,
      ),
      syncState: "lagging",
    };
  }

  if (result.detail === "mailbox_cursor_regressed") {
    return {
      lastError: lastError(
        result.detail,
        "Mailbox sync produced a cursor older than the stored mailbox cursor. The cursor was not advanced.",
        result.completedAt,
        false,
      ),
      syncState: "lagging",
    };
  }

  if (result.detail === "gmail_rate_limited") {
    return {
      lastError: lastError(
        result.detail,
        "Gmail temporarily rate-limited sync operations for this mailbox.",
        result.completedAt,
        true,
      ),
      syncState: "lagging",
    };
  }

  if (result.detail === "mailbox_sync_dispatch_retry_exhausted") {
    return transitionForDispatchRetryExhausted({ occurredAt: result.completedAt });
  }

  return {
    lastError: lastError(
      result.detail ?? result.status,
      result.status === "lease_lost"
        ? "Mailbox sync lost the active mailbox lease while processing."
        : "Mailbox sync failed after the mailbox lease was acquired.",
      result.completedAt,
      true,
    ),
    syncState: "failed",
  };
};
