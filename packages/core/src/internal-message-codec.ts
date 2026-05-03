import { Schema } from "effect";

import {
  ControlJobDispatchRequestSchema,
  type ControlJobDispatchRequest,
  type GmailPushNotification,
  MailboxSyncJobDataSchema,
  type MailboxSyncJobData,
  WebhookDeliveryScheduleRequestSchema,
  type WebhookDeliveryScheduleRequest,
} from "./contracts.js";

export type InternalMessageDecodeResult<T> =
  | {
      readonly value: T;
    }
  | {
      readonly error: string;
    };

const GmailPushNotificationDataSchema = Schema.Struct({
  emailAddress: Schema.NonEmptyString,
  historyId: Schema.NonEmptyString,
});

const encodeJsonString = (value: unknown) => {
  return Schema.encodeUnknownSync(Schema.parseJson())(value);
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  return typeof value === "object" && value !== null;
};

const decodeSchema = <A>(schema: Schema.Schema<A>, value: unknown): A | null => {
  try {
    return Schema.decodeUnknownSync(schema)(value);
  } catch {
    return null;
  }
};

const decodeBase64Json = (encoded: string): unknown => {
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as unknown;
};

const decodePubSubMessageData = (
  payload: unknown,
  options: {
    readonly envelopeMessage: string;
    readonly missingDataMessage: string;
    readonly invalidJsonMessage: string;
  },
): InternalMessageDecodeResult<{
  readonly decoded: unknown;
  readonly message: Readonly<Record<string, unknown>>;
  readonly payload: Readonly<Record<string, unknown>>;
}> => {
  if (!isRecord(payload) || !isRecord(payload.message)) {
    return {
      error: options.envelopeMessage,
    };
  }

  const message = payload.message;

  if (typeof message.data !== "string" || message.data.length === 0) {
    return {
      error: options.missingDataMessage,
    };
  }

  try {
    return {
      value: {
        decoded: decodeBase64Json(message.data),
        message,
        payload,
      },
    };
  } catch {
    return {
      error: options.invalidJsonMessage,
    };
  }
};

export const encodeInternalJsonPayload = (value: unknown) => {
  return encodeJsonString(value);
};

export const createMailboxSyncJobData = (mailboxId: string): MailboxSyncJobData => {
  return {
    mailboxId,
  };
};

export const decodeWebhookDeliveryScheduleRequest = (
  payload: unknown,
): InternalMessageDecodeResult<WebhookDeliveryScheduleRequest> => {
  const request = decodeSchema(WebhookDeliveryScheduleRequestSchema, payload);

  if (request === null) {
    return {
      error: "Expected a webhook delivery payload with non-empty deliveryId and notBefore fields.",
    };
  }

  return {
    value: request,
  };
};

export const decodeControlJobDispatchRequest = (
  payload: unknown,
): InternalMessageDecodeResult<ControlJobDispatchRequest> => {
  const request = decodeSchema(ControlJobDispatchRequestSchema, payload);

  if (request === null) {
    return {
      error: "Expected a control job payload with a supported kind.",
    };
  }

  return {
    value: request,
  };
};

export const decodeMailboxSyncWorkerRequest = (
  payload: unknown,
): InternalMessageDecodeResult<MailboxSyncJobData> => {
  const direct = decodeSchema(MailboxSyncJobDataSchema, payload);

  if (direct !== null) {
    return {
      value: direct,
    };
  }

  const envelope = decodePubSubMessageData(payload, {
    envelopeMessage: "Expected a mailbox-scoped sync payload or a Pub/Sub push envelope.",
    invalidJsonMessage: "Pub/Sub message.data was not valid base64-encoded JSON.",
    missingDataMessage:
      "Expected Pub/Sub message.data to contain a base64-encoded mailbox sync payload.",
  });

  if ("error" in envelope) {
    return envelope;
  }

  const job = decodeSchema(MailboxSyncJobDataSchema, envelope.value.decoded);

  if (job === null) {
    return {
      error: "Expected mailbox sync data to include a non-empty mailboxId field.",
    };
  }

  return {
    value: job,
  };
};

export const decodeMailboxSyncDeadLetterRequest = (
  payload: unknown,
): InternalMessageDecodeResult<MailboxSyncJobData> => {
  const envelope = decodePubSubMessageData(payload, {
    envelopeMessage: "Expected a Pub/Sub dead-letter push envelope with a message object.",
    invalidJsonMessage: "Pub/Sub dead-letter message.data was not valid base64-encoded JSON.",
    missingDataMessage:
      "Expected Pub/Sub dead-letter message.data to contain a base64-encoded mailbox sync payload.",
  });

  if ("error" in envelope) {
    return envelope;
  }

  const job = decodeSchema(MailboxSyncJobDataSchema, envelope.value.decoded);

  if (job === null) {
    return {
      error: "Expected dead-lettered mailbox sync data to include a non-empty mailboxId field.",
    };
  }

  return {
    value: job,
  };
};

export const decodeGmailPushNotificationPubSubEnvelope = (
  payload: unknown,
): InternalMessageDecodeResult<GmailPushNotification> => {
  const envelope = decodePubSubMessageData(payload, {
    envelopeMessage: "Expected a Pub/Sub push envelope with a message object.",
    invalidJsonMessage: "Pub/Sub message.data was not valid base64-encoded JSON.",
    missingDataMessage:
      "Expected Pub/Sub message.data to contain a base64-encoded Gmail notification.",
  });

  if ("error" in envelope) {
    return envelope;
  }

  const notificationData = decodeSchema(GmailPushNotificationDataSchema, envelope.value.decoded);

  if (notificationData === null) {
    return {
      error:
        "Expected Gmail notification data to include non-empty emailAddress and historyId fields.",
    };
  }

  return {
    value: {
      emailAddress: notificationData.emailAddress,
      historyId: notificationData.historyId,
      messageId:
        typeof envelope.value.message.messageId === "string" &&
        envelope.value.message.messageId.length > 0
          ? envelope.value.message.messageId
          : null,
      subscription:
        typeof envelope.value.payload.subscription === "string" &&
        envelope.value.payload.subscription.length > 0
          ? envelope.value.payload.subscription
          : null,
    },
  };
};
