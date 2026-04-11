import { Schema } from "effect";

export const MailboxStatusSchema = Schema.Literal("active", "reconnect_required", "disabled");
export const MailboxSyncStateSchema = Schema.Literal(
  "initializing",
  "healthy",
  "lagging",
  "failed",
);
export const MailboxWatchStateSchema = Schema.Literal("active", "expiring", "expired", "unhealthy");
export const MailboxEventTypeSchema = Schema.Literal(
  "message.created",
  "message.updated",
  "thread.updated",
);
export const WebhookEventTypeSchema = Schema.Literal(
  "message.created",
  "message.updated",
  "thread.updated",
);
export const WebhookEndpointDeliveryStateSchema = Schema.Literal("healthy", "degraded", "failing");
export const ReplayStatusSchema = Schema.Literal(
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
);
export const SyncRunOutcomeSchema = Schema.Literal(
  "completed",
  "skipped_due_to_active_lease",
  "failed_after_lease_acquired",
  "lease_lost",
);
export const ControlJobKindSchema = Schema.Literal(
  "renew_watches",
  "dispatch_replays",
  "repair_mailboxes",
  "cleanup",
);
export const MailboxSyncJobDataSchema = Schema.Struct({
  mailboxId: Schema.NonEmptyString,
});
export const WebhookDeliveryScheduleRequestSchema = Schema.Struct({
  deliveryId: Schema.NonEmptyString,
  notBefore: Schema.NonEmptyString,
});
export const ControlJobDispatchRequestSchema = Schema.Struct({
  kind: ControlJobKindSchema,
});

export type MailboxStatus = Schema.Schema.Type<typeof MailboxStatusSchema>;
export type MailboxSyncState = Schema.Schema.Type<typeof MailboxSyncStateSchema>;
export type MailboxWatchState = Schema.Schema.Type<typeof MailboxWatchStateSchema>;
export type MailboxEventType = Schema.Schema.Type<typeof MailboxEventTypeSchema>;
export type WebhookEventType = Schema.Schema.Type<typeof WebhookEventTypeSchema>;
export type WebhookEndpointDeliveryState = Schema.Schema.Type<
  typeof WebhookEndpointDeliveryStateSchema
>;
export type ReplayStatus = Schema.Schema.Type<typeof ReplayStatusSchema>;
export type SyncRunOutcome = Schema.Schema.Type<typeof SyncRunOutcomeSchema>;
export type ControlJobKind = Schema.Schema.Type<typeof ControlJobKindSchema>;
export type MailboxSyncJobData = Schema.Schema.Type<typeof MailboxSyncJobDataSchema>;
export type WebhookDeliveryScheduleRequest = Schema.Schema.Type<
  typeof WebhookDeliveryScheduleRequestSchema
>;
export type ControlJobDispatchRequest = Schema.Schema.Type<typeof ControlJobDispatchRequestSchema>;

export interface MailboxOperationalError {
  readonly code: string;
  readonly message: string;
  readonly occurredAt: string;
  readonly retryable: boolean;
}

export interface WebhookEndpointOperationalError {
  readonly code: string;
  readonly message: string;
  readonly occurredAt: string;
  readonly retryable: boolean;
}

export interface ConnectSessionResource {
  readonly id: string;
  readonly object: "connect_session";
  readonly connectUrl: string;
  readonly expiresAt: string;
}

export interface CreateWebhookEndpointRequest {
  readonly url: string;
  readonly description?: string | null;
}

export interface CreateWebhookEndpointSubscriptionRequest {
  readonly mailboxIds: ReadonlyArray<string>;
  readonly eventTypes: ReadonlyArray<WebhookEventType>;
}

export interface CreateConnectSessionRequest {
  readonly provider: "gmail";
  readonly tenantExternalId: string;
  readonly mailboxExternalId: string;
  readonly redirectUrl: string;
}

export interface WebhookEndpointResource {
  readonly id: string;
  readonly object: "webhook_endpoint";
  readonly url: string;
  readonly description: string | null;
  readonly deliveryState: WebhookEndpointDeliveryState;
  readonly lastDeliveryAt: string | null;
  readonly lastDeliveryError: WebhookEndpointOperationalError | null;
  readonly createdAt: string;
}

