import { createHash } from "node:crypto";

import {
  MailboxCatalog,
  MailboxConnectSessionStore,
  MailboxQueryCatalog,
  MailboxSyncCoordinator,
  MailboxStateStore,
  SyncRunStore,
  WebhookDeliveryStore,
  WebhookEndpointCatalog,
  WebhookEndpointStore,
  WebhookEndpointSubscriptionStore,
  WorkspaceApiKeyStore,
  invalidPaginationCursor,
  mailboxAlreadyConnected,
  webhookEndpointAlreadyExists,
  webhookEndpointSubscriptionAlreadyExists,
  makeProblem,
  type CanonicalMessageRecord,
  type CanonicalThreadRecord,
  type CompletedMailboxConnectSession,
  type CompletedWebhookDeliveryAttempt,
  type CompletedSyncRun,
  type CreatedWebhookEndpointResource,
  type ListMailboxMessagesRequest,
  type ListMailboxThreadsRequest,
  type ListResource,
  type MailboxOperationalError,
  type MailboxResource,
  type MailboxEventEnvelope,
  type MailboxEventType,
  type MailboxSyncLeaseAcquisition,
  type MailboxSyncCommitResult,
  type MailboxSyncLeaseRenewal,
  type MessageResource,
  type PreparedWebhookDelivery,
  type StartedSyncRun,
  type StoredConnectSession,
  type ThreadListItemResource,
  type ThreadMessageSummaryResource,
  type ThreadResource,
  type WebhookEndpointDeliveryState,
  type WebhookEndpointOperationalError,
  type WebhookEndpointResource,
  type WebhookEndpointSubscriptionResource,
  type WebhookDeliveryScheduleRequest,
  type WebhookEventType,
  type WorkspaceApiKeyIdentity,
} from "@mailmon/core";
import { GmailMailboxCredentialStore, GmailRefreshTokenCipher } from "@mailmon/gmail";
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";

import { createDb } from "./client.js";
import {
  gmailMailboxCredentials,
  mailboxConnectSessions,
  mailboxEvents,
  mailboxes,
  messages,
  syncRuns,
  threads,
  webhookDeliveries,
  webhookEndpoints,
  webhookEndpointSubscriptions,
  workspaceApiKeys,
} from "./schema.js";

type DatabaseHandle = ReturnType<typeof createDb>;
type MailboxRow = typeof mailboxes.$inferSelect;
type ConnectSessionRow = typeof mailboxConnectSessions.$inferSelect;
type MessageRow = typeof messages.$inferSelect;
type ThreadRow = typeof threads.$inferSelect;
type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect;
type WebhookEndpointSubscriptionRow = typeof webhookEndpointSubscriptions.$inferSelect;

const WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS = 30_000;

const hashApiKey = (apiKey: string) => {
  return createHash("sha256").update(apiKey).digest("hex");
};

const normalizeEmailAddress = (emailAddress: string) => {
  return emailAddress.trim().toLowerCase();
};

const createMailboxId = () => {
  return `mbx_${globalThis.crypto.randomUUID()}`;
};

