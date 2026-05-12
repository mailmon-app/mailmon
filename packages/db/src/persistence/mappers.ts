import { createHash } from "node:crypto";

import {
  invalidPaginationCursor,
  transitionForCompletedSyncRun,
  type CanonicalMessageRecord,
  type CanonicalThreadRecord,
  type CompletedSyncRun,
  type CreatedWebhookEndpointResource,
  type MailboxEventEnvelope,
  type MailboxEventType,
  type MailboxOperationalTransition,
  type MailboxOperationalError,
  type MailboxRepairTarget,
  type MailboxResource,
  type MailboxSyncCommitResult,
  type MailboxSyncRunInspectionResource,
  type MailboxSyncRunInspectionStatus,
  type MailboxWatchRenewalTarget,
  type MailboxWebhookDeliveryDegradationResource,
  type MessageResource,
  type PreparedWebhookDelivery,
  type ProblemDetails,
  type ReplayResource,
  type StartedSyncRun,
  type StoredConnectSession,
  type StuckMailboxSyncExecution,
  type ThreadListItemResource,
  type ThreadMessageSummaryResource,
  type ThreadResource,
  type WebhookDeliveryScheduleRequest,
  type WebhookEndpointDeliveryState,
  type WebhookEndpointOperationalError,
  type WebhookEndpointResource,
  type WebhookEndpointSubscriptionResource,
  type WebhookEventType,
  type WorkspaceApiKeyIdentity,
} from "@mailmon/core";

import {
  mailboxConnectSessions,
  mailboxes,
  messages,
  replays,
  syncRuns,
  threads,
  webhookDeliveries,
  webhookEndpoints,
  webhookEndpointSubscriptions,
} from "../schema.js";
import { isProblemDetails } from "./problems.js";

type MailboxRow = typeof mailboxes.$inferSelect;
type ConnectSessionRow = typeof mailboxConnectSessions.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type ThreadRow = typeof threads.$inferSelect;
type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect;
type WebhookEndpointSubscriptionRow = typeof webhookEndpointSubscriptions.$inferSelect;
type ReplayRow = typeof replays.$inferSelect;
type SyncRunRow = typeof syncRuns.$inferSelect;

export type MailboxSyncApplyTransactionResult =
  | {
      readonly kind: "committed";
      readonly result: MailboxSyncCommitResult;
    }
  | {
      readonly kind: "failed";
      readonly problem: ProblemDetails;
    };

export const WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS = 30_000;

export const hashApiKey = (apiKey: string) => {
  return createHash("sha256").update(apiKey).digest("hex");
};

export const normalizeEmailAddress = (emailAddress: string) => {
  return emailAddress.trim().toLowerCase();
};

export const parseDecimalHistoryCursor = (cursor: string): bigint | null => {
  if (!/^\d+$/.test(cursor)) {
    return null;
  }

  return BigInt(cursor);
};

export const parseTrailingOrdinalCursor = (cursor: string) => {
  const match = /^(.*\D)(\d+)$/.exec(cursor);

  if (match === null) {
    return null;
  }
  const [, prefix, value] = match;

  if (prefix === undefined || value === undefined) {
    return null;
  }

  return {
    prefix,
    value: BigInt(value),
  };
};

export const isMailboxCursorRegression = (
  currentCursor: string | null,
  nextCursor: string | null,
) => {
  if (currentCursor === null || currentCursor === nextCursor) {
    return false;
  }

  if (nextCursor === null) {
    return true;
  }

  const currentDecimal = parseDecimalHistoryCursor(currentCursor);
  const nextDecimal = parseDecimalHistoryCursor(nextCursor);

  if (currentDecimal !== null && nextDecimal !== null) {
    return nextDecimal < currentDecimal;
  }

  if (currentDecimal !== null) {
    return true;
  }

  const currentOrdinal = parseTrailingOrdinalCursor(currentCursor);
  const nextOrdinal = parseTrailingOrdinalCursor(nextCursor);

  if (
    currentOrdinal !== null &&
    nextOrdinal !== null &&
    currentOrdinal.prefix === nextOrdinal.prefix
  ) {
    return nextOrdinal.value < currentOrdinal.value;
  }

  return false;
};

