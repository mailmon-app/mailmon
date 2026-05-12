import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import {
  MailboxConnectProvider,
  MailboxSyncProvider,
  MailboxWatchProvider,
  type CanonicalMessageRecord,
  type MailboxConnectAuthorization,
  type MailboxProviderSyncResult,
  type MailboxSyncRequest,
  type ProblemDetails,
} from "@mailmon/core";
import { Context, Effect, Layer } from "effect";

import { createHttpGmailApi } from "./http-api.js";
import type { GmailMessageResponse } from "./parsers.js";
import { isProblemDetails, makeGmailConnectProblem, makeGmailProblem } from "./problems.js";

export interface GmailMailboxCredential {
  readonly mailboxId: string;
  readonly refreshToken: string;
}

type GmailRefreshTokenCipherOperation = "decrypt" | "encrypt";

export interface GmailRefreshTokenCipherError {
  readonly _tag: "GmailRefreshTokenCipherError";
  readonly message: string;
  readonly operation: GmailRefreshTokenCipherOperation;
}

export interface GmailRefreshTokenCipherKey {
  readonly encryptionKey: string;
  readonly keyId: string;
}

export interface GmailRefreshTokenInspection {
  readonly keyId: string | null;
  readonly rewrapRequired: boolean;
  readonly storage: "encrypted" | "plaintext";
}

export class GmailRefreshTokenCipher extends Context.Service<
  GmailRefreshTokenCipher,
  {
    readonly decryptRefreshToken: (
      storedRefreshToken: string,
    ) => Effect.Effect<string, GmailRefreshTokenCipherError>;
    readonly encryptRefreshToken: (
      refreshToken: string,
    ) => Effect.Effect<string, GmailRefreshTokenCipherError>;
    readonly inspectRefreshToken: (
      storedRefreshToken: string,
    ) => Effect.Effect<GmailRefreshTokenInspection, GmailRefreshTokenCipherError>;
    readonly rewrapRefreshToken: (
      storedRefreshToken: string,
    ) => Effect.Effect<string, GmailRefreshTokenCipherError>;
  }
>()("@mailmon/gmail/GmailRefreshTokenCipher") {}

export class GmailMailboxCredentialStore extends Context.Service<
  GmailMailboxCredentialStore,
  {
    readonly getGmailMailboxCredential: (
      mailboxId: string,
    ) => Effect.Effect<GmailMailboxCredential | null, ProblemDetails>;
  }
>()("@mailmon/gmail/GmailMailboxCredentialStore") {}

export interface GmailRefreshTokenCipherConfig {
  readonly activeKeyId?: string;
  readonly allowPlaintextFallback?: boolean;
  readonly decryptionKeys?: ReadonlyArray<GmailRefreshTokenCipherKey>;
  readonly encryptionKey: string;
}

interface GmailRefreshTokenEnvelopeV1 {
  readonly alg: "aes-256-gcm";
  readonly ciphertext: string;
  readonly iv: string;
  readonly kid?: string;
  readonly tag: string;
  readonly v: 1;
}

const GMAIL_REFRESH_TOKEN_ENVELOPE_PREFIX = "mmrt_v1:";
const GMAIL_REFRESH_TOKEN_ENVELOPE_VERSION = 1;
const GMAIL_REFRESH_TOKEN_IV_BYTES = 12;
const DEFAULT_GMAIL_REFRESH_TOKEN_KEY_ID = "primary";

const createGmailRefreshTokenCipherError = (
  operation: GmailRefreshTokenCipherOperation,
  message: string,
): GmailRefreshTokenCipherError => {
  return {
    _tag: "GmailRefreshTokenCipherError",
    message,
    operation,
  };
};

const isGmailRefreshTokenEnvelopeV1 = (value: unknown): value is GmailRefreshTokenEnvelopeV1 => {
  return (
    typeof value === "object" &&
    value !== null &&
    "v" in value &&
    value.v === GMAIL_REFRESH_TOKEN_ENVELOPE_VERSION &&
    "alg" in value &&
    value.alg === "aes-256-gcm" &&
    "ciphertext" in value &&
    typeof value.ciphertext === "string" &&
    "iv" in value &&
    typeof value.iv === "string" &&
    "tag" in value &&
    typeof value.tag === "string"
  );
};

