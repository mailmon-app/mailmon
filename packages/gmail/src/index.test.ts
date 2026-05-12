import { MailboxConnectProvider, MailboxSyncProvider, MailboxWatchProvider } from "@mailmon/core";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import {
  createAesGcmGmailRefreshTokenCipherLayer,
  createHttpGmailConnectProviderLayer,
  createHttpGmailSyncProviderLayer,
  createHttpGmailWatchProviderLayer,
  createStubMailboxSyncProviderLayer,
  GmailMailboxCredentialStore,
  GmailRefreshTokenCipher,
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
const primaryEncryptionKey = "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=";
const rotatedEncryptionKey = "CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg=";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

const gmailAccessToken = () => jsonResponse({ access_token: "access-token" });

const gmailProfile = (historyId: string) =>
  jsonResponse({
    emailAddress: mailboxFixture.emailAddress,
    historyId,
  });

const gmailHistoryPage = (
  historyId: string,
  history: ReadonlyArray<Record<string, unknown>> = [],
) =>
  jsonResponse({
    history,
    historyId,
  });

const gmailMessage = (
  id: string,
  options: Readonly<{
    internalDate: string;
    labelIds: ReadonlyArray<string>;
    snippet: string;
    subject: string;
    threadId?: string;
  }>,
) =>
  jsonResponse({
    id,
    internalDate: String(Date.parse(options.internalDate)),
    labelIds: options.labelIds,
    payload: {
      headers: [
        { name: "From", value: "Mailmon <hello@mailmon.dev>" },
        { name: "Subject", value: options.subject },
      ],
    },
    snippet: options.snippet,
    threadId: options.threadId ?? "gmail_thread_1",
  });

const syncMailboxWithGmailFetch = (
  fetchImpl: typeof fetch,
  params: Readonly<{
    cursor: string | null;
    initialized?: boolean;
  }>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const provider = yield* MailboxSyncProvider;

      return yield* provider.syncMailbox({
        mailbox:
          params.initialized === true
            ? {
                ...mailboxFixture,
                initializedAt: "2026-03-29T09:30:00.000Z",
                lastSuccessfulSyncAt: "2026-03-29T09:30:00.000Z",
              }
            : mailboxFixture,
        cursor: params.cursor,
      });
    }).pipe(
      Effect.provide(
        createHttpGmailSyncProviderLayer({
          apiBaseUrl: "http://gmail.mock/gmail/v1",
          fetchImpl,
          oauthClientId: "client-id",
          oauthClientSecret: "client-secret",
          oauthTokenUrl: "http://gmail.mock/token",
        }).pipe(
          Layer.provide(
            Layer.succeed(GmailMailboxCredentialStore, {
              getGmailMailboxCredential: () =>
                Effect.succeed({
                  mailboxId: mailboxFixture.id,
                  refreshToken: "refresh-token",
                }),
            }),
          ),
        ),
      ),
    ),
  );

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