export const createMailboxId = () => {
  return `mbx_${globalThis.crypto.randomUUID()}`;
};

export const toMailboxProvider = (provider: string): MailboxResource["provider"] => {
  switch (provider) {
    case "gmail":
      return provider;
    default:
      throw new Error(`Unsupported mailbox provider: ${provider}`);
  }
};

export const toMailboxStatus = (status: string): MailboxResource["status"] => {
  switch (status) {
    case "active":
    case "disabled":
    case "reconnect_required":
      return status;
    default:
      throw new Error(`Unsupported mailbox status: ${status}`);
  }
};

export const toMailboxSyncState = (syncState: string): MailboxResource["syncState"] => {
  switch (syncState) {
    case "failed":
    case "healthy":
    case "initializing":
    case "lagging":
      return syncState;
    default:
      throw new Error(`Unsupported mailbox sync state: ${syncState}`);
  }
};

export const toMailboxWatchState = (watchState: string): MailboxResource["watchState"] => {
  switch (watchState) {
    case "active":
    case "expired":
    case "expiring":
    case "unhealthy":
      return watchState;
    default:
      throw new Error(`Unsupported mailbox watch state: ${watchState}`);
  }
};

export const toWebhookEndpointDeliveryState = (
  deliveryState: string,
): WebhookEndpointDeliveryState => {
  switch (deliveryState) {
    case "degraded":
    case "failing":
    case "healthy":
      return deliveryState;
    default:
      throw new Error(`Unsupported webhook endpoint delivery state: ${deliveryState}`);
  }
};

export const toWebhookEventTypes = (
  eventTypes: ReadonlyArray<string>,
): ReadonlyArray<WebhookEventType> => {
  return eventTypes.map((eventType) => {
    switch (eventType) {
      case "message.created":
      case "message.updated":
      case "thread.updated":
        return eventType;
      default:
        throw new Error(`Unsupported webhook event type: ${eventType}`);
    }
  });
};

export const toDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }

  return date;
};

export const addMillisecondsToIsoTimestamp = (timestamp: string, milliseconds: number) => {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
};

export const toIsoString = (value: Date | null) => {
  return value === null ? null : value.toISOString();
};

export const toOperationalError = (row: {
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly lastErrorOccurredAt: Date | null;
  readonly lastErrorRetryable: boolean | null;
}) => {
  if (
    row.lastErrorCode === null ||
    row.lastErrorMessage === null ||
    row.lastErrorOccurredAt === null ||
    row.lastErrorRetryable === null
  ) {
    return null;
  }

  return {
    code: row.lastErrorCode,
    message: row.lastErrorMessage,
    occurredAt: row.lastErrorOccurredAt.toISOString(),
    retryable: row.lastErrorRetryable,
  };
};

export const toMailboxOperationalError = (row: MailboxRow): MailboxOperationalError | null => {
  return toOperationalError(row);
};

export const toWebhookEndpointOperationalError = (
  row: WebhookEndpointRow,
): WebhookEndpointOperationalError | null => {
  return toOperationalError(row);
};

export const toMailboxResource = (row: MailboxRow): MailboxResource => {
  return {
    id: row.id,
    object: "mailbox",
    provider: toMailboxProvider(row.provider),
    emailAddress: row.emailAddress,
    status: toMailboxStatus(row.status),
    syncState: toMailboxSyncState(row.syncState),
    watchState: toMailboxWatchState(row.watchState),
    initializedAt: toIsoString(row.initializedAt),
    lastSuccessfulSyncAt: toIsoString(row.lastSuccessfulSyncAt),
    lastError: toMailboxOperationalError(row),
  };
};