const gmailMailboxCredentialEncryptionFailed = (connectSessionId: string) => {
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

const gmailMailboxCredentialUnreadable = (mailboxId: string) => {
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

const gmailMailboxCredentialReadFailed = (mailboxId: string) => {
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

const isProblemDetails = (
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

const toMailboxProvider = (provider: string): MailboxResource["provider"] => {
  switch (provider) {
    case "gmail":
      return provider;
    default:
      throw new Error(`Unsupported mailbox provider: ${provider}`);
  }
};

const toMailboxStatus = (status: string): MailboxResource["status"] => {
  switch (status) {
    case "active":
    case "disabled":
    case "reconnect_required":
      return status;
    default:
      throw new Error(`Unsupported mailbox status: ${status}`);
  }
};

const toMailboxSyncState = (syncState: string): MailboxResource["syncState"] => {
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

const toMailboxWatchState = (watchState: string): MailboxResource["watchState"] => {
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

const toDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }

  return date;
};

const addMillisecondsToIsoTimestamp = (timestamp: string, milliseconds: number) => {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
};

const toIsoString = (value: Date | null) => {
  return value === null ? null : value.toISOString();
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

const toMailboxResource = (row: MailboxRow): MailboxResource => {
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

const toWebhookEndpointResource = (row: WebhookEndpointRow): WebhookEndpointResource => {
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

const toCreatedWebhookEndpointResource = (
  row: WebhookEndpointRow,
): CreatedWebhookEndpointResource => {
  return {
    ...toWebhookEndpointResource(row),
    secret: row.signingSecret,
  };
};

const toWebhookEndpointSubscriptionResource = (
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

const toMessageResource = (row: MessageRow): MessageResource => {
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

const toThreadListItemResource = (row: ThreadRow): ThreadListItemResource => {
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

const toThreadResource = (
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

const encodePaginationCursor = (cursor: PaginationCursor) => {
  const payload = JSON.stringify({
    id: cursor.id,
    timestamp: cursor.timestamp,
  });

  return `cur_${Buffer.from(payload, "utf8").toString("base64url")}`;
};

const decodePaginationCursor = (
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

const toStoredConnectSession = (row: ConnectSessionRow): StoredConnectSession => {
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

const toWorkspaceApiKeyIdentity = (workspaceId: string): WorkspaceApiKeyIdentity => {
  return {
    workspaceId,
  };
};

const createStartedSyncRun = (mailboxId: string): StartedSyncRun => {
  return {
    syncRunId: `sr_${globalThis.crypto.randomUUID()}`,
    mailboxId,
    startedAt: new Date().toISOString(),
  };
};

const toThreadInsert = (mailboxId: string, thread: CanonicalThreadRecord) => {
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

const toThreadUpdateSet = (thread: CanonicalThreadRecord) => {
  return {
    subject: thread.subject,
    lastMessageAt: toDate(thread.lastMessageAt),
    updatedAt: new Date(),
  };
};

const toMessageInsert = (mailboxId: string, message: CanonicalMessageRecord) => {
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

const toMessageUpdateSet = (message: CanonicalMessageRecord) => {
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

const normalizeLabelIds = (labelIds: ReadonlyArray<string>) => {
  return [...new Set(labelIds)].toSorted();
};

const hasSameStringArrayValues = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) => {
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

const toMailboxMessageEventData = (message: CanonicalMessageRecord) => {
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

const toMailboxThreadEventData = (thread: CanonicalThreadRecord) => {
  return {
    threadId: thread.id,
    providerThreadId: thread.providerThreadId,
    subject: thread.subject,
    lastMessageAt: thread.lastMessageAt,
  };
};

const toCanonicalThreadFromMessageRow = (
  row: Pick<MessageRow, "providerThreadId" | "receivedAt" | "subject" | "threadId">,
): CanonicalThreadRecord => {
  return {
    id: row.threadId,
    providerThreadId: row.providerThreadId,
    subject: row.subject,
    lastMessageAt: row.receivedAt.toISOString(),
  };
};

const isSameCanonicalMessage = (row: MessageRow, message: CanonicalMessageRecord) => {
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

const isSameCanonicalThread = (row: ThreadRow, thread: CanonicalThreadRecord) => {
  return (
    row.id === thread.id &&
    row.providerThreadId === thread.providerThreadId &&
    row.subject === thread.subject &&
    row.lastMessageAt.getTime() === Date.parse(thread.lastMessageAt)
  );
};

const createStableMailboxEventId = (
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

const createStableWebhookDeliveryId = (mailboxEventId: string, webhookEndpointId: string) => {
  const hash = createHash("sha256")
    .update(mailboxEventId)
    .update("\0")
    .update(webhookEndpointId)
    .digest("hex");

  return `del_${hash}`;
};

const createMessageCreatedMailboxEvent = (params: {
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

const createMessageUpdatedMailboxEvent = (params: {
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

const createThreadUpdatedMailboxEvent = (params: {
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

const toMailboxEventInsert = (event: MailboxEventEnvelope) => {
  return {
    id: event.id,
    mailboxId: event.mailboxId,
    eventType: event.type,
    occurredAt: toDate(event.occurredAt),
    payload: event,
  };
};

const toPreparedWebhookDelivery = (
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

const maxIsoTimestamp = (left: string, right: string) => {
  return Date.parse(left) >= Date.parse(right) ? left : right;
};

const toWebhookDeliveryRecoverySchedule = (
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

const getMailboxSyncFailureState = (
  result: CompletedSyncRun,
): Pick<
  MailboxRow,
  "lastErrorCode" | "lastErrorMessage" | "lastErrorOccurredAt" | "lastErrorRetryable" | "syncState"
> | null => {
  if (result.status === "completed" || result.status === "skipped_due_to_active_lease") {
    return null;
  }

  return {
    lastErrorCode: result.detail ?? result.status,
    lastErrorMessage:
      result.status === "lease_lost"
        ? "Mailbox sync lost the active mailbox lease while processing."
        : "Mailbox sync failed after the mailbox lease was acquired.",
    lastErrorOccurredAt: toDate(result.completedAt),
    lastErrorRetryable: true,
    syncState: "failed",
  };
};

export class MailmonDatabase extends Context.Tag("@mailmon/db/MailmonDatabase")<
  MailmonDatabase,
  DatabaseHandle
>() {}

export const createDatabaseLayer = (connectionString: string) =>
  Layer.scoped(
    MailmonDatabase,
    Effect.acquireRelease(
      Effect.sync(() => createDb(connectionString)),
      ({ client }) => Effect.promise(() => client.end()),
    ),
  );

export const createMailboxCatalogLayer = Layer.effect(
  MailboxCatalog,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      getMailbox: (
        mailboxId: string,
        options: Readonly<{
          workspaceId?: string;
        }> = {},
      ) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select()
            .from(mailboxes)
            .where(
              options.workspaceId === undefined
                ? eq(mailboxes.id, mailboxId)
                : and(eq(mailboxes.id, mailboxId), eq(mailboxes.workspaceId, options.workspaceId)),
            )
            .limit(1);

          return Option.fromNullable(row).pipe(Option.map(toMailboxResource));
        }),
    };
  }),
);

export const createWorkspaceApiKeyStoreLayer = Layer.effect(
  WorkspaceApiKeyStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      getWorkspaceForApiKey: (apiKey: string) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select({
              workspaceId: workspaceApiKeys.workspaceId,
            })
            .from(workspaceApiKeys)
            .where(eq(workspaceApiKeys.apiKeyHash, hashApiKey(apiKey)))
            .limit(1);

          return Option.fromNullable(row).pipe(
            Option.map((value) => toWorkspaceApiKeyIdentity(value.workspaceId)),
          );
        }),
    };
  }),
);

export const createWebhookEndpointCatalogLayer = Layer.effect(
  WebhookEndpointCatalog,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      getWebhookEndpoint: (
        webhookEndpointId: string,
        options: Readonly<{
          workspaceId?: string;
        }> = {},
      ) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select()
            .from(webhookEndpoints)
            .where(
              options.workspaceId === undefined
                ? eq(webhookEndpoints.id, webhookEndpointId)
                : and(
                    eq(webhookEndpoints.id, webhookEndpointId),
                    eq(webhookEndpoints.workspaceId, options.workspaceId),
                  ),
            )
            .limit(1);

          return Option.fromNullable(row).pipe(Option.map(toWebhookEndpointResource));
        }),
    };
  }),
);

export const createWebhookEndpointStoreLayer = Layer.effect(
  WebhookEndpointStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      createWebhookEndpoint: (params) =>
        Effect.tryPromise({
          catch: (error) => {
            if (isProblemDetails(error)) {
              return error;
            }

            throw error;
          },
          try: async () => {
            const [row] = await database.db
              .insert(webhookEndpoints)
              .values({
                id: params.id,
                workspaceId: params.workspaceId,
                url: params.url,
                description: params.description,
                signingSecret: params.secret,
                deliveryState: "healthy",
                createdAt: toDate(params.createdAt),
                updatedAt: toDate(params.createdAt),
              })
              .onConflictDoNothing({
                target: [webhookEndpoints.workspaceId, webhookEndpoints.url],
              })
              .returning();

            if (row === undefined) {
              throw webhookEndpointAlreadyExists(params.url);
            }

            return toCreatedWebhookEndpointResource(row);
          },
        }),
    };
  }),
);

export const createWebhookEndpointSubscriptionStoreLayer = Layer.effect(
  WebhookEndpointSubscriptionStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      createWebhookEndpointSubscription: (params) =>
        Effect.tryPromise({
          catch: (error) => {
            if (isProblemDetails(error)) {
              return error;
            }

            throw error;
          },
          try: async () => {
            return database.db.transaction(async (transaction) => {
              const createdAt = toDate(params.createdAt);
              const rows = await transaction
                .insert(webhookEndpointSubscriptions)
                .values(
                  params.mailboxIds.map((mailboxId) => ({
                    id: `whsub_${globalThis.crypto.randomUUID()}`,
                    workspaceId: params.workspaceId,
                    webhookEndpointId: params.webhookEndpointId,
                    mailboxId,
                    eventTypes: [...params.eventTypes],
                    createdAt,
                    updatedAt: createdAt,
                  })),
                )
                .onConflictDoNothing({
                  target: [
                    webhookEndpointSubscriptions.webhookEndpointId,
                    webhookEndpointSubscriptions.mailboxId,
                  ],
                })
                .returning();

              if (rows.length !== params.mailboxIds.length) {
                const insertedMailboxIds = new Set(rows.map((row) => row.mailboxId));
                const conflictingMailboxId = params.mailboxIds.find(
                  (mailboxId) => !insertedMailboxIds.has(mailboxId),
                );

                if (conflictingMailboxId === undefined) {
                  throw new Error(
                    `Webhook endpoint subscription insert count mismatch for ${params.webhookEndpointId}.`,
                  );
                }

                throw webhookEndpointSubscriptionAlreadyExists(
                  params.webhookEndpointId,
                  conflictingMailboxId,
                );
              }

              return {
                object: "list",
                data: rows.map((row) => toWebhookEndpointSubscriptionResource(row)),
                nextCursor: null,
              } satisfies ListResource<WebhookEndpointSubscriptionResource>;
            });
          },
        }),
    };
  }),
);

export const createWebhookDeliveryStoreLayer = Layer.effect(
  WebhookDeliveryStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      createWebhookDeliveriesForMailboxEvents: (mailboxEventIds) =>
        Effect.promise(async () => {
          if (mailboxEventIds.length === 0) {
            return [];
          }

          const eventRows = await database.db
            .select({
              eventType: mailboxEvents.eventType,
              id: mailboxEvents.id,
              mailboxId: mailboxEvents.mailboxId,
            })
            .from(mailboxEvents)
            .where(inArray(mailboxEvents.id, [...new Set(mailboxEventIds)]));

          if (eventRows.length === 0) {
            return [];
          }

          const subscriptions = await database.db
            .select({
              eventTypes: webhookEndpointSubscriptions.eventTypes,
              mailboxId: webhookEndpointSubscriptions.mailboxId,
              webhookEndpointId: webhookEndpointSubscriptions.webhookEndpointId,
            })
            .from(webhookEndpointSubscriptions)
            .where(
              inArray(webhookEndpointSubscriptions.mailboxId, [
                ...new Set(eventRows.map((event) => event.mailboxId)),
              ]),
            );

          const createdAt = new Date();
          const deliveryRows = eventRows.flatMap((event) =>
            subscriptions
              .filter(
                (subscription) =>
                  subscription.mailboxId === event.mailboxId &&
                  subscription.eventTypes.includes(event.eventType),
              )
              .map((subscription) => ({
                id: createStableWebhookDeliveryId(event.id, subscription.webhookEndpointId),
                mailboxEventId: event.id,
                webhookEndpointId: subscription.webhookEndpointId,
                state: "pending",
                attemptCount: 0,
                processingStartedAt: null,
                lastAttemptedAt: null,
                nextAttemptAt: createdAt,
                deliveredAt: null,
                lastResponseStatus: null,
                lastErrorCode: null,
                lastErrorMessage: null,
                lastErrorOccurredAt: null,
                lastErrorRetryable: null,
                createdAt,
                updatedAt: createdAt,
              })),
          );

          if (deliveryRows.length === 0) {
            return [];
          }

          await database.db
            .insert(webhookDeliveries)
            .values(deliveryRows)
            .onConflictDoNothing({
              target: [webhookDeliveries.mailboxEventId, webhookDeliveries.webhookEndpointId],
            });

          return deliveryRows.map((row) => ({
            deliveryId: row.id,
            notBefore: row.nextAttemptAt.toISOString(),
          }));
        }),
      listWebhookDeliveryRecoverySchedules: (recoveredAt: string) =>
        Effect.promise(async () => {
          const recoveryRows = await database.db
            .select({
              createdAt: webhookDeliveries.createdAt,
              id: webhookDeliveries.id,
              nextAttemptAt: webhookDeliveries.nextAttemptAt,
              processingStartedAt: webhookDeliveries.processingStartedAt,
              state: webhookDeliveries.state,
            })
            .from(webhookDeliveries)
            .where(inArray(webhookDeliveries.state, ["pending", "processing"]));

          return recoveryRows
            .map((delivery) => toWebhookDeliveryRecoverySchedule(delivery, recoveredAt))
            .filter((delivery): delivery is WebhookDeliveryScheduleRequest => delivery !== null)
            .toSorted((left, right) =>
              left.notBefore === right.notBefore
                ? left.deliveryId.localeCompare(right.deliveryId)
                : left.notBefore.localeCompare(right.notBefore),
            );
        }),
      prepareWebhookDeliveryAttempt: (deliveryId: string, attemptedAt: string) =>
        Effect.promise(async () => {
          const attemptedAtDate = toDate(attemptedAt);
          const staleProcessingCutoff = new Date(
            attemptedAtDate.getTime() - WEBHOOK_DELIVERY_PROCESSING_TIMEOUT_MS,
          );

          return database.db.transaction(async (transaction) => {
            const [claimedDelivery] = await transaction
              .update(webhookDeliveries)
              .set({
                attemptCount: sql`${webhookDeliveries.attemptCount} + 1`,
                lastAttemptedAt: attemptedAtDate,
                processingStartedAt: attemptedAtDate,
                state: "processing",
                updatedAt: attemptedAtDate,
              })
              .where(
                and(
                  eq(webhookDeliveries.id, deliveryId),
                  or(
                    and(
                      eq(webhookDeliveries.state, "pending"),
                      lte(webhookDeliveries.nextAttemptAt, attemptedAtDate),
                    ),
                    and(
                      eq(webhookDeliveries.state, "processing"),
                      lte(webhookDeliveries.processingStartedAt, staleProcessingCutoff),
                    ),
                  ),
                ),
              )
              .returning();

            if (claimedDelivery === undefined) {
              return Option.none();
            }

            const [deliveryContext] = await transaction
              .select({
                endpoint: webhookEndpoints,
                payload: mailboxEvents.payload,
              })
              .from(webhookDeliveries)
              .innerJoin(
                webhookEndpoints,
                eq(webhookDeliveries.webhookEndpointId, webhookEndpoints.id),
              )
              .innerJoin(mailboxEvents, eq(webhookDeliveries.mailboxEventId, mailboxEvents.id))
              .where(eq(webhookDeliveries.id, deliveryId))
              .limit(1);

            if (deliveryContext === undefined) {
              throw new Error(`Webhook delivery ${deliveryId} could not be prepared.`);
            }

            return Option.some(
              toPreparedWebhookDelivery(
                claimedDelivery,
                deliveryContext.endpoint,
                deliveryContext.payload,
              ),
            );
          });
        }),
      completeWebhookDeliveryAttempt: (attempt: CompletedWebhookDeliveryAttempt) =>
        Effect.promise(async () => {
          const completedAt = toDate(attempt.completedAt);
          const processingStartedAt = toDate(attempt.processingStartedAt);

          return database.db.transaction(async (transaction) => {
            const [delivery] = await transaction
              .update(webhookDeliveries)
              .set({
                deliveredAt: attempt.state === "delivered" ? completedAt : null,
                lastErrorCode: attempt.errorCode,
                lastErrorMessage: attempt.errorMessage,
                lastErrorOccurredAt:
                  attempt.errorCode === null && attempt.errorMessage === null ? null : completedAt,
                lastErrorRetryable: attempt.retryable,
                lastResponseStatus: attempt.responseStatusCode,
                nextAttemptAt:
                  attempt.state === "pending" && attempt.nextAttemptAt !== null
                    ? toDate(attempt.nextAttemptAt)
                    : null,
                processingStartedAt: null,
                state: attempt.state,
                updatedAt: completedAt,
              })
              .where(
                and(
                  eq(webhookDeliveries.id, attempt.deliveryId),
                  eq(webhookDeliveries.state, "processing"),
                  eq(webhookDeliveries.attemptCount, attempt.attemptCount),
                  eq(webhookDeliveries.processingStartedAt, processingStartedAt),
                ),
              )
              .returning({
                webhookEndpointId: webhookDeliveries.webhookEndpointId,
              });

            if (delivery === undefined) {
              return false;
            }

            const [endpoint] = await transaction
              .select({
                consecutiveDeliveryFailures: webhookEndpoints.consecutiveDeliveryFailures,
              })
              .from(webhookEndpoints)
              .where(eq(webhookEndpoints.id, delivery.webhookEndpointId))
              .limit(1);

            if (endpoint === undefined) {
              throw new Error(
                `Webhook endpoint ${delivery.webhookEndpointId} referenced by delivery ${attempt.deliveryId} does not exist.`,
              );
            }

            if (attempt.state === "delivered") {
              await transaction
                .update(webhookEndpoints)
                .set({
                  consecutiveDeliveryFailures: 0,
                  deliveryState: "healthy",
                  lastDeliveryAt: completedAt,
                  lastErrorCode: null,
                  lastErrorMessage: null,
                  lastErrorOccurredAt: null,
                  lastErrorRetryable: null,
                  updatedAt: completedAt,
                })
                .where(eq(webhookEndpoints.id, delivery.webhookEndpointId));

              return true;
            }

            const consecutiveDeliveryFailures = endpoint.consecutiveDeliveryFailures + 1;

            await transaction
              .update(webhookEndpoints)
              .set({
                consecutiveDeliveryFailures,
                deliveryState: consecutiveDeliveryFailures >= 3 ? "failing" : "degraded",
                lastDeliveryAt: completedAt,
                lastErrorCode: attempt.errorCode,
                lastErrorMessage: attempt.errorMessage,
                lastErrorOccurredAt: completedAt,
                lastErrorRetryable: attempt.retryable,
                updatedAt: completedAt,
              })
              .where(eq(webhookEndpoints.id, delivery.webhookEndpointId));

            return true;
          });
        }),
    };
  }),
);

export const createMailboxQueryCatalogLayer = Layer.effect(
  MailboxQueryCatalog,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      listMessages: (request: ListMailboxMessagesRequest) =>
        Effect.tryPromise({
          catch: (error) => {
            if (isProblemDetails(error)) {
              return error;
            }

            throw error;
          },
          try: async () => {
            const paginationCursor =
              request.cursor === null ? null : decodePaginationCursor("messages", request.cursor);
            const whereClause =
              paginationCursor === null
                ? eq(messages.mailboxId, request.mailboxId)
                : and(
                    eq(messages.mailboxId, request.mailboxId),
                    or(
                      lt(messages.receivedAt, toDate(paginationCursor.timestamp)),
                      and(
                        eq(messages.receivedAt, toDate(paginationCursor.timestamp)),
                        lt(messages.id, paginationCursor.id),
                      ),
                    ),
                  );
            const rows = await database.db
              .select()
              .from(messages)
              .where(whereClause)
              .orderBy(desc(messages.receivedAt), desc(messages.id))
              .limit(request.limit + 1);
            const pageRows = rows.slice(0, request.limit);
            const nextCursor =
              rows.length > request.limit
                ? encodePaginationCursor({
                    id: pageRows[pageRows.length - 1]?.id ?? rows[request.limit - 1]!.id,
                    timestamp:
                      pageRows[pageRows.length - 1]?.receivedAt.toISOString() ??
                      rows[request.limit - 1]!.receivedAt.toISOString(),
                  })
                : null;

            return {
              object: "list",
              data: pageRows.map((row) => toMessageResource(row)),
              nextCursor,
            } satisfies ListResource<MessageResource>;
          },
        }),
      getMessage: (
        messageId: string,
        options: Readonly<{
          workspaceId?: string;
        }> = {},
      ) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select({
              message: messages,
            })
            .from(messages)
            .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
            .where(
              options.workspaceId === undefined
                ? eq(messages.id, messageId)
                : and(eq(messages.id, messageId), eq(mailboxes.workspaceId, options.workspaceId)),
            )
            .limit(1);

          return Option.fromNullable(row?.message).pipe(
            Option.map((message) => toMessageResource(message)),
          );
        }),
      listThreads: (request: ListMailboxThreadsRequest) =>
        Effect.tryPromise({
          catch: (error) => {
            if (isProblemDetails(error)) {
              return error;
            }

            throw error;
          },
          try: async () => {
            const paginationCursor =
              request.cursor === null ? null : decodePaginationCursor("threads", request.cursor);
            const whereClause =
              paginationCursor === null
                ? eq(threads.mailboxId, request.mailboxId)
                : and(
                    eq(threads.mailboxId, request.mailboxId),
                    or(
                      lt(threads.lastMessageAt, toDate(paginationCursor.timestamp)),
                      and(
                        eq(threads.lastMessageAt, toDate(paginationCursor.timestamp)),
                        lt(threads.id, paginationCursor.id),
                      ),
                    ),
                  );
            const rows = await database.db
              .select()
              .from(threads)
              .where(whereClause)
              .orderBy(desc(threads.lastMessageAt), desc(threads.id))
              .limit(request.limit + 1);
            const pageRows = rows.slice(0, request.limit);
            const nextCursor =
              rows.length > request.limit
                ? encodePaginationCursor({
                    id: pageRows[pageRows.length - 1]?.id ?? rows[request.limit - 1]!.id,
                    timestamp:
                      pageRows[pageRows.length - 1]?.lastMessageAt.toISOString() ??
                      rows[request.limit - 1]!.lastMessageAt.toISOString(),
                  })
                : null;

            return {
              object: "list",
              data: pageRows.map((row) => toThreadListItemResource(row)),
              nextCursor,
            } satisfies ListResource<ThreadListItemResource>;
          },
        }),
      getThread: (
        threadId: string,
        options: Readonly<{
          workspaceId?: string;
        }> = {},
      ) =>
        Effect.promise(async () => {
          const [threadRow] = await database.db
            .select({
              thread: threads,
            })
            .from(threads)
            .innerJoin(mailboxes, eq(threads.mailboxId, mailboxes.id))
            .where(
              options.workspaceId === undefined
                ? eq(threads.id, threadId)
                : and(eq(threads.id, threadId), eq(mailboxes.workspaceId, options.workspaceId)),
            )
            .limit(1);

          if (threadRow === undefined) {
            return Option.none();
          }

          const threadMessages = await database.db
            .select()
            .from(messages)
            .where(eq(messages.threadId, threadRow.thread.id))
            .orderBy(asc(messages.receivedAt), asc(messages.id));

          return Option.some(toThreadResource(threadRow.thread, threadMessages));
        }),
    };
  }),
);