const parseGmailRefreshTokenEncryptionKey = (encryptionKey: string) => {
  const decodedKey = Buffer.from(encryptionKey, "base64");

  if (decodedKey.byteLength !== 32) {
    throw new Error(
      "MAILMON_GMAIL_REFRESH_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }

  return decodedKey;
};

const normalizeGmailRefreshTokenKeyId = (keyId: string) => {
  const normalized = keyId.trim();

  if (normalized.length === 0) {
    throw new Error("Gmail refresh token encryption key IDs must be non-empty.");
  }

  return normalized;
};

const createGmailRefreshTokenKeyRing = (config: GmailRefreshTokenCipherConfig) => {
  const activeKeyId = normalizeGmailRefreshTokenKeyId(
    config.activeKeyId ?? DEFAULT_GMAIL_REFRESH_TOKEN_KEY_ID,
  );
  const activeKey = {
    id: activeKeyId,
    key: parseGmailRefreshTokenEncryptionKey(config.encryptionKey),
  };
  const keyEntries = new Map<string, Buffer>([[activeKey.id, activeKey.key]]);

  for (const configuredKey of config.decryptionKeys ?? []) {
    const keyId = normalizeGmailRefreshTokenKeyId(configuredKey.keyId);

    if (keyEntries.has(keyId)) {
      throw new Error(`Duplicate Gmail refresh token encryption key ID: ${keyId}`);
    }

    keyEntries.set(keyId, parseGmailRefreshTokenEncryptionKey(configuredKey.encryptionKey));
  }

  return {
    activeKey,
    keys: [...keyEntries.entries()].map(([id, key]) => ({ id, key })),
    keysById: keyEntries,
  };
};

const serializeGmailRefreshTokenEnvelope = (envelope: GmailRefreshTokenEnvelopeV1) => {
  return `${GMAIL_REFRESH_TOKEN_ENVELOPE_PREFIX}${Buffer.from(
    JSON.stringify(envelope),
    "utf8",
  ).toString("base64url")}`;
};

const parseGmailRefreshTokenEnvelope = (
  storedRefreshToken: string,
  allowPlaintextFallback: boolean,
) => {
  if (!storedRefreshToken.startsWith(GMAIL_REFRESH_TOKEN_ENVELOPE_PREFIX)) {
    if (allowPlaintextFallback) {
      return {
        kind: "plaintext" as const,
        refreshToken: storedRefreshToken,
      };
    }

    throw new Error("Stored Gmail refresh token is not in the encrypted envelope format.");
  }

  const encodedEnvelope = storedRefreshToken.slice(GMAIL_REFRESH_TOKEN_ENVELOPE_PREFIX.length);
  const parsedEnvelope = JSON.parse(
    Buffer.from(encodedEnvelope, "base64url").toString("utf8"),
  ) as unknown;

  if (!isGmailRefreshTokenEnvelopeV1(parsedEnvelope)) {
    throw new Error("Stored Gmail refresh token envelope is invalid.");
  }

  return {
    envelope: parsedEnvelope,
    kind: "encrypted" as const,
  };
};

const decryptGmailRefreshTokenEnvelope = (envelope: GmailRefreshTokenEnvelopeV1, key: Buffer) => {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));

  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
};

