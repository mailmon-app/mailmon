import {
  MailboxCatalog,
  MailboxConnectProvider,
  MailboxConnectSessionStore,
  MailboxObservabilityCatalog,
  MailboxQueryCatalog,
  MailboxSyncDispatcher,
  ReplayStore,
  WebhookEndpointCatalog,
  WebhookEndpointStore,
  WebhookEndpointSubscriptionStore,
  WorkspaceApiKeyStore,
  type MailboxResource,
  type ReplayResource,
  type StoredConnectSession,
  type WebhookEndpointResource,
} from "@mailmon/core";
import { Effect, Layer, ManagedRuntime, Option } from "effect";

import { createApp } from "./server.js";

export const createWorkspaceAuthFixture = () => ({
  foreignWorkspaceId: "ws_foreign",
  primaryApiKey: "test-api-key",
  primaryWorkspaceId: "ws_123",
});

export const createMailboxFixture = (
  overrides: Partial<MailboxResource> = {},
): MailboxResource => ({
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
  ...overrides,
});

export const createWebhookEndpointFixture = (
  overrides: Partial<WebhookEndpointResource> = {},
): WebhookEndpointResource => ({
  id: "whe_demo",
  object: "webhook_endpoint",
  url: "https://app.example.com/webhooks/mailmon",
  description: "production inbox events",
  deliveryState: "healthy",
  lastDeliveryAt: null,
  lastDeliveryError: null,
  createdAt: "2026-03-24T00:00:00.000Z",
  ...overrides,
});

export const createReplayFixture = (overrides: Partial<ReplayResource> = {}): ReplayResource => ({
  id: "rpl_demo",
  object: "replay",
  status: "queued",
  mailboxId: "mbx_demo",
  webhookEndpointId: "whe_demo",
  startTime: "2026-03-23T00:00:00.000Z",
  endTime: "2026-03-24T00:00:00.000Z",
  eventsReplayed: null,
  createdAt: "2026-03-24T00:00:00.000Z",
  startedAt: null,
  completedAt: null,
  lastError: null,
  ...overrides,
});

export const mailboxFixture = createMailboxFixture();
export const foreignMailboxFixture = createMailboxFixture({
  id: "mbx_foreign",
  emailAddress: "foreign@mailmon.dev",
});
export const webhookEndpointFixture = createWebhookEndpointFixture();
export const foreignWebhookEndpointFixture = createWebhookEndpointFixture({
  id: "whe_foreign",
  url: "https://foreign.example.com/webhooks/mailmon",
});

export const messageFixture = {
  id: "msg_demo",
  mailboxId: mailboxFixture.id,
  threadId: "thr_demo",
  providerMessageId: "gmail_msg_demo",
  subject: "Interview availability",
  from: {
    name: "Jane",
    email: "jane@acme.com",
  },
  snippet: "Could you share your availability...",
  receivedAt: "2026-03-23T10:11:20.000Z",
  labelIds: ["INBOX", "UNREAD"],
};

export const threadListItemFixture = {
  id: "thr_demo",
  object: "thread" as const,
  mailboxId: mailboxFixture.id,
  providerThreadId: "gmail_thr_demo",
  subject: "Interview availability",
  lastMessageAt: "2026-03-23T10:11:20.000Z",
};

export const threadFixture = {
  ...threadListItemFixture,
  messages: [
    {
      id: "msg_120",
      subject: "Interview availability",
      receivedAt: "2026-03-23T09:55:00.000Z",
    },
    {
      id: messageFixture.id,
      subject: "Re: Interview availability",
      receivedAt: messageFixture.receivedAt,
    },
  ],
};

export const syncRunInspectionFixture = {
  syncRunId: "sr_demo",
  mailboxId: mailboxFixture.id,
  startedAt: "2026-04-22T10:00:00.000Z",
  completedAt: "2026-04-22T10:00:12.000Z",
  status: "completed" as const,
  detail: null,
  eventsEmitted: 3,
  leaseOwnerId: "lease_demo",
  previousCursor: "hist_100",
  nextCursor: "hist_105",
  cursorAdvanced: true,
};