export const createMailboxConnectSessionStoreLayer = Layer.effect(
  MailboxConnectSessionStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;
    const gmailRefreshTokenCipher = yield* GmailRefreshTokenCipher;

    return {
      createConnectSession: (params) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .insert(mailboxConnectSessions)
            .values({
              id: params.id,
              provider: params.provider,
              workspaceId: params.workspaceId,
              tenantExternalId: params.tenantExternalId,
              mailboxExternalId: params.mailboxExternalId,
              redirectUrl: params.redirectUrl,
              codeVerifier: params.codeVerifier,
              expiresAt: toDate(params.expiresAt),
            })
            .returning();

          if (row === undefined) {
            throw new Error(`Connect session ${params.id} was not created.`);
          }

          return toStoredConnectSession(row);
        }),
      getConnectSession: (connectSessionId: string) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select()
            .from(mailboxConnectSessions)
            .where(eq(mailboxConnectSessions.id, connectSessionId))
            .limit(1);

          return Option.fromNullable(row).pipe(Option.map(toStoredConnectSession));
        }),
      completeConnectSession: (params) =>
        Effect.gen(function* () {
          const encryptedRefreshToken = yield* gmailRefreshTokenCipher
            .encryptRefreshToken(params.refreshToken)
            .pipe(Effect.mapError(() => gmailMailboxCredentialEncryptionFailed(params.connectSessionId)));

          return yield* Effect.tryPromise({
            catch: (error) => {
              if (isProblemDetails(error)) {
                return error;
              }

              throw error;
            },
            try: async () => {
              return database.db.transaction(async (transaction) => {
                const [connectSession] = await transaction
                  .select()
                  .from(mailboxConnectSessions)
                  .where(eq(mailboxConnectSessions.id, params.connectSessionId))
                  .limit(1);

                if (connectSession === undefined) {
                  throw new Error(`Connect session ${params.connectSessionId} does not exist.`);
                }

                if (connectSession.mailboxId !== null) {
                  const [existingMailbox] = await transaction
                    .select()
                    .from(mailboxes)
                    .where(eq(mailboxes.id, connectSession.mailboxId))
                    .limit(1);

                  if (existingMailbox === undefined) {
                    throw new Error(
                      `Mailbox ${connectSession.mailboxId} referenced by connect session ${connectSession.id} does not exist.`,
                    );
                  }

                  return {
                    mailbox: toMailboxResource(existingMailbox),
                    redirectUrl: connectSession.redirectUrl,
                    created: false,
                  } satisfies CompletedMailboxConnectSession;
                }

                const normalizedEmailAddress = normalizeEmailAddress(params.providerAccountEmail);
                const [existingMailbox] = await transaction
                  .select()
                  .from(mailboxes)
                  .where(
                    and(
                      eq(mailboxes.workspaceId, connectSession.workspaceId),
                      eq(mailboxes.provider, connectSession.provider),
                      or(
                        eq(mailboxes.emailAddress, normalizedEmailAddress),
                        and(
                          eq(mailboxes.tenantExternalId, connectSession.tenantExternalId),
                          eq(mailboxes.mailboxExternalId, connectSession.mailboxExternalId),
                        ),
                      ),
                    ),
                  )
                  .limit(1);

                if (existingMailbox !== undefined) {
                  throw mailboxAlreadyConnected(existingMailbox.id);
                }

                const createdAt = toDate(params.connectedAt);
                const mailboxId = createMailboxId();

                const [createdMailbox] = await transaction
                  .insert(mailboxes)
                  .values({
                    id: mailboxId,
                    workspaceId: connectSession.workspaceId,
                    provider: connectSession.provider,
                    tenantExternalId: connectSession.tenantExternalId,
                    mailboxExternalId: connectSession.mailboxExternalId,
                    emailAddress: normalizedEmailAddress,
                    status: "active",
                    syncState: "initializing",
                    watchState: "active",
                    createdAt,
                    updatedAt: createdAt,
                  })
                  .returning();

                if (createdMailbox === undefined) {
                  throw new Error(`Mailbox ${mailboxId} was not created.`);
                }

                await transaction.insert(gmailMailboxCredentials).values({
                  mailboxId,
                  refreshTokenCiphertext: encryptedRefreshToken,
                  createdAt,
                  updatedAt: createdAt,
                });

                await transaction
                  .update(mailboxConnectSessions)
                  .set({
                    mailboxId,
                    completedAt: createdAt,
                    updatedAt: createdAt,
                  })
                  .where(eq(mailboxConnectSessions.id, connectSession.id));

                return {
                  mailbox: toMailboxResource(createdMailbox),
                  redirectUrl: connectSession.redirectUrl,
                  created: true,
                } satisfies CompletedMailboxConnectSession;
              });
            },
          });
        }),
    };
  }),
);