export const createAesGcmGmailRefreshTokenCipherLayer = (config: GmailRefreshTokenCipherConfig) =>
  Layer.effect(
    GmailRefreshTokenCipher,
    Effect.sync(() => {
      const keyRing = createGmailRefreshTokenKeyRing(config);
      const allowPlaintextFallback = config.allowPlaintextFallback ?? false;
      const decryptEncryptedRefreshToken = (envelope: GmailRefreshTokenEnvelopeV1) => {
        if (envelope.kid !== undefined) {
          const keyedDecryptionKey = keyRing.keysById.get(envelope.kid);

          if (keyedDecryptionKey === undefined) {
            throw new Error(
              `Stored Gmail refresh token references unknown encryption key ID: ${envelope.kid}`,
            );
          }

          return decryptGmailRefreshTokenEnvelope(envelope, keyedDecryptionKey);
        }

        let lastError: unknown;

        for (const candidateKey of keyRing.keys) {
          try {
            return decryptGmailRefreshTokenEnvelope(envelope, candidateKey.key);
          } catch (error) {
            lastError = error;
          }
        }

        throw lastError instanceof Error
          ? lastError
          : new Error("Stored Gmail refresh token could not be decrypted.");
      };
      const inspectParsedRefreshToken = (
        parsedRefreshToken: ReturnType<typeof parseGmailRefreshTokenEnvelope>,
      ): GmailRefreshTokenInspection => {
        if (parsedRefreshToken.kind === "plaintext") {
          return {
            keyId: null,
            rewrapRequired: true,
            storage: "plaintext",
          };
        }

        decryptEncryptedRefreshToken(parsedRefreshToken.envelope);

        return {
          keyId: parsedRefreshToken.envelope.kid ?? null,
          rewrapRequired: parsedRefreshToken.envelope.kid !== keyRing.activeKey.id,
          storage: "encrypted",
        };
      };

      return {
        decryptRefreshToken: (storedRefreshToken: string) =>
          Effect.try({
            catch: (error) =>
              createGmailRefreshTokenCipherError(
                "decrypt",
                error instanceof Error
                  ? error.message
                  : "Stored Gmail refresh token could not be decrypted.",
              ),
            try: () => {
              const parsedRefreshToken = parseGmailRefreshTokenEnvelope(
                storedRefreshToken,
                allowPlaintextFallback,
              );

              if (parsedRefreshToken.kind === "plaintext") {
                return parsedRefreshToken.refreshToken;
              }

              return decryptEncryptedRefreshToken(parsedRefreshToken.envelope);
            },
          }),
        encryptRefreshToken: (refreshToken: string) =>
          Effect.try({
            catch: (error) =>
              createGmailRefreshTokenCipherError(
                "encrypt",
                error instanceof Error
                  ? error.message
                  : "Gmail refresh token could not be encrypted.",
              ),
            try: () => {
              const iv = randomBytes(GMAIL_REFRESH_TOKEN_IV_BYTES);
              const cipher = createCipheriv("aes-256-gcm", keyRing.activeKey.key, iv);
              const ciphertext = Buffer.concat([
                cipher.update(refreshToken, "utf8"),
                cipher.final(),
              ]);

              return serializeGmailRefreshTokenEnvelope({
                alg: "aes-256-gcm",
                ciphertext: ciphertext.toString("base64url"),
                iv: iv.toString("base64url"),
                kid: keyRing.activeKey.id,
                tag: cipher.getAuthTag().toString("base64url"),
                v: GMAIL_REFRESH_TOKEN_ENVELOPE_VERSION,
              });
            },
          }),
        inspectRefreshToken: (storedRefreshToken: string) =>
          Effect.try({
            catch: (error) =>
              createGmailRefreshTokenCipherError(
                "decrypt",
                error instanceof Error
                  ? error.message
                  : "Stored Gmail refresh token could not be inspected.",
              ),
            try: () => {
              const parsedRefreshToken = parseGmailRefreshTokenEnvelope(storedRefreshToken, true);

              return inspectParsedRefreshToken(parsedRefreshToken);
            },
          }),
        rewrapRefreshToken: (storedRefreshToken: string) =>
          Effect.try({
            catch: (error) =>
              createGmailRefreshTokenCipherError(
                "encrypt",
                error instanceof Error
                  ? error.message
                  : "Stored Gmail refresh token could not be rewrapped.",
              ),
            try: () => {
              const parsedRefreshToken = parseGmailRefreshTokenEnvelope(storedRefreshToken, true);
              const inspection = inspectParsedRefreshToken(parsedRefreshToken);

              if (!inspection.rewrapRequired) {
                return storedRefreshToken;
              }

              const refreshToken =
                parsedRefreshToken.kind === "plaintext"
                  ? parsedRefreshToken.refreshToken
                  : decryptEncryptedRefreshToken(parsedRefreshToken.envelope);
              const iv = randomBytes(GMAIL_REFRESH_TOKEN_IV_BYTES);
              const cipher = createCipheriv("aes-256-gcm", keyRing.activeKey.key, iv);
              const ciphertext = Buffer.concat([
                cipher.update(refreshToken, "utf8"),
                cipher.final(),
              ]);

              return serializeGmailRefreshTokenEnvelope({
                alg: "aes-256-gcm",
                ciphertext: ciphertext.toString("base64url"),
                iv: iv.toString("base64url"),
                kid: keyRing.activeKey.id,
                tag: cipher.getAuthTag().toString("base64url"),
                v: GMAIL_REFRESH_TOKEN_ENVELOPE_VERSION,
              });
            },
          }),
      };
    }),
  );

export interface GmailSyncProviderConfig {
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly gmailPubSubTopicName?: string | null;
  readonly oauthAuthorizeUrl?: string;
  readonly oauthClientId: string | null;
  readonly oauthClientSecret: string | null;
  readonly oauthTokenUrl?: string;
}

