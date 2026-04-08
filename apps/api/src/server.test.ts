import {
  MailboxCatalog,
  MailboxConnectProvider,
  MailboxConnectSessionStore,
  MailboxQueryCatalog,
  MailboxSyncDispatcher,
  WorkspaceApiKeyStore,
  type MailboxResource,
  type StoredConnectSession,
} from "@mailmon/core";
import { Effect, Layer, ManagedRuntime, Option } from "effect";
import { describe, expect, it } from "vitest";

import { createApp } from "./server.js";

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

const createRuntime = () => {
  const dispatchedMailboxIds: Array<string> = [];
  const connectSessions = new Map<string, StoredConnectSession>();

  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(WorkspaceApiKeyStore, {
        getWorkspaceForApiKey: (apiKey: string) =>
          Effect.succeed(
            apiKey === "test-api-key" ? Option.some({ workspaceId: "ws_123" }) : Option.none(),
          ),
      }),
      Layer.succeed(MailboxCatalog, {
        getMailbox: (mailboxId: string, options?: Readonly<{ workspaceId?: string }>) =>
          Effect.succeed(
            mailboxId === mailboxFixture.id && options?.workspaceId === "ws_123"
              ? Option.some(mailboxFixture)
              : Option.none(),
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
            messageId === messageFixture.id && options?.workspaceId === "ws_123"
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
            threadId === threadFixture.id && options?.workspaceId === "ws_123"
              ? Option.some(threadFixture)
              : Option.none(),
          ),
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
