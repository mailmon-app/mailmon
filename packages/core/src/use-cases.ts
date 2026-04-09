import { Duration, Effect, Option } from "effect";

import type {
  CompletedSyncRun,
  ConnectSessionResource,
  CreateConnectSessionRequest,
  CreateWebhookEndpointRequest,
  CreateWebhookEndpointSubscriptionRequest,
  MailboxResource,
  StoredConnectSession,
  SyncMailboxResult,
  SyncRunOutcome,
  WebhookEventType,
} from "./contracts.js";
import {
  connectSessionExpired,
  connectSessionNotFound,
  invalidApiKey,
  mailboxNotFound,
  mailboxSyncLeaseLost,
  messageNotFound,
  threadNotFound,
  webhookEndpointNotFound,
} from "./problems.js";
import {
  MailboxQueryCatalog,
  MailboxCatalog,
  MailboxConnectProvider,
  MailboxConnectSessionStore,
  MailboxSyncCoordinator,
  MailboxSyncDispatcher,
  MailboxSyncProvider,
  MailboxStateStore,
  SyncRunStore,
  WebhookEndpointCatalog,
  WebhookEndpointStore,
  WebhookEndpointSubscriptionStore,
  WorkspaceApiKeyStore,
} from "./services.js";

const DEFAULT_CONNECT_SESSION_TTL_MS = 15 * 60_000;
const DEFAULT_MAILBOX_SYNC_LEASE_TTL_MS = 90_000;
const DEFAULT_MAILBOX_SYNC_LEASE_HEARTBEAT_INTERVAL_MS = 30_000;

const addMillisecondsToIsoTimestamp = (timestamp: string, milliseconds: number) => {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
};

const trimTrailingSlash = (value: string) => {
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

const buildHostedGmailConnectUrl = (connectBaseUrl: string, connectSessionId: string) => {
  return `${trimTrailingSlash(connectBaseUrl)}/oauth/gmail/${connectSessionId}`;
};

const buildGmailConnectRedirectUri = (connectBaseUrl: string) => {
  return `${trimTrailingSlash(connectBaseUrl)}/oauth/gmail/callback`;
};

const createConnectSessionCodeVerifier = () => {
  return `${globalThis.crypto.randomUUID()}${globalThis.crypto.randomUUID()}`;
};

const createConnectSessionId = () => {
  return `mcs_${globalThis.crypto.randomUUID()}`;
};

const createWebhookEndpointId = () => {
  return `whe_${globalThis.crypto.randomUUID()}`;
};

const createWebhookEndpointSecret = () => {
  return `whsec_${globalThis.crypto.randomUUID()}${globalThis.crypto.randomUUID()}`;
};

const WEBHOOK_EVENT_TYPE_ORDER: ReadonlyArray<WebhookEventType> = [
  "message.created",
  "message.updated",
  "thread.updated",
];

const normalizeWebhookEventTypes = (
  eventTypes: ReadonlyArray<WebhookEventType>,
): ReadonlyArray<WebhookEventType> => {
  const requestedEventTypes = new Set(eventTypes);

  return WEBHOOK_EVENT_TYPE_ORDER.filter((eventType) => requestedEventTypes.has(eventType));
};

const isConnectSessionExpired = (
  connectSession: Readonly<Pick<StoredConnectSession, "completedAt" | "expiresAt">>,
  observedAt: string,
) => {
  return (
    connectSession.completedAt === null &&
    Date.parse(connectSession.expiresAt) <= Date.parse(observedAt)
  );
};

const createSyncRunCompletion = (
  params: Readonly<{
    syncRunId: string;
    mailboxId: string;
    completedAt: string;
    status: SyncRunOutcome;
    eventsEmitted: number;
    nextCursor: string | null;
    detail?: string | null;
  }>,
): CompletedSyncRun => {
  return {
    syncRunId: params.syncRunId,
    mailboxId: params.mailboxId,
    completedAt: params.completedAt,
    status: params.status,
    eventsEmitted: params.eventsEmitted,
    nextCursor: params.nextCursor,
    detail: params.detail ?? null,
  };
};

export const authenticateWorkspaceApiKeyOrFail = (apiKey: string) =>
  Effect.gen(function* () {
    const workspaceApiKeyStore = yield* WorkspaceApiKeyStore;
    const workspace = yield* workspaceApiKeyStore.getWorkspaceForApiKey(apiKey);

    return yield* Option.match(workspace, {
      onNone: () => Effect.fail(invalidApiKey()),
      onSome: (value) => Effect.succeed(value),
    });
  });

export const getMailboxById = (
  mailboxId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const catalog = yield* MailboxCatalog;

    return yield* catalog.getMailbox(mailboxId, options);
  });