const createPkceCodeChallenge = (codeVerifier: string) => {
  return createHash("sha256").update(codeVerifier).digest("base64url");
};

const createCanonicalThreadId = (mailboxId: string, providerThreadId: string) => {
  return `thr_${mailboxId}_${providerThreadId}`;
};

const createCanonicalMessageId = (mailboxId: string, providerMessageId: string) => {
  return `msg_${mailboxId}_${providerMessageId}`;
};

const parseFromHeader = (value: string | null) => {
  if (value === null) {
    return {
      email: "unknown@example.invalid",
      name: null,
    };
  }

  const match = value.match(/^(.*)<([^>]+)>$/);

  if (match === null) {
    return {
      email: value.trim(),
      name: null,
    };
  }

  const rawName = match[1] ?? "";
  const rawEmail = match[2] ?? value.trim();
  const name = rawName.trim().replace(/^"|"$/g, "");

  return {
    email: rawEmail.trim(),
    name: name.length > 0 ? name : null,
  };
};

const getHeaderValue = (message: GmailMessageResponse, headerName: string) => {
  return (
    message.payload?.headers?.find(
      (header) => header.name.toLowerCase() === headerName.toLowerCase(),
    )?.value ?? null
  );
};

const toReceivedAt = (internalDate: string | undefined) => {
  if (internalDate === undefined) {
    return new Date(0).toISOString();
  }

  return new Date(Number.parseInt(internalDate, 10)).toISOString();
};

const toCanonicalMessage = (
  mailboxId: string,
  message: GmailMessageResponse,
): CanonicalMessageRecord => {
  const from = parseFromHeader(getHeaderValue(message, "From"));
  const subject = getHeaderValue(message, "Subject") ?? "";

  return {
    id: createCanonicalMessageId(mailboxId, message.id),
    threadId: createCanonicalThreadId(mailboxId, message.threadId),
    providerMessageId: message.id,
    providerThreadId: message.threadId,
    subject,
    from,
    snippet: message.snippet ?? "",
    receivedAt: toReceivedAt(message.internalDate),
    labelIds: [...(message.labelIds ?? [])],
  };
};

const toSyncSnapshot = (
  mailboxId: string,
  messages: ReadonlyArray<GmailMessageResponse>,
  deletedProviderMessageIds: ReadonlyArray<string>,
) => {
  const canonicalMessages = messages.map((message) => toCanonicalMessage(mailboxId, message));
  const canonicalThreads = new Map<
    string,
    {
      id: string;
      lastMessageAt: string;
      providerThreadId: string;
      subject: string;
    }
  >();

  for (const message of canonicalMessages) {
    const existing = canonicalThreads.get(message.providerThreadId);

    if (
      existing === undefined ||
      Date.parse(message.receivedAt) >= Date.parse(existing.lastMessageAt)
    ) {
      canonicalThreads.set(message.providerThreadId, {
        id: message.threadId,
        lastMessageAt: message.receivedAt,
        providerThreadId: message.providerThreadId,
        subject: message.subject,
      });
    }
  }

  return {
    deletedProviderMessageIds: [...deletedProviderMessageIds],
    messages: canonicalMessages,
    threads: [...canonicalThreads.values()],
  };
};

const mergeInitialSyncMessages = (
  baselineMessages: ReadonlyArray<GmailMessageResponse>,
  catchUp: Readonly<{
    deletedMessageIds: ReadonlyArray<string>;
    messages: ReadonlyArray<GmailMessageResponse>;
  }>,
) => {
  const deletedMessageIds = new Set(catchUp.deletedMessageIds);
  const messagesById = new Map<string, GmailMessageResponse>();

  for (const message of baselineMessages) {
    if (!deletedMessageIds.has(message.id)) {
      messagesById.set(message.id, message);
    }
  }

  for (const message of catchUp.messages) {
    if (!deletedMessageIds.has(message.id)) {
      messagesById.set(message.id, message);
    }
  }

  return [...messagesById.values()];
};

