import { Effect } from "effect";

import type {
  GmailPushNotification,
  GmailPushNotificationResult,
  MailboxResource,
  MailboxSyncDispatchExhaustedResult,
} from "./contracts.js";
import { getMailboxOrFail } from "./resource-queries.js";
import {
  MailboxPushNotificationStore,
  MailboxSyncDispatchExhaustionStore,
  MailboxSyncDispatcher,
} from "./services.js";

const createSyncRunId = () => {
  return `sr_${globalThis.crypto.randomUUID()}`;
};

export const dispatchMailboxSync = (mailboxId: string) =>
  Effect.gen(function* () {
    const mailbox = yield* getMailboxOrFail(mailboxId);
    const dispatcher = yield* MailboxSyncDispatcher;

    yield* dispatcher.dispatchMailboxSync(mailbox.id);

    return mailbox;
  });

export const recordMailboxSyncDispatchExhausted = (mailboxId: string) =>
  Effect.gen(function* () {
    const store = yield* MailboxSyncDispatchExhaustionStore;

    return yield* store.recordMailboxSyncDispatchExhausted({
      mailboxId,
      recordedAt: new Date().toISOString(),
      syncRunId: createSyncRunId(),
    });
  }) satisfies Effect.Effect<
    MailboxSyncDispatchExhaustedResult,
    never,
    MailboxSyncDispatchExhaustionStore
  >;

export const ingestGmailPushNotification = (notification: GmailPushNotification) =>
  Effect.gen(function* () {
    const pushNotificationStore = yield* MailboxPushNotificationStore;
    const dispatcher = yield* MailboxSyncDispatcher;
    const mailboxes =
      yield* pushNotificationStore.listMailboxesForGmailPushNotification(notification);

    yield* Effect.forEach(mailboxes, (mailbox) => dispatcher.dispatchMailboxSync(mailbox.id), {
      concurrency: 10,
      discard: true,
    });

    return {
      dispatched: mailboxes.length,
      emailAddress: notification.emailAddress,
      historyId: notification.historyId,
      kind: "gmail_push",
      status: "accepted",
    } satisfies GmailPushNotificationResult;
  });

export const createHealthyMailboxSnapshot = (
  mailbox: Readonly<Pick<MailboxResource, "emailAddress" | "id">>,
): MailboxResource => {
  return {
    id: mailbox.id,
    object: "mailbox",
    provider: "gmail",
    emailAddress: mailbox.emailAddress,
    status: "active",
    syncState: "healthy",
    watchState: "active",
    initializedAt: null,
    lastSuccessfulSyncAt: null,
    lastError: null,
  };
};
