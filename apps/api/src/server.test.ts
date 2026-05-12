import { describe, expect, it } from "vitest";

import {
  INVALID_JSON_DETAIL,
  INVALID_LIMIT_DETAIL,
  INVALID_REPLAY_BODY_DETAIL,
  INVALID_WEBHOOK_EVENT_TYPES_DETAIL,
  MISSING_MAILBOX_QUERY_DETAIL,
} from "./http/parsers.js";
import {
  createApiRouteTestRuntime as createRuntime,
  mailboxFixture,
  mailboxObservabilityFixture,
  messageFixture,
  syncRunInspectionFixture,
  threadFixture,
  threadListItemFixture,
} from "./test-harness.js";

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
    const document = await response.json();

    expect(document).toMatchObject({
      openapi: "3.1.0",
      info: {
        title: "Mailmon API",
        version: "1.0.0",
      },
      paths: {
        "/v1/mailboxes/connect-sessions": expect.any(Object),
        "/v1/mailboxes/{mailboxId}": expect.any(Object),
        "/v1/mailboxes/{mailboxId}/observability": expect.any(Object),
        "/v1/messages": expect.any(Object),
        "/v1/messages/{messageId}": expect.any(Object),
        "/v1/replays": expect.any(Object),
        "/v1/replays/{replayId}": expect.any(Object),
        "/v1/threads/{threadId}": expect.any(Object),
      },
    });

    const connectSessionResponse =
      document.paths["/v1/mailboxes/connect-sessions"].post.responses["201"].content[
        "application/json"
      ].schema;

    expect(connectSessionResponse).toMatchObject({
      type: "object",
      required: expect.arrayContaining(["id", "object", "connectUrl", "expiresAt"]),
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
