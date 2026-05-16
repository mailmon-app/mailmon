import { describe, expect, it } from "@effect/vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import type { Generator } from "@hegeldev/hegel/generators";

import {
  decodeControlJobDispatchRequest,
  decodeGmailPushNotificationPubSubEnvelope,
  decodeMailboxSyncDeadLetterRequest,
  decodeMailboxSyncWorkerRequest,
  decodeWebhookDeliveryScheduleRequest,
  type InternalMessageDecodeResult,
} from "./internal-message-codec.js";

const hegelSettings = {
  testCases: 40,
};

type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

const nonEmptyTextGen = gs.text({
  alphabet: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-",
  minSize: 1,
  maxSize: 32,
});

const jsonPrimitiveGen: Generator<JsonValue> = gs.composite((tc) => {
  const kind = tc.draw(gs.sampledFrom(["null", "boolean", "number", "string"] as const));

  switch (kind) {
    case "null":
      return null;
    case "boolean":
      return tc.draw(gs.booleans());
    case "number":
      return tc.draw(gs.integers({ minValue: -100, maxValue: 100 }));
    case "string":
      return tc.draw(gs.text({ maxSize: 24 }));
  }

  throw new Error("unsupported JSON primitive kind");
});

const jsonValueGen = (depth = 0): Generator<JsonValue> =>
  gs.composite((tc) => {
    const kind = tc.draw(
      depth >= 2
        ? gs.sampledFrom(["primitive"] as const)
        : gs.sampledFrom(["primitive", "array", "object"] as const),
    );

    if (kind === "primitive") {
      return tc.draw(jsonPrimitiveGen);
    }

    if (kind === "array") {
      return tc.draw(gs.arrays(jsonValueGen(depth + 1), { maxSize: 3 }));
    }

    const object: Record<string, JsonValue> = {};
    const candidateKeys = ["message", "data", "mailboxId", "historyId", "kind"];

    for (const key of candidateKeys) {
      if (tc.draw(gs.booleans())) {
        object[key] = tc.draw(jsonValueGen(depth + 1));
      }
    }

    return object;
  });

const encodedJson = (payload: unknown) => {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
};

const pubSubEnvelope = (payload: unknown) => ({
  message: {
    data: encodedJson(payload),
    messageId: "pubsub_msg_property",
  },
  subscription: "projects/mailmon-property/subscriptions/generated",
});

const expectValue = <T>(result: InternalMessageDecodeResult<T>): T => {
  if ("error" in result) {
    throw new Error(result.error);
  }

  return result.value;
};

const assertNonEmptyDecodeResult = <T>(
  result: InternalMessageDecodeResult<T>,
  assertValue: (value: T) => void,
) => {
  if ("error" in result) {
    expect(result.error.length).toBeGreaterThan(0);
    return;
  }

  assertValue(result.value);
};

