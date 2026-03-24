import { Context, Effect, Option } from "effect";

import type {
  MailboxProviderSyncResult,
  MailboxResource,
  ProblemDetails,
  StartedSyncRun,
} from "./contracts.js";

export class MailboxCatalog extends Context.Tag("@mailmon/core/MailboxCatalog")<
  MailboxCatalog,
  {
    readonly getMailbox: (mailboxId: string) => Effect.Effect<Option.Option<MailboxResource>>;
  }
>() {}

export class SyncRunStore extends Context.Tag("@mailmon/core/SyncRunStore")<
  SyncRunStore,
  {
    readonly startSyncRun: (mailboxId: string) => Effect.Effect<StartedSyncRun>;
    readonly completeSyncRun: (
      result: Readonly<{
        syncRunId: string;
        mailboxId: string;
        completedAt: string;
        eventsEmitted: number;
      }>,
    ) => Effect.Effect<void>;
  }
>() {}

export class MailboxSyncProvider extends Context.Tag("@mailmon/core/MailboxSyncProvider")<
  MailboxSyncProvider,
  {
    readonly syncMailbox: (
      mailbox: MailboxResource,
    ) => Effect.Effect<MailboxProviderSyncResult, ProblemDetails>;
  }
>() {}
