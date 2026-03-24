import { MailboxSyncProvider, type MailboxProviderSyncResult } from "@mailmon/core";
import { Effect, Layer } from "effect";

export const createStubMailboxSyncProviderLayer = Layer.succeed(MailboxSyncProvider, {
  syncMailbox: () => {
    const result: MailboxProviderSyncResult = {
      eventsEmitted: 1,
      nextCursor: "hist_bootstrap",
    };

    return Effect.succeed(result);
  },
});