export const mailboxObservabilityFixture = {
  object: "mailbox_observability" as const,
  mailboxId: mailboxFixture.id,
  generatedAt: "2026-04-22T10:05:00.000Z",
  lag: {
    status: "active" as const,
    syncState: "healthy" as const,
    watchState: "active" as const,
    lastSuccessfulSyncAt: "2026-04-22T10:00:12.000Z",
    lagSeconds: 288,
  },
  cursor: {
    currentCursor: "hist_105",
    previousCursor: "hist_100",
    nextCursor: "hist_105",
    advanced: true,
    advancedAt: "2026-04-22T10:00:12.000Z",
  },
  lease: {
    activeLeaseOwner: null,
    activeLeaseHeartbeatAt: null,
    activeLeaseExpiresAt: null,
    contentionCount24h: 2,
    latestContentionAt: "2026-04-22T09:58:00.000Z",
    leaseLossCount24h: 1,
    latestLeaseLossAt: "2026-04-22T09:59:30.000Z",
  },
  webhookDeliveries: [
    {
      webhookEndpointId: webhookEndpointFixture.id,
      webhookEndpointUrl: webhookEndpointFixture.url,
      deliveryState: "degraded" as const,
      consecutiveFailures: 2,
      pendingDeliveries: 3,
      processingDeliveries: 1,
      failedDeliveries: 4,
      lastDeliveryAt: "2026-04-22T10:04:00.000Z",
      lastDeliveryError: {
        code: "webhook_delivery_timeout",
        message: "Webhook delivery timed out before the endpoint responded.",
        occurredAt: "2026-04-22T10:04:00.000Z",
        retryable: true,
      },
    },
  ],
  latestSyncRun: syncRunInspectionFixture,
};