export const getMailboxOrFail = (
  mailboxId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  getMailboxById(mailboxId, options).pipe(
    Effect.flatMap((mailbox) =>
      Option.match(mailbox, {
        onNone: () => Effect.fail(mailboxNotFound(mailboxId)),
        onSome: (value) => Effect.succeed(value),
      }),
    ),
  );

export const getWebhookEndpointById = (
  webhookEndpointId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const catalog = yield* WebhookEndpointCatalog;

    return yield* catalog.getWebhookEndpoint(webhookEndpointId, options);
  });

export const getWebhookEndpointOrFail = (
  webhookEndpointId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  getWebhookEndpointById(webhookEndpointId, options).pipe(
    Effect.flatMap((webhookEndpoint) =>
      Option.match(webhookEndpoint, {
        onNone: () => Effect.fail(webhookEndpointNotFound(webhookEndpointId)),
        onSome: (value) => Effect.succeed(value),
      }),
    ),
  );

export const listMailboxMessages = (
  mailboxId: string,
  options: Readonly<{
    cursor?: string | null;
    limit: number;
    workspaceId?: string;
  }>,
) =>
  Effect.gen(function* () {
    yield* getMailboxOrFail(
      mailboxId,
      options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId },
    );
    const queryCatalog = yield* MailboxQueryCatalog;

    return yield* queryCatalog.listMessages({
      mailboxId,
      cursor: options.cursor ?? null,
      limit: options.limit,
    });
  });

export const getMessageOrFail = (
  messageId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const queryCatalog = yield* MailboxQueryCatalog;
    const message = yield* queryCatalog.getMessage(messageId, options);

    return yield* Option.match(message, {
      onNone: () => Effect.fail(messageNotFound(messageId)),
      onSome: (value) => Effect.succeed(value),
    });
  });

export const listMailboxThreads = (
  mailboxId: string,
  options: Readonly<{
    cursor?: string | null;
    limit: number;
    workspaceId?: string;
  }>,
) =>
  Effect.gen(function* () {
    yield* getMailboxOrFail(
      mailboxId,
      options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId },
    );
    const queryCatalog = yield* MailboxQueryCatalog;

    return yield* queryCatalog.listThreads({
      mailboxId,
      cursor: options.cursor ?? null,
      limit: options.limit,
    });
  });

export const getThreadOrFail = (
  threadId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const queryCatalog = yield* MailboxQueryCatalog;
    const thread = yield* queryCatalog.getThread(threadId, options);

    return yield* Option.match(thread, {
      onNone: () => Effect.fail(threadNotFound(threadId)),
      onSome: (value) => Effect.succeed(value),
    });
  });

export const getConnectSessionOrFail = (connectSessionId: string) =>
  Effect.gen(function* () {
    const connectSessionStore = yield* MailboxConnectSessionStore;
    const connectSession = yield* connectSessionStore.getConnectSession(connectSessionId);

    return yield* Option.match(connectSession, {
      onNone: () => Effect.fail(connectSessionNotFound(connectSessionId)),
      onSome: (value) => Effect.succeed(value),
    });
  });

export const createMailboxConnectSession = (
  workspaceId: string,
  request: CreateConnectSessionRequest,
  connectBaseUrl: string,
) =>
  Effect.gen(function* () {
    const connectSessionStore = yield* MailboxConnectSessionStore;
    const createdAt = new Date().toISOString();
    const connectSession = yield* connectSessionStore.createConnectSession({
      id: createConnectSessionId(),
      codeVerifier: createConnectSessionCodeVerifier(),
      expiresAt: addMillisecondsToIsoTimestamp(createdAt, DEFAULT_CONNECT_SESSION_TTL_MS),
      mailboxExternalId: request.mailboxExternalId,
      provider: request.provider,
      redirectUrl: request.redirectUrl,
      tenantExternalId: request.tenantExternalId,
      workspaceId,
    });

    const resource: ConnectSessionResource = {
      id: connectSession.id,
      object: "connect_session",
      connectUrl: buildHostedGmailConnectUrl(connectBaseUrl, connectSession.id),
      expiresAt: connectSession.expiresAt,
    };

    return resource;
  });