describe("Internal message codec properties", () => {
  it(
    "accepts generated valid direct, Pub/Sub, dead-letter, webhook, and control payloads",
    () =>
      hegel.test((tc) => {
        const mailboxId = tc.draw(nonEmptyTextGen);
        const deliveryId = `del_${tc.draw(nonEmptyTextGen)}`;
        const notBefore = tc.draw(gs.datetimes());
        const controlJobKind = tc.draw(
          gs.sampledFrom(["recover_stuck_syncs", "recover_webhook_deliveries"] as const),
        );
        const historyId = tc.draw(gs.booleans())
          ? tc.draw(nonEmptyTextGen)
          : tc.draw(gs.integers({ minValue: 0, maxValue: 1_000_000 }));

        expect(expectValue(decodeMailboxSyncWorkerRequest({ mailboxId }))).toEqual({
          mailboxId,
        });
        expect(expectValue(decodeMailboxSyncWorkerRequest(pubSubEnvelope({ mailboxId })))).toEqual({
          mailboxId,
        });
        expect(
          expectValue(decodeMailboxSyncDeadLetterRequest(pubSubEnvelope({ mailboxId }))),
        ).toEqual({
          mailboxId,
        });
        expect(
          expectValue(
            decodeWebhookDeliveryScheduleRequest({
              deliveryId,
              notBefore,
            }),
          ),
        ).toEqual({
          deliveryId,
          notBefore,
        });
        expect(expectValue(decodeControlJobDispatchRequest({ kind: controlJobKind }))).toEqual({
          kind: controlJobKind,
        });
        expect(
          expectValue(
            decodeGmailPushNotificationPubSubEnvelope(
              pubSubEnvelope({
                emailAddress: `${mailboxId}@mailmon.dev`,
                historyId,
              }),
            ),
          ),
        ).toEqual({
          emailAddress: `${mailboxId}@mailmon.dev`,
          historyId: String(historyId),
          messageId: "pubsub_msg_property",
          subscription: "projects/mailmon-property/subscriptions/generated",
        });
      }, hegelSettings),
    60_000,
  );

  it(
    "rejects malformed generated payloads or normalizes them to non-empty decoded requests",
    () =>
      hegel.test((tc) => {
        const payload = tc.draw(jsonValueGen());

        assertNonEmptyDecodeResult(decodeMailboxSyncWorkerRequest(payload), (value) => {
          expect(value.mailboxId.length).toBeGreaterThan(0);
        });
        assertNonEmptyDecodeResult(decodeMailboxSyncDeadLetterRequest(payload), (value) => {
          expect(value.mailboxId.length).toBeGreaterThan(0);
        });
        assertNonEmptyDecodeResult(decodeWebhookDeliveryScheduleRequest(payload), (value) => {
          expect(value.deliveryId.length).toBeGreaterThan(0);
          expect(value.notBefore.length).toBeGreaterThan(0);
        });
        assertNonEmptyDecodeResult(decodeControlJobDispatchRequest(payload), (value) => {
          expect(["recover_stuck_syncs", "recover_webhook_deliveries"]).toContain(value.kind);
        });
        assertNonEmptyDecodeResult(decodeGmailPushNotificationPubSubEnvelope(payload), (value) => {
          expect(value.emailAddress.length).toBeGreaterThan(0);
          expect(value.historyId.length).toBeGreaterThan(0);
        });
      }, hegelSettings),
    60_000,
  );

  it(
    "returns specific errors for missing Pub/Sub data, invalid JSON, and empty generated IDs",
    () =>
      hegel.test((tc) => {
        const malformedKind = tc.draw(
          gs.sampledFrom(["missing-message", "missing-data", "invalid-json", "empty-id"] as const),
        );
        const payload =
          malformedKind === "missing-message"
            ? {}
            : malformedKind === "missing-data"
              ? { message: {} }
              : malformedKind === "invalid-json"
                ? { message: { data: "%%%" } }
                : pubSubEnvelope({ mailboxId: "" });

        if (malformedKind === "missing-message") {
          expect(decodeMailboxSyncWorkerRequest(payload)).toEqual({
            error: "Expected a mailbox-scoped sync payload or a Pub/Sub push envelope.",
          });
          expect(decodeMailboxSyncDeadLetterRequest(payload)).toEqual({
            error: "Expected a Pub/Sub dead-letter push envelope with a message object.",
          });
          expect(decodeGmailPushNotificationPubSubEnvelope(payload)).toEqual({
            error: "Expected a Pub/Sub push envelope with a message object.",
          });
          return;
        }

        if (malformedKind === "missing-data") {
          expect(decodeMailboxSyncWorkerRequest(payload)).toEqual({
            error:
              "Expected Pub/Sub message.data to contain a base64-encoded mailbox sync payload.",
          });
          expect(decodeMailboxSyncDeadLetterRequest(payload)).toEqual({
            error:
              "Expected Pub/Sub dead-letter message.data to contain a base64-encoded mailbox sync payload.",
          });
          expect(decodeGmailPushNotificationPubSubEnvelope(payload)).toEqual({
            error: "Expected Pub/Sub message.data to contain a base64-encoded Gmail notification.",
          });
          return;
        }

        if (malformedKind === "invalid-json") {
          expect(decodeMailboxSyncWorkerRequest(payload)).toEqual({
            error: "Pub/Sub message.data was not valid base64-encoded JSON.",
          });
          expect(decodeMailboxSyncDeadLetterRequest(payload)).toEqual({
            error: "Pub/Sub dead-letter message.data was not valid base64-encoded JSON.",
          });
          expect(decodeGmailPushNotificationPubSubEnvelope(payload)).toEqual({
            error: "Pub/Sub message.data was not valid base64-encoded JSON.",
          });
          return;
        }

        expect(decodeMailboxSyncWorkerRequest(payload)).toEqual({
          error: "Expected mailbox sync data to include a non-empty mailboxId field.",
        });
        expect(decodeMailboxSyncDeadLetterRequest(payload)).toEqual({
          error: "Expected dead-lettered mailbox sync data to include a non-empty mailboxId field.",
        });
      }, hegelSettings),
    60_000,
  );
});
