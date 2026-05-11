import { Effect, Option } from "effect";

import type {
  ConnectSessionResource,
  CompletedWebhookDeliveryAttempt,
  ControlJobDispatchRequest,
  ControlJobRunResult,
  CreateConnectSessionRequest,
  CreateReplayRequest,
  CreateWebhookEndpointRequest,
  CreateWebhookEndpointSubscriptionRequest,
  DispatchReplaysResult,
  GmailPushNotification,
  GmailPushNotificationResult,
  MailboxSyncDispatchExhaustedResult,
  MailboxResource,
  NoopControlJobResult,
  ProcessWebhookDeliveryResult,
  RecoveredStuckMailboxSyncExecution,
  RecoverStuckMailboxSyncExecutionsResult,
  RecoverWebhookDeliverySchedulingResult,
  RepairMailboxesResult,
  RenewMailboxWatchesResult,
  StoredConnectSession,
  WebhookDeliverySendFailure,
  WebhookEventType,
} from "./contracts.js";
import { scheduleWebhookDeliveryRequests } from "./mailbox-event-delivery-scheduling.js";
export { scheduleMailboxEventDeliveries } from "./mailbox-event-delivery-scheduling.js";
export { runMailboxSync } from "./mailbox-sync-execution.js";
import {
  connectSessionExpired,
  connectSessionNotFound,
  invalidApiKey,
  invalidReplayTimeRange,
  mailboxNotFound,
  messageNotFound,
  replayNotFound,
  threadNotFound,
  webhookEndpointNotFound,
} from "./problems.js";
import {
  MailboxObservabilityCatalog,
  MailboxQueryCatalog,
  MailboxCatalog,
  MailboxConnectProvider,
  MailboxConnectSessionStore,
  MailboxExecutionRecoveryStore,
  MailboxPushNotificationStore,
  MailboxRepairStore,
  MailboxSyncDispatchExhaustionStore,
  MailboxSyncDispatcher,
  MailboxWatchProvider,
  MailboxWatchStore,
  ReplayStore,
  WebhookDeliveryScheduler,
  WebhookDeliverySender,
  WebhookDeliveryStore,
  WebhookEndpointCatalog,
  WebhookEndpointStore,
  WebhookEndpointSubscriptionStore,
  WorkspaceApiKeyStore,
} from "./services.js";

const DEFAULT_CONNECT_SESSION_TTL_MS = 15 * 60_000;
const DEFAULT_GMAIL_WATCH_RENEWAL_WINDOW_MS = 24 * 60 * 60_000;
const DEFAULT_GMAIL_WATCH_RENEWAL_BATCH_SIZE = 100;
const DEFAULT_MAILBOX_REPAIR_BATCH_SIZE = 100;
const DEFAULT_STUCK_MAILBOX_SYNC_RECOVERY_BATCH_SIZE = 100;
const DEFAULT_REPLAY_DISPATCH_BATCH_SIZE = 100;
const DEFAULT_WEBHOOK_DELIVERY_MAX_ATTEMPTS = 5;
const DEFAULT_WEBHOOK_DELIVERY_RETRY_DELAY_MS = 5_000;
const MAX_WEBHOOK_DELIVERY_RETRY_DELAY_MS = 15 * 60_000;

interface StuckMailboxSyncRecoveryOutcome {
  readonly dispatched: boolean;
  readonly recovered: boolean;
  readonly recoveredExecution: RecoveredStuckMailboxSyncExecution | null;
  readonly skippedReconnectRequired: boolean;
}

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

const createSyncRunId = () => {
  return `sr_${globalThis.crypto.randomUUID()}`;
};