export const createWebhookEndpoint = (workspaceId: string, request: CreateWebhookEndpointRequest) =>
  Effect.gen(function* () {
    const webhookEndpointStore = yield* WebhookEndpointStore;
    const createdAt = new Date().toISOString();

    return yield* webhookEndpointStore.createWebhookEndpoint({
      id: createWebhookEndpointId(),
      workspaceId,
      url: request.url,
      description: request.description ?? null,
      secret: createWebhookEndpointSecret(),
      createdAt,
    });
  });

export const createWebhookEndpointSubscription = (
  workspaceId: string,
  webhookEndpointId: string,
  request: CreateWebhookEndpointSubscriptionRequest,
) =>
  Effect.gen(function* () {
    const mailboxIds = [...new Set(request.mailboxIds)];
    const eventTypes = normalizeWebhookEventTypes(request.eventTypes);

    yield* getWebhookEndpointOrFail(webhookEndpointId, { workspaceId });
    yield* Effect.forEach(mailboxIds, (mailboxId) => getMailboxOrFail(mailboxId, { workspaceId }));

    const webhookEndpointSubscriptionStore = yield* WebhookEndpointSubscriptionStore;

    return yield* webhookEndpointSubscriptionStore.createWebhookEndpointSubscription({
      webhookEndpointId,
      workspaceId,
      mailboxIds,
      eventTypes,
      createdAt: new Date().toISOString(),
    });
  });

export const getGmailMailboxConnectAuthorizationUrl = (
  connectSessionId: string,
  connectBaseUrl: string,
) =>
  Effect.gen(function* () {
    const connectSession = yield* getConnectSessionOrFail(connectSessionId);

    if (isConnectSessionExpired(connectSession, new Date().toISOString())) {
      return yield* Effect.fail(connectSessionExpired(connectSessionId));
    }

    const mailboxConnectProvider = yield* MailboxConnectProvider;

    return yield* mailboxConnectProvider.createAuthorizationUrl({
      codeVerifier: connectSession.codeVerifier,
      connectSessionId: connectSession.id,
      redirectUri: buildGmailConnectRedirectUri(connectBaseUrl),
    });
  });

const completePreviouslyConnectedMailboxSession = (connectSession: StoredConnectSession) =>
  Effect.gen(function* () {
    if (connectSession.mailboxId === null) {
      return yield* Effect.fail(connectSessionNotFound(connectSession.id));
    }

    const mailbox = yield* getMailboxOrFail(connectSession.mailboxId, {
      workspaceId: connectSession.workspaceId,
    });

    if (mailbox.initializedAt === null) {
      const dispatcher = yield* MailboxSyncDispatcher;

      yield* dispatcher.dispatchMailboxSync(mailbox.id);
    }

    return {
      mailbox,
      redirectUrl: connectSession.redirectUrl,
      created: false,
    } as const;
  });

export const completeGmailMailboxConnectSession = (
  connectSessionId: string,
  code: string,
  connectBaseUrl: string,
) =>
  Effect.gen(function* () {
    const connectSession = yield* getConnectSessionOrFail(connectSessionId);

    if (connectSession.completedAt !== null) {
      return yield* completePreviouslyConnectedMailboxSession(connectSession);
    }

    const completedAt = new Date().toISOString();

    if (isConnectSessionExpired(connectSession, completedAt)) {
      return yield* Effect.fail(connectSessionExpired(connectSessionId));
    }

    const mailboxConnectProvider = yield* MailboxConnectProvider;
    const connectSessionStore = yield* MailboxConnectSessionStore;
    const dispatcher = yield* MailboxSyncDispatcher;
    const authorization = yield* mailboxConnectProvider.completeAuthorization({
      code,
      codeVerifier: connectSession.codeVerifier,
      connectSessionId: connectSession.id,
      redirectUri: buildGmailConnectRedirectUri(connectBaseUrl),
    });
    const completedSession = yield* connectSessionStore.completeConnectSession({
      connectSessionId: connectSession.id,
      connectedAt: completedAt,
      providerAccountEmail: authorization.providerAccountEmail,
      refreshToken: authorization.refreshToken,
    });

    if (completedSession.created) {
      yield* dispatcher.dispatchMailboxSync(completedSession.mailbox.id);
    }

    return completedSession;
  });

