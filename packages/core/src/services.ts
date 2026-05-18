import { Context, Effect, Layer, Option } from "effect";

import type {
  CompletedWebhookDeliveryAttempt,
  CompletedMailboxConnectSession,
  CompletedReplayDispatch,
  CompletedSyncRun,
  CreatedWebhookEndpointResource,
  CreateReplayRequest,
  GmailPushNotification,
  ListMailboxSyncRunsRequest,
  ListMailboxMessagesRequest,
  ListMailboxThreadsRequest,
  ListResource,
  MailboxObservabilitySnapshotResource,
  MailboxSyncRunInspectionResource,
  MessageResource,
  MailboxConnectAuthorization,
  ControlJobDispatchRequest,
  MailboxRepairTarget,
  StuckMailboxSyncExecution,
  MailboxWatchRenewalRequest,
  MailboxWatchRenewalResult,
  MailboxWatchRenewalTarget,
  MailboxSyncLeaseAcquisition,
  MailboxProviderSyncResult,
  MailboxResource,
  MailboxSyncCommitResult,
  MailboxSyncDispatchExhaustedResult,
  MailboxSyncLeaseRenewal,
  MailboxSyncRequest,
  MailboxSyncSnapshot,
  PreparedWebhookDelivery,
  PreparedReplayDispatch,
  ProblemDetails,
  ReplayResource,
  StartedSyncRun,
  StoredConnectSession,
  ThreadListItemResource,
  ThreadResource,
  WebhookDeliverySendFailure,
  WebhookDeliverySendResponse,
  WebhookEndpointResource,
  WebhookEndpointSubscriptionResource,
  WebhookDeliveryScheduleRequest,
  WebhookEventType,
  WorkspaceApiKeyIdentity,
} from "./contracts.js";

export class MailboxCatalog extends Context.Service<
  MailboxCatalog,
  {
    readonly getMailbox: (
      mailboxId: string,
      options?: Readonly<{
        workspaceId?: string;
      }>,
    ) => Effect.Effect<Option.Option<MailboxResource>>;
  }
>()("@mailmon/core/MailboxCatalog") {}

export class WorkspaceApiKeyStore extends Context.Service<
  WorkspaceApiKeyStore,
  {
    readonly getWorkspaceForApiKey: (
      apiKey: string,
    ) => Effect.Effect<Option.Option<WorkspaceApiKeyIdentity>>;
  }
>()("@mailmon/core/WorkspaceApiKeyStore") {}

export class WebhookEndpointCatalog extends Context.Service<
  WebhookEndpointCatalog,
  {
    readonly getWebhookEndpoint: (
      webhookEndpointId: string,
      options?: Readonly<{
        workspaceId?: string;
      }>,
    ) => Effect.Effect<Option.Option<WebhookEndpointResource>>;
  }
>()("@mailmon/core/WebhookEndpointCatalog") {}

export class WebhookEndpointStore extends Context.Service<
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
>()("@mailmon/core/WebhookEndpointStore") {}

export class WebhookEndpointSubscriptionStore extends Context.Service<
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
>()("@mailmon/core/WebhookEndpointSubscriptionStore") {}

export class MailboxQueryCatalog extends Context.Service<
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
>()("@mailmon/core/MailboxQueryCatalog") {}

export class MailboxObservabilityCatalog extends Context.Service<
  MailboxObservabilityCatalog,
  {
    readonly listSyncRuns: (
      request: ListMailboxSyncRunsRequest,
    ) => Effect.Effect<ListResource<MailboxSyncRunInspectionResource>, ProblemDetails>;
    readonly getMailboxObservability: (params: {
      readonly mailboxId: string;
      readonly observedAt: string;
    }) => Effect.Effect<MailboxObservabilitySnapshotResource>;
  }
>()("@mailmon/core/MailboxObservabilityCatalog") {}

export class MailboxConnectSessionStore extends Context.Service<
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
>()("@mailmon/core/MailboxConnectSessionStore") {}

export class SyncRunStore extends Context.Service<
  SyncRunStore,
  {
    readonly startSyncRun: (mailboxId: string) => Effect.Effect<StartedSyncRun>;
    readonly completeSyncRun: (result: CompletedSyncRun) => Effect.Effect<void>;
  }
>()("@mailmon/core/SyncRunStore") {}

export class MailboxSyncCoordinator extends Context.Service<
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
>()("@mailmon/core/MailboxSyncCoordinator") {}