const createReplayId = () => {
  return `rpl_${globalThis.crypto.randomUUID()}`;
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

const calculateWebhookDeliveryRetryDelayMs = (attemptCount: number) => {
  return Math.min(
    MAX_WEBHOOK_DELIVERY_RETRY_DELAY_MS,
    DEFAULT_WEBHOOK_DELIVERY_RETRY_DELAY_MS * 2 ** Math.max(0, attemptCount - 1),
  );
};

const createWebhookDeliveryCompletion = (params: {
  readonly deliveryId: string;
  readonly attemptCount: number;
  readonly processingStartedAt: string;
  readonly state: CompletedWebhookDeliveryAttempt["state"];
  readonly completedAt: string;
  readonly nextAttemptAt?: string | null;
  readonly responseStatusCode?: number | null;
  readonly errorCode?: string | null;
  readonly errorMessage?: string | null;
  readonly retryable?: boolean | null;
}): CompletedWebhookDeliveryAttempt => {
  return {
    deliveryId: params.deliveryId,
    attemptCount: params.attemptCount,
    processingStartedAt: params.processingStartedAt,
    state: params.state,
    completedAt: params.completedAt,
    nextAttemptAt: params.nextAttemptAt ?? null,
    responseStatusCode: params.responseStatusCode ?? null,
    errorCode: params.errorCode ?? null,
    errorMessage: params.errorMessage ?? null,
    retryable: params.retryable ?? null,
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

export const listMailboxSyncRuns = (
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
    const observabilityCatalog = yield* MailboxObservabilityCatalog;

    return yield* observabilityCatalog.listSyncRuns({
      mailboxId,
      cursor: options.cursor ?? null,
      limit: options.limit,
    });
  });

export const getMailboxObservability = (
  mailboxId: string,
  options: Readonly<{
    observedAt?: string;
    workspaceId?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    yield* getMailboxOrFail(
      mailboxId,
      options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId },
    );
    const observabilityCatalog = yield* MailboxObservabilityCatalog;

    return yield* observabilityCatalog.getMailboxObservability({
      mailboxId,
      observedAt: options.observedAt ?? new Date().toISOString(),
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

const parseReplayTimestamp = (value: string) => {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
};

const validateReplayTimeRange = (request: CreateReplayRequest) => {
  const start = parseReplayTimestamp(request.startTime);
  const end = parseReplayTimestamp(request.endTime);

  if (start === null || end === null || start > end) {
    return Effect.fail(invalidReplayTimeRange());
  }

  return Effect.succeed({
    endTime: new Date(end).toISOString(),
    startTime: new Date(start).toISOString(),
  });
};

export const createReplay = (workspaceId: string, request: CreateReplayRequest) =>
  Effect.gen(function* () {
    const range = yield* validateReplayTimeRange(request);
    yield* getMailboxOrFail(request.mailboxId, { workspaceId });
    yield* getWebhookEndpointOrFail(request.webhookEndpointId, { workspaceId });

    const replayStore = yield* ReplayStore;

    return yield* replayStore.createReplay({
      ...request,
      endTime: range.endTime,
      startTime: range.startTime,
      createdAt: new Date().toISOString(),
      id: createReplayId(),
      workspaceId,
    });
  });

export const getReplayOrFail = (
  replayId: string,
  options: Readonly<{
    workspaceId?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const replayStore = yield* ReplayStore;
    const replay = yield* replayStore.getReplay(replayId, options);

    return yield* Option.match(replay, {
      onNone: () => Effect.fail(replayNotFound(replayId)),
      onSome: (resource) => Effect.succeed(resource),
    });
  });

export const dispatchReplays = (
  options: Readonly<{
    limit?: number;
    observedAt?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const observedAt = options.observedAt ?? new Date().toISOString();
    const limit = options.limit ?? DEFAULT_REPLAY_DISPATCH_BATCH_SIZE;
    const replayStore = yield* ReplayStore;
    const webhookDeliveryStore = yield* WebhookDeliveryStore;
    const webhookDeliveryScheduler = yield* WebhookDeliveryScheduler;
    const targets = yield* replayStore.listReplayDispatchTargets({
      limit,
      observedAt,
    });

    const outcomes = yield* Effect.forEach(
      targets,
      (target) =>
        replayStore
          .prepareReplayDispatch({
            replayId: target.id,
            startedAt: observedAt,
          })
          .pipe(
            Effect.flatMap((prepared) =>
              Option.match(prepared, {
                onNone: () =>
                  Effect.succeed({
                    dispatched: false,
                    eventsReplayed: 0,
                    failed: false,
                  }),
                onSome: (dispatch) =>
                  Effect.gen(function* () {
                    const deliveryRequests =
                      yield* webhookDeliveryStore.createWebhookDeliveriesForReplay({
                        mailboxEventIds: dispatch.mailboxEventIds,
                        notBefore: observedAt,
                        replayId: dispatch.replay.id,
                        webhookEndpointId: dispatch.replay.webhookEndpointId,
                      });

                    yield* Effect.forEach(
                      deliveryRequests,
                      (request) => webhookDeliveryScheduler.scheduleWebhookDelivery(request),
                      { discard: true },
                    );

                    yield* replayStore.completeReplayDispatch({
                      replayId: dispatch.replay.id,
                      completedAt: observedAt,
                      eventsReplayed: deliveryRequests.length,
                    });

                    return {
                      dispatched: true,
                      eventsReplayed: deliveryRequests.length,
                      failed: false,
                    } as const;
                  }),
              }),
            ),
          ),
      { concurrency: 10 },
    );

    return {
      completedAt: observedAt,
      dispatched: outcomes.filter((outcome) => outcome.dispatched).length,
      eventsReplayed: outcomes.reduce((total, outcome) => total + outcome.eventsReplayed, 0),
      failed: outcomes.filter((outcome) => outcome.failed).length,
      kind: "dispatch_replays",
      scanned: targets.length,
      status: "completed",
    } satisfies DispatchReplaysResult;
  });

export const recoverWebhookDeliveryScheduling = (recoveredAt = new Date().toISOString()) =>
  Effect.gen(function* () {
    const webhookDeliveryStore = yield* WebhookDeliveryStore;
    const deliveryRequests =
      yield* webhookDeliveryStore.listWebhookDeliveryRecoverySchedules(recoveredAt);

    if (deliveryRequests.length === 0) {
      return [] as const;
    }

    return yield* scheduleWebhookDeliveryRequests(deliveryRequests);
  });

export const recoverWebhookDeliverySchedulingControlJob = (
  options: Readonly<{
    recoveredAt?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const recoveredAt = options.recoveredAt ?? new Date().toISOString();
    const deliveryRequests = yield* recoverWebhookDeliveryScheduling(recoveredAt);

    return {
      completedAt: recoveredAt,
      kind: "recover_webhook_deliveries",
      recovered: deliveryRequests.length,
      status: "completed",
    } satisfies RecoverWebhookDeliverySchedulingResult;
  });

const classifyWebhookDeliveryFailure = (
  delivery: Readonly<{
    deliveryId: string;
    attemptCount: number;
    processingStartedAt: string;
  }>,
  completedAt: string,
  failure: WebhookDeliverySendFailure,
) => {
  const retryExhausted =
    failure.retryable && delivery.attemptCount >= DEFAULT_WEBHOOK_DELIVERY_MAX_ATTEMPTS;
  const nextAttemptAt =
    failure.retryable && !retryExhausted
      ? addMillisecondsToIsoTimestamp(
          completedAt,
          calculateWebhookDeliveryRetryDelayMs(delivery.attemptCount),
        )
      : null;

  if (nextAttemptAt !== null) {
    return {
      completion: createWebhookDeliveryCompletion({
        deliveryId: delivery.deliveryId,
        attemptCount: delivery.attemptCount,
        processingStartedAt: delivery.processingStartedAt,
        state: "pending",
        completedAt,
        nextAttemptAt,
        errorCode: failure.code,
        errorMessage: failure.message,
        retryable: true,
      }),
      result: {
        deliveryId: delivery.deliveryId,
        status: "scheduled_for_retry",
        attemptCount: delivery.attemptCount,
        nextAttemptAt,
      } satisfies ProcessWebhookDeliveryResult,
    } as const;
  }

  return {
    completion: createWebhookDeliveryCompletion({
      deliveryId: delivery.deliveryId,
      attemptCount: delivery.attemptCount,
      processingStartedAt: delivery.processingStartedAt,
      state: "failed",
      completedAt,
      errorCode: retryExhausted ? "webhook_delivery_retry_exhausted" : failure.code,
      errorMessage: retryExhausted
        ? `Webhook delivery exhausted application retries after ${delivery.attemptCount} attempts. Last failure: ${failure.message}`
        : failure.message,
      retryable: retryExhausted ? false : failure.retryable,
    }),
    result: {
      deliveryId: delivery.deliveryId,
      status: retryExhausted ? "retry_exhausted" : "failed",
      attemptCount: delivery.attemptCount,
      nextAttemptAt: null,
    } satisfies ProcessWebhookDeliveryResult,
  } as const;
};

const classifyWebhookDeliveryResponse = (
  delivery: Readonly<{
    deliveryId: string;
    attemptCount: number;
    processingStartedAt: string;
  }>,
  completedAt: string,
  statusCode: number,
) => {
  if (statusCode >= 200 && statusCode < 300) {
    return {
      completion: createWebhookDeliveryCompletion({
        deliveryId: delivery.deliveryId,
        attemptCount: delivery.attemptCount,
        processingStartedAt: delivery.processingStartedAt,
        state: "delivered",
        completedAt,
        responseStatusCode: statusCode,
      }),
      result: {
        deliveryId: delivery.deliveryId,
        status: "delivered",
        attemptCount: delivery.attemptCount,
        nextAttemptAt: null,
      } satisfies ProcessWebhookDeliveryResult,
    } as const;
  }

  const retryExhausted =
    statusCode >= 500 && delivery.attemptCount >= DEFAULT_WEBHOOK_DELIVERY_MAX_ATTEMPTS;
  const nextAttemptAt =
    statusCode >= 500 && !retryExhausted
      ? addMillisecondsToIsoTimestamp(
          completedAt,
          calculateWebhookDeliveryRetryDelayMs(delivery.attemptCount),
        )
      : null;

  if (nextAttemptAt !== null) {
    return {
      completion: createWebhookDeliveryCompletion({
        deliveryId: delivery.deliveryId,
        attemptCount: delivery.attemptCount,
        processingStartedAt: delivery.processingStartedAt,
        state: "pending",
        completedAt,
        nextAttemptAt,
        responseStatusCode: statusCode,
        errorCode: `webhook_endpoint_http_${statusCode}`,
        errorMessage: `Webhook endpoint responded with HTTP ${statusCode}.`,
        retryable: true,
      }),
      result: {
        deliveryId: delivery.deliveryId,
        status: "scheduled_for_retry",
        attemptCount: delivery.attemptCount,
        nextAttemptAt,
      } satisfies ProcessWebhookDeliveryResult,
    } as const;
  }

  return {
    completion: createWebhookDeliveryCompletion({
      deliveryId: delivery.deliveryId,
      attemptCount: delivery.attemptCount,
      processingStartedAt: delivery.processingStartedAt,
      state: "failed",
      completedAt,
      responseStatusCode: statusCode,
      errorCode: retryExhausted
        ? "webhook_delivery_retry_exhausted"
        : `webhook_endpoint_http_${statusCode}`,
      errorMessage: retryExhausted
        ? `Webhook delivery exhausted application retries after ${delivery.attemptCount} attempts. Last response: HTTP ${statusCode}.`
        : `Webhook endpoint responded with HTTP ${statusCode}.`,
      retryable: retryExhausted ? false : statusCode >= 500,
    }),
    result: {
      deliveryId: delivery.deliveryId,
      status: retryExhausted ? "retry_exhausted" : "failed",
      attemptCount: delivery.attemptCount,
      nextAttemptAt: null,
    } satisfies ProcessWebhookDeliveryResult,
  } as const;
};

const finalizeWebhookDelivery = (
  completion: CompletedWebhookDeliveryAttempt,
  result: ProcessWebhookDeliveryResult,
) =>
  Effect.gen(function* () {
    const webhookDeliveryStore = yield* WebhookDeliveryStore;
    const applied = yield* webhookDeliveryStore.completeWebhookDeliveryAttempt(completion);

    if (!applied) {
      return {
        deliveryId: completion.deliveryId,
        status: "noop",
        attemptCount: null,
        nextAttemptAt: null,
      } satisfies ProcessWebhookDeliveryResult;
    }

    if (completion.state === "pending") {
      yield* scheduleWebhookDeliveryRequests(
        [
          {
            deliveryId: completion.deliveryId,
            notBefore: completion.nextAttemptAt ?? completion.completedAt,
          },
        ],
        {
          continueOnSchedulingFailure: true,
        },
      );
    }

    return result;
  });

export const runWebhookDelivery = (deliveryId: string) =>
  Effect.gen(function* () {
    const webhookDeliveryStore = yield* WebhookDeliveryStore;
    const webhookDeliverySender = yield* WebhookDeliverySender;
    const attemptedAt = new Date().toISOString();
    const preparedDelivery = yield* webhookDeliveryStore.prepareWebhookDeliveryAttempt(
      deliveryId,
      attemptedAt,
    );

    return yield* Option.match(preparedDelivery, {
      onNone: () =>
        Effect.succeed({
          deliveryId,
          status: "noop",
          attemptCount: null,
          nextAttemptAt: null,
        } satisfies ProcessWebhookDeliveryResult),
      onSome: (delivery) =>
        webhookDeliverySender.send(delivery, attemptedAt).pipe(
          Effect.match({
            onFailure: (failure) =>
              classifyWebhookDeliveryFailure(delivery, new Date().toISOString(), failure),
            onSuccess: (response) =>
              classifyWebhookDeliveryResponse(
                delivery,
                new Date().toISOString(),
                response.statusCode,
              ),
          }),
          Effect.flatMap(({ completion, result }) => finalizeWebhookDelivery(completion, result)),
        ),
    });
  });

const isMailboxWatchExpired = (watchExpiresAt: string | null, observedAt: string): boolean =>
  watchExpiresAt !== null && Date.parse(watchExpiresAt) <= Date.parse(observedAt);

const parseGmailHistoryId = (historyId: string): bigint | null => {
  if (!/^\d+$/.test(historyId)) {
    return null;
  }

  return BigInt(historyId);
};

const isWatchHistoryAheadOfMailboxCursor = (
  mailboxCursor: string | null,
  watchHistoryId: string,
): boolean => {
  if (mailboxCursor === null) {
    return true;
  }

  const parsedMailboxCursor = parseGmailHistoryId(mailboxCursor);
  const parsedWatchHistoryId = parseGmailHistoryId(watchHistoryId);

  if (parsedMailboxCursor !== null && parsedWatchHistoryId !== null) {
    return parsedWatchHistoryId > parsedMailboxCursor;
  }

  return watchHistoryId !== mailboxCursor;
};

export const renewExpiringMailboxWatches = (
  options: Readonly<{
    limit?: number;
    observedAt?: string;
    renewalWindowMs?: number;
  }> = {},
) =>
  Effect.gen(function* () {
    const observedAt = options.observedAt ?? new Date().toISOString();
    const renewalWindowMs = options.renewalWindowMs ?? DEFAULT_GMAIL_WATCH_RENEWAL_WINDOW_MS;
    const limit = options.limit ?? DEFAULT_GMAIL_WATCH_RENEWAL_BATCH_SIZE;
    const mailboxWatchStore = yield* MailboxWatchStore;
    const mailboxWatchProvider = yield* MailboxWatchProvider;
    const dispatcher = yield* MailboxSyncDispatcher;
    const targets = yield* mailboxWatchStore.listMailboxWatchesNeedingRenewal({
      limit,
      observedAt,
      renewalWindowMs,
    });

    const outcomes = yield* Effect.forEach(
      targets,
      (target) => {
        const expired =
          target.mailbox.watchState === "expired" ||
          isMailboxWatchExpired(target.watchExpiresAt, observedAt);

        return Effect.gen(function* () {
          yield* mailboxWatchStore.markMailboxWatchRenewalStarted({
            mailboxId: target.mailbox.id,
            observedAt,
          });

          const renewal = yield* mailboxWatchProvider.renewMailboxWatch({
            mailbox: target.mailbox,
          });

          yield* mailboxWatchStore.completeMailboxWatchRenewal({
            historyId: renewal.historyId,
            mailboxId: target.mailbox.id,
            renewedAt: observedAt,
            watchExpiresAt: renewal.watchExpiresAt,
          });

          if (expired || isWatchHistoryAheadOfMailboxCursor(target.cursor, renewal.historyId)) {
            yield* dispatcher.dispatchMailboxSync(target.mailbox.id);
          }

          return {
            expired,
            status: "renewed" as const,
          };
        }).pipe(
          Effect.catch((problem) =>
            mailboxWatchStore.failMailboxWatchRenewal({
              mailboxId: target.mailbox.id,
              observedAt,
              problem,
            }).pipe(
              Effect.as({
                expired,
                status: "failed" as const,
              }),
            ),
          ),
        );
      },
      { concurrency: 10 },
    );

    return {
      completedAt: observedAt,
      expired: outcomes.filter((outcome) => outcome.expired).length,
      expiring: outcomes.filter((outcome) => !outcome.expired).length,
      failed: outcomes.filter((outcome) => outcome.status === "failed").length,
      kind: "renew_watches",
      renewed: outcomes.filter((outcome) => outcome.status === "renewed").length,
      scanned: targets.length,
      status: "completed",
    } satisfies RenewMailboxWatchesResult;
  });

export const repairMailboxes = (
  options: Readonly<{
    limit?: number;
    observedAt?: string;
  }> = {},
) =>
  Effect.gen(function* () {
    const observedAt = options.observedAt ?? new Date().toISOString();
    const limit = options.limit ?? DEFAULT_MAILBOX_REPAIR_BATCH_SIZE;
    const mailboxRepairStore = yield* MailboxRepairStore;
    const dispatcher = yield* MailboxSyncDispatcher;
    const targets = yield* mailboxRepairStore.listMailboxesNeedingRepair({
      limit,
      observedAt,
    });

    const prepared = yield* Effect.forEach(
      targets,
      (target) =>
        mailboxRepairStore
          .prepareMailboxForRepair({
            mailboxId: target.mailbox.id,
            observedAt,
            resetCursor: target.requiresCursorReset,
          })
          .pipe(
            Effect.flatMap((scheduled) =>
              scheduled
                ? dispatcher.dispatchMailboxSync(target.mailbox.id).pipe(
                    Effect.as({
                      dispatched: true,
                      resetCursor: target.requiresCursorReset,
                    }),
                  )
                : Effect.succeed({
                    dispatched: false,
                    resetCursor: false,
                  }),
            ),
          ),
      { concurrency: 10 },
    );

    return {
      completedAt: observedAt,
      cursorResets: prepared.filter((item) => item.resetCursor).length,
      dispatched: prepared.filter((item) => item.dispatched).length,
      kind: "repair_mailboxes",
      scanned: targets.length,
      status: "completed",
    } satisfies RepairMailboxesResult;
  });

export const recoverStuckMailboxSyncExecutions = (
  options: Readonly<{
    limit?: number;
    observedAt?: string;
    staleThresholdMs?: number;
  }> = {},
) =>
  Effect.gen(function* () {
    const observedAt = options.observedAt ?? new Date().toISOString();
    const limit = options.limit ?? DEFAULT_STUCK_MAILBOX_SYNC_RECOVERY_BATCH_SIZE;
    const staleThresholdMs = options.staleThresholdMs ?? 0;
    const recoveryStore = yield* MailboxExecutionRecoveryStore;
    const dispatcher = yield* MailboxSyncDispatcher;
    const targets = yield* recoveryStore.listStuckMailboxSyncExecutions({
      limit,
      observedAt,
      staleThresholdMs,
    });

    const outcomes = yield* Effect.forEach(
      targets,
      (target): Effect.Effect<StuckMailboxSyncRecoveryOutcome> =>
        recoveryStore
          .recoverStuckMailboxSyncExecution({
            mailboxId: target.mailbox.id,
            observedAt,
            syncRunId: target.syncRunId,
          })
          .pipe(
            Effect.flatMap((recovered): Effect.Effect<StuckMailboxSyncRecoveryOutcome> => {
              if (!recovered) {
                return Effect.succeed({
                  dispatched: false,
                  recovered: false,
                  recoveredExecution: null,
                  skippedReconnectRequired: false,
                } satisfies StuckMailboxSyncRecoveryOutcome);
              }

              const recoveredExecution = {
                mailboxId: target.mailbox.id,
                leaseOwnerId: target.leaseOwnerId,
                syncRunId: target.syncRunId,
              };

              if (target.mailbox.status === "reconnect_required") {
                return Effect.succeed({
                  dispatched: false,
                  recovered: true,
                  recoveredExecution,
                  skippedReconnectRequired: true,
                } satisfies StuckMailboxSyncRecoveryOutcome);
              }

              return dispatcher.dispatchMailboxSync(target.mailbox.id).pipe(
                Effect.as({
                  dispatched: true,
                  recovered: true,
                  recoveredExecution,
                  skippedReconnectRequired: false,
                } satisfies StuckMailboxSyncRecoveryOutcome),
              );
            }),
          ),
      { concurrency: 10 },
    );

    return {
      completedAt: observedAt,
      dispatched: outcomes.filter((item) => item.dispatched).length,
      kind: "recover_stuck_syncs",
      recovered: outcomes.filter((item) => item.recovered).length,
      recoveredExecutions: outcomes
        .map((item) => item.recoveredExecution)
        .filter((item): item is RecoveredStuckMailboxSyncExecution => item !== null),
      scanned: targets.length,
      skippedReconnectRequired: outcomes.filter((item) => item.skippedReconnectRequired).length,
      status: "completed",
    } satisfies RecoverStuckMailboxSyncExecutionsResult;
  });

export function runControlJob(
  request: Readonly<{ kind: "renew_watches" }>,
): Effect.Effect<RenewMailboxWatchesResult, never, MailboxWatchProvider | MailboxWatchStore>;
export function runControlJob(
  request: Readonly<{ kind: "repair_mailboxes" }>,
): Effect.Effect<RepairMailboxesResult, never, MailboxRepairStore | MailboxSyncDispatcher>;
export function runControlJob(
  request: Readonly<{ kind: "recover_stuck_syncs" }>,
): Effect.Effect<
  RecoverStuckMailboxSyncExecutionsResult,
  never,
  MailboxExecutionRecoveryStore | MailboxSyncDispatcher
>;
export function runControlJob(
  request: Readonly<{ kind: "recover_webhook_deliveries" }>,
): Effect.Effect<
  RecoverWebhookDeliverySchedulingResult,
  never,
  WebhookDeliveryScheduler | WebhookDeliveryStore
>;
export function runControlJob(
  request: Readonly<{ kind: "dispatch_replays" }>,
): Effect.Effect<
  DispatchReplaysResult,
  never,
  ReplayStore | WebhookDeliveryScheduler | WebhookDeliveryStore
>;
export function runControlJob(
  request: Readonly<{ kind: "cleanup" }>,
): Effect.Effect<NoopControlJobResult>;
export function runControlJob(
  request: ControlJobDispatchRequest,
): Effect.Effect<
  ControlJobRunResult,
  never,
  | MailboxExecutionRecoveryStore
  | MailboxRepairStore
  | MailboxSyncDispatcher
  | MailboxWatchProvider
  | MailboxWatchStore
  | ReplayStore
  | WebhookDeliveryScheduler
  | WebhookDeliveryStore
>;
export function runControlJob(
  request: ControlJobDispatchRequest,
): Effect.Effect<
  ControlJobRunResult,
  never,
  | MailboxExecutionRecoveryStore
  | MailboxRepairStore
  | MailboxSyncDispatcher
  | MailboxWatchProvider
  | MailboxWatchStore
  | ReplayStore
  | WebhookDeliveryScheduler
  | WebhookDeliveryStore
> {
  switch (request.kind) {
    case "renew_watches":
      return renewExpiringMailboxWatches();
    case "cleanup":
      return Effect.succeed({
        completedAt: new Date().toISOString(),
        kind: request.kind,
        status: "noop",
      });
    case "dispatch_replays":
      return dispatchReplays();
    case "repair_mailboxes":
      return repairMailboxes();
    case "recover_stuck_syncs":
      return recoverStuckMailboxSyncExecutions();
    case "recover_webhook_deliveries":
      return recoverWebhookDeliverySchedulingControlJob();
  }

  return Effect.succeed({
    completedAt: new Date().toISOString(),
    kind: request.kind,
    status: "noop",
  });
}

export const dispatchMailboxSync = (mailboxId: string) =>
  Effect.gen(function* () {
    const mailbox = yield* getMailboxOrFail(mailboxId);
    const dispatcher = yield* MailboxSyncDispatcher;

    yield* dispatcher.dispatchMailboxSync(mailbox.id);

    return mailbox;
  });

export const recordMailboxSyncDispatchExhausted = (mailboxId: string) =>
  Effect.gen(function* () {
    const store = yield* MailboxSyncDispatchExhaustionStore;

    return yield* store.recordMailboxSyncDispatchExhausted({
      mailboxId,
      recordedAt: new Date().toISOString(),
      syncRunId: createSyncRunId(),
    });
  }) satisfies Effect.Effect<
    MailboxSyncDispatchExhaustedResult,
    never,
    MailboxSyncDispatchExhaustionStore
  >;

export const ingestGmailPushNotification = (notification: GmailPushNotification) =>
  Effect.gen(function* () {
    const pushNotificationStore = yield* MailboxPushNotificationStore;
    const dispatcher = yield* MailboxSyncDispatcher;
    const mailboxes =
      yield* pushNotificationStore.listMailboxesForGmailPushNotification(notification);

    yield* Effect.forEach(mailboxes, (mailbox) => dispatcher.dispatchMailboxSync(mailbox.id), {
      concurrency: 10,
      discard: true,
    });

    return {
      dispatched: mailboxes.length,
      emailAddress: notification.emailAddress,
      historyId: notification.historyId,
      kind: "gmail_push",
      status: "accepted",
    } satisfies GmailPushNotificationResult;
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