export const runMailboxSync = (mailboxId: string) =>
  Effect.gen(function* () {
    const mailbox = yield* getMailboxOrFail(mailboxId);
    const syncRunStore = yield* SyncRunStore;
    const syncCoordinator = yield* MailboxSyncCoordinator;
    const mailboxProvider = yield* MailboxSyncProvider;
    const mailboxStateStore = yield* MailboxStateStore;
    const cursor = yield* mailboxStateStore.getMailboxCursor(mailbox.id);
    const syncRun = yield* syncRunStore.startSyncRun(mailbox.id);
    const leaseOwnerId = globalThis.crypto.randomUUID();
    const acquisition = yield* syncCoordinator.acquireMailboxSyncLease({
      mailboxId: mailbox.id,
      syncRunId: syncRun.syncRunId,
      leaseOwnerId,
      acquiredAt: syncRun.startedAt,
      expiresAt: addMillisecondsToIsoTimestamp(
        syncRun.startedAt,
        DEFAULT_MAILBOX_SYNC_LEASE_TTL_MS,
      ),
    });

    if (!acquisition.acquired) {
      const completedAt = new Date().toISOString();
      const completion = createSyncRunCompletion({
        syncRunId: syncRun.syncRunId,
        mailboxId: mailbox.id,
        completedAt,
        status: "skipped_due_to_active_lease",
        eventsEmitted: 0,
        nextCursor: null,
      });

      yield* syncRunStore.completeSyncRun(completion);

      const skipped: SyncMailboxResult = {
        ...syncRun,
        status: "skipped_due_to_active_lease",
        completedAt,
        eventsEmitted: 0,
        nextCursor: null,
      };

      return skipped;
    }

    const heartbeat = Effect.forever(
      Effect.sleep(Duration.millis(DEFAULT_MAILBOX_SYNC_LEASE_HEARTBEAT_INTERVAL_MS)).pipe(
        Effect.zipRight(
          syncCoordinator.renewMailboxSyncLease({
            mailboxId: mailbox.id,
            leaseOwnerId,
            heartbeatAt: new Date().toISOString(),
            expiresAt: addMillisecondsToIsoTimestamp(
              new Date().toISOString(),
              DEFAULT_MAILBOX_SYNC_LEASE_TTL_MS,
            ),
          }),
        ),
        Effect.flatMap((renewal) =>
          renewal.renewed ? Effect.void : Effect.fail(mailboxSyncLeaseLost(mailbox.id)),
        ),
      ),
    );

    const syncWork = mailboxProvider.syncMailbox({ mailbox, cursor }).pipe(
      Effect.flatMap((providerResult) => {
        const completedAt = new Date().toISOString();
        return mailboxStateStore
          .applySyncResult({
            eventsEmitted: providerResult.eventsEmitted,
            mailboxId: mailbox.id,
            leaseOwnerId,
            syncRunId: syncRun.syncRunId,
            snapshot: providerResult.snapshot,
            nextCursor: providerResult.nextCursor,
            syncedAt: completedAt,
          })
          .pipe(
            Effect.flatMap((commitResult) =>
              commitResult.applied
                ? Effect.succeed({
                    ...syncRun,
                    status: "completed",
                    completedAt,
                    eventsEmitted: commitResult.mailboxEventIds.length,
                    nextCursor: providerResult.nextCursor,
                  } satisfies SyncMailboxResult)
                : Effect.fail(mailboxSyncLeaseLost(mailbox.id)),
            ),
          );
      }),
    );

    return yield* Effect.raceFirst(syncWork, heartbeat).pipe(
      Effect.catchAll((problem) => {
        const completedAt = new Date().toISOString();
        const completion = createSyncRunCompletion({
          syncRunId: syncRun.syncRunId,
          mailboxId: mailbox.id,
          completedAt,
          status:
            problem.code === "mailbox_sync_lease_lost"
              ? "lease_lost"
              : "failed_after_lease_acquired",
          eventsEmitted: 0,
          nextCursor: null,
          detail: problem.code,
        });

        return syncRunStore.completeSyncRun(completion).pipe(Effect.zipRight(Effect.fail(problem)));
      }),
      Effect.ensuring(
        syncCoordinator.releaseMailboxSyncLease({
          mailboxId: mailbox.id,
          leaseOwnerId,
        }),
      ),
    );
  });

export const dispatchMailboxSync = (mailboxId: string) =>
  Effect.gen(function* () {
    const mailbox = yield* getMailboxOrFail(mailboxId);
    const dispatcher = yield* MailboxSyncDispatcher;

    yield* dispatcher.dispatchMailboxSync(mailbox.id);

    return mailbox;
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
