import type { ProblemDetails } from "./contracts.js";

export const makeProblem = (problem: ProblemDetails): ProblemDetails => {
  return problem;
};

export const invalidApiKey = (): ProblemDetails => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/invalid-api-key",
    title: "Invalid API key",
    status: 401,
    code: "invalid_api_key",
    detail: "The provided API key is invalid for any known workspace.",
    retryable: false,
  });
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

export const webhookEndpointNotFound = (webhookEndpointId: string): ProblemDetails => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/webhook-endpoint-not-found",
    title: "Webhook endpoint not found",
    status: 404,
    code: "webhook_endpoint_not_found",
    detail: `Webhook endpoint ${webhookEndpointId} does not exist in the current workspace.`,
    resource: {
      webhook_endpoint_id: webhookEndpointId,
    },
    retryable: false,
  });
};

export const messageNotFound = (messageId: string): ProblemDetails => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/message-not-found",
    title: "Message not found",
    status: 404,
    code: "message_not_found",
    detail: `Message ${messageId} does not exist in the current workspace.`,
    resource: {
      message_id: messageId,
    },
    retryable: false,
  });
};

export const threadNotFound = (threadId: string): ProblemDetails => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/thread-not-found",
    title: "Thread not found",
    status: 404,
    code: "thread_not_found",
    detail: `Thread ${threadId} does not exist in the current workspace.`,
    resource: {
      thread_id: threadId,
    },
    retryable: false,
  });
};

export const invalidPaginationCursor = (resourceType: "messages" | "threads"): ProblemDetails => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/invalid-pagination-cursor",
    title: "Invalid pagination cursor",
    status: 400,
    code: "invalid_pagination_cursor",
    detail: `The pagination cursor for ${resourceType} is invalid.`,
    resource: {
      resource_type: resourceType,
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

export const connectSessionNotFound = (connectSessionId: string): ProblemDetails => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/connect-session-not-found",
    title: "Connect session not found",
    status: 404,
    code: "connect_session_not_found",
    detail: `Connect session ${connectSessionId} does not exist in the current workspace.`,
    resource: {
      connect_session_id: connectSessionId,
    },
    retryable: false,
  });
};

export const connectSessionExpired = (connectSessionId: string): ProblemDetails => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/connect-session-expired",
    title: "Connect session expired",
    status: 410,
    code: "connect_session_expired",
    detail: `Connect session ${connectSessionId} has expired and can no longer be used.`,
    resource: {
      connect_session_id: connectSessionId,
    },
    retryable: false,
  });
};

export const mailboxAlreadyConnected = (mailboxId: string): ProblemDetails => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/mailbox-already-connected",
    title: "Mailbox already connected",
    status: 409,
    code: "mailbox_already_connected",
    detail: "This Gmail account is already connected in this workspace.",
    resource: {
      mailbox_id: mailboxId,
    },
    retryable: false,
  });
};

export const webhookEndpointAlreadyExists = (url: string): ProblemDetails => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/webhook-endpoint-already-exists",
    title: "Webhook endpoint already exists",
    status: 409,
    code: "webhook_endpoint_already_exists",
    detail: `Webhook endpoint ${url} already exists in this workspace.`,
    resource: {
      url,
    },
    retryable: false,
  });
};

export const webhookEndpointSubscriptionAlreadyExists = (
  webhookEndpointId: string,
  mailboxId: string,
): ProblemDetails => {
  return makeProblem({
    type: "https://api.mailmon.dev/problems/webhook-endpoint-subscription-already-exists",
    title: "Webhook endpoint subscription already exists",
    status: 409,
    code: "webhook_endpoint_subscription_already_exists",
    detail: `Webhook endpoint ${webhookEndpointId} already has a subscription for mailbox ${mailboxId}.`,
    resource: {
      mailbox_id: mailboxId,
      webhook_endpoint_id: webhookEndpointId,
    },
    retryable: false,
  });
};
