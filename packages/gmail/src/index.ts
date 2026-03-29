import { MailboxSyncProvider, type MailboxProviderSyncResult } from "@mailmon/core";
import { Effect, Layer } from "effect";

export const createStubMailboxSyncProviderLayer = Layer.succeed(MailboxSyncProvider, {
  syncMailbox: ({ cursor, mailbox }) => {
    const threadId = `thr_${mailbox.id}_bootstrap`;
    const providerThreadId = `gmail_thr_${mailbox.id}_bootstrap`;

    if (cursor === null) {
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
              id: `msg_${mailbox.id}_bootstrap_1`,
              threadId,
              providerMessageId: `gmail_msg_${mailbox.id}_bootstrap_1`,
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
    }

    const result: MailboxProviderSyncResult = {
      snapshot: {
        threads: [
          {
            id: threadId,
            providerThreadId,
            subject: "Welcome to Mailmon",
            lastMessageAt: "2026-03-29T10:00:00.000Z",
          },
        ],
        messages: [
          {
            id: `msg_${mailbox.id}_bootstrap_2`,
            threadId,
            providerMessageId: `gmail_msg_${mailbox.id}_bootstrap_2`,
            providerThreadId,
            subject: "Re: Welcome to Mailmon",
            from: {
              name: "Mailmon",
              email: "hello@mailmon.dev",
            },
            snippet: "This incremental sync proves cursor-based mailbox updates.",
            receivedAt: "2026-03-29T10:00:00.000Z",
            labelIds: ["INBOX", "UNREAD"],
          },
        ],
      },
      eventsEmitted: 1,
      nextCursor: "hist_incremental_2",
    };

    return Effect.succeed(result);
  },
});
