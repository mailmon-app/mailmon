import { Schema } from "effect";

import {
  MailboxStatusSchema,
  MailboxSyncRunInspectionStatusSchema,
  MailboxSyncStateSchema,
  MailboxWatchStateSchema,
  ReplayStatusSchema,
  WebhookEndpointDeliveryStateSchema,
  WebhookEventTypeSchema,
} from "./contracts.js";

const DateTimeStringSchema = Schema.String.annotate({ format: "date-time" });
const NullableStringSchema = Schema.NullOr(Schema.String);
const NullableDateTimeStringSchema = Schema.NullOr(DateTimeStringSchema);
const NullableIntegerSchema = Schema.NullOr(Schema.Int);
const NullableBooleanSchema = Schema.NullOr(Schema.Boolean);

export const PublicOperationalErrorSchema = Schema.Struct({
  code: Schema.NonEmptyString,
  message: Schema.NonEmptyString,
  occurredAt: DateTimeStringSchema,
  retryable: Schema.Boolean,
});

export const PublicProblemDetailsSchema = Schema.Struct({
  type: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  status: Schema.Int,
  code: Schema.NonEmptyString,
  detail: Schema.NonEmptyString,
  resource: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  retryable: Schema.Boolean,
});

export const PublicConnectSessionResourceSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  object: Schema.Literal("connect_session"),
  connectUrl: Schema.NonEmptyString,
  expiresAt: DateTimeStringSchema,
});

export const PublicMailboxResourceSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  object: Schema.Literal("mailbox"),
  provider: Schema.Literal("gmail"),
  emailAddress: Schema.NonEmptyString,
  status: MailboxStatusSchema,
  syncState: MailboxSyncStateSchema,
  watchState: MailboxWatchStateSchema,
  initializedAt: NullableDateTimeStringSchema,
  lastSuccessfulSyncAt: NullableDateTimeStringSchema,
  lastError: Schema.NullOr(PublicOperationalErrorSchema),
});

export const PublicWebhookEndpointResourceSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  object: Schema.Literal("webhook_endpoint"),
  url: Schema.NonEmptyString,
  description: Schema.NullOr(Schema.NonEmptyString),
  deliveryState: WebhookEndpointDeliveryStateSchema,
  lastDeliveryAt: NullableDateTimeStringSchema,
  lastDeliveryError: Schema.NullOr(PublicOperationalErrorSchema),
  createdAt: DateTimeStringSchema,
});

export const PublicCreatedWebhookEndpointResourceSchema = Schema.Struct({
  ...PublicWebhookEndpointResourceSchema.fields,
  secret: Schema.NonEmptyString,
});

export const PublicWebhookEndpointSubscriptionResourceSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  object: Schema.Literal("webhook_endpoint_subscription"),
  webhookEndpointId: Schema.NonEmptyString,
  mailboxId: Schema.NonEmptyString,
  eventTypes: Schema.Array(WebhookEventTypeSchema),
  createdAt: DateTimeStringSchema,
});

export const PublicReplayResourceSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  object: Schema.Literal("replay"),
  status: ReplayStatusSchema,
  mailboxId: Schema.NonEmptyString,
  webhookEndpointId: Schema.NonEmptyString,
  startTime: DateTimeStringSchema,
  endTime: DateTimeStringSchema,
  eventsReplayed: NullableIntegerSchema,
  createdAt: DateTimeStringSchema,
  startedAt: NullableDateTimeStringSchema,
  completedAt: NullableDateTimeStringSchema,
  lastError: NullableStringSchema,
});

export const PublicMessageSenderResourceSchema = Schema.Struct({
  name: NullableStringSchema,
  email: Schema.NonEmptyString,
});

export const PublicMessageResourceSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  mailboxId: Schema.NonEmptyString,
  threadId: Schema.NonEmptyString,
  providerMessageId: Schema.NonEmptyString,
  subject: Schema.String,
  from: PublicMessageSenderResourceSchema,
  snippet: Schema.String,
  receivedAt: DateTimeStringSchema,
  labelIds: Schema.Array(Schema.NonEmptyString),
});

export const PublicThreadListItemResourceSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  object: Schema.Literal("thread"),
  mailboxId: Schema.NonEmptyString,
  providerThreadId: Schema.NonEmptyString,
  subject: Schema.String,
  lastMessageAt: DateTimeStringSchema,
});

export const PublicThreadMessageSummaryResourceSchema = Schema.Struct({
  id: Schema.NonEmptyString,
  subject: Schema.String,
  receivedAt: DateTimeStringSchema,
});

export const PublicThreadResourceSchema = Schema.Struct({
  ...PublicThreadListItemResourceSchema.fields,
  messages: Schema.Array(PublicThreadMessageSummaryResourceSchema),
});

export const PublicMailboxSyncRunInspectionResourceSchema = Schema.Struct({
  syncRunId: Schema.NonEmptyString,
  mailboxId: Schema.NonEmptyString,
  startedAt: DateTimeStringSchema,
  completedAt: NullableDateTimeStringSchema,
  status: MailboxSyncRunInspectionStatusSchema,
  detail: NullableStringSchema,
  eventsEmitted: NullableIntegerSchema,
  leaseOwnerId: NullableStringSchema,
  previousCursor: NullableStringSchema,
  nextCursor: NullableStringSchema,
  cursorAdvanced: NullableBooleanSchema,
});

export const PublicMailboxLagInspectionResourceSchema = Schema.Struct({
  status: MailboxStatusSchema,
  syncState: MailboxSyncStateSchema,
  watchState: MailboxWatchStateSchema,
  lastSuccessfulSyncAt: NullableDateTimeStringSchema,
  lagSeconds: NullableIntegerSchema,
});

export const PublicMailboxCursorMovementInspectionResourceSchema = Schema.Struct({
  currentCursor: NullableStringSchema,
  previousCursor: NullableStringSchema,
  nextCursor: NullableStringSchema,
  advanced: NullableBooleanSchema,
  advancedAt: NullableDateTimeStringSchema,
});

export const PublicMailboxLeaseInspectionResourceSchema = Schema.Struct({
  activeLeaseOwner: NullableStringSchema,
  activeLeaseHeartbeatAt: NullableDateTimeStringSchema,
  activeLeaseExpiresAt: NullableDateTimeStringSchema,
  contentionCount24h: Schema.Int,
  latestContentionAt: NullableDateTimeStringSchema,
  leaseLossCount24h: Schema.Int,
  latestLeaseLossAt: NullableDateTimeStringSchema,
});

export const PublicMailboxWebhookDeliveryDegradationResourceSchema = Schema.Struct({
  webhookEndpointId: Schema.NonEmptyString,
  webhookEndpointUrl: Schema.NonEmptyString,
  deliveryState: WebhookEndpointDeliveryStateSchema,
  consecutiveFailures: Schema.Int,
  pendingDeliveries: Schema.Int,
  processingDeliveries: Schema.Int,
  failedDeliveries: Schema.Int,
  lastDeliveryAt: NullableDateTimeStringSchema,
  lastDeliveryError: Schema.NullOr(PublicOperationalErrorSchema),
});

export const PublicMailboxObservabilitySnapshotResourceSchema = Schema.Struct({
  object: Schema.Literal("mailbox_observability"),
  mailboxId: Schema.NonEmptyString,
  generatedAt: DateTimeStringSchema,
  lag: PublicMailboxLagInspectionResourceSchema,
  cursor: PublicMailboxCursorMovementInspectionResourceSchema,
  lease: PublicMailboxLeaseInspectionResourceSchema,
  webhookDeliveries: Schema.Array(PublicMailboxWebhookDeliveryDegradationResourceSchema),
  latestSyncRun: Schema.NullOr(PublicMailboxSyncRunInspectionResourceSchema),
});

export const PublicListResourceSchema = <TItem extends Schema.Top>(item: TItem) => {
  return Schema.Struct({
    object: Schema.Literal("list"),
    data: Schema.Array(item),
    nextCursor: NullableStringSchema,
  });
};