export interface CreatedWebhookEndpointResource extends WebhookEndpointResource {
  readonly secret: string;
}

export interface WebhookEndpointSubscriptionResource {
  readonly id: string;
  readonly object: "webhook_endpoint_subscription";
  readonly webhookEndpointId: string;
  readonly mailboxId: string;
  readonly eventTypes: ReadonlyArray<WebhookEventType>;
  readonly createdAt: string;
}

export interface StoredConnectSession {
  readonly id: string;
  readonly provider: "gmail";
  readonly workspaceId: string;
  readonly tenantExternalId: string;
  readonly mailboxExternalId: string;
  readonly redirectUrl: string;
  readonly codeVerifier: string;
  readonly expiresAt: string;
  readonly mailboxId: string | null;
  readonly completedAt: string | null;
}

export interface MailboxConnectAuthorization {
  readonly providerAccountEmail: string;
  readonly refreshToken: string;
}

export interface CompletedMailboxConnectSession {
  readonly mailbox: MailboxResource;
  readonly redirectUrl: string;
  readonly created: boolean;
}

export interface MailboxResource {
  readonly id: string;
  readonly object: "mailbox";
  readonly provider: "gmail";
  readonly emailAddress: string;
  readonly status: MailboxStatus;
  readonly syncState: MailboxSyncState;
  readonly watchState: MailboxWatchState;
  readonly initializedAt: string | null;
  readonly lastSuccessfulSyncAt: string | null;
  readonly lastError: MailboxOperationalError | null;
}

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail: string;
  readonly resource?: Readonly<Record<string, string>>;
  readonly retryable: boolean;
}

export interface ReplayResource {
  readonly id: string;
  readonly object: "replay";
  readonly status: ReplayStatus;
  readonly mailboxId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly eventsReplayed?: number;
}

export interface ListResource<T> {
  readonly object: "list";
  readonly data: ReadonlyArray<T>;
  readonly nextCursor: string | null;
}

export interface MessageSenderResource {
  readonly name: string | null;
  readonly email: string;
}

export interface MessageResource {
  readonly id: string;
  readonly mailboxId: string;
  readonly threadId: string;
  readonly providerMessageId: string;
  readonly subject: string;
  readonly from: MessageSenderResource;
  readonly snippet: string;
  readonly receivedAt: string;
  readonly labelIds: ReadonlyArray<string>;
}

export interface ThreadMessageSummaryResource {
  readonly id: string;
  readonly subject: string;
  readonly receivedAt: string;
}

export interface ThreadResource {
  readonly id: string;
  readonly object: "thread";
  readonly mailboxId: string;
  readonly providerThreadId: string;
  readonly subject: string;
  readonly lastMessageAt: string;
  readonly messages: ReadonlyArray<ThreadMessageSummaryResource>;
}

export interface ThreadListItemResource {
  readonly id: string;
  readonly object: "thread";
  readonly mailboxId: string;
  readonly providerThreadId: string;
  readonly subject: string;
  readonly lastMessageAt: string;
}

export interface MailboxMessageEventData {
  readonly messageId: string;
  readonly threadId: string;
  readonly providerMessageId: string;
  readonly providerThreadId: string;
  readonly subject: string;
  readonly snippet: string;
  readonly receivedAt: string;
  readonly labelIds: ReadonlyArray<string>;
}

export interface MailboxThreadEventData {
  readonly threadId: string;
  readonly providerThreadId: string;
  readonly subject: string;
  readonly lastMessageAt: string;
}

interface MailboxEventEnvelopeBase<
  TType extends MailboxEventType,
  TData extends MailboxMessageEventData | MailboxThreadEventData,
> {
  readonly id: string;
  readonly type: TType;
  readonly schemaVersion: 1;
  readonly occurredAt: string;
  readonly workspaceId: string;
  readonly tenantExternalId: string;
  readonly mailboxId: string;
  readonly data: TData;
}

export type MessageCreatedMailboxEventEnvelope = MailboxEventEnvelopeBase<
  "message.created",
  MailboxMessageEventData
>;

export type MessageUpdatedMailboxEventEnvelope = MailboxEventEnvelopeBase<
  "message.updated",
  MailboxMessageEventData
>;

export type ThreadUpdatedMailboxEventEnvelope = MailboxEventEnvelopeBase<
  "thread.updated",
  MailboxThreadEventData
