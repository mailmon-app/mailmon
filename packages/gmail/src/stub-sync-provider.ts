import {
  MailboxSyncProvider,
  type MailboxProviderSyncResult,
  type MailboxSyncRequest,
} from "@mailmon/core";
import { Effect, Layer } from "effect";

const createStubSyncResult = (request: MailboxSyncRequest): MailboxProviderSyncResult => {
  const { cursor, mailbox } = request;
  const threadId = `thr_${mailbox.id}_bootstrap`;
  const providerThreadId = `gmail_thr_${mailbox.id}_bootstrap`;

  if (cursor === null) {
    return {
      snapshot: {
        deletedProviderMessageIds: [],
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
  }

  return {
    snapshot: {
      deletedProviderMessageIds: [],
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
};

export const createStubMailboxSyncProviderLayer = Layer.succeed(MailboxSyncProvider, {
  syncMailbox: (request) => {
    return Effect.succeed(createStubSyncResult(request));
  },
});
