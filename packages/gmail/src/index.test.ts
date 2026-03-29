import { describe, expect, it } from "@effect/vitest";
import { MailboxSyncProvider } from "@mailmon/core";
import { Effect } from "effect";

import { createStubMailboxSyncProviderLayer } from "./index.js";

describe("createStubMailboxSyncProviderLayer", () => {
  it.effect("returns a stable bootstrap sync result", () =>
    Effect.gen(function* () {
      const provider = yield* MailboxSyncProvider;
      const result = yield* provider.syncMailbox({
        id: "mbx_123",
        object: "mailbox",
        provider: "gmail",
        emailAddress: "demo@mailmon.dev",
        status: "active",
        syncState: "healthy",
        watchState: "active",
        initializedAt: null,
        lastSuccessfulSyncAt: null,
        lastError: null,
      });

      expect(result).toEqual({
        snapshot: {
          threads: [
            {
              id: "thr_mbx_123_bootstrap",
              providerThreadId: "gmail_thr_mbx_123_bootstrap",
              subject: "Welcome to Mailmon",
              lastMessageAt: "2026-03-29T09:30:00.000Z",
            },
          ],
          messages: [
            {
              id: "msg_mbx_123_bootstrap_1",
              threadId: "thr_mbx_123_bootstrap",
              providerMessageId: "gmail_msg_mbx_123_bootstrap_1",
              providerThreadId: "gmail_thr_mbx_123_bootstrap",
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
      });
    }).pipe(Effect.provide(createStubMailboxSyncProviderLayer)),
  );
});
