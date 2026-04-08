import { MailboxConnectProvider, MailboxSyncProvider } from "@mailmon/core";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import {
  createHttpGmailConnectProviderLayer,
  createHttpGmailSyncProviderLayer,
  createStubMailboxSyncProviderLayer,
  GmailMailboxCredentialStore,
} from "./index.js";

const getInputUrl = (input: URL | RequestInfo) => {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
};

const mailboxFixture = {
  id: "mbx_123",
  object: "mailbox" as const,
  provider: "gmail" as const,
  emailAddress: "demo@mailmon.dev",
  status: "active" as const,
  syncState: "healthy" as const,
  watchState: "active" as const,
  initializedAt: null,
  lastSuccessfulSyncAt: null,
  lastError: null,
};

describe("createStubMailboxSyncProviderLayer", () => {
  it("returns a stable bootstrap sync result when no cursor is stored", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* MailboxSyncProvider;

        return yield* provider.syncMailbox({
          mailbox: mailboxFixture,
          cursor: null,
        });
      }).pipe(Effect.provide(createStubMailboxSyncProviderLayer)),
    );

    expect(result).toEqual({
      snapshot: {
        deletedProviderMessageIds: [],
        threads: [
          {
            id: "thr_mbx_123_bootstrap",
            providerThreadId: "gmail_thr_mbx_123_bootstrap",
            subject: "Welcome to Mailmon",
            lastMessageAt: "2026-03-29T09:30:00.000Z",
          },
        ],
        messages: [
          {
            id: "msg_mbx_123_bootstrap_1",
            threadId: "thr_mbx_123_bootstrap",
            providerMessageId: "gmail_msg_mbx_123_bootstrap_1",
            providerThreadId: "gmail_thr_mbx_123_bootstrap",
            subject: "Welcome to Mailmon",
            from: {
              name: "Mailmon",
              email: "hello@mailmon.dev",
            },
            snippet: "Your mailbox baseline sync is now persisted locally.",
            receivedAt: "2026-03-29T09:30:00.000Z",
            labelIds: ["INBOX"],
          },
        ],
      },
      eventsEmitted: 1,
      nextCursor: "hist_bootstrap",
    });
  });

  it("returns an incremental sync result when a cursor is already stored", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* MailboxSyncProvider;

        return yield* provider.syncMailbox({
          mailbox: {
            ...mailboxFixture,
            initializedAt: "2026-03-29T09:30:00.000Z",
            lastSuccessfulSyncAt: "2026-03-29T09:30:00.000Z",
          },
          cursor: "hist_bootstrap",
        });
      }).pipe(Effect.provide(createStubMailboxSyncProviderLayer)),
    );

    expect(result).toEqual({
      snapshot: {
        deletedProviderMessageIds: [],
        threads: [
          {
            id: "thr_mbx_123_bootstrap",
            providerThreadId: "gmail_thr_mbx_123_bootstrap",
            subject: "Welcome to Mailmon",
            lastMessageAt: "2026-03-29T10:00:00.000Z",
          },
        ],
        messages: [
          {
            id: "msg_mbx_123_bootstrap_2",
            threadId: "thr_mbx_123_bootstrap",
            providerMessageId: "gmail_msg_mbx_123_bootstrap_2",
            providerThreadId: "gmail_thr_mbx_123_bootstrap",
            subject: "Re: Welcome to Mailmon",
            from: {
              name: "Mailmon",
              email: "hello@mailmon.dev",
            },
            snippet: "This incremental sync proves cursor-based mailbox updates.",
            receivedAt: "2026-03-29T10:00:00.000Z",
            labelIds: ["INBOX", "UNREAD"],
          },
        ],
      },
      eventsEmitted: 1,
      nextCursor: "hist_incremental_2",
    });
  });
});

