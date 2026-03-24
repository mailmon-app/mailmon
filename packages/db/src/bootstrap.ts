import { MailboxCatalog, SyncRunStore, type MailboxResource } from "@mailmon/core";
import { Effect, Layer, Option, Ref } from "effect";

export const defaultBootstrapMailbox: MailboxResource = {
  id: "mbx_demo",
  object: "mailbox",
  provider: "gmail",
  emailAddress: "demo@mailmon.dev",
  status: "active",
  syncState: "healthy",
  watchState: "active",
  initializedAt: null,
  lastSuccessfulSyncAt: null,
  lastError: null,
};

export const createBootstrapMailboxCatalogLayer = (
  mailboxes: ReadonlyArray<MailboxResource> = [defaultBootstrapMailbox],
) =>
  Layer.succeed(MailboxCatalog, {
    getMailbox: (mailboxId: string) =>
      Effect.succeed(Option.fromNullable(mailboxes.find((mailbox) => mailbox.id === mailboxId))),
  });

export const createBootstrapSyncRunStoreLayer = Layer.effect(
  SyncRunStore,
  Effect.gen(function* () {
    const counter = yield* Ref.make(0);

    return {
      startSyncRun: (mailboxId: string) =>
        Ref.updateAndGet(counter, (value) => value + 1).pipe(
          Effect.map((value) => ({
            syncRunId: `sr_${value}`,
            mailboxId,
            startedAt: new Date().toISOString(),
          })),
        ),
      completeSyncRun: () => Effect.void,
    };
  }),
);