export class MailboxSyncProvider extends Context.Service<
  MailboxSyncProvider,
  {
    readonly syncMailbox: (
      request: MailboxSyncRequest,
    ) => Effect.Effect<MailboxProviderSyncResult, ProblemDetails>;
  }
>()("@mailmon/core/MailboxSyncProvider") {}

export interface MailboxSyncLeaseTimingConfig {
  readonly leaseTtlMs: number;
  readonly heartbeatIntervalMs: number;
}

export const defaultMailboxSyncLeaseTiming: MailboxSyncLeaseTimingConfig = {
  leaseTtlMs: 90_000,
  heartbeatIntervalMs: 30_000,
};

export class MailboxSyncLeaseTiming extends Context.Service<
  MailboxSyncLeaseTiming,
  MailboxSyncLeaseTimingConfig
>()("@mailmon/core/MailboxSyncLeaseTiming") {
  static readonly defaults = defaultMailboxSyncLeaseTiming;

  static readonly defaultLayer = Layer.succeed(
    MailboxSyncLeaseTiming,
    defaultMailboxSyncLeaseTiming,
  );

  static readonly layer = (config: MailboxSyncLeaseTimingConfig) =>
    Layer.succeed(MailboxSyncLeaseTiming, config);
}

export class MailboxConnectProvider extends Context.Service<
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
>()("@mailmon/core/MailboxConnectProvider") {}

export class MailboxStateStore extends Context.Service<
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
    ) => Effect.Effect<MailboxSyncCommitResult, ProblemDetails>;
  }
>()("@mailmon/core/MailboxStateStore") {}

export class MailboxSyncDispatchExhaustionStore extends Context.Service<
  MailboxSyncDispatchExhaustionStore,
  {
    readonly recordMailboxSyncDispatchExhausted: (params: {
      readonly mailboxId: string;
      readonly recordedAt: string;
      readonly syncRunId: string;
    }) => Effect.Effect<MailboxSyncDispatchExhaustedResult>;
  }
>()("@mailmon/core/MailboxSyncDispatchExhaustionStore") {}

export class MailboxWatchStore extends Context.Service<
  MailboxWatchStore,
  {
    readonly listMailboxWatchesNeedingRenewal: (params: {
      readonly limit: number;
      readonly observedAt: string;
      readonly renewalWindowMs: number;
    }) => Effect.Effect<ReadonlyArray<MailboxWatchRenewalTarget>>;
    readonly markMailboxWatchRenewalStarted: (params: {
      readonly mailboxId: string;
      readonly observedAt: string;
    }) => Effect.Effect<void>;
    readonly completeMailboxWatchRenewal: (params: {
      readonly historyId: string;
      readonly mailboxId: string;
      readonly renewedAt: string;
      readonly watchExpiresAt: string;
    }) => Effect.Effect<void>;
    readonly failMailboxWatchRenewal: (params: {
      readonly mailboxId: string;
      readonly observedAt: string;
      readonly problem: ProblemDetails;
    }) => Effect.Effect<void>;
  }
>()("@mailmon/core/MailboxWatchStore") {}

export class MailboxRepairStore extends Context.Service<
  MailboxRepairStore,
  {
    readonly listMailboxesNeedingRepair: (params: {
      readonly limit: number;
      readonly observedAt: string;
    }) => Effect.Effect<ReadonlyArray<MailboxRepairTarget>>;
    readonly prepareMailboxForRepair: (params: {
      readonly mailboxId: string;
      readonly observedAt: string;
      readonly resetCursor: boolean;
    }) => Effect.Effect<boolean>;
  }
>()("@mailmon/core/MailboxRepairStore") {}

export class MailboxExecutionRecoveryStore extends Context.Service<
  MailboxExecutionRecoveryStore,
  {
    readonly listStuckMailboxSyncExecutions: (params: {
      readonly limit: number;
      readonly observedAt: string;
      readonly staleThresholdMs: number;
    }) => Effect.Effect<ReadonlyArray<StuckMailboxSyncExecution>>;
    readonly recoverStuckMailboxSyncExecution: (params: {
      readonly mailboxId: string;
      readonly observedAt: string;
      readonly syncRunId: string | null;
    }) => Effect.Effect<boolean>;
  }
>()("@mailmon/core/MailboxExecutionRecoveryStore") {}

