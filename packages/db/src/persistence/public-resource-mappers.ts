import {
  type CreatedWebhookEndpointResource,
  type MailboxOperationalError,
  type MailboxRepairTarget,
  type MailboxResource,
  type MailboxSyncRunInspectionResource,
  type MailboxSyncRunInspectionStatus,
  type MailboxWatchRenewalTarget,
  type MailboxWebhookDeliveryDegradationResource,
  type MessageResource,
  type ReplayResource,
  type StoredConnectSession,
  type StuckMailboxSyncExecution,
  type ThreadListItemResource,
  type ThreadMessageSummaryResource,
  type ThreadResource,
  type WebhookEndpointDeliveryState,
  type WebhookEndpointOperationalError,
  type WebhookEndpointResource,
  type WebhookEndpointSubscriptionResource,
  type WebhookEventType,
} from "@mailmon/core";

import {
  mailboxConnectSessions,
  mailboxes,
  messages,
  replays,
  syncRuns,
  threads,
  webhookEndpoints,
  webhookEndpointSubscriptions,
} from "../schema.js";
import { toIsoString } from "./common-mappers.js";

type MailboxRow = typeof mailboxes.$inferSelect;
type ConnectSessionRow = typeof mailboxConnectSessions.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type ThreadRow = typeof threads.$inferSelect;
type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect;
type WebhookEndpointSubscriptionRow = typeof webhookEndpointSubscriptions.$inferSelect;
type ReplayRow = typeof replays.$inferSelect;
type SyncRunRow = typeof syncRuns.$inferSelect;

const toMailboxProvider = (provider: string): MailboxResource["provider"] => {
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

const toWebhookEndpointDeliveryState = (deliveryState: string): WebhookEndpointDeliveryState => {
  switch (deliveryState) {
    case "degraded":
    case "failing":
    case "healthy":
      return deliveryState;
    default:
      throw new Error(`Unsupported webhook endpoint delivery state: ${deliveryState}`);
  }
};

const toWebhookEventTypes = (
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

const toOperationalError = (row: {
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

const toMailboxOperationalError = (row: MailboxRow): MailboxOperationalError | null => {
  return toOperationalError(row);
};

const toWebhookEndpointOperationalError = (
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

const toSyncRunInspectionStatus = (status: string): MailboxSyncRunInspectionStatus => {
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

const toThreadMessageSummaryResource = (
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