const createStubSyncResult = (request: MailboxSyncRequest): MailboxProviderSyncResult => {
  const { cursor, mailbox } = request;
  const threadId = `thr_${mailbox.id}_bootstrap`;
  const providerThreadId = `gmail_thr_${mailbox.id}_bootstrap`;

  if (cursor === null) {
    return {
      snapshot: {
        deletedProviderMessageIds: [],
        threads: [
          {
            id: threadId,
            providerThreadId,
            subject: "Welcome to Mailmon",
            lastMessageAt: "2026-03-29T09:30:00.000Z",
          },
        ],
        messages: [
          {
            id: `msg_${mailbox.id}_bootstrap_1`,
            threadId,
            providerMessageId: `gmail_msg_${mailbox.id}_bootstrap_1`,
            providerThreadId,
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
    };
  }

  return {
    snapshot: {
      deletedProviderMessageIds: [],
      threads: [
        {
          id: threadId,
          providerThreadId,
          subject: "Welcome to Mailmon",
          lastMessageAt: "2026-03-29T10:00:00.000Z",
        },
      ],
      messages: [
        {
          id: `msg_${mailbox.id}_bootstrap_2`,
          threadId,
          providerMessageId: `gmail_msg_${mailbox.id}_bootstrap_2`,
          providerThreadId,
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
  };
};

export const createStubMailboxSyncProviderLayer = Layer.succeed(MailboxSyncProvider, {
  syncMailbox: (request) => {
    return Effect.succeed(createStubSyncResult(request));
  },
});

export const createHttpGmailWatchProviderLayer = (config: GmailSyncProviderConfig) =>
  Layer.effect(
    MailboxWatchProvider,
    Effect.gen(function* () {
      const credentialStore = yield* GmailMailboxCredentialStore;
      const gmailApi = createHttpGmailApi(config);

      return {
        renewMailboxWatch: ({ mailbox }) =>
          Effect.gen(function* () {
            const credential = yield* credentialStore.getGmailMailboxCredential(mailbox.id);

            if (credential === null) {
              return yield* Effect.fail(
                makeGmailProblem({
                  code: "gmail_mailbox_credentials_missing",
                  detail: `Mailbox ${mailbox.id} has no stored Gmail refresh token.`,
                  mailboxId: mailbox.id,
                  retryable: false,
                  status: 409,
                  title: "Gmail mailbox credentials missing",
                }),
              );
            }

            return yield* Effect.tryPromise({
              catch: (error) => {
                if (isProblemDetails(error)) {
                  return error;
                }

                return makeGmailProblem({
                  code: "gmail_watch_renewal_failed",
                  detail:
                    error instanceof Error
                      ? error.message
                      : "An unexpected Gmail watch renewal error occurred.",
                  mailboxId: mailbox.id,
                  retryable: true,
                  status: 502,
                  title: "Gmail watch renewal failed",
                });
              },
              try: async () => {
                const accessToken = await gmailApi.fetchAccessToken({
                  mailboxId: mailbox.id,
                  refreshToken: credential.refreshToken,
                });

                return gmailApi.watchMailbox({
                  accessToken,
                  mailboxId: mailbox.id,
                });
              },
            });
          }),
      };
    }),
  );

export const createHttpGmailConnectProviderLayer = (config: GmailSyncProviderConfig) =>
  Layer.effect(
    MailboxConnectProvider,
    Effect.sync(() => {
      const gmailApi = createHttpGmailApi(config);

      return {
        createAuthorizationUrl: (params) =>
          Effect.try({
            catch: (error) => {
              if (isProblemDetails(error)) {
                return error;
              }

              return makeGmailConnectProblem({
                code: "gmail_authorization_url_failed",
                connectSessionId: params.connectSessionId,
                detail:
                  error instanceof Error
                    ? error.message
                    : "An unexpected Gmail authorization URL error occurred.",
                retryable: false,
                status: 500,
                title: "Gmail authorization URL failed",
              });
            },
            try: () => {
              if (config.oauthClientId === null) {
                throw makeGmailConnectProblem({
                  code: "gmail_oauth_config_missing",
                  connectSessionId: params.connectSessionId,
                  detail: "API Gmail OAuth client credentials are not configured.",
                  retryable: false,
                  status: 500,
                  title: "Gmail OAuth config missing",
                });
              }

              const authorizationUrl = new URL(gmailApi.oauthAuthorizeUrl);

              authorizationUrl.searchParams.set("access_type", "offline");
              authorizationUrl.searchParams.set("client_id", config.oauthClientId);
              authorizationUrl.searchParams.set(
                "code_challenge",
                createPkceCodeChallenge(params.codeVerifier),
              );
              authorizationUrl.searchParams.set("code_challenge_method", "S256");
              authorizationUrl.searchParams.set("include_granted_scopes", "true");
              authorizationUrl.searchParams.set("prompt", "consent");
              authorizationUrl.searchParams.set("redirect_uri", params.redirectUri);
              authorizationUrl.searchParams.set("response_type", "code");
              authorizationUrl.searchParams.set(
                "scope",
                "https://www.googleapis.com/auth/gmail.readonly",
              );
              authorizationUrl.searchParams.set("state", params.connectSessionId);

              return authorizationUrl.toString();
            },
          }),
        completeAuthorization: (params) =>
          Effect.tryPromise({
            catch: (error) => {
              if (isProblemDetails(error)) {
                return error;
              }

              return makeGmailConnectProblem({
                code: "gmail_connect_failed",
                connectSessionId: params.connectSessionId,
                detail:
                  error instanceof Error
                    ? error.message
                    : "An unexpected Gmail connect error occurred.",
                retryable: true,
                status: 502,
                title: "Gmail connect failed",
              });
            },
            try: async () => {
              const authorization = await gmailApi.exchangeAuthorizationCode({
                code: params.code,
                codeVerifier: params.codeVerifier,
                connectSessionId: params.connectSessionId,
                redirectUri: params.redirectUri,
              });
              const profile = await gmailApi.getConnectProfile({
                accessToken: authorization.accessToken,
                connectSessionId: params.connectSessionId,
              });

              return {
                providerAccountEmail: profile.emailAddress.trim().toLowerCase(),
                refreshToken: authorization.refreshToken,
              } satisfies MailboxConnectAuthorization;
            },
          }),
      };
    }),
  );

export const createHttpGmailSyncProviderLayer = (config: GmailSyncProviderConfig) =>
  Layer.effect(
    MailboxSyncProvider,
    Effect.gen(function* () {
      const credentialStore = yield* GmailMailboxCredentialStore;
      const gmailApi = createHttpGmailApi(config);

      return {
        syncMailbox: ({ cursor, mailbox }) =>
          Effect.gen(function* () {
            const credential = yield* credentialStore.getGmailMailboxCredential(mailbox.id);

            if (credential === null) {
              return yield* Effect.fail(
                makeGmailProblem({
                  code: "gmail_mailbox_credentials_missing",
                  detail: `Mailbox ${mailbox.id} has no stored Gmail refresh token.`,
                  mailboxId: mailbox.id,
                  retryable: false,
                  status: 409,
                  title: "Gmail mailbox credentials missing",
                }),
              );
            }

            return yield* Effect.tryPromise({
              catch: (error) => {
                if (isProblemDetails(error)) {
                  return error;
                }

                return makeGmailProblem({
                  code: "gmail_sync_failed",
                  detail:
                    error instanceof Error
                      ? error.message
                      : "An unexpected Gmail sync error occurred.",
                  mailboxId: mailbox.id,
                  retryable: true,
                  status: 502,
                  title: "Gmail sync failed",
                });
              },
              try: async () => {
                const accessToken = await gmailApi.fetchAccessToken({
                  mailboxId: mailbox.id,
                  refreshToken: credential.refreshToken,
                });

                if (cursor === null) {
                  const profile = await gmailApi.getProfile({
                    accessToken,
                    mailboxId: mailbox.id,
                  });
                  const baselineMessages = await gmailApi.listAllMessages({
                    accessToken,
                    mailboxId: mailbox.id,
                  });
                  const catchUp = await gmailApi.listHistoryDelta({
                    accessToken,
                    cursor: profile.historyId,
                    mailboxId: mailbox.id,
                  });
                  const messages = mergeInitialSyncMessages(baselineMessages, catchUp);

                  return {
                    eventsEmitted: messages.length + catchUp.deletedMessageIds.length,
                    nextCursor: catchUp.nextCursor,
                    snapshot: toSyncSnapshot(mailbox.id, messages, catchUp.deletedMessageIds),
                  } satisfies MailboxProviderSyncResult;
                }

                const historyDelta = await gmailApi.listHistoryDelta({
                  accessToken,
                  cursor,
                  mailboxId: mailbox.id,
                });

                return {
                  eventsEmitted:
                    historyDelta.messages.length + historyDelta.deletedMessageIds.length,
                  nextCursor: historyDelta.nextCursor,
                  snapshot: toSyncSnapshot(
                    mailbox.id,
                    historyDelta.messages,
                    historyDelta.deletedMessageIds,
                  ),
                } satisfies MailboxProviderSyncResult;
              },
            });
          }),
      };
    }),
  );
