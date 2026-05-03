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
import { describe, expect, it } from "vitest";

import {
  INVALID_JSON_DETAIL,
  INVALID_LIMIT_DETAIL,
  INVALID_REPLAY_BODY_DETAIL,
  INVALID_WEBHOOK_EVENT_TYPES_DETAIL,
  MISSING_MAILBOX_QUERY_DETAIL,
} from "./http/parsers.js";
import { createApp } from "./server.js";

const primaryWorkspaceId = "ws_123";
const foreignWorkspaceId = "ws_foreign";

const mailboxFixture: MailboxResource = {
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

const foreignMailboxFixture: MailboxResource = {
  ...mailboxFixture,
  id: "mbx_foreign",
  emailAddress: "foreign@mailmon.dev",
};

const webhookEndpointFixture: WebhookEndpointResource = {
  id: "whe_demo",
  object: "webhook_endpoint",
  url: "https://app.example.com/webhooks/mailmon",
  description: "production inbox events",
  deliveryState: "healthy",
  lastDeliveryAt: null,
  lastDeliveryError: null,
  createdAt: "2026-03-24T00:00:00.000Z",
};

const foreignWebhookEndpointFixture: WebhookEndpointResource = {
  ...webhookEndpointFixture,
  id: "whe_foreign",
  url: "https://foreign.example.com/webhooks/mailmon",
};

const messageFixture = {
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

const threadListItemFixture = {
  id: "thr_demo",
  object: "thread" as const,
  mailboxId: mailboxFixture.id,
  providerThreadId: "gmail_thr_demo",
  subject: "Interview availability",
  lastMessageAt: "2026-03-23T10:11:20.000Z",
};

const threadFixture = {
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

const syncRunInspectionFixture = {
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

const mailboxObservabilityFixture = {
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

const createRuntime = () => {
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
            apiKey === "test-api-key"
              ? Option.some({ workspaceId: primaryWorkspaceId })
              : Option.none(),
          ),
      }),
      Layer.succeed(MailboxCatalog, {
        getMailbox: (mailboxId: string, options?: Readonly<{ workspaceId?: string }>) =>
          Effect.succeed(
            Option.fromNullable(mailboxFixtures.get(mailboxId)).pipe(
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
            Option.fromNullable(webhookEndpoints.get(webhookEndpointId)).pipe(
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
            const webhookEndpoint = {
              id: params.id,
              object: "webhook_endpoint" as const,
              url: params.url,
              description: params.description,
              deliveryState: "healthy" as const,
              lastDeliveryAt: null,
              lastDeliveryError: null,
              createdAt: params.createdAt,
            };

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
            const replay: ReplayResource = {
              id: params.id,
              object: "replay",
              status: "queued",
              mailboxId: params.mailboxId,
              webhookEndpointId: params.webhookEndpointId,
              startTime: params.startTime,
              endTime: params.endTime,
              eventsReplayed: null,
              createdAt: params.createdAt,
              startedAt: null,
              completedAt: null,
              lastError: null,
            };

            replays.set(replay.id, {
              replay,
              workspaceId: params.workspaceId,
            });

            return replay;
          }),
        getReplay: (replayId, options) =>
          Effect.succeed(
            Option.fromNullable(replays.get(replayId)).pipe(
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
          Effect.succeed(Option.fromNullable(connectSessions.get(connectSessionId))),
        completeConnectSession: (params) =>
          Effect.sync(() => {
            const session = connectSessions.get(params.connectSessionId);

            if (session === undefined) {
              throw new Error(`Missing connect session ${params.connectSessionId}`);
            }

            const mailbox: MailboxResource = {
              ...mailboxFixture,
              emailAddress: params.providerAccountEmail,
              initializedAt: null,
              syncState: "initializing",
            };

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

describe("createApp", () => {
  it("returns a healthy response", async () => {
    const { app } = createRuntime();
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("serves the generated OpenAPI document", async () => {
    const { app } = createRuntime();
    const response = await app.request("/openapi.json");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      openapi: "3.1.0",
      info: {
        title: "Mailmon API",
        version: "1.0.0",
      },
      paths: {
        "/v1/mailboxes/connect-sessions": expect.any(Object),
        "/v1/messages": expect.any(Object),
        "/v1/replays": expect.any(Object),
      },
    });
  });

  it("requires a bearer API key for mailbox reads", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/mailboxes/mbx_demo");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_request",
      status: 400,
    });
  });

  it("returns a mailbox resource scoped to the authenticated workspace", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/mailboxes/mbx_demo", {
      headers: {
        authorization: "Bearer test-api-key",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(mailboxFixture);
  });

  it("lists mailbox sync runs for the authenticated workspace", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/mailboxes/mbx_demo/sync-runs", {
      headers: {
        authorization: "Bearer test-api-key",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      object: "list",
      data: [syncRunInspectionFixture],
      nextCursor: null,
    });
  });

  it("returns mailbox observability for the authenticated workspace", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/mailboxes/mbx_demo/observability", {
      headers: {
        authorization: "Bearer test-api-key",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(mailboxObservabilityFixture);
  });

  it("lists mailbox-scoped messages for the authenticated workspace", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/messages?mailbox_id=mbx_demo&limit=25", {
      headers: {
        authorization: "Bearer test-api-key",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      object: "list",
      data: [messageFixture],
      nextCursor: "cur_next",
    });
  });

  it("rejects non-integer message list limit with deterministic invalid_request detail", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/messages?mailbox_id=mbx_demo&limit=abc", {
      headers: {
        authorization: "Bearer test-api-key",
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_request",
      detail: INVALID_LIMIT_DETAIL,
    });
  });

  it("rejects message lists missing mailbox query with deterministic invalid_request detail", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/messages", {
      headers: {
        authorization: "Bearer test-api-key",
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_request",
      detail: MISSING_MAILBOX_QUERY_DETAIL,
    });
  });

  it("returns a single message resource scoped to the authenticated workspace", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/messages/msg_demo", {
      headers: {
        authorization: "Bearer test-api-key",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(messageFixture);
  });

  it("lists mailbox-scoped threads for the authenticated workspace", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/threads?mailboxId=mbx_demo", {
      headers: {
        authorization: "Bearer test-api-key",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      object: "list",
      data: [threadListItemFixture],
      nextCursor: null,
    });
  });

  it("returns a thread with its messages scoped to the authenticated workspace", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/threads/thr_demo", {
      headers: {
        authorization: "Bearer test-api-key",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(threadFixture);
  });

  it("creates a connect session through the core workflow", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/mailboxes/connect-sessions", {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: "gmail",
        tenantExternalId: "tenant_123",
        mailboxExternalId: "user_456",
        redirectUrl: "https://app.example.com/settings/gmail/callback",
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: expect.stringMatching(/^mcs_/),
      object: "connect_session",
      connectUrl: expect.stringMatching(/^http:\/\/localhost\/oauth\/gmail\/mcs_/),
      expiresAt: expect.any(String),
    });
  });

  it("returns invalid_request when connect session body is malformed JSON", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/mailboxes/connect-sessions", {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: "{ not-json",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_request",
      detail: INVALID_JSON_DETAIL,
    });
  });

  it("creates a webhook endpoint and returns its secret once", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/webhook-endpoints", {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url: "https://app.example.com/webhooks/mailmon",
        description: "production inbox events",
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: expect.stringMatching(/^whe_/),
      object: "webhook_endpoint",
      url: "https://app.example.com/webhooks/mailmon",
      description: "production inbox events",
      deliveryState: "healthy",
      lastDeliveryAt: null,
      lastDeliveryError: null,
      createdAt: expect.any(String),
      secret: expect.stringMatching(/^whsec_/),
    });
  });

  it("accepts a null webhook endpoint description", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/webhook-endpoints", {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url: "https://app.example.com/webhooks/mailmon-null",
        description: null,
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      id: expect.stringMatching(/^whe_/),
      object: "webhook_endpoint",
      url: "https://app.example.com/webhooks/mailmon-null",
      description: null,
      deliveryState: "healthy",
      lastDeliveryAt: null,
      lastDeliveryError: null,
      createdAt: expect.any(String),
      secret: expect.stringMatching(/^whsec_/),
    });
  });

  it("creates mailbox-scoped webhook subscriptions for the authenticated workspace", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/webhook-endpoints/whe_demo/subscriptions", {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailbox_ids: ["mbx_demo"],
        event_types: ["message.created", "thread.updated"],
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      object: "list",
      data: [
        {
          id: "whsub_mbx_demo",
          object: "webhook_endpoint_subscription",
          webhookEndpointId: "whe_demo",
          mailboxId: "mbx_demo",
          eventTypes: ["message.created", "thread.updated"],
          createdAt: expect.any(String),
        },
      ],
      nextCursor: null,
    });
  });

  it("creates and fetches a Replay for the authenticated workspace", async () => {
    const { app } = createRuntime();
    const createResponse = await app.request("/v1/replays", {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailbox_id: "mbx_demo",
        webhook_endpoint_id: "whe_demo",
        start_time: "2026-03-24T00:00:00.000Z",
        end_time: "2026-03-24T01:00:00.000Z",
      }),
    });

    expect(createResponse.status).toBe(201);
    const replay = await createResponse.json();
    expect(replay).toMatchObject({
      id: expect.stringMatching(/^rpl_/),
      object: "replay",
      status: "queued",
      mailboxId: "mbx_demo",
      webhookEndpointId: "whe_demo",
      startTime: "2026-03-24T00:00:00.000Z",
      endTime: "2026-03-24T01:00:00.000Z",
      eventsReplayed: null,
    });

    const getResponse = await app.request(`/v1/replays/${replay.id}`, {
      headers: {
        authorization: "Bearer test-api-key",
      },
    });

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual(replay);
  });

  it("rejects invalid Replay request bodies", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/replays", {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailbox_id: "mbx_demo",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_request",
      detail: INVALID_REPLAY_BODY_DETAIL,
    });
  });

  it("rejects unsupported webhook event type with deterministic invalid_request detail", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/webhook-endpoints/whe_demo/subscriptions", {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailboxIds: ["mbx_demo"],
        eventTypes: ["message.deleted"],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_request",
      detail: INVALID_WEBHOOK_EVENT_TYPES_DETAIL,
    });
  });

  it("collapses a foreign-owned subscription mailbox to not found", async () => {
    const { app } = createRuntime();
    const response = await app.request("/v1/webhook-endpoints/whe_demo/subscriptions", {
      method: "POST",
      headers: {
        authorization: "Bearer test-api-key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mailboxIds: ["mbx_foreign"],
        eventTypes: ["message.created"],
      }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "mailbox_not_found",
      status: 404,
      resource: {
        mailbox_id: "mbx_foreign",
      },
    });
  });

  it("redirects a hosted Gmail connect URL to the provider authorization URL", async () => {
    const { app, connectSessions } = createRuntime();

    connectSessions.set("mcs_123", {
      id: "mcs_123",
      provider: "gmail",
      workspaceId: "ws_123",
      tenantExternalId: "tenant_123",
      mailboxExternalId: "user_456",
      redirectUrl: "https://app.example.com/settings/gmail/callback",
      codeVerifier: "verifier",
      expiresAt: "2099-01-01T00:00:00.000Z",
      mailboxId: null,
      completedAt: null,
    });

    const response = await app.request("/oauth/gmail/mcs_123");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?state=mcs_123",
    );
  });

  it("completes the OAuth callback and redirects back with mailbox state", async () => {
    const { app, connectSessions, dispatchedMailboxIds } = createRuntime();

    connectSessions.set("mcs_123", {
      id: "mcs_123",
      provider: "gmail",
      workspaceId: "ws_123",
      tenantExternalId: "tenant_123",
      mailboxExternalId: "user_456",
      redirectUrl: "https://app.example.com/settings/gmail/callback",
      codeVerifier: "verifier",
      expiresAt: "2099-01-01T00:00:00.000Z",
      mailboxId: null,
      completedAt: null,
    });

    const response = await app.request("/oauth/gmail/callback?state=mcs_123&code=oauth-code");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/settings/gmail/callback?created=true&mailbox_id=mbx_demo&status=success",
    );
    expect(dispatchedMailboxIds).toEqual(["mbx_demo"]);
  });
});
