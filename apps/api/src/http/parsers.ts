import { type ProblemDetails } from "@mailmon/core";
import { Schema } from "effect";

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;
export const INVALID_JSON_DETAIL = "Body must be valid JSON.";
export const INVALID_LIMIT_DETAIL = `Query parameter limit must be an integer between 1 and ${MAX_LIST_LIMIT}.`;
export const MISSING_MAILBOX_QUERY_DETAIL = "Query must include mailboxId or mailbox_id.";
export const INVALID_CONNECT_SESSION_BODY_DETAIL =
  "Body must include provider, tenantExternalId, mailboxExternalId, and redirectUrl.";
export const INVALID_WEBHOOK_ENDPOINT_BODY_DETAIL =
  "Body must include a valid http(s) url and an optional description.";
export const INVALID_REPLAY_BODY_DETAIL =
  "Body must include mailboxId/mailbox_id, webhookEndpointId/webhook_endpoint_id, startTime/start_time, and endTime/end_time.";
export const INVALID_WEBHOOK_SUBSCRIPTION_BODY_DETAIL =
  "Body must include mailboxIds/mailbox_ids and eventTypes/event_types arrays.";
export const INVALID_WEBHOOK_EVENT_TYPES_DETAIL =
  "Body eventTypes/event_types must only include message.created, message.updated, or thread.updated.";

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const NonEmptyString = Schema.NonEmptyString;
const OptionalNonEmptyString = Schema.optional(NonEmptyString);
const OptionalString = Schema.optional(Schema.String);
const OptionalListLimit = Schema.optional(
  Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, MAX_LIST_LIMIT)),
);

const HttpUrlSchema = NonEmptyString.pipe(Schema.filter((value) => isHttpUrl(value)));

export const CreateConnectSessionBodySchema = Schema.Struct({
  provider: Schema.Literal("gmail"),
  tenantExternalId: NonEmptyString,
  mailboxExternalId: NonEmptyString,
  redirectUrl: NonEmptyString,
});

export const CreateWebhookEndpointBodySchema = Schema.Struct({
  url: HttpUrlSchema,
  description: Schema.optional(Schema.NullOr(NonEmptyString)),
});

export const WebhookEventTypeBodySchema = Schema.Literal(
  "message.created",
  "message.updated",
  "thread.updated",
);

const WebhookSubscriptionCamelBodySchema = Schema.Struct({
  mailboxIds: Schema.NonEmptyArray(NonEmptyString),
  eventTypes: Schema.NonEmptyArray(WebhookEventTypeBodySchema),
});

const WebhookSubscriptionSnakeBodySchema = Schema.Struct({
  mailbox_ids: Schema.NonEmptyArray(NonEmptyString),
  event_types: Schema.NonEmptyArray(WebhookEventTypeBodySchema),
});

export const CreateWebhookEndpointSubscriptionBodySchema = Schema.Union(
  WebhookSubscriptionCamelBodySchema,
  WebhookSubscriptionSnakeBodySchema,
);

export type CreateWebhookEndpointSubscriptionBody = Schema.Schema.Type<
  typeof CreateWebhookEndpointSubscriptionBodySchema
>;

const ReplayCamelBodySchema = Schema.Struct({
  mailboxId: NonEmptyString,
  webhookEndpointId: NonEmptyString,
  startTime: NonEmptyString,
  endTime: NonEmptyString,
});

const ReplaySnakeBodySchema = Schema.Struct({
  mailbox_id: NonEmptyString,
  webhook_endpoint_id: NonEmptyString,
  start_time: NonEmptyString,
  end_time: NonEmptyString,
});

export const CreateReplayBodySchema = Schema.Union(ReplayCamelBodySchema, ReplaySnakeBodySchema);

export type CreateReplayBody = Schema.Schema.Type<typeof CreateReplayBodySchema>;

export const CursorLimitQuerySchema = Schema.Struct({
  cursor: OptionalString,
  limit: OptionalListLimit,
});

export const MailboxListQuerySchema = Schema.Struct({
  cursor: OptionalString,
  limit: OptionalListLimit,
  mailboxId: OptionalNonEmptyString,
  mailbox_id: OptionalNonEmptyString,
}).pipe(Schema.filter((query) => query.mailboxId !== undefined || query.mailbox_id !== undefined));

export type CursorLimitQueryParams = Schema.Schema.Type<typeof CursorLimitQuerySchema>;
export type MailboxListQueryParams = Schema.Schema.Type<typeof MailboxListQuerySchema>;

export const invalidRequest = (detail: string): ProblemDetails => {
  return {
    type: "https://api.mailmon.dev/problems/invalid-request",
    title: "Invalid request",
    status: 400,
    code: "invalid_request",
    detail,
    retryable: false,
  };
};
