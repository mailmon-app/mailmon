import { Effect, Option } from "effect";

import type { MailboxResource, SyncMailboxResult } from "./contracts.js";
import { mailboxNotFound } from "./problems.js";
import { MailboxCatalog, MailboxSyncProvider, SyncRunStore } from "./services.js";

export const getMailboxById = (mailboxId: string) =>
  Effect.gen(function* () {
    const catalog = yield* MailboxCatalog;

    return yield* catalog.getMailbox(mailboxId);
  });

export const getMailboxOrFail = (mailboxId: string) =>
  getMailboxById(mailboxId).pipe(
    Effect.flatMap((mailbox) =>
      Option.match(mailbox, {
        onNone: () => Effect.fail(mailboxNotFound(mailboxId)),
        onSome: (value) => Effect.succeed(value),
      }),
    ),
  );

export const runMailboxSync = (mailboxId: string) =>
  Effect.gen(function* () {
    const mailbox = yield* getMailboxOrFail(mailboxId);
    const syncRunStore = yield* SyncRunStore;
    const mailboxProvider = yield* MailboxSyncProvider;
    const syncRun = yield* syncRunStore.startSyncRun(mailbox.id);
    const providerResult = yield* mailboxProvider.syncMailbox(mailbox);
    const completedAt = new Date().toISOString();

    yield* syncRunStore.completeSyncRun({
      syncRunId: syncRun.syncRunId,
      mailboxId: mailbox.id,
      completedAt,
      eventsEmitted: providerResult.eventsEmitted,
    });

    const result: SyncMailboxResult = {
      ...syncRun,
      completedAt,
      eventsEmitted: providerResult.eventsEmitted,
      nextCursor: providerResult.nextCursor,
    };

    return result;
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
