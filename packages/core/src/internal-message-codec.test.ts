import { describe, expect, it } from "@effect/vitest";

import {
  createMailboxSyncJobData,
  decodeControlJobDispatchRequest,
  decodeGmailPushNotificationPubSubEnvelope,
  decodeMailboxSyncDeadLetterRequest,
  decodeMailboxSyncWorkerRequest,
  decodeWebhookDeliveryScheduleRequest,
  encodeInternalJsonPayload,
} from "./internal-message-codec.js";

const pubSubEnvelope = (payload: unknown) => ({
  message: {
    data: Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    messageId: "pubsub_msg_123",
  },
  subscription: "projects/mailmon-staging/subscriptions/mailbox-sync-dispatch-worker",
});

describe("createMailboxSyncJobData", () => {
  it("uses mailbox ids as the unit of work", () => {
    expect(createMailboxSyncJobData("mbx_123")).toEqual({
      mailboxId: "mbx_123",
    });
  });
});

describe("encodeInternalJsonPayload", () => {
  it("serializes internal transport payloads as JSON strings", () => {
    expect(encodeInternalJsonPayload({ mailboxId: "mbx_123" })).toBe(
      JSON.stringify({ mailboxId: "mbx_123" }),
    );
  });
});

describe("decodeMailboxSyncWorkerRequest", () => {
  it("accepts direct local mailbox sync payloads", () => {
    expect(decodeMailboxSyncWorkerRequest({ mailboxId: "mbx_local" })).toEqual({
      value: {
        mailboxId: "mbx_local",
      },
    });
  });

  it("accepts Pub/Sub mailbox sync push envelopes", () => {
    expect(decodeMailboxSyncWorkerRequest(pubSubEnvelope({ mailboxId: "mbx_pubsub" }))).toEqual({
      value: {
        mailboxId: "mbx_pubsub",
      },
    });
  });

  it("rejects malformed Pub/Sub mailbox sync data", () => {
    expect(decodeMailboxSyncWorkerRequest(pubSubEnvelope({ mailboxId: "" }))).toEqual({
      error: "Expected mailbox sync data to include a non-empty mailboxId field.",
    });
  });
});

describe("decodeMailboxSyncDeadLetterRequest", () => {
  it("accepts Pub/Sub dead-letter envelopes", () => {
    expect(decodeMailboxSyncDeadLetterRequest(pubSubEnvelope({ mailboxId: "mbx_dead" }))).toEqual({
      value: {
        mailboxId: "mbx_dead",
      },
    });
  });

  it("rejects direct dead-letter payloads", () => {
    expect(decodeMailboxSyncDeadLetterRequest({ mailboxId: "mbx_dead" })).toEqual({
      error: "Expected a Pub/Sub dead-letter push envelope with a message object.",
    });
  });
});

describe("decodeGmailPushNotificationPubSubEnvelope", () => {
  it("decodes Gmail Push Notification envelopes", () => {
    expect(
      decodeGmailPushNotificationPubSubEnvelope(
        pubSubEnvelope({
          emailAddress: "demo@mailmon.dev",
          historyId: "hist_123",
        }),
      ),
    ).toEqual({
      value: {
        emailAddress: "demo@mailmon.dev",
        historyId: "hist_123",
        messageId: "pubsub_msg_123",
        subscription: "projects/mailmon-staging/subscriptions/mailbox-sync-dispatch-worker",
      },
    });
  });

  it("normalizes numeric Gmail history ids from live Pub/Sub notifications", () => {
    expect(
      decodeGmailPushNotificationPubSubEnvelope(
        pubSubEnvelope({
          emailAddress: "demo@mailmon.dev",
          historyId: 5088,
        }),
      ),
    ).toEqual({
      value: {
        emailAddress: "demo@mailmon.dev",
        historyId: "5088",
        messageId: "pubsub_msg_123",
        subscription: "projects/mailmon-staging/subscriptions/mailbox-sync-dispatch-worker",
      },
    });
  });

  it("rejects malformed Gmail Push Notification data", () => {
    expect(
      decodeGmailPushNotificationPubSubEnvelope(
        pubSubEnvelope({
          emailAddress: "demo@mailmon.dev",
        }),
      ),
    ).toEqual({
      error:
        "Expected Gmail notification data to include non-empty emailAddress and historyId fields.",
    });
  });
});

describe("decodeWebhookDeliveryScheduleRequest", () => {
  it("accepts webhook delivery schedule payloads", () => {
    expect(
      decodeWebhookDeliveryScheduleRequest({
        deliveryId: "del_123",
        notBefore: "2026-03-24T00:00:00.000Z",
      }),
    ).toEqual({
      value: {
        deliveryId: "del_123",
        notBefore: "2026-03-24T00:00:00.000Z",
      },
    });
  });
});

describe("decodeControlJobDispatchRequest", () => {
  it("accepts supported control job payloads", () => {
    expect(decodeControlJobDispatchRequest({ kind: "recover_stuck_syncs" })).toEqual({
      value: {
        kind: "recover_stuck_syncs",
      },
    });
  });

  it("rejects unsupported control job payloads", () => {
    expect(decodeControlJobDispatchRequest({ kind: "unknown" })).toEqual({
      error: "Expected a control job payload with a supported kind.",
    });
  });
});