export const createMailboxStateStoreLayer = Layer.effect(
  MailboxStateStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      getMailboxCursor: (mailboxId: string) =>
        Effect.promise(async () => {
          const [row] = await database.db
            .select({
              cursor: mailboxes.cursor,
            })
            .from(mailboxes)
            .where(eq(mailboxes.id, mailboxId))
            .limit(1);

          return row?.cursor ?? null;
        }),
      applySyncResult: ({ mailboxId, leaseOwnerId, nextCursor, snapshot, syncRunId, syncedAt }) =>
        Effect.promise(async () => {
          const syncedAtDate = toDate(syncedAt);

          return database.db.transaction(async (transaction) => {
            const leaseCheckAt = new Date();
            const [row] = await transaction
              .select({
                activeSyncLeaseExpiresAt: mailboxes.activeSyncLeaseExpiresAt,
                activeSyncLeaseOwner: mailboxes.activeSyncLeaseOwner,
                initializedAt: mailboxes.initializedAt,
                tenantExternalId: mailboxes.tenantExternalId,
                workspaceId: mailboxes.workspaceId,
              })
              .from(mailboxes)
              .where(eq(mailboxes.id, mailboxId))
              .limit(1);

            if (
              row === undefined ||
              row.activeSyncLeaseOwner !== leaseOwnerId ||
              row.activeSyncLeaseExpiresAt === null ||
              row.activeSyncLeaseExpiresAt <= leaseCheckAt
            ) {
              return {
                applied: false,
                mailboxEventIds: [],
              } satisfies MailboxSyncCommitResult;
            }

            if (row.workspaceId === null || row.tenantExternalId === null) {
              throw new Error(
                `Mailbox ${mailboxId} is missing the workspace or tenant identity required for mailbox event emission.`,
              );
            }

            const deletedMessageRows =
              snapshot.deletedProviderMessageIds.length === 0
                ? []
                : await transaction
                    .select()
                    .from(messages)
                    .where(
                      and(
                        eq(messages.mailboxId, mailboxId),
                        inArray(messages.providerMessageId, [
                          ...snapshot.deletedProviderMessageIds,
                        ]),
                      ),
                    );
            const existingMessageRows =
              snapshot.messages.length === 0
                ? []
                : await transaction
                    .select()
                    .from(messages)
                    .where(
                      and(
                        eq(messages.mailboxId, mailboxId),
                        inArray(messages.providerMessageId, [
                          ...new Set(snapshot.messages.map((message) => message.providerMessageId)),
                        ]),
                      ),
                    );
            const existingMessagesByProviderMessageId = new Map(
              existingMessageRows.map((message) => [message.providerMessageId, message]),
            );
            const affectedProviderThreadIds = [
              ...new Set([
                ...snapshot.threads.map((thread) => thread.providerThreadId),
                ...snapshot.messages.map((message) => message.providerThreadId),
                ...existingMessageRows.map((message) => message.providerThreadId),
                ...deletedMessageRows.map((message) => message.providerThreadId),
              ]),
            ];
            const existingThreadRows =
              affectedProviderThreadIds.length === 0
                ? []
                : await transaction
                    .select()
                    .from(threads)
                    .where(
                      and(
                        eq(threads.mailboxId, mailboxId),
                        inArray(threads.providerThreadId, affectedProviderThreadIds),
                      ),
                    );
            const existingThreadsByProviderThreadId = new Map(
              existingThreadRows.map((thread) => [thread.providerThreadId, thread]),
            );
            const emittedMailboxEvents: Array<MailboxEventEnvelope> = [];

            for (const thread of snapshot.threads) {
              await transaction
                .insert(threads)
                .values(toThreadInsert(mailboxId, thread))
                .onConflictDoUpdate({
                  target: [threads.mailboxId, threads.providerThreadId],
                  set: toThreadUpdateSet(thread),
                });
            }

            for (const message of snapshot.messages) {
              const existingMessage = existingMessagesByProviderMessageId.get(
                message.providerMessageId,
              );

              if (existingMessage === undefined) {
                emittedMailboxEvents.push(
                  createMessageCreatedMailboxEvent({
                    syncRunId,
                    occurredAt: syncedAt,
                    workspaceId: row.workspaceId,
                    tenantExternalId: row.tenantExternalId,
                    mailboxId,
                    message,
                  }),
                );
              } else if (!isSameCanonicalMessage(existingMessage, message)) {
                emittedMailboxEvents.push(
                  createMessageUpdatedMailboxEvent({
                    syncRunId,
                    occurredAt: syncedAt,
                    workspaceId: row.workspaceId,
                    tenantExternalId: row.tenantExternalId,
                    mailboxId,
                    message,
                  }),
                );
              }

              await transaction
                .insert(messages)
                .values(toMessageInsert(mailboxId, message))
                .onConflictDoUpdate({
                  target: [messages.mailboxId, messages.providerMessageId],
                  set: toMessageUpdateSet(message),
                });
            }

            if (snapshot.deletedProviderMessageIds.length > 0) {
              await transaction
                .delete(messages)
                .where(
                  and(
                    eq(messages.mailboxId, mailboxId),
                    inArray(messages.providerMessageId, [...snapshot.deletedProviderMessageIds]),
                  ),
                );

              await transaction.execute(sql`
                DELETE FROM ${threads}
                WHERE ${threads.mailboxId} = ${mailboxId}
                  AND NOT EXISTS (
                    SELECT 1
                    FROM ${messages}
                    WHERE ${messages.threadId} = ${threads.id}
                  )
              `);
            }

            const recalculatedThreadRecordsByProviderThreadId =
              affectedProviderThreadIds.length === 0
                ? new Map<string, CanonicalThreadRecord>()
                : await transaction
                    .select({
                      providerThreadId: messages.providerThreadId,
                      receivedAt: messages.receivedAt,
                      subject: messages.subject,
                      threadId: messages.threadId,
                    })
                    .from(messages)
                    .where(
                      and(
                        eq(messages.mailboxId, mailboxId),
                        inArray(messages.providerThreadId, affectedProviderThreadIds),
                      ),
                    )
                    .orderBy(
                      asc(messages.providerThreadId),
                      desc(messages.receivedAt),
                      desc(messages.id),
                    )
                    .then((rows) => {
                      const recalculatedThreads = new Map<string, CanonicalThreadRecord>();

                      for (const message of rows) {
                        if (!recalculatedThreads.has(message.providerThreadId)) {
                          recalculatedThreads.set(
                            message.providerThreadId,
                            toCanonicalThreadFromMessageRow(message),
                          );
                        }
                      }

                      return recalculatedThreads;
                    });

            for (const providerThreadId of affectedProviderThreadIds) {
              const existingThread = existingThreadsByProviderThreadId.get(providerThreadId);
              const recalculatedThread =
                recalculatedThreadRecordsByProviderThreadId.get(providerThreadId);

              if (recalculatedThread === undefined) {
                continue;
              }

              if (
                existingThread === undefined ||
                !isSameCanonicalThread(existingThread, recalculatedThread)
              ) {
                emittedMailboxEvents.push(
                  createThreadUpdatedMailboxEvent({
                    syncRunId,
                    occurredAt: syncedAt,
                    workspaceId: row.workspaceId,
                    tenantExternalId: row.tenantExternalId,
                    mailboxId,
                    thread: recalculatedThread,
                  }),
                );
              }

              await transaction
                .insert(threads)
                .values(toThreadInsert(mailboxId, recalculatedThread))
                .onConflictDoUpdate({
                  target: [threads.mailboxId, threads.providerThreadId],
                  set: toThreadUpdateSet(recalculatedThread),
                });
            }

            if (emittedMailboxEvents.length > 0) {
              await transaction
                .insert(mailboxEvents)
                .values(emittedMailboxEvents.map((event) => toMailboxEventInsert(event)))
                .onConflictDoNothing({
                  target: mailboxEvents.id,
                });
            }

            const [updatedMailbox] = await transaction
              .update(mailboxes)
              .set({
                activeSyncLeaseAcquiredAt: null,
                activeSyncLeaseExpiresAt: null,
                activeSyncLeaseHeartbeatAt: null,
                activeSyncLeaseOwner: null,
                activeSyncRunId: null,
                cursor: nextCursor,
                initializedAt: row?.initializedAt ?? syncedAtDate,
                lastErrorCode: null,
                lastErrorMessage: null,
                lastErrorOccurredAt: null,
                lastErrorRetryable: null,
                lastSuccessfulSyncAt: syncedAtDate,
                syncState: "healthy",
                updatedAt: syncedAtDate,
              })
              .where(eq(mailboxes.id, mailboxId))
              .returning({
                id: mailboxes.id,
              });

            if (updatedMailbox === undefined) {
              throw new Error(
                `Mailbox ${mailboxId} could not be finalized after sync application.`,
              );
            }

            const [updatedSyncRun] = await transaction
              .update(syncRuns)
              .set({
                completedAt: syncedAtDate,
                detail: null,
                eventsEmitted: String(emittedMailboxEvents.length),
                nextCursor,
                status: "completed",
              })
              .where(eq(syncRuns.id, syncRunId))
              .returning({
                id: syncRuns.id,
              });

            if (updatedSyncRun === undefined) {
              throw new Error(
                `Sync run ${syncRunId} could not be finalized after sync application.`,
              );
            }

            return {
              applied: true,
              mailboxEventIds: emittedMailboxEvents.map((event) => event.id),
            } satisfies MailboxSyncCommitResult;
          });
        }),
    };
  }),
);

