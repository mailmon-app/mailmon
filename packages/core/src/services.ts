import { Context, Effect, Option } from "effect";

import type {
  CompletedMailboxConnectSession,
  CreatedWebhookEndpointResource,
  ListMailboxMessagesRequest,
  ListMailboxThreadsRequest,
  ListResource,
  MessageResource,
  MailboxSyncRequest,
  MailboxSyncSnapshot,
  MailboxConnectAuthorization,
  CompletedSyncRun,
  ControlJobDispatchRequest,
  MailboxSyncLeaseAcquisition,
  MailboxSyncLeaseRenewal,
  MailboxProviderSyncResult,
  MailboxResource,
  ProblemDetails,
  StartedSyncRun,
  StoredConnectSession,
  ThreadListItemResource,
  ThreadResource,
  WebhookEndpointResource,
  WebhookEndpointSubscriptionResource,
  WebhookEventType,
  WebhookDeliveryScheduleRequest,
  WorkspaceApiKeyIdentity,
} from "./contracts.js";

export class MailboxCatalog extends Context.Tag("@mailmon/core/MailboxCatalog")<
  MailboxCatalog,
  {
    readonly getMailbox: (
      mailboxId: string,
      options?: Readonly<{
        workspaceId?: string;
      }>,
    ) => Effect.Effect<Option.Option<MailboxResource>>;
  }
>() {}

export class WorkspaceApiKeyStore extends Context.Tag("@mailmon/core/WorkspaceApiKeyStore")<
  WorkspaceApiKeyStore,
  {
    readonly getWorkspaceForApiKey: (
      apiKey: string,
    ) => Effect.Effect<Option.Option<WorkspaceApiKeyIdentity>>;
  }
>() {}

export class WebhookEndpointCatalog extends Context.Tag("@mailmon/core/WebhookEndpointCatalog")<
  WebhookEndpointCatalog,
  {
    readonly getWebhookEndpoint: (
      webhookEndpointId: string,
      options?: Readonly<{
        workspaceId?: string;
      }>,
    ) => Effect.Effect<Option.Option<WebhookEndpointResource>>;
  }
>() {}

export class WebhookEndpointStore extends Context.Tag("@mailmon/core/WebhookEndpointStore")<
  WebhookEndpointStore,
  {
    readonly createWebhookEndpoint: (params: {
      readonly id: string;
      readonly workspaceId: string;
      readonly url: string;
      readonly description: string | null;
      readonly secret: string;
      readonly createdAt: string;
    }) => Effect.Effect<CreatedWebhookEndpointResource, ProblemDetails>;
  }
>() {}

export class WebhookEndpointSubscriptionStore extends Context.Tag(
  "@mailmon/core/WebhookEndpointSubscriptionStore",
)<
  WebhookEndpointSubscriptionStore,
  {
    readonly createWebhookEndpointSubscription: (params: {
      readonly webhookEndpointId: string;
      readonly workspaceId: string;
      readonly mailboxIds: ReadonlyArray<string>;
      readonly eventTypes: ReadonlyArray<WebhookEventType>;
      readonly createdAt: string;
    }) => Effect.Effect<ListResource<WebhookEndpointSubscriptionResource>, ProblemDetails>;
  }
>() {}

export class MailboxQueryCatalog extends Context.Tag("@mailmon/core/MailboxQueryCatalog")<
  MailboxQueryCatalog,
  {
    readonly listMessages: (
      request: ListMailboxMessagesRequest,
    ) => Effect.Effect<ListResource<MessageResource>, ProblemDetails>;
    readonly getMessage: (
      messageId: string,
      options?: Readonly<{
        workspaceId?: string;
      }>,
    ) => Effect.Effect<Option.Option<MessageResource>>;
    readonly listThreads: (
      request: ListMailboxThreadsRequest,
    ) => Effect.Effect<ListResource<ThreadListItemResource>, ProblemDetails>;
    readonly getThread: (
      threadId: string,
      options?: Readonly<{
        workspaceId?: string;
      }>,
    ) => Effect.Effect<Option.Option<ThreadResource>>;
  }
>() {}

export class MailboxConnectSessionStore extends Context.Tag(
  "@mailmon/core/MailboxConnectSessionStore",
)<
  MailboxConnectSessionStore,
  {
    readonly createConnectSession: (params: {
      readonly id: string;
      readonly workspaceId: string;
      readonly provider: "gmail";
      readonly tenantExternalId: string;
      readonly mailboxExternalId: string;
      readonly redirectUrl: string;
      readonly codeVerifier: string;
      readonly expiresAt: string;
    }) => Effect.Effect<StoredConnectSession>;
    readonly getConnectSession: (
      connectSessionId: string,
    ) => Effect.Effect<Option.Option<StoredConnectSession>>;
    readonly completeConnectSession: (params: {
      readonly connectSessionId: string;
      readonly connectedAt: string;
      readonly providerAccountEmail: string;
      readonly refreshToken: string;
    }) => Effect.Effect<CompletedMailboxConnectSession, ProblemDetails>;
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
      request: MailboxSyncRequest,
    ) => Effect.Effect<MailboxProviderSyncResult, ProblemDetails>;
  }
>() {}

export class MailboxConnectProvider extends Context.Tag("@mailmon/core/MailboxConnectProvider")<
  MailboxConnectProvider,
  {
    readonly createAuthorizationUrl: (params: {
      readonly connectSessionId: string;
      readonly codeVerifier: string;
      readonly redirectUri: string;
    }) => Effect.Effect<string, ProblemDetails>;
    readonly completeAuthorization: (params: {
      readonly connectSessionId: string;
      readonly code: string;
      readonly codeVerifier: string;
      readonly redirectUri: string;
    }) => Effect.Effect<MailboxConnectAuthorization, ProblemDetails>;
  }
>() {}

export class MailboxStateStore extends Context.Tag("@mailmon/core/MailboxStateStore")<
  MailboxStateStore,
  {
    readonly getMailboxCursor: (mailboxId: string) => Effect.Effect<string | null>;
    readonly applySyncResult: (
      params: Readonly<{
        eventsEmitted: number;
        mailboxId: string;
        leaseOwnerId: string;
        syncRunId: string;
        snapshot: MailboxSyncSnapshot;
        nextCursor: string | null;
        syncedAt: string;
      }>,
    ) => Effect.Effect<boolean>;
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
