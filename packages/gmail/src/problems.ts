import { makeProblem, type ProblemDetails } from "@mailmon/core";

const GMAIL_RATE_LIMIT_REASONS = new Set([
  "dailyLimitExceeded",
  "quotaExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

export const isReadonlyRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  return typeof value === "object" && value !== null;
};

const parseGmailErrorReasons = (payload: unknown): ReadonlyArray<string> => {
  if (!isRecord(payload) || !isRecord(payload.error) || !Array.isArray(payload.error.errors)) {
    return [];
  }

  return payload.error.errors.flatMap((errorEntry) => {
    if (!isRecord(errorEntry) || typeof errorEntry.reason !== "string") {
      return [];
    }

    return [errorEntry.reason];
  });
};

export const isGmailRateLimitedResponse = (status: number, payload: unknown) => {
  if (status === 429) {
    return true;
  }

  if (status !== 403) {
    return false;
  }

  return parseGmailErrorReasons(payload).some((reason) => GMAIL_RATE_LIMIT_REASONS.has(reason));
};

export const makeGmailProblem = (params: {
  readonly code: string;
  readonly detail: string;
  readonly mailboxId: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly title: string;
}) => {
  return makeProblem({
    type: `https://api.mailmon.dev/problems/${params.code.replaceAll("_", "-")}`,
    title: params.title,
    status: params.status ?? 502,
    code: params.code,
    detail: params.detail,
    resource: {
      mailbox_id: params.mailboxId,
    },
    retryable: params.retryable,
  });
};

export const makeGmailConnectProblem = (params: {
  readonly code: string;
  readonly connectSessionId: string;
  readonly detail: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly title: string;
}) => {
  return makeProblem({
    type: `https://api.mailmon.dev/problems/${params.code.replaceAll("_", "-")}`,
    title: params.title,
    status: params.status ?? 502,
    code: params.code,
    detail: params.detail,
    resource: {
      connect_session_id: params.connectSessionId,
    },
    retryable: params.retryable,
  });
};

export const makeGmailRateLimitedProblem = (params: {
  readonly mailboxId: string;
  readonly operation: string;
  readonly status: number;
}) => {
  return makeGmailProblem({
    code: "gmail_rate_limited",
    detail: `Gmail temporarily rate-limited ${params.operation} for this mailbox.`,
    mailboxId: params.mailboxId,
    retryable: true,
    status: params.status,
    title: "Gmail rate limited",
  });
};

export const isProblemDetails = (value: unknown): value is ProblemDetails => {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "number" &&
    typeof value.code === "string" &&
    typeof value.detail === "string" &&
    typeof value.retryable === "boolean"
  );
};

export const isReconnectRequiredTokenRefreshPayload = (
  payload: unknown,
): payload is Readonly<{
  error: "invalid_grant";
  error_description?: string;
}> => {
  return (
    isReadonlyRecord(payload) &&
    "error" in payload &&
    payload.error === "invalid_grant" &&
    (!("error_description" in payload) || typeof payload.error_description === "string")
  );
};
