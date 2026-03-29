import { Context, Effect, Option } from "effect";

import type {
  MailboxSyncSnapshot,
  CompletedSyncRun,
  ControlJobDispatchRequest,
  MailboxSyncLeaseAcquisition,
  MailboxSyncLeaseRenewal,
  MailboxProviderSyncResult,
  MailboxResource,
  ProblemDetails,
  StartedSyncRun,
  WebhookDeliveryScheduleRequest,
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
    readonly completeSyncRun: (result: CompletedSyncRun) => Effect.Effect<void>;
  }
>() {}

export class MailboxSyncCoordinator extends Context.Tag("@mailmon/core/MailboxSyncCoordinator")<
  MailboxSyncCoordinator,
  {
    readonly acquireMailboxSyncLease: (
      lease: Readonly<{
        mailboxId: string;
        syncRunId: string;
        leaseOwnerId: string;
        acquiredAt: string;
        expiresAt: string;
      }>,
    ) => Effect.Effect<MailboxSyncLeaseAcquisition>;
    readonly renewMailboxSyncLease: (
      lease: Readonly<{
        mailboxId: string;
        leaseOwnerId: string;
        heartbeatAt: string;
        expiresAt: string;
      }>,
    ) => Effect.Effect<MailboxSyncLeaseRenewal>;
    readonly releaseMailboxSyncLease: (
      lease: Readonly<{
        mailboxId: string;
        leaseOwnerId: string;
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

export class MailboxStateStore extends Context.Tag("@mailmon/core/MailboxStateStore")<
  MailboxStateStore,
  {
    readonly applySyncSnapshot: (
      params: Readonly<{
        mailboxId: string;
        snapshot: MailboxSyncSnapshot;
      }>,
    ) => Effect.Effect<void>;
  }
>() {}

export class MailboxSyncDispatcher extends Context.Tag("@mailmon/core/MailboxSyncDispatcher")<
  MailboxSyncDispatcher,
  {
    readonly dispatchMailboxSync: (mailboxId: string) => Effect.Effect<void>;
  }
>() {}

export class WebhookDeliveryScheduler extends Context.Tag("@mailmon/core/WebhookDeliveryScheduler")<
  WebhookDeliveryScheduler,
  {
    readonly scheduleWebhookDelivery: (
      request: WebhookDeliveryScheduleRequest,
    ) => Effect.Effect<void>;
  }
>() {}

export class ControlJobDispatcher extends Context.Tag("@mailmon/core/ControlJobDispatcher")<
  ControlJobDispatcher,
  {
    readonly dispatchControlJob: (request: ControlJobDispatchRequest) => Effect.Effect<void>;
  }
>() {}