export const createGmailMailboxCredentialStoreLayer = Layer.effect(
  GmailMailboxCredentialStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;
    const gmailRefreshTokenCipher = yield* GmailRefreshTokenCipher;

    return {
      getGmailMailboxCredential: (mailboxId: string) =>
        Effect.gen(function* () {
          const [row] = yield* Effect.tryPromise({
            catch: () => gmailMailboxCredentialReadFailed(mailboxId),
            try: () => {
              return database.db
                .select({
                  mailboxId: gmailMailboxCredentials.mailboxId,
                  refreshTokenCiphertext: gmailMailboxCredentials.refreshTokenCiphertext,
                })
                .from(gmailMailboxCredentials)
                .where(eq(gmailMailboxCredentials.mailboxId, mailboxId))
                .limit(1);
            },
          });

          if (row === undefined) {
            return null;
          }

          const refreshToken = yield* gmailRefreshTokenCipher
            .decryptRefreshToken(row.refreshTokenCiphertext)
            .pipe(Effect.mapError(() => gmailMailboxCredentialUnreadable(mailboxId)));

          return {
            mailboxId: row.mailboxId,
            refreshToken,
          };
        }),
    };
  }),
);

export const createSyncRunStoreLayer = Layer.effect(
  SyncRunStore,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      startSyncRun: (mailboxId: string) =>
        Effect.promise(async () => {
          const startedSyncRun = createStartedSyncRun(mailboxId);

          await database.db.insert(syncRuns).values({
            id: startedSyncRun.syncRunId,
            mailboxId: startedSyncRun.mailboxId,
            status: "running",
            startedAt: toDate(startedSyncRun.startedAt),
          });

          return startedSyncRun;
        }),
      completeSyncRun: (result: CompletedSyncRun) =>
        Effect.promise(async () => {
          const completedAt = toDate(result.completedAt);
          const mailboxFailureState = getMailboxSyncFailureState(result);

          await database.db.transaction(async (transaction) => {
            await transaction
              .update(syncRuns)
              .set({
                completedAt,
                detail: result.detail,
                eventsEmitted: String(result.eventsEmitted),
                nextCursor: result.nextCursor,
                status: result.status,
              })
              .where(eq(syncRuns.id, result.syncRunId));

            if (result.status === "skipped_due_to_active_lease") {
              return;
            }

            if (mailboxFailureState !== null) {
              await transaction
                .update(mailboxes)
                .set({
                  ...mailboxFailureState,
                  updatedAt: completedAt,
                })
                .where(eq(mailboxes.id, result.mailboxId));
            }
          });
        }),
    };
  }),
);

