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
        eventsEmitted: 1,
        nextCursor: "hist_bootstrap",
      });
    }).pipe(Effect.provide(createStubMailboxSyncProviderLayer)),
  );
});
