import { MailboxSyncProvider, type MailboxProviderSyncResult } from "@mailmon/core";
import { Effect, Layer } from "effect";

export const createStubMailboxSyncProviderLayer = Layer.succeed(MailboxSyncProvider, {
  syncMailbox: (mailbox) => {
    const providerThreadId = `gmail_thr_${mailbox.id}_bootstrap`;
    const threadId = `thr_${mailbox.id}_bootstrap`;
    const providerMessageId = `gmail_msg_${mailbox.id}_bootstrap_1`;
    const messageId = `msg_${mailbox.id}_bootstrap_1`;

    const result: MailboxProviderSyncResult = {
      snapshot: {
        threads: [
          {
            id: threadId,
            providerThreadId,
            subject: "Welcome to Mailmon",
            lastMessageAt: "2026-03-29T09:30:00.000Z",
          },
        ],
        messages: [
          {
            id: messageId,
            threadId,
            providerMessageId,
            providerThreadId,
            subject: "Welcome to Mailmon",
            from: {
              name: "Mailmon",
              email: "hello@mailmon.dev",
            },
            snippet: "Your mailbox baseline sync is now persisted locally.",
            receivedAt: "2026-03-29T09:30:00.000Z",
            labelIds: ["INBOX"],
          },
        ],
      },
      eventsEmitted: 1,
      nextCursor: "hist_bootstrap",
    };

    return Effect.succeed(result);
  },
});