export class MailboxWatchProvider extends Context.Service<
  MailboxWatchProvider,
  {
    readonly renewMailboxWatch: (
      request: MailboxWatchRenewalRequest,
    ) => Effect.Effect<MailboxWatchRenewalResult, ProblemDetails>;
  }
>()("@mailmon/core/MailboxWatchProvider") {}

export class MailboxPushNotificationStore extends Context.Service<
  MailboxPushNotificationStore,
  {
    readonly listMailboxesForGmailPushNotification: (
      notification: GmailPushNotification,
    ) => Effect.Effect<ReadonlyArray<MailboxResource>>;
  }
>()("@mailmon/core/MailboxPushNotificationStore") {}

export class MailboxSyncDispatcher extends Context.Service<
  MailboxSyncDispatcher,
  {
    readonly dispatchMailboxSync: (mailboxId: string) => Effect.Effect<void>;
  }
>()("@mailmon/core/MailboxSyncDispatcher") {}

export class WebhookDeliveryScheduler extends Context.Service<
  WebhookDeliveryScheduler,
  {
    readonly scheduleWebhookDelivery: (
      request: WebhookDeliveryScheduleRequest,
    ) => Effect.Effect<void>;
  }
>()("@mailmon/core/WebhookDeliveryScheduler") {}

export class WebhookDeliveryStore extends Context.Service<
  WebhookDeliveryStore,
  {
    readonly createWebhookDeliveriesForMailboxEvents: (
      mailboxEventIds: ReadonlyArray<string>,
    ) => Effect.Effect<ReadonlyArray<WebhookDeliveryScheduleRequest>>;
    readonly createWebhookDeliveriesForReplay: (params: {
      readonly mailboxEventIds: ReadonlyArray<string>;
      readonly notBefore: string;
      readonly replayId: string;
      readonly webhookEndpointId: string;
    }) => Effect.Effect<ReadonlyArray<WebhookDeliveryScheduleRequest>>;
    readonly listWebhookDeliveryRecoverySchedules: (
      recoveredAt: string,
    ) => Effect.Effect<ReadonlyArray<WebhookDeliveryScheduleRequest>>;
    readonly prepareWebhookDeliveryAttempt: (
      deliveryId: string,
      attemptedAt: string,
    ) => Effect.Effect<Option.Option<PreparedWebhookDelivery>>;
    readonly completeWebhookDeliveryAttempt: (
      attempt: CompletedWebhookDeliveryAttempt,
    ) => Effect.Effect<boolean>;
  }
>()("@mailmon/core/WebhookDeliveryStore") {}

export class ReplayStore extends Context.Service<
  ReplayStore,
  {
    readonly createReplay: (
      params: CreateReplayRequest & {
        readonly createdAt: string;
        readonly id: string;
        readonly workspaceId: string;
      },
    ) => Effect.Effect<ReplayResource, ProblemDetails>;
    readonly getReplay: (
      replayId: string,
      options?: Readonly<{
        workspaceId?: string;
      }>,
    ) => Effect.Effect<Option.Option<ReplayResource>>;
    readonly listReplayDispatchTargets: (params: {
      readonly limit: number;
      readonly observedAt: string;
    }) => Effect.Effect<ReadonlyArray<ReplayResource>>;
    readonly prepareReplayDispatch: (params: {
      readonly replayId: string;
      readonly startedAt: string;
    }) => Effect.Effect<Option.Option<PreparedReplayDispatch>>;
    readonly completeReplayDispatch: (params: CompletedReplayDispatch) => Effect.Effect<void>;
    readonly failReplayDispatch: (params: {
      readonly completedAt: string;
      readonly error: string;
      readonly replayId: string;
    }) => Effect.Effect<void>;
  }
>()("@mailmon/core/ReplayStore") {}

export class WebhookDeliverySender extends Context.Service<
  WebhookDeliverySender,
  {
    readonly send: (
      delivery: PreparedWebhookDelivery,
      attemptedAt: string,
    ) => Effect.Effect<WebhookDeliverySendResponse, WebhookDeliverySendFailure>;
  }
>()("@mailmon/core/WebhookDeliverySender") {}

export class ControlJobDispatcher extends Context.Service<
  ControlJobDispatcher,
  {
    readonly dispatchControlJob: (request: ControlJobDispatchRequest) => Effect.Effect<void>;
  }
>()("@mailmon/core/ControlJobDispatcher") {}