export const toMailboxWatchRenewalTarget = (row: MailboxRow): MailboxWatchRenewalTarget => {
  return {
    cursor: row.cursor,
    mailbox: toMailboxResource(row),
    watchExpiresAt: toIsoString(row.watchExpirationAt),
  };
};

export const toMailboxRepairTarget = (row: MailboxRow): MailboxRepairTarget => {
  const reason =
    row.lastErrorCode === "gmail_history_cursor_invalid"
      ? "invalid_cursor"
      : row.watchState === "expired"
        ? "watch_expired"
        : "watch_unhealthy";

  return {
    mailbox: toMailboxResource(row),
    reason,
    requiresCursorReset: reason === "invalid_cursor",
  };
};

export const toStuckMailboxSyncExecution = (row: MailboxRow): StuckMailboxSyncExecution => {
  return {
    leaseOwnerId: row.activeSyncLeaseOwner,
    mailbox: toMailboxResource(row),
    syncRunId: row.activeSyncRunId,
  };
};

export const toWebhookEndpointResource = (row: WebhookEndpointRow): WebhookEndpointResource => {
  return {
    id: row.id,
    object: "webhook_endpoint",
    url: row.url,
    description: row.description,
    deliveryState: toWebhookEndpointDeliveryState(row.deliveryState),
    lastDeliveryAt: toIsoString(row.lastDeliveryAt),
    lastDeliveryError: toWebhookEndpointOperationalError(row),
    createdAt: row.createdAt.toISOString(),
  };
};

export const toCreatedWebhookEndpointResource = (
  row: WebhookEndpointRow,
): CreatedWebhookEndpointResource => {
  return {
    ...toWebhookEndpointResource(row),
    secret: row.signingSecret,
  };
};

export const toWebhookEndpointSubscriptionResource = (
  row: WebhookEndpointSubscriptionRow,
): WebhookEndpointSubscriptionResource => {
  return {
    id: row.id,
    object: "webhook_endpoint_subscription",
    webhookEndpointId: row.webhookEndpointId,
    mailboxId: row.mailboxId,
    eventTypes: toWebhookEventTypes(row.eventTypes),
    createdAt: row.createdAt.toISOString(),
  };
};

export const toReplayResource = (row: ReplayRow): ReplayResource => {
  return {
    id: row.id,
    object: "replay",
    status: row.status,
    mailboxId: row.mailboxId,
    webhookEndpointId: row.webhookEndpointId,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    eventsReplayed: row.eventsReplayed,
    createdAt: row.createdAt.toISOString(),
    startedAt: toIsoString(row.startedAt),
    completedAt: toIsoString(row.completedAt),
    lastError: row.lastError,
  };
};

export const toSyncRunInspectionStatus = (status: string): MailboxSyncRunInspectionStatus => {
  switch (status) {
    case "running":
    case "completed":
    case "skipped_due_to_active_lease":
    case "reconnect_required":
    case "dispatch_retry_exhausted":
    case "failed_after_lease_acquired":
    case "lease_lost":
      return status;
    default:
      throw new Error(`Unsupported sync run status: ${status}`);
  }
};

export const toMailboxSyncRunInspectionResource = (
  row: SyncRunRow,
): MailboxSyncRunInspectionResource => {
  const parsedEventsEmitted =
    row.eventsEmitted === null ? null : Number.parseInt(row.eventsEmitted, 10);

  return {
    syncRunId: row.id,
    mailboxId: row.mailboxId,
    startedAt: row.startedAt.toISOString(),
    completedAt: toIsoString(row.completedAt),
    status: toSyncRunInspectionStatus(row.status),
    detail: row.detail,
    eventsEmitted:
      parsedEventsEmitted !== null && Number.isNaN(parsedEventsEmitted)
        ? null
        : parsedEventsEmitted,
    leaseOwnerId: row.leaseOwnerId,
    previousCursor: row.previousCursor,
    nextCursor: row.nextCursor,
    cursorAdvanced:
      row.previousCursor === null || row.nextCursor === null
        ? null
        : row.previousCursor !== row.nextCursor,
  };
};

