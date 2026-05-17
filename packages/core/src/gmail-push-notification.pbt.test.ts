import { describe, expect, it } from "@effect/vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { Effect, Layer } from "effect";

import type { GmailPushNotification, MailboxResource } from "./contracts.js";
import { MailboxPushNotificationStore, MailboxSyncDispatcher } from "./services.js";
import { hegelSettings, notePbtCase } from "./test-hegel.js";
import { ingestGmailPushNotification } from "./use-cases.js";

const emailLocalPartGen = gs.sampledFrom(["push", "alerts", "inbox", "team", "workspace"] as const);
const historyIdGen = gs.integers({ minValue: 1, maxValue: 1_000_000 });
const messageIdIndexGen = gs.integers({ minValue: 0, maxValue: 10_000 });
const mailboxIdIndexGen = gs.integers({ minValue: 0, maxValue: 3 });

const buildNotification = (tc: hegel.TestCase): GmailPushNotification => {
  const localPart = tc.draw(emailLocalPartGen);
  const emailIndex = tc.draw(gs.integers({ minValue: 0, maxValue: 100 }));
  const historyId = tc.draw(historyIdGen);
  const messageIdIndex = tc.draw(messageIdIndexGen);
  const includeMessageId = tc.draw(gs.booleans());
  const includeSubscription = tc.draw(gs.booleans());

  return {
    emailAddress: `${localPart}-${emailIndex}@mailmon.dev`,
    historyId: `hist_${historyId}`,
    messageId: includeMessageId ? `pubsub_msg_${messageIdIndex}` : null,
    subscription: includeSubscription ? "projects/mailmon-property/subscriptions/gmail-push" : null,
  };
};

const buildMailbox = (
  notification: GmailPushNotification,
  mailboxIdIndex: number,
): MailboxResource => {
  return {
    id: `mbx_gmail_push_pbt_${mailboxIdIndex}`,
    object: "mailbox",
    provider: "gmail",
    emailAddress: notification.emailAddress,
    status: "active",
    syncState: "healthy",
    watchState: "active",
    initializedAt: null,
    lastSuccessfulSyncAt: null,
    lastError: null,
  };
};

const buildMailboxList = (
  tc: hegel.TestCase,
  notification: GmailPushNotification,
  options?: Readonly<{ minSize?: number }>,
) => {
  const mailboxIdIndexes = tc.draw(
    gs.arrays(mailboxIdIndexGen, {
      minSize: options?.minSize ?? 0,
      maxSize: 8,
    }),
  );

  return mailboxIdIndexes.map((mailboxIdIndex) => buildMailbox(notification, mailboxIdIndex));
};

const hasDuplicateMailboxIds = (mailboxes: ReadonlyArray<MailboxResource>) => {
  const ids = mailboxes.map((mailbox) => mailbox.id);

  return new Set(ids).size !== ids.length;
};

const notificationNote = (notification: GmailPushNotification) => {
  return {
    emailAddress: notification.emailAddress,
    historyId: notification.historyId,
    messageId: notification.messageId,
    subscription: notification.subscription,
  };
};

describe("Gmail push notification properties", () => {
  it(
    "gmail-push-is-wakeup-only-and-fans-out dispatches exactly the generated store result",
    () =>
      hegel.testAsync(async (tc) => {
        const notification = buildNotification(tc);
        const mailboxes = buildMailboxList(tc, notification);
        const storeNotifications: Array<GmailPushNotification> = [];
        const dispatchCalls: Array<string> = [];

        notePbtCase(tc, "gmail-push-is-wakeup-only-and-fans-out", {
          family: "accepted-fanout",
          notification: notificationNote(notification),
          mailboxIds: mailboxes.map((mailbox) => mailbox.id),
          duplicateMailboxIds: hasDuplicateMailboxIds(mailboxes),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(MailboxPushNotificationStore, {
            listMailboxesForGmailPushNotification: (receivedNotification) =>
              Effect.sync(() => {
                storeNotifications.push(receivedNotification);
                return mailboxes;
              }),
          }),
          Layer.succeed(MailboxSyncDispatcher, {
            dispatchMailboxSync: (mailboxId) =>
              Effect.sync(() => {
                dispatchCalls.push(mailboxId);
              }),
          }),
        );

        const result = await Effect.runPromise(
          ingestGmailPushNotification(notification).pipe(Effect.provide(testLayer)),
        );

        expect(result).toEqual({
          dispatched: mailboxes.length,
          emailAddress: notification.emailAddress,
          historyId: notification.historyId,
          kind: "gmail_push",
          status: "accepted",
        });
        expect(storeNotifications).toEqual([notification]);
        expect(dispatchCalls).toEqual(mailboxes.map((mailbox) => mailbox.id));
      }, hegelSettings),
    60_000,
  );

  it(
    "gmail-push-is-wakeup-only-and-fans-out propagates generated dispatcher failures",
    () =>
      hegel.testAsync(async (tc) => {
        const notification = buildNotification(tc);
        const mailboxes = buildMailboxList(tc, notification, { minSize: 1 });
        const failingMailbox = tc.draw(gs.sampledFrom(mailboxes));
        const dispatchCalls: Array<string> = [];

        notePbtCase(tc, "gmail-push-is-wakeup-only-and-fans-out", {
          family: "dispatcher-failure-propagates",
          notification: notificationNote(notification),
          mailboxIds: mailboxes.map((mailbox) => mailbox.id),
          failingMailboxId: failingMailbox.id,
          duplicateMailboxIds: hasDuplicateMailboxIds(mailboxes),
        });

        const testLayer = Layer.mergeAll(
          Layer.succeed(MailboxPushNotificationStore, {
            listMailboxesForGmailPushNotification: () => Effect.succeed(mailboxes),
          }),
          Layer.succeed(MailboxSyncDispatcher, {
            dispatchMailboxSync: (mailboxId) =>
              Effect.sync(() => {
                dispatchCalls.push(mailboxId);

                if (mailboxId === failingMailbox.id) {
                  throw new Error(`generated dispatcher failure for ${mailboxId}`);
                }
              }),
          }),
        );

        let rejection: unknown = null;

        try {
          await Effect.runPromise(
            ingestGmailPushNotification(notification).pipe(Effect.provide(testLayer)),
          );
        } catch (error) {
          rejection = error;
        }

        expect(rejection).not.toBeNull();
        expect(String(rejection)).toContain("generated dispatcher failure");
        expect(dispatchCalls).toContain(failingMailbox.id);
      }, hegelSettings),
    60_000,
  );
});