>;

export type MailboxEventEnvelope =
  | MessageCreatedMailboxEventEnvelope
  | MessageUpdatedMailboxEventEnvelope
  | ThreadUpdatedMailboxEventEnvelope;

export type WebhookEventEnvelope = MailboxEventEnvelope;

export interface PreparedWebhookDelivery {
  readonly deliveryId: string;
  readonly mailboxEventId: string;
  readonly webhookEndpointId: string;
  readonly attemptCount: number;
  readonly processingStartedAt: string;
  readonly url: string;
  readonly signingSecret: string;
  readonly event: WebhookEventEnvelope;
}

export interface WebhookDeliverySendResponse {
  readonly statusCode: number;
}

export interface WebhookDeliverySendFailure {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export interface CompletedWebhookDeliveryAttempt {
  readonly deliveryId: string;
  readonly attemptCount: number;
  readonly processingStartedAt: string;
  readonly state: "pending" | "delivered" | "failed";
  readonly completedAt: string;
  readonly nextAttemptAt: string | null;
  readonly responseStatusCode: number | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly retryable: boolean | null;
}

export interface ProcessWebhookDeliveryResult {
  readonly deliveryId: string;
  readonly status: "delivered" | "failed" | "noop" | "scheduled_for_retry";
  readonly attemptCount: number | null;
  readonly nextAttemptAt: string | null;
}

export interface StartedSyncRun {
  readonly syncRunId: string;
  readonly mailboxId: string;
  readonly startedAt: string;
}

export interface CompletedSyncRun {
  readonly syncRunId: string;
  readonly mailboxId: string;
  readonly completedAt: string;
  readonly status: SyncRunOutcome;
  readonly eventsEmitted: number;
  readonly nextCursor: string | null;
  readonly detail: string | null;
}

export interface CanonicalThreadRecord {
  readonly id: string;
  readonly providerThreadId: string;
  readonly subject: string;
  readonly lastMessageAt: string;
}

export interface CanonicalMessageRecord {
  readonly id: string;
  readonly threadId: string;
  readonly providerMessageId: string;
  readonly providerThreadId: string;
  readonly subject: string;
  readonly from: Readonly<{
    readonly name: string | null;
    readonly email: string;
  }>;
  readonly snippet: string;
  readonly receivedAt: string;
  readonly labelIds: ReadonlyArray<string>;
}

export interface MailboxSyncSnapshot {
  readonly threads: ReadonlyArray<CanonicalThreadRecord>;
  readonly messages: ReadonlyArray<CanonicalMessageRecord>;
  readonly deletedProviderMessageIds: ReadonlyArray<string>;
}

export interface MailboxSyncRequest {
  readonly mailbox: MailboxResource;
  readonly cursor: string | null;
}

export interface MailboxProviderSyncResult {
  readonly snapshot: MailboxSyncSnapshot;
  readonly eventsEmitted: number;
  readonly nextCursor: string | null;
}

export interface MailboxSyncLeaseAcquisition {
  readonly acquired: boolean;
  readonly expiresAt: string | null;
}

export interface MailboxSyncLeaseRenewal {
  readonly renewed: boolean;
  readonly expiresAt: string | null;
}

export interface MailboxSyncCommitResult {
  readonly applied: boolean;
  readonly mailboxEventIds: ReadonlyArray<string>;
}

export interface WorkspaceApiKeyIdentity {
  readonly workspaceId: string;
}

export interface ListMailboxMessagesRequest {
  readonly mailboxId: string;
  readonly limit: number;
  readonly cursor: string | null;
}

export interface ListMailboxThreadsRequest {
  readonly mailboxId: string;
  readonly limit: number;
  readonly cursor: string | null;
}

export interface CompletedSyncMailboxResult extends StartedSyncRun {
  readonly status: "completed";
  readonly completedAt: string;
  readonly eventsEmitted: number;
  readonly nextCursor: string | null;
}

export interface SkippedSyncMailboxResult extends StartedSyncRun {
  readonly status: "skipped_due_to_active_lease";
  readonly completedAt: string;
  readonly eventsEmitted: 0;
  readonly nextCursor: null;
}

export type SyncMailboxResult = CompletedSyncMailboxResult | SkippedSyncMailboxResult;