export const toMailboxWebhookDeliveryDegradationResource = (row: {
  readonly webhookEndpointId: string;
  readonly webhookEndpointUrl: string;
  readonly deliveryState: string;
  readonly consecutiveFailures: number;
  readonly pendingDeliveries: number;
  readonly processingDeliveries: number;
  readonly failedDeliveries: number;
  readonly lastDeliveryAt: Date | null;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly lastErrorOccurredAt: Date | null;
  readonly lastErrorRetryable: boolean | null;
}): MailboxWebhookDeliveryDegradationResource => {
  return {
    webhookEndpointId: row.webhookEndpointId,
    webhookEndpointUrl: row.webhookEndpointUrl,
    deliveryState: toWebhookEndpointDeliveryState(row.deliveryState),
    consecutiveFailures: row.consecutiveFailures,
    pendingDeliveries: row.pendingDeliveries,
    processingDeliveries: row.processingDeliveries,
    failedDeliveries: row.failedDeliveries,
    lastDeliveryAt: toIsoString(row.lastDeliveryAt),
    lastDeliveryError: toOperationalError({
      lastErrorCode: row.lastErrorCode,
      lastErrorMessage: row.lastErrorMessage,
      lastErrorOccurredAt: row.lastErrorOccurredAt,
      lastErrorRetryable: row.lastErrorRetryable,
    }),
  };
};

export const toMessageResource = (row: MessageRow): MessageResource => {
  return {
    id: row.id,
    mailboxId: row.mailboxId,
    threadId: row.threadId,
    providerMessageId: row.providerMessageId,
    subject: row.subject,
    from: {
      name: row.fromName,
      email: row.fromEmail,
    },
    snippet: row.snippet,
    receivedAt: row.receivedAt.toISOString(),
    labelIds: [...row.labelIds],
  };
};

export const toThreadListItemResource = (row: ThreadRow): ThreadListItemResource => {
  return {
    id: row.id,
    object: "thread",
    mailboxId: row.mailboxId,
    providerThreadId: row.providerThreadId,
    subject: row.subject,
    lastMessageAt: row.lastMessageAt.toISOString(),
  };
};

export const toThreadMessageSummaryResource = (
  row: Pick<MessageRow, "id" | "receivedAt" | "subject">,
): ThreadMessageSummaryResource => {
  return {
    id: row.id,
    subject: row.subject,
    receivedAt: row.receivedAt.toISOString(),
  };
};

export const toThreadResource = (
  row: ThreadRow,
  threadMessages: ReadonlyArray<MessageRow>,
): ThreadResource => {
  return {
    ...toThreadListItemResource(row),
    messages: threadMessages.map((message) => toThreadMessageSummaryResource(message)),
  };
};

interface PaginationCursor {
  readonly id: string;
  readonly timestamp: string;
}

interface SyncRunPaginationCursor {
  readonly id: string;
  readonly startedAt: string;
}

export const encodePaginationCursor = (cursor: PaginationCursor) => {
  const payload = JSON.stringify({
    id: cursor.id,
    timestamp: cursor.timestamp,
  });

  return `cur_${Buffer.from(payload, "utf8").toString("base64url")}`;
};

export const decodePaginationCursor = (
  resourceType: "messages" | "threads",
  cursor: string,
): PaginationCursor => {
  if (!cursor.startsWith("cur_")) {
    throw invalidPaginationCursor(resourceType);
  }

  try {
    const decoded = Buffer.from(cursor.slice(4), "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as unknown;

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("id" in payload) ||
      typeof payload.id !== "string" ||
      payload.id.length === 0 ||
      !("timestamp" in payload) ||
      typeof payload.timestamp !== "string" ||
      Number.isNaN(Date.parse(payload.timestamp))
    ) {
      throw invalidPaginationCursor(resourceType);
    }

    return {
      id: payload.id,
      timestamp: payload.timestamp,
    };
  } catch (error) {
    if (isProblemDetails(error)) {
      throw error;
    }

    throw invalidPaginationCursor(resourceType);
  }
};