export const createMailboxSyncCoordinatorLayer = Layer.effect(
  MailboxSyncCoordinator,
  Effect.gen(function* () {
    const database = yield* MailmonDatabase;

    return {
      acquireMailboxSyncLease: (lease) =>
        Effect.promise(async () => {
          const acquiredAt = toDate(lease.acquiredAt);
          const expiresAt = toDate(lease.expiresAt);

          return database.db.transaction(async (transaction) => {
            const [updatedMailbox] = await transaction
              .update(mailboxes)
              .set({
                activeSyncLeaseAcquiredAt: acquiredAt,
                activeSyncLeaseExpiresAt: expiresAt,
                activeSyncLeaseHeartbeatAt: acquiredAt,
                activeSyncLeaseOwner: lease.leaseOwnerId,
                activeSyncRunId: lease.syncRunId,
                updatedAt: acquiredAt,
              })
              .where(
                and(
                  eq(mailboxes.id, lease.mailboxId),
                  or(
                    isNull(mailboxes.activeSyncLeaseExpiresAt),
                    lte(mailboxes.activeSyncLeaseExpiresAt, acquiredAt),
                  ),
                ),
              )
              .returning({
                expiresAt: mailboxes.activeSyncLeaseExpiresAt,
              });

            if (updatedMailbox === undefined) {
              const [currentMailbox] = await transaction
                .select({
                  expiresAt: mailboxes.activeSyncLeaseExpiresAt,
                })
                .from(mailboxes)
                .where(eq(mailboxes.id, lease.mailboxId))
                .limit(1);

              const result: MailboxSyncLeaseAcquisition = {
                acquired: false,
                expiresAt: toIsoString(currentMailbox?.expiresAt ?? null),
              };

              return result;
            }

            await transaction
              .update(syncRuns)
              .set({
                leaseOwnerId: lease.leaseOwnerId,
              })
              .where(eq(syncRuns.id, lease.syncRunId));

            const result: MailboxSyncLeaseAcquisition = {
              acquired: true,
              expiresAt: toIsoString(updatedMailbox.expiresAt) ?? lease.expiresAt,
            };

            return result;
          });
        }),
      renewMailboxSyncLease: (lease) =>
        Effect.promise(async () => {
          const heartbeatAt = toDate(lease.heartbeatAt);
          const expiresAt = toDate(lease.expiresAt);

          const [updatedMailbox] = await database.db
            .update(mailboxes)
            .set({
              activeSyncLeaseExpiresAt: expiresAt,
              activeSyncLeaseHeartbeatAt: heartbeatAt,
              updatedAt: heartbeatAt,
            })
            .where(
              and(
                eq(mailboxes.id, lease.mailboxId),
                eq(mailboxes.activeSyncLeaseOwner, lease.leaseOwnerId),
                gt(mailboxes.activeSyncLeaseExpiresAt, heartbeatAt),
              ),
            )
            .returning({
              expiresAt: mailboxes.activeSyncLeaseExpiresAt,
            });

          if (updatedMailbox === undefined) {
            const [currentMailbox] = await database.db
              .select({
                expiresAt: mailboxes.activeSyncLeaseExpiresAt,
              })
              .from(mailboxes)
              .where(eq(mailboxes.id, lease.mailboxId))
              .limit(1);

            const result: MailboxSyncLeaseRenewal = {
              renewed: false,
              expiresAt: toIsoString(currentMailbox?.expiresAt ?? null),
            };

            return result;
          }

          const result: MailboxSyncLeaseRenewal = {
            renewed: true,
            expiresAt: toIsoString(updatedMailbox.expiresAt) ?? lease.expiresAt,
          };

          return result;
        }),
      releaseMailboxSyncLease: (lease) =>
        Effect.promise(async () => {
          await database.db
            .update(mailboxes)
            .set({
              activeSyncLeaseAcquiredAt: null,
              activeSyncLeaseExpiresAt: null,
              activeSyncLeaseHeartbeatAt: null,
              activeSyncLeaseOwner: null,
              activeSyncRunId: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(mailboxes.id, lease.mailboxId),
                eq(mailboxes.activeSyncLeaseOwner, lease.leaseOwnerId),
              ),
            );
        }),
    };
  }),
);

export const createPersistenceServicesLayer = Layer.mergeAll(
  createMailboxCatalogLayer,
  createMailboxConnectSessionStoreLayer,
  createMailboxQueryCatalogLayer,
  createMailboxStateStoreLayer,
  createMailboxSyncCoordinatorLayer,
  createSyncRunStoreLayer,
  createWebhookDeliveryStoreLayer,
  createWebhookEndpointCatalogLayer,
  createWebhookEndpointStoreLayer,
  createWebhookEndpointSubscriptionStoreLayer,
  createWorkspaceApiKeyStoreLayer,
);

export const createCorePersistenceLayer = (connectionString: string) =>
  createPersistenceServicesLayer.pipe(Layer.provide(createDatabaseLayer(connectionString)));

export const createWorkerPersistenceLayer = (connectionString: string) =>
  Layer.mergeAll(createPersistenceServicesLayer, createGmailMailboxCredentialStoreLayer).pipe(
    Layer.provide(createDatabaseLayer(connectionString)),
  );