export const createApiRouteTestRuntime = () => {
  const { foreignWorkspaceId, primaryApiKey, primaryWorkspaceId } = createWorkspaceAuthFixture();
  const dispatchedMailboxIds: Array<string> = [];
  const connectSessions = new Map<string, StoredConnectSession>();
  const webhookEndpoints = new Map([
    [
      webhookEndpointFixture.id,
      {
        webhookEndpoint: webhookEndpointFixture,
        secret: "whsec_existing",
        workspaceId: primaryWorkspaceId,
      },
    ],
    [
      foreignWebhookEndpointFixture.id,
      {
        webhookEndpoint: foreignWebhookEndpointFixture,
        secret: "whsec_foreign",
        workspaceId: foreignWorkspaceId,
      },
    ],
  ]);
  const mailboxFixtures = new Map([
    [mailboxFixture.id, { mailbox: mailboxFixture, workspaceId: primaryWorkspaceId }],
    [foreignMailboxFixture.id, { mailbox: foreignMailboxFixture, workspaceId: foreignWorkspaceId }],
  ]);
  const replays = new Map<
    string,
    {
      replay: ReplayResource;
      workspaceId: string;
    }
  >();

  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(WorkspaceApiKeyStore, {
        getWorkspaceForApiKey: (apiKey: string) =>
          Effect.succeed(
            apiKey === primaryApiKey
              ? Option.some({ workspaceId: primaryWorkspaceId })
              : Option.none(),
          ),
      }),
      Layer.succeed(MailboxCatalog, {
        getMailbox: (mailboxId: string, options?: Readonly<{ workspaceId?: string }>) =>
          Effect.succeed(
            Option.fromNullishOr(mailboxFixtures.get(mailboxId)).pipe(
              Option.filter(
                (value) =>
                  options?.workspaceId === undefined || value.workspaceId === options.workspaceId,
              ),
              Option.map((value) => value.mailbox),
            ),
          ),
      }),
      Layer.succeed(WebhookEndpointCatalog, {
        getWebhookEndpoint: (
          webhookEndpointId: string,
          options?: Readonly<{ workspaceId?: string }>,
        ) =>
          Effect.succeed(
            Option.fromNullishOr(webhookEndpoints.get(webhookEndpointId)).pipe(
              Option.filter(
                (value) =>
                  options?.workspaceId === undefined || value.workspaceId === options.workspaceId,
              ),
              Option.map((value) => value.webhookEndpoint),
            ),
          ),
      }),
      Layer.succeed(MailboxQueryCatalog, {
        listMessages: ({ mailboxId }) =>
          Effect.succeed({
            object: "list" as const,
            data: mailboxId === mailboxFixture.id ? [messageFixture] : [],
            nextCursor: mailboxId === mailboxFixture.id ? "cur_next" : null,
          }),
        getMessage: (messageId: string, options?: Readonly<{ workspaceId?: string }>) =>
          Effect.succeed(
            messageId === messageFixture.id && options?.workspaceId === primaryWorkspaceId
              ? Option.some(messageFixture)
              : Option.none(),
          ),
        listThreads: ({ mailboxId }) =>
          Effect.succeed({
            object: "list" as const,
            data: mailboxId === mailboxFixture.id ? [threadListItemFixture] : [],
            nextCursor: null,
          }),
        getThread: (threadId: string, options?: Readonly<{ workspaceId?: string }>) =>
          Effect.succeed(
            threadId === threadFixture.id && options?.workspaceId === primaryWorkspaceId
              ? Option.some(threadFixture)
              : Option.none(),
          ),
      }),
      Layer.succeed(MailboxObservabilityCatalog, {
        listSyncRuns: ({ mailboxId }) =>
          Effect.succeed({
            object: "list" as const,
            data: mailboxId === mailboxFixture.id ? [syncRunInspectionFixture] : [],
            nextCursor: null,
          }),
        getMailboxObservability: () => Effect.succeed(mailboxObservabilityFixture),
      }),
      Layer.succeed(WebhookEndpointStore, {
        createWebhookEndpoint: (params) =>
          Effect.sync(() => {
            const webhookEndpoint = createWebhookEndpointFixture({
              id: params.id,
              url: params.url,
              description: params.description,
              createdAt: params.createdAt,
            });

            webhookEndpoints.set(webhookEndpoint.id, {
              webhookEndpoint,
              secret: params.secret,
              workspaceId: params.workspaceId,
            });

            return {
              ...webhookEndpoint,
              secret: params.secret,
            };
          }),
      }),
      Layer.succeed(WebhookEndpointSubscriptionStore, {
        createWebhookEndpointSubscription: (params) =>
          Effect.succeed({
            object: "list" as const,
            data: params.mailboxIds.map((mailboxId) => ({
              id: `whsub_${mailboxId}`,
              object: "webhook_endpoint_subscription" as const,
              webhookEndpointId: params.webhookEndpointId,
              mailboxId,
              eventTypes: [...params.eventTypes],
              createdAt: params.createdAt,
            })),
            nextCursor: null,
          }),
      }),
      Layer.succeed(ReplayStore, {
        createReplay: (params) =>
          Effect.sync(() => {
            const replay = createReplayFixture({
              id: params.id,
              mailboxId: params.mailboxId,
              webhookEndpointId: params.webhookEndpointId,
              startTime: params.startTime,
              endTime: params.endTime,
              createdAt: params.createdAt,
            });

            replays.set(replay.id, {
              replay,
              workspaceId: params.workspaceId,
            });

            return replay;
          }),
        getReplay: (replayId, options) =>
          Effect.succeed(
            Option.fromNullishOr(replays.get(replayId)).pipe(
              Option.filter(
                (value) =>
                  options?.workspaceId === undefined || value.workspaceId === options.workspaceId,
              ),
              Option.map((value) => value.replay),
            ),
          ),
        listReplayDispatchTargets: () => Effect.succeed([]),
        prepareReplayDispatch: () => Effect.succeed(Option.none()),
        completeReplayDispatch: () => Effect.void,
        failReplayDispatch: () => Effect.void,
      }),
      Layer.succeed(MailboxConnectSessionStore, {
        createConnectSession: (params) =>
          Effect.sync(() => {
            const session: StoredConnectSession = {
              id: params.id,
              provider: params.provider,
              workspaceId: params.workspaceId,
              tenantExternalId: params.tenantExternalId,
              mailboxExternalId: params.mailboxExternalId,
              redirectUrl: params.redirectUrl,
              codeVerifier: params.codeVerifier,
              expiresAt: params.expiresAt,
              mailboxId: null,
              completedAt: null,
            };

            connectSessions.set(session.id, session);

            return session;
          }),
        getConnectSession: (connectSessionId: string) =>
          Effect.succeed(Option.fromNullishOr(connectSessions.get(connectSessionId))),
        completeConnectSession: (params) =>
          Effect.sync(() => {
            const session = connectSessions.get(params.connectSessionId);

            if (session === undefined) {
              throw new Error(`Missing connect session ${params.connectSessionId}`);
            }

            const mailbox = createMailboxFixture({
              emailAddress: params.providerAccountEmail,
              initializedAt: null,
              syncState: "initializing",
            });

            connectSessions.set(session.id, {
              ...session,
              mailboxId: mailbox.id,
              completedAt: params.connectedAt,
            });

            return {
              mailbox,
              redirectUrl: session.redirectUrl,
              created: true,
            } as const;
          }),
      }),
      Layer.succeed(MailboxConnectProvider, {
        createAuthorizationUrl: ({ connectSessionId }) =>
          Effect.succeed(`https://accounts.google.com/o/oauth2/v2/auth?state=${connectSessionId}`),
        completeAuthorization: () =>
          Effect.succeed({
            providerAccountEmail: "user@gmail.com",
            refreshToken: "refresh-token",
          }),
      }),
      Layer.succeed(MailboxSyncDispatcher, {
        dispatchMailboxSync: (mailboxId: string) =>
          Effect.sync(() => {
            dispatchedMailboxIds.push(mailboxId);
          }),
      }),
    ),
  );

  return {
    app: createApp(runtime),
    connectSessions,
    dispatchedMailboxIds,
  };
};