export const encodeSyncRunPaginationCursor = (cursor: SyncRunPaginationCursor) => {
  const payload = JSON.stringify(cursor);

  return `cur_${Buffer.from(payload, "utf8").toString("base64url")}`;
};

export const decodeSyncRunPaginationCursor = (cursor: string): SyncRunPaginationCursor => {
  if (!cursor.startsWith("cur_")) {
    throw invalidPaginationCursor("sync_runs");
  }

  try {
    const decoded = Buffer.from(cursor.slice(4), "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as unknown;

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("id" in payload) ||
      typeof payload.id !== "string" ||
      payload.id.length === 0 ||
      !("startedAt" in payload) ||
      typeof payload.startedAt !== "string" ||
      Number.isNaN(Date.parse(payload.startedAt))
    ) {
      throw invalidPaginationCursor("sync_runs");
    }

    return {
      id: payload.id,
      startedAt: payload.startedAt,
    };
  } catch (error) {
    if (isProblemDetails(error)) {
      throw error;
    }

    throw invalidPaginationCursor("sync_runs");
  }
};

export const toStoredConnectSession = (row: ConnectSessionRow): StoredConnectSession => {
  return {
    id: row.id,
    provider: toMailboxProvider(row.provider),
    workspaceId: row.workspaceId,
    tenantExternalId: row.tenantExternalId,
    mailboxExternalId: row.mailboxExternalId,
    redirectUrl: row.redirectUrl,
    codeVerifier: row.codeVerifier,
    expiresAt: row.expiresAt.toISOString(),
    mailboxId: row.mailboxId,
    completedAt: toIsoString(row.completedAt),
  };
};

export const toWorkspaceApiKeyIdentity = (workspaceId: string): WorkspaceApiKeyIdentity => {
  return {
    workspaceId,
  };
};

export const createStartedSyncRun = (mailboxId: string): StartedSyncRun => {
  return {
    syncRunId: `sr_${globalThis.crypto.randomUUID()}`,
    mailboxId,
    startedAt: new Date().toISOString(),
  };
};

export const toThreadInsert = (mailboxId: string, thread: CanonicalThreadRecord) => {
  const timestamp = new Date();

  return {
    id: thread.id,
    mailboxId,
    providerThreadId: thread.providerThreadId,
    subject: thread.subject,
    lastMessageAt: toDate(thread.lastMessageAt),
    updatedAt: timestamp,
  };
};

export const toThreadUpdateSet = (thread: CanonicalThreadRecord) => {
  return {
    subject: thread.subject,
    lastMessageAt: toDate(thread.lastMessageAt),
    updatedAt: new Date(),
  };
};

export const toMessageInsert = (mailboxId: string, message: CanonicalMessageRecord) => {
  const timestamp = new Date();

  return {
    id: message.id,
    mailboxId,
    threadId: message.threadId,
    providerMessageId: message.providerMessageId,
    providerThreadId: message.providerThreadId,
    subject: message.subject,
    fromName: message.from.name,
    fromEmail: message.from.email,
    snippet: message.snippet,
    receivedAt: toDate(message.receivedAt),
    labelIds: normalizeLabelIds(message.labelIds),
    updatedAt: timestamp,
  };
};

export const toMessageUpdateSet = (message: CanonicalMessageRecord) => {
  return {
    threadId: message.threadId,
    providerThreadId: message.providerThreadId,
    subject: message.subject,
    fromName: message.from.name,
    fromEmail: message.from.email,
    snippet: message.snippet,
    receivedAt: toDate(message.receivedAt),
    labelIds: normalizeLabelIds(message.labelIds),
    updatedAt: new Date(),
  };
};