describe("createAesGcmGmailRefreshTokenCipherLayer", () => {
  it("encrypts refresh tokens into an envelope and decrypts them back", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const cipher = yield* GmailRefreshTokenCipher;
        const encryptedRefreshToken = yield* cipher.encryptRefreshToken("refresh-token");
        const decryptedRefreshToken = yield* cipher.decryptRefreshToken(encryptedRefreshToken);

        expect(encryptedRefreshToken).not.toBe("refresh-token");
        expect(encryptedRefreshToken).toMatch(/^mmrt_v1:/);

        return decryptedRefreshToken;
      }).pipe(
        Effect.provide(
          createAesGcmGmailRefreshTokenCipherLayer({
            activeKeyId: "primary",
            encryptionKey: primaryEncryptionKey,
          }),
        ),
      ),
    );

    expect(result).toBe("refresh-token");
  });

  it("includes the active key id in new encrypted envelopes", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const cipher = yield* GmailRefreshTokenCipher;
        const encryptedRefreshToken = yield* cipher.encryptRefreshToken("refresh-token");

        return yield* cipher.inspectRefreshToken(encryptedRefreshToken);
      }).pipe(
        Effect.provide(
          createAesGcmGmailRefreshTokenCipherLayer({
            activeKeyId: "key_2026_04",
            encryptionKey: primaryEncryptionKey,
          }),
        ),
      ),
    );

    expect(result).toEqual({
      keyId: "key_2026_04",
      rewrapRequired: false,
      storage: "encrypted",
    });
  });

  it("supports legacy plaintext reads when the fallback is enabled", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const cipher = yield* GmailRefreshTokenCipher;

        return yield* cipher.decryptRefreshToken("legacy-refresh-token");
      }).pipe(
        Effect.provide(
          createAesGcmGmailRefreshTokenCipherLayer({
            allowPlaintextFallback: true,
            encryptionKey: primaryEncryptionKey,
          }),
        ),
      ),
    );

    expect(result).toBe("legacy-refresh-token");
  });

  it("decrypts previous-key envelopes and rewraps them with the active key", async () => {
    const legacyEncryptedRefreshToken = await Effect.runPromise(
      Effect.gen(function* () {
        const cipher = yield* GmailRefreshTokenCipher;

        return yield* cipher.encryptRefreshToken("refresh-token");
      }).pipe(
        Effect.provide(
          createAesGcmGmailRefreshTokenCipherLayer({
            activeKeyId: "key_old",
            encryptionKey: primaryEncryptionKey,
          }),
        ),
      ),
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const cipher = yield* GmailRefreshTokenCipher;
        const inspection = yield* cipher.inspectRefreshToken(legacyEncryptedRefreshToken);
        const rewrappedRefreshToken = yield* cipher.rewrapRefreshToken(legacyEncryptedRefreshToken);
        const rewrappedInspection = yield* cipher.inspectRefreshToken(rewrappedRefreshToken);
        const decryptedRefreshToken = yield* cipher.decryptRefreshToken(rewrappedRefreshToken);

        return {
          decryptedRefreshToken,
          inspection,
          rewrappedInspection,
        };
      }).pipe(
        Effect.provide(
          createAesGcmGmailRefreshTokenCipherLayer({
            activeKeyId: "key_new",
            decryptionKeys: [
              {
                encryptionKey: primaryEncryptionKey,
                keyId: "key_old",
              },
            ],
            encryptionKey: rotatedEncryptionKey,
          }),
        ),
      ),
    );

    expect(result).toEqual({
      decryptedRefreshToken: "refresh-token",
      inspection: {
        keyId: "key_old",
        rewrapRequired: true,
        storage: "encrypted",
      },
      rewrappedInspection: {
        keyId: "key_new",
        rewrapRequired: false,
        storage: "encrypted",
      },
    });
  });

  it("rewraps legacy plaintext tokens without enabling plaintext runtime reads", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const cipher = yield* GmailRefreshTokenCipher;
        const rewrappedRefreshToken = yield* cipher.rewrapRefreshToken("legacy-refresh-token");
        const inspection = yield* cipher.inspectRefreshToken(rewrappedRefreshToken);
        const decryptedRefreshToken = yield* cipher.decryptRefreshToken(rewrappedRefreshToken);

        return {
          decryptedRefreshToken,
          inspection,
          rewrappedRefreshToken,
        };
      }).pipe(
        Effect.provide(
          createAesGcmGmailRefreshTokenCipherLayer({
            activeKeyId: "key_new",
            encryptionKey: rotatedEncryptionKey,
          }),
        ),
      ),
    );

    expect(result.rewrappedRefreshToken).toMatch(/^mmrt_v1:/);
    expect(result.decryptedRefreshToken).toBe("legacy-refresh-token");
    expect(result.inspection).toEqual({
      keyId: "key_new",
      rewrapRequired: false,
      storage: "encrypted",
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
        return gmailAccessToken();
      }

      if (url.pathname === "/gmail/v1/users/me/profile") {
        return gmailProfile("hist_bootstrap");
      }

      if (url.pathname === "/gmail/v1/users/me/messages") {
        return jsonResponse({ messages: [{ id: "gmail_msg_1" }] });
      }

      if (url.pathname === "/gmail/v1/users/me/history") {
        expect(url.searchParams.get("startHistoryId")).toBe("hist_bootstrap");

        return gmailHistoryPage("hist_bootstrap");
      }

      if (url.pathname === "/gmail/v1/users/me/messages/gmail_msg_1") {
        return gmailMessage("gmail_msg_1", {
          internalDate: "2026-03-29T09:30:00.000Z",
          labelIds: ["INBOX"],
          snippet: "Baseline message",
          subject: "Welcome to Mailmon",
        });
      }

      throw new Error(`Unhandled fetch ${url.toString()}`);
    };

    const result = await syncMailboxWithGmailFetch(fetchImpl, {
      cursor: null,
    });

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

  it("runs initial sync catch-up from the pre-baseline history boundary", async () => {
    const requests: Array<string> = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(getInputUrl(input));
      requests.push(url.pathname);

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
            historyId: "hist_before_full",
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

      if (url.pathname === "/gmail/v1/users/me/history") {
        expect(url.searchParams.get("startHistoryId")).toBe("hist_before_full");

        return new Response(
          JSON.stringify({
            history: [
              {
                messagesAdded: [{ message: { id: "gmail_msg_2" } }],
              },
            ],
            historyId: "hist_after_catchup",
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        );
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

      if (url.pathname === "/gmail/v1/users/me/messages/gmail_msg_2") {
        return new Response(
          JSON.stringify({
            id: "gmail_msg_2",
            internalDate: String(Date.parse("2026-03-29T09:31:00.000Z")),
            labelIds: ["INBOX", "UNREAD"],
            payload: {
              headers: [
                { name: "From", value: "Mailmon <hello@mailmon.dev>" },
                { name: "Subject", value: "Race-safe update" },
              ],
            },
            snippet: "Catch-up message",
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

    expect(requests).toEqual([
      "/token",
      "/gmail/v1/users/me/profile",
      "/gmail/v1/users/me/messages",
      "/gmail/v1/users/me/messages/gmail_msg_1",
      "/gmail/v1/users/me/history",
      "/gmail/v1/users/me/messages/gmail_msg_2",
    ]);
    expect(result.snapshot.deletedProviderMessageIds).toEqual([]);
    expect(result.snapshot.messages.map((message) => message.providerMessageId)).toEqual([
      "gmail_msg_1",
      "gmail_msg_2",
    ]);
    expect(result.snapshot.threads).toEqual([
      {
        id: "thr_mbx_123_gmail_thread_1",
        providerThreadId: "gmail_thread_1",
        subject: "Race-safe update",
        lastMessageAt: "2026-03-29T09:31:00.000Z",
      },
    ]);
    expect(result.eventsEmitted).toBe(2);
    expect(result.nextCursor).toBe("hist_after_catchup");
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

  it("classifies revoked refresh tokens as reconnect_required failures", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(getInputUrl(input));

      if (url.pathname === "/token") {
        return new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description:
              "Token has been expired or revoked. The mailbox must be reconnected.",
          }),
          {
            headers: { "content-type": "application/json" },
            status: 400,
          },
        );
      }

      throw new Error(`Unhandled fetch ${url.toString()}`);
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* MailboxSyncProvider;

        return yield* provider
          .syncMailbox({
            mailbox: mailboxFixture,
            cursor: null,
          })
          .pipe(
            Effect.match({
              onFailure: (problem) => problem,
              onSuccess: () => {
                throw new Error("Expected syncMailbox to fail for revoked refresh tokens.");
              },
            }),
          );
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

    expect(result).toMatchObject({
      code: "gmail_token_refresh_reconnect_required",
      retryable: false,
      status: 401,
      title: "Gmail reconnect required",
    });
  });

  it("classifies Gmail 429 sync responses as rate-limited failures", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(getInputUrl(input));

      if (url.pathname === "/token") {
        return new Response(JSON.stringify({ access_token: "access-token" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }

      if (
        url.pathname === "/gmail/v1/users/me/profile" ||
        url.pathname === "/gmail/v1/users/me/messages"
      ) {
        return new Response(
          JSON.stringify({
            error: {
              code: 429,
              message: "Rate Limit Exceeded",
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 429,
          },
        );
      }

      throw new Error(`Unhandled fetch ${url.toString()}`);
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* MailboxSyncProvider;

        return yield* provider
          .syncMailbox({
            mailbox: mailboxFixture,
            cursor: null,
          })
          .pipe(
            Effect.match({
              onFailure: (problem) => problem,
              onSuccess: () => {
                throw new Error("Expected syncMailbox to fail for Gmail 429 responses.");
              },
            }),
          );
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

    expect(result).toMatchObject({
      code: "gmail_rate_limited",
      detail: "Gmail temporarily rate-limited sync operations for this mailbox.",
      retryable: true,
      status: 429,
      title: "Gmail rate limited",
    });
  });

  it("classifies Gmail 503 history fetch responses as retryable sync failures", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(getInputUrl(input));

      if (url.pathname === "/token") {
        return new Response(JSON.stringify({ access_token: "access-token" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }

      if (url.pathname === "/gmail/v1/users/me/history") {
        return new Response(
          JSON.stringify({
            error: {
              code: 503,
              message: "Service Unavailable",
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 503,
          },
        );
      }

      throw new Error(`Unhandled fetch ${url.toString()}`);
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* MailboxSyncProvider;

        return yield* provider
          .syncMailbox({
            mailbox: {
              ...mailboxFixture,
              initializedAt: "2026-03-29T09:30:00.000Z",
              lastSuccessfulSyncAt: "2026-03-29T09:30:00.000Z",
            },
            cursor: "hist_bootstrap",
          })
          .pipe(
            Effect.match({
              onFailure: (problem) => problem,
              onSuccess: () => {
                throw new Error("Expected syncMailbox to fail for Gmail 503 responses.");
              },
            }),
          );
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

    expect(result).toMatchObject({
      code: "gmail_history_fetch_failed",
      detail: "Fetching Gmail history failed with HTTP 503.",
      retryable: true,
      status: 503,
      title: "Gmail history fetch failed",
    });
  });

  it("classifies Gmail 403 quota responses as rate-limited failures", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(getInputUrl(input));

      if (url.pathname === "/token") {
        return new Response(JSON.stringify({ access_token: "access-token" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }

      if (url.pathname === "/gmail/v1/users/me/history") {
        return new Response(
          JSON.stringify({
            error: {
              code: 403,
              errors: [
                {
                  domain: "usageLimits",
                  message: "User Rate Limit Exceeded",
                  reason: "userRateLimitExceeded",
                },
              ],
              message: "User Rate Limit Exceeded",
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 403,
          },
        );
      }

      throw new Error(`Unhandled fetch ${url.toString()}`);
    };

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const provider = yield* MailboxSyncProvider;

        return yield* provider
          .syncMailbox({
            mailbox: mailboxFixture,
            cursor: "hist_bootstrap",
          })
          .pipe(
            Effect.match({
              onFailure: (problem) => problem,
              onSuccess: () => {
                throw new Error("Expected syncMailbox to fail for Gmail 403 quota responses.");
              },
            }),
          );
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

    expect(result).toMatchObject({
      code: "gmail_rate_limited",
      detail: "Gmail temporarily rate-limited sync operations for this mailbox.",
      retryable: true,
      status: 403,
      title: "Gmail rate limited",
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

  it("advances the cursor when Gmail returns a higher historyId without history records", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(getInputUrl(input));

      if (url.pathname === "/token") {
        return gmailAccessToken();
      }

      if (url.pathname === "/gmail/v1/users/me/history") {
        expect(url.searchParams.get("startHistoryId")).toBe("hist_bootstrap");

        return jsonResponse({
          historyId: "hist_idle_2",
        });
      }

      throw new Error(`Unhandled fetch ${url.toString()}`);
    };

    const result = await syncMailboxWithGmailFetch(fetchImpl, {
      cursor: "hist_bootstrap",
      initialized: true,
    });

    expect(result).toEqual({
      snapshot: {
        deletedProviderMessageIds: [],
        messages: [],
        threads: [],
      },
      eventsEmitted: 0,
      nextCursor: "hist_idle_2",
    });
  });

  it("skips changed messages that disappear before fetch", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(getInputUrl(input));

      if (url.pathname === "/token") {
        return gmailAccessToken();
      }

      if (url.pathname === "/gmail/v1/users/me/history") {
        return gmailHistoryPage("hist_incremental_2", [
          {
            messagesAdded: [{ message: { id: "gmail_msg_deleted_before_fetch" } }],
          },
        ]);
      }

      if (url.pathname === "/gmail/v1/users/me/messages/gmail_msg_deleted_before_fetch") {
        return jsonResponse(
          {
            error: {
              code: 404,
              message: "Not found",
            },
          },
          404,
        );
      }

      throw new Error(`Unhandled fetch ${url.toString()}`);
    };

    const result = await syncMailboxWithGmailFetch(fetchImpl, {
      cursor: "hist_bootstrap",
      initialized: true,
    });

    expect(result).toEqual({
      snapshot: {
        deletedProviderMessageIds: [],
        messages: [],
        threads: [],
      },
      eventsEmitted: 0,
      nextCursor: "hist_incremental_2",
    });
  });
});

describe("createHttpGmailWatchProviderLayer", () => {
  const credentialStoreLayer = Layer.succeed(GmailMailboxCredentialStore, {
    getGmailMailboxCredential: () =>
      Effect.succeed({
        mailboxId: mailboxFixture.id,
        refreshToken: "refresh-token",
      }),
  });

  it("renews a Gmail watch using the configured Pub/Sub topic", async () => {
    const requests: Array<{
      readonly body: string | null;
      readonly method: string | undefined;
      readonly path: string;
    }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(getInputUrl(input));
      const body =
        typeof init?.body === "string"
          ? init.body
          : init?.body instanceof URLSearchParams
            ? init.body.toString()
            : null;

      requests.push({
        body,
        method: init?.method,
        path: url.pathname,
      });

      if (url.pathname === "/token") {
        return new Response(JSON.stringify({ access_token: "access-token" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }

      if (url.pathname === "/gmail/v1/users/me/watch") {
        return new Response(
          JSON.stringify({
            historyId: "hist_watch_123",
            expiration: String(Date.parse("2026-04-29T00:00:00.000Z")),
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
        const provider = yield* MailboxWatchProvider;

        return yield* provider.renewMailboxWatch({
          mailbox: mailboxFixture,
        });
      }).pipe(
        Effect.provide(
          createHttpGmailWatchProviderLayer({
            apiBaseUrl: "http://gmail.mock/gmail/v1",
            fetchImpl,
            gmailPubSubTopicName: "projects/mailmon-staging/topics/gmail-push",
            oauthClientId: "client-id",
            oauthClientSecret: "client-secret",
            oauthTokenUrl: "http://gmail.mock/token",
          }).pipe(Layer.provide(credentialStoreLayer)),
        ),
      ),
    );

    expect(result).toEqual({
      historyId: "hist_watch_123",
      watchExpiresAt: "2026-04-29T00:00:00.000Z",
    });
    expect(requests).toEqual([
      {
        body: expect.stringContaining("grant_type=refresh_token"),
        method: "POST",
        path: "/token",
      },
      {
        body: JSON.stringify({
          topicName: "projects/mailmon-staging/topics/gmail-push",
        }),
        method: "POST",
        path: "/gmail/v1/users/me/watch",
      },
    ]);
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