describe("createHttpGmailSyncProviderLayer", () => {
  const credentialStoreLayer = Layer.succeed(GmailMailboxCredentialStore, {
    getGmailMailboxCredential: () =>
      Effect.succeed({
        mailboxId: mailboxFixture.id,
        refreshToken: "refresh-token",
      }),
  });

  it("performs a baseline sync through Gmail HTTP endpoints", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(getInputUrl(input));

      if (url.pathname === "/token") {
        return new Response(JSON.stringify({ access_token: "access-token" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }

      if (url.pathname === "/gmail/v1/users/me/profile") {
        return new Response(
          JSON.stringify({
            emailAddress: mailboxFixture.emailAddress,
            historyId: "hist_bootstrap",
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }

      if (url.pathname === "/gmail/v1/users/me/messages") {
        return new Response(JSON.stringify({ messages: [{ id: "gmail_msg_1" }] }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }

      if (url.pathname === "/gmail/v1/users/me/messages/gmail_msg_1") {
        return new Response(
          JSON.stringify({
            id: "gmail_msg_1",
            internalDate: String(Date.parse("2026-03-29T09:30:00.000Z")),
            labelIds: ["INBOX"],
            payload: {
              headers: [
                { name: "From", value: "Mailmon <hello@mailmon.dev>" },
                { name: "Subject", value: "Welcome to Mailmon" },
              ],
            },
            snippet: "Baseline message",
            threadId: "gmail_thread_1",
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }

      throw new Error(`Unhandled fetch ${url.toString()}`);
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* MailboxSyncProvider;

        return yield* provider.syncMailbox({
          mailbox: mailboxFixture,
          cursor: null,
        });
      }).pipe(
        Effect.provide(
          createHttpGmailSyncProviderLayer({
            apiBaseUrl: "http://gmail.mock/gmail/v1",
            fetchImpl,
            oauthClientId: "client-id",
            oauthClientSecret: "client-secret",
            oauthTokenUrl: "http://gmail.mock/token",
          }).pipe(Layer.provide(credentialStoreLayer)),
        ),
      ),
    );

    expect(result).toEqual({
      snapshot: {
        deletedProviderMessageIds: [],
        threads: [
          {
            id: "thr_mbx_123_gmail_thread_1",
            providerThreadId: "gmail_thread_1",
            subject: "Welcome to Mailmon",
            lastMessageAt: "2026-03-29T09:30:00.000Z",
          },
        ],
        messages: [
          {
            id: "msg_mbx_123_gmail_msg_1",
            threadId: "thr_mbx_123_gmail_thread_1",
            providerMessageId: "gmail_msg_1",
            providerThreadId: "gmail_thread_1",
            subject: "Welcome to Mailmon",
            from: {
              name: "Mailmon",
              email: "hello@mailmon.dev",
            },
            snippet: "Baseline message",
            receivedAt: "2026-03-29T09:30:00.000Z",
            labelIds: ["INBOX"],
          },
        ],
      },
      eventsEmitted: 1,
      nextCursor: "hist_bootstrap",
    });
  });

  it("performs an incremental sync using Gmail history and deletions", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(getInputUrl(input));

      if (url.pathname === "/token") {
        return new Response(JSON.stringify({ access_token: "access-token" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }

      if (url.pathname === "/gmail/v1/users/me/history") {
        expect(url.searchParams.get("startHistoryId")).toBe("hist_bootstrap");
        return new Response(
          JSON.stringify({
            history: [
              {
                messagesAdded: [{ message: { id: "gmail_msg_2" } }],
                messagesDeleted: [{ message: { id: "gmail_msg_1" } }],
              },
            ],
            historyId: "hist_incremental_2",
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }

      if (url.pathname === "/gmail/v1/users/me/messages/gmail_msg_2") {
        return new Response(
          JSON.stringify({
            id: "gmail_msg_2",
            internalDate: String(Date.parse("2026-03-29T10:00:00.000Z")),
            labelIds: ["INBOX", "UNREAD"],
            payload: {
              headers: [
                { name: "From", value: "Mailmon <hello@mailmon.dev>" },
                { name: "Subject", value: "Re: Welcome to Mailmon" },
              ],
            },
            snippet: "Incremental message",
            threadId: "gmail_thread_1",
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }

      throw new Error(`Unhandled fetch ${url.toString()}`);
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* MailboxSyncProvider;

        return yield* provider.syncMailbox({
          mailbox: {
            ...mailboxFixture,
            initializedAt: "2026-03-29T09:30:00.000Z",
            lastSuccessfulSyncAt: "2026-03-29T09:30:00.000Z",
          },
          cursor: "hist_bootstrap",
        });
      }).pipe(
        Effect.provide(
          createHttpGmailSyncProviderLayer({
            apiBaseUrl: "http://gmail.mock/gmail/v1",
            fetchImpl,
            oauthClientId: "client-id",
            oauthClientSecret: "client-secret",
            oauthTokenUrl: "http://gmail.mock/token",
          }).pipe(Layer.provide(credentialStoreLayer)),
        ),
      ),
    );

    expect(result).toEqual({
      snapshot: {
        deletedProviderMessageIds: ["gmail_msg_1"],
        threads: [
          {
            id: "thr_mbx_123_gmail_thread_1",
            providerThreadId: "gmail_thread_1",
            subject: "Re: Welcome to Mailmon",
            lastMessageAt: "2026-03-29T10:00:00.000Z",
          },
        ],
        messages: [
          {
            id: "msg_mbx_123_gmail_msg_2",
            threadId: "thr_mbx_123_gmail_thread_1",
            providerMessageId: "gmail_msg_2",
            providerThreadId: "gmail_thread_1",
            subject: "Re: Welcome to Mailmon",
            from: {
              name: "Mailmon",
              email: "hello@mailmon.dev",
            },
            snippet: "Incremental message",
            receivedAt: "2026-03-29T10:00:00.000Z",
            labelIds: ["INBOX", "UNREAD"],
          },
        ],
      },
      eventsEmitted: 2,
      nextCursor: "hist_incremental_2",
    });
  });

  it("deduplicates repeated history references and keeps deletes dominant", async () => {
    const fetchedMessageIds: Array<string> = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(getInputUrl(input));

      if (url.pathname === "/token") {
        return new Response(JSON.stringify({ access_token: "access-token" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }

      if (url.pathname === "/gmail/v1/users/me/history") {
        expect(url.searchParams.get("startHistoryId")).toBe("hist_bootstrap");
        return new Response(
          JSON.stringify({
            history: [
              {
                labelsAdded: [
                  { message: { id: "gmail_msg_2" } },
                  { message: { id: "gmail_msg_2" } },
                ],
                labelsRemoved: [{ message: { id: "gmail_msg_1" } }],
                messagesAdded: [{ message: { id: "gmail_msg_2" } }],
                messagesDeleted: [{ message: { id: "gmail_msg_1" } }],
              },
              {
                messagesAdded: [
                  { message: { id: "gmail_msg_2" } },
                  { message: { id: "gmail_msg_3" } },
                ],
                messagesDeleted: [{ message: { id: "gmail_msg_2" } }],
              },
            ],
            historyId: "hist_incremental_3",
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }

      if (url.pathname === "/gmail/v1/users/me/messages/gmail_msg_3") {
        fetchedMessageIds.push("gmail_msg_3");

        return new Response(
          JSON.stringify({
            id: "gmail_msg_3",
            internalDate: String(Date.parse("2026-03-29T10:05:00.000Z")),
            labelIds: ["INBOX"],
            payload: {
              headers: [
                { name: "From", value: "Mailmon <hello@mailmon.dev>" },
                { name: "Subject", value: "Latest Mailmon update" },
              ],
            },
            snippet: "Only the surviving change should be fetched.",
            threadId: "gmail_thread_1",
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }

      throw new Error(`Unhandled fetch ${url.toString()}`);
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* MailboxSyncProvider;

        return yield* provider.syncMailbox({
          mailbox: {
            ...mailboxFixture,
            initializedAt: "2026-03-29T09:30:00.000Z",
            lastSuccessfulSyncAt: "2026-03-29T09:30:00.000Z",
          },
          cursor: "hist_bootstrap",
        });
      }).pipe(
        Effect.provide(
          createHttpGmailSyncProviderLayer({
            apiBaseUrl: "http://gmail.mock/gmail/v1",
            fetchImpl,
            oauthClientId: "client-id",
            oauthClientSecret: "client-secret",
            oauthTokenUrl: "http://gmail.mock/token",
          }).pipe(Layer.provide(credentialStoreLayer)),
        ),
      ),
    );

    expect(fetchedMessageIds).toEqual(["gmail_msg_3"]);
    expect(result).toEqual({
      snapshot: {
        deletedProviderMessageIds: ["gmail_msg_1", "gmail_msg_2"],
        threads: [
          {
            id: "thr_mbx_123_gmail_thread_1",
            providerThreadId: "gmail_thread_1",
            subject: "Latest Mailmon update",
            lastMessageAt: "2026-03-29T10:05:00.000Z",
          },
        ],
        messages: [
          {
            id: "msg_mbx_123_gmail_msg_3",
            threadId: "thr_mbx_123_gmail_thread_1",
            providerMessageId: "gmail_msg_3",
            providerThreadId: "gmail_thread_1",
            subject: "Latest Mailmon update",
            from: {
              name: "Mailmon",
              email: "hello@mailmon.dev",
            },
            snippet: "Only the surviving change should be fetched.",
            receivedAt: "2026-03-29T10:05:00.000Z",
            labelIds: ["INBOX"],
          },
        ],
      },
      eventsEmitted: 3,
      nextCursor: "hist_incremental_3",
    });
  });
});

describe("createHttpGmailConnectProviderLayer", () => {
  it("builds a Gmail OAuth authorization URL with PKCE state", async () => {
    const authorizationUrl = await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* MailboxConnectProvider;

        return yield* provider.createAuthorizationUrl({
          connectSessionId: "mcs_123",
          codeVerifier: "verifier-123",
          redirectUri: "http://localhost/oauth/gmail/callback",
        });
      }).pipe(
        Effect.provide(
          createHttpGmailConnectProviderLayer({
            apiBaseUrl: "http://gmail.mock/gmail/v1",
            oauthAuthorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
            oauthClientId: "client-id",
            oauthClientSecret: "client-secret",
            oauthTokenUrl: "http://gmail.mock/token",
          }),
        ),
      ),
    );

    const url = new URL(authorizationUrl);

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("state")).toBe("mcs_123");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost/oauth/gmail/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("exchanges an authorization code and returns the connected Gmail identity", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(getInputUrl(input));

      if (url.pathname === "/token") {
        expect(init?.method).toBe("POST");

        return new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "refresh-token",
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }

      if (url.pathname === "/gmail/v1/users/me/profile") {
        return new Response(
          JSON.stringify({
            emailAddress: "User@gmail.com",
            historyId: "hist_123",
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
      }

      throw new Error(`Unhandled fetch ${url.toString()}`);
    };

    const authorization = await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* MailboxConnectProvider;

        return yield* provider.completeAuthorization({
          connectSessionId: "mcs_123",
          code: "oauth-code",
          codeVerifier: "verifier-123",
          redirectUri: "http://localhost/oauth/gmail/callback",
        });
      }).pipe(
        Effect.provide(
          createHttpGmailConnectProviderLayer({
            apiBaseUrl: "http://gmail.mock/gmail/v1",
            fetchImpl,
            oauthAuthorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
            oauthClientId: "client-id",
            oauthClientSecret: "client-secret",
            oauthTokenUrl: "http://gmail.mock/token",
          }),
        ),
      ),
    );

    expect(authorization).toEqual({
      providerAccountEmail: "user@gmail.com",
      refreshToken: "refresh-token",
    });
  });
});