export const normalizeLabelIds = (labelIds: ReadonlyArray<string>) => {
  return [...new Set(labelIds)].toSorted();
};

export const hasSameStringArrayValues = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
) => {
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

export const toMailboxMessageEventData = (message: CanonicalMessageRecord) => {
  return {
    messageId: message.id,
    threadId: message.threadId,
    providerMessageId: message.providerMessageId,
    providerThreadId: message.providerThreadId,
    subject: message.subject,
    snippet: message.snippet,
    receivedAt: message.receivedAt,
    labelIds: normalizeLabelIds(message.labelIds),
  };
};

export const toMailboxThreadEventData = (thread: CanonicalThreadRecord) => {
  return {
    threadId: thread.id,
    providerThreadId: thread.providerThreadId,
    subject: thread.subject,
    lastMessageAt: thread.lastMessageAt,
  };
};

export const toCanonicalThreadFromMessageRow = (
  row: Pick<MessageRow, "providerThreadId" | "receivedAt" | "subject" | "threadId">,
): CanonicalThreadRecord => {
  return {
    id: row.threadId,
    providerThreadId: row.providerThreadId,
    subject: row.subject,
    lastMessageAt: row.receivedAt.toISOString(),
  };
};

export const isSameCanonicalMessage = (row: MessageRow, message: CanonicalMessageRecord) => {
  return (
    row.id === message.id &&
    row.threadId === message.threadId &&
    row.providerMessageId === message.providerMessageId &&
    row.providerThreadId === message.providerThreadId &&
    row.subject === message.subject &&
    row.fromName === message.from.name &&
    row.fromEmail === message.from.email &&
    row.snippet === message.snippet &&
    row.receivedAt.getTime() === Date.parse(message.receivedAt) &&
    hasSameStringArrayValues(row.labelIds, normalizeLabelIds(message.labelIds))
  );
};

export const isSameCanonicalThread = (row: ThreadRow, thread: CanonicalThreadRecord) => {
  return (
    row.id === thread.id &&
    row.providerThreadId === thread.providerThreadId &&
    row.subject === thread.subject &&
    row.lastMessageAt.getTime() === Date.parse(thread.lastMessageAt)
  );
};

export const createStableMailboxEventId = (
  syncRunId: string,
  eventType: MailboxEventType,
  mailboxId: string,
  resourceId: string,
) => {
  const hash = createHash("sha256")
    .update(syncRunId)
    .update("\0")
    .update(eventType)
    .update("\0")
    .update(mailboxId)
    .update("\0")
    .update(resourceId)
    .digest("hex");

  return `evt_${hash}`;
};

export const createStableWebhookDeliveryId = (
  mailboxEventId: string,
  webhookEndpointId: string,
) => {
  const hash = createHash("sha256")
    .update(mailboxEventId)
    .update("\0")
    .update(webhookEndpointId)
    .digest("hex");

  return `del_${hash}`;
};

export const createMessageCreatedMailboxEvent = (params: {
  readonly syncRunId: string;
  readonly occurredAt: string;
  readonly workspaceId: string;
  readonly tenantExternalId: string;
  readonly mailboxId: string;
  readonly message: CanonicalMessageRecord;
}): MailboxEventEnvelope => {
  const data = toMailboxMessageEventData(params.message);

  return {
    id: createStableMailboxEventId(
      params.syncRunId,
      "message.created",
      params.mailboxId,
      params.message.id,
    ),
    type: "message.created",
    occurredAt: params.occurredAt,
    workspaceId: params.workspaceId,
    tenantExternalId: params.tenantExternalId,
    mailboxId: params.mailboxId,
    data,
    schemaVersion: 1,
  };
};

export const createMessageUpdatedMailboxEvent = (params: {
  readonly syncRunId: string;
  readonly occurredAt: string;
  readonly workspaceId: string;
  readonly tenantExternalId: string;
  readonly mailboxId: string;
  readonly message: CanonicalMessageRecord;
}): MailboxEventEnvelope => {
  const data = toMailboxMessageEventData(params.message);

  return {
    id: createStableMailboxEventId(
      params.syncRunId,
      "message.updated",
      params.mailboxId,
      params.message.id,
    ),
    type: "message.updated",
    occurredAt: params.occurredAt,
    workspaceId: params.workspaceId,
    tenantExternalId: params.tenantExternalId,
    mailboxId: params.mailboxId,
    data,
    schemaVersion: 1,
  };
};

export const createThreadUpdatedMailboxEvent = (params: {
  readonly syncRunId: string;
  readonly occurredAt: string;
  readonly workspaceId: string;
  readonly tenantExternalId: string;
  readonly mailboxId: string;
  readonly thread: CanonicalThreadRecord;
}): MailboxEventEnvelope => {
  const data = toMailboxThreadEventData(params.thread);

  return {
    id: createStableMailboxEventId(
      params.syncRunId,
      "thread.updated",
      params.mailboxId,
      params.thread.id,
    ),
    type: "thread.updated",
    occurredAt: params.occurredAt,
    workspaceId: params.workspaceId,
    tenantExternalId: params.tenantExternalId,
    mailboxId: params.mailboxId,
    data,
    schemaVersion: 1,
  };
};

export const toMailboxEventInsert = (event: MailboxEventEnvelope) => {
  return {
    id: event.id,
    mailboxId: event.mailboxId,
    eventType: event.type,
    occurredAt: toDate(event.occurredAt),
    payload: event,
  };
};

export const toPreparedWebhookDelivery = (
  delivery: Pick<
    WebhookDeliveryRow,
    "attemptCount" | "id" | "mailboxEventId" | "processingStartedAt" | "webhookEndpointId"
  >,
  endpoint: Pick<WebhookEndpointRow, "id" | "signingSecret" | "url">,
  event: MailboxEventEnvelope,
): PreparedWebhookDelivery => {
  if (delivery.processingStartedAt === null) {
    throw new Error(`Webhook delivery ${delivery.id} is missing its processing start timestamp.`);
  }

  return {
    deliveryId: delivery.id,
    mailboxEventId: delivery.mailboxEventId,
    webhookEndpointId: delivery.webhookEndpointId,
    attemptCount: delivery.attemptCount,
    processingStartedAt: delivery.processingStartedAt.toISOString(),
    url: endpoint.url,
    signingSecret: endpoint.signingSecret,
    event,
  };
};

export const maxIsoTimestamp = (left: string, right: string) => {
  return Date.parse(left) >= Date.parse(right) ? left : right;
};

export const toWebhookDeliveryRecoverySchedule = (
  delivery: Pick<
    WebhookDeliveryRow,
    "createdAt" | "id" | "nextAttemptAt" | "processingStartedAt" | "state"
  >,
  recoveredAt: string,
): WebhookDeliveryScheduleRequest | null => {
  switch (delivery.state) {
    case "pending":
      return {
        deliveryId: delivery.id,
        notBefore: delivery.nextAttemptAt?.toISOString() ?? delivery.createdAt.toISOString(),
      };
    case "processing":
      if (delivery.processingStartedAt === null) {
        return null;
      }

      return {
        deliveryId: delivery.id,
        notBefore: maxIsoTimestamp(
          addMillisecondsToIsoTimestamp(
            delivery.processingStartedAt.toISOString(),
            WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS,
          ),
          recoveredAt,
        ),
      };
    default:
      return null;
  }
};

export const getLatestCompletedAt = (
  rows: ReadonlyArray<{
    readonly completedAt: Date | null;
  }>,
) => {
  return rows.reduce<Date | null>((latest, row) => {
    if (row.completedAt === null) {
      return latest;
    }

    if (latest === null || row.completedAt.getTime() > latest.getTime()) {
      return row.completedAt;
    }

    return latest;
  }, null);
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
