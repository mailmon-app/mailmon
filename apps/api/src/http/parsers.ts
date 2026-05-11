import { type ProblemDetails } from "@mailmon/core";
import { Schema } from "effect";

export const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
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
  Schema.NumberFromString.pipe(
    Schema.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: MAX_LIST_LIMIT })),
  ),
);

const HttpUrlSchema = NonEmptyString.pipe(
  Schema.refine((value): value is string => isHttpUrl(value), {
    description: "a valid http(s) url",
  }),
);

export const CreateConnectSessionBodySchema = Schema.Struct({
  provider: Schema.Literals(["gmail"]),
  tenantExternalId: NonEmptyString,
  mailboxExternalId: NonEmptyString,
  redirectUrl: NonEmptyString,
});

export const CreateWebhookEndpointBodySchema = Schema.Struct({
  url: HttpUrlSchema,
  description: Schema.optional(Schema.NullOr(NonEmptyString)),
});

const WebhookEventTypeBodySchema = Schema.Literals([
  "message.created",
  "message.updated",
  "thread.updated",
]);

const WebhookSubscriptionCamelBodySchema = Schema.Struct({
  mailboxIds: Schema.NonEmptyArray(NonEmptyString),
  eventTypes: Schema.NonEmptyArray(WebhookEventTypeBodySchema),
});

const WebhookSubscriptionSnakeBodySchema = Schema.Struct({
  mailbox_ids: Schema.NonEmptyArray(NonEmptyString),
  event_types: Schema.NonEmptyArray(WebhookEventTypeBodySchema),
});

export const CreateWebhookEndpointSubscriptionBodySchema = Schema.Union([
  WebhookSubscriptionCamelBodySchema,
  WebhookSubscriptionSnakeBodySchema,
]);

export type CreateWebhookEndpointSubscriptionBody =
  typeof CreateWebhookEndpointSubscriptionBodySchema.Type;

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

export const CreateReplayBodySchema = Schema.Union([ReplayCamelBodySchema, ReplaySnakeBodySchema]);

export type CreateReplayBody = typeof CreateReplayBodySchema.Type;

export const CursorLimitQuerySchema = Schema.Struct({
  cursor: OptionalString,
  limit: OptionalListLimit,
});

const MailboxListQueryBaseSchema = Schema.Struct({
  cursor: OptionalString,
  limit: OptionalListLimit,
  mailboxId: OptionalNonEmptyString,
  mailbox_id: OptionalNonEmptyString,
});

type MailboxListQueryBase = typeof MailboxListQueryBaseSchema.Type;

export const MailboxListQuerySchema = MailboxListQueryBaseSchema.pipe(
  Schema.refine(
    (query): query is MailboxListQueryBase =>
      query.mailboxId !== undefined || query.mailbox_id !== undefined,
    {
      description: "a query with mailboxId or mailbox_id",
    },
  ),
);

export type CursorLimitQueryParams = typeof CursorLimitQuerySchema.Type;
export type MailboxListQueryParams = typeof MailboxListQuerySchema.Type;

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
