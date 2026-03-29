import {
  MailboxSyncProvider,
  makeProblem,
  type CanonicalMessageRecord,
  type MailboxProviderSyncResult,
  type ProblemDetails,
  type MailboxSyncRequest,
} from "@mailmon/core";
import { Context, Effect, Layer } from "effect";

const DEFAULT_GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1";
const DEFAULT_GMAIL_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GmailMailboxCredential {
  readonly mailboxId: string;
  readonly refreshToken: string;
}

export class GmailMailboxCredentialStore extends Context.Tag(
  "@mailmon/gmail/GmailMailboxCredentialStore",
)<
  GmailMailboxCredentialStore,
  {
    readonly getGmailMailboxCredential: (
      mailboxId: string,
    ) => Effect.Effect<GmailMailboxCredential | null>;
  }
>() {}

export interface GmailSyncProviderConfig {
  readonly apiBaseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly oauthClientId: string | null;
  readonly oauthClientSecret: string | null;
  readonly oauthTokenUrl?: string;
}

interface GmailProfileResponse {
  readonly emailAddress: string;
  readonly historyId: string;
}

interface GmailHeader {
  readonly name: string;
  readonly value: string;
}

interface GmailMessageResponse {
  readonly id: string;
  readonly internalDate?: string;
  readonly labelIds?: string[];
  readonly payload?: Readonly<{
    readonly headers?: ReadonlyArray<GmailHeader>;
  }>;
  readonly snippet?: string;
  readonly threadId: string;
}

interface GmailListMessagesResponse {
  readonly messages?: ReadonlyArray<{
    readonly id: string;
  }>;
  readonly nextPageToken?: string;
}

interface GmailHistoryListResponse {
  readonly history?: ReadonlyArray<GmailHistoryRecord>;
  readonly historyId: string;
  readonly nextPageToken?: string;
}

interface GmailHistoryRecord {
  readonly labelsAdded?: ReadonlyArray<GmailHistoryChange>;
  readonly labelsRemoved?: ReadonlyArray<GmailHistoryChange>;
  readonly messagesAdded?: ReadonlyArray<GmailHistoryChange>;
  readonly messagesDeleted?: ReadonlyArray<GmailHistoryChange>;
}

interface GmailHistoryChange {
  readonly message: Readonly<{
    readonly id: string;
  }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isStringArray = (value: unknown): value is ReadonlyArray<string> => {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
};

const isGmailHeader = (value: unknown): value is GmailHeader => {
  return isRecord(value) && typeof value.name === "string" && typeof value.value === "string";
};

const parseGmailProfileResponse = (payload: unknown, mailboxId: string): GmailProfileResponse => {
  if (
    isRecord(payload) &&
    typeof payload.emailAddress === "string" &&
    typeof payload.historyId === "string"
  ) {
    return {
      emailAddress: payload.emailAddress,
      historyId: payload.historyId,
    };
  }

  throw makeGmailProblem({
    code: "gmail_profile_response_invalid",
    detail: "Fetching the Gmail mailbox profile returned an invalid response body.",
    mailboxId,
    retryable: false,
    status: 502,
    title: "Gmail profile response invalid",
  });
};

const parseGmailMessageResponse = (
  payload: unknown,
  mailboxId: string,
  messageId: string,
): GmailMessageResponse => {
  if (
    !isRecord(payload) ||
    typeof payload.id !== "string" ||
    typeof payload.threadId !== "string"
  ) {
    throw makeGmailProblem({
      code: "gmail_message_response_invalid",
      detail: `Fetching Gmail message ${messageId} returned an invalid response body.`,
      mailboxId,
      retryable: false,
      status: 502,
      title: "Gmail message response invalid",
    });
  }

  const payloadData = isRecord(payload.payload) ? payload.payload : undefined;
  const headers = Array.isArray(payloadData?.headers)
    ? payloadData.headers.filter(isGmailHeader)
    : undefined;
  return {
    id: payload.id,
    threadId: payload.threadId,
    ...(typeof payload.internalDate === "string" ? { internalDate: payload.internalDate } : {}),
    ...(isStringArray(payload.labelIds) ? { labelIds: [...payload.labelIds] } : {}),
    ...(payloadData !== undefined
      ? {
          payload:
            headers === undefined
              ? {}
              : {
                  headers,
                },
        }
      : {}),
    ...(typeof payload.snippet === "string" ? { snippet: payload.snippet } : {}),
  };
};

const parseGmailListMessagesResponse = (
  payload: unknown,
  mailboxId: string,
): GmailListMessagesResponse => {
  if (!isRecord(payload)) {
    throw makeGmailProblem({
      code: "gmail_message_list_response_invalid",
      detail: "Listing Gmail messages returned an invalid response body.",
      mailboxId,
      retryable: false,
      status: 502,
      title: "Gmail message list response invalid",
    });
  }

  const parsedMessages = Array.isArray(payload.messages)
    ? payload.messages.flatMap((message) => {
        if (!isRecord(message) || typeof message.id !== "string") {
          return [];
        }

        return [{ id: message.id }];
      })
    : undefined;

  return {
    ...(parsedMessages !== undefined ? { messages: parsedMessages } : {}),
    ...(typeof payload.nextPageToken === "string" ? { nextPageToken: payload.nextPageToken } : {}),
  };
};

const parseGmailHistoryChange = (value: unknown): GmailHistoryChange | null => {
  if (!isRecord(value) || !isRecord(value.message) || typeof value.message.id !== "string") {
    return null;
  }

  return {
    message: {
      id: value.message.id,
    },
  };
};

const parseGmailHistoryRecord = (value: unknown): GmailHistoryRecord | null => {
  if (!isRecord(value)) {
    return null;
  }

  const parseChanges = (changes: unknown) => {
    if (!Array.isArray(changes)) {
      return undefined;
    }

    return changes.flatMap((change) => {
      const parsed = parseGmailHistoryChange(change);
      return parsed === null ? [] : [parsed];
    });
  };

  const labelsAdded = parseChanges(value.labelsAdded);
  const labelsRemoved = parseChanges(value.labelsRemoved);
  const messagesAdded = parseChanges(value.messagesAdded);
  const messagesDeleted = parseChanges(value.messagesDeleted);

  return {
    ...(labelsAdded !== undefined ? { labelsAdded } : {}),
    ...(labelsRemoved !== undefined ? { labelsRemoved } : {}),
    ...(messagesAdded !== undefined ? { messagesAdded } : {}),
    ...(messagesDeleted !== undefined ? { messagesDeleted } : {}),
  };
};

const parseGmailHistoryListResponse = (
  payload: unknown,
  mailboxId: string,
): GmailHistoryListResponse => {
  if (!isRecord(payload) || typeof payload.historyId !== "string") {
    throw makeGmailProblem({
      code: "gmail_history_response_invalid",
      detail: "Fetching Gmail history returned an invalid response body.",
      mailboxId,
      retryable: false,
      status: 502,
      title: "Gmail history response invalid",
    });
  }

  const history = Array.isArray(payload.history)
    ? payload.history.flatMap((record) => {
        const parsed = parseGmailHistoryRecord(record);
        return parsed === null ? [] : [parsed];
      })
    : undefined;

  return {
    historyId: payload.historyId,
    ...(history !== undefined ? { history } : {}),
    ...(typeof payload.nextPageToken === "string" ? { nextPageToken: payload.nextPageToken } : {}),
  };
};

const isProblemDetails = (value: unknown): value is ProblemDetails => {
  return (
    isRecord(value) &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "number" &&
    typeof value.code === "string" &&
    typeof value.detail === "string" &&
    typeof value.retryable === "boolean"
  );
};

const trimTrailingSlash = (value: string) => {
  return value.endsWith("/") ? value.slice(0, -1) : value;
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

const makeGmailProblem = (params: {
  readonly code: string;
  readonly detail: string;
  readonly mailboxId: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly title: string;
}) => {
  return makeProblem({
    type: `https://api.mailmon.dev/problems/${params.code.replaceAll("_", "-")}`,
    title: params.title,
    status: params.status ?? 502,
    code: params.code,
    detail: params.detail,
    resource: {
      mailbox_id: params.mailboxId,
    },
    retryable: params.retryable,
  });
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

const createFetchUrl = (
  apiBaseUrl: string,
  pathname: string,
  params: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>,
) => {
  const url = new URL(`${trimTrailingSlash(apiBaseUrl)}${pathname}`);

  for (const key of Object.keys(params)) {
    const value = params[key];

    if (value === undefined) {
      continue;
    }

    if (typeof value !== "string") {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }

    url.searchParams.set(key, value);
  }

  return url;
};

const createHttpGmailApi = (config: GmailSyncProviderConfig) => {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const oauthTokenUrl = config.oauthTokenUrl ?? DEFAULT_GMAIL_OAUTH_TOKEN_URL;
  const apiBaseUrl = config.apiBaseUrl ?? DEFAULT_GMAIL_API_BASE_URL;

  const fetchAccessToken = async (params: {
    readonly mailboxId: string;
    readonly refreshToken: string;
  }) => {
    if (config.oauthClientId === null || config.oauthClientSecret === null) {
      throw makeGmailProblem({
        code: "gmail_oauth_config_missing",
        detail: "Worker Gmail OAuth client credentials are not configured.",
        mailboxId: params.mailboxId,
        retryable: false,
        status: 500,
        title: "Gmail OAuth config missing",
      });
    }

    const body = new URLSearchParams({
      client_id: config.oauthClientId,
      client_secret: config.oauthClientSecret,
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
    });
    const response = await fetchImpl(oauthTokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw makeGmailProblem({
        code: "gmail_token_refresh_failed",
        detail: `Refreshing the Gmail access token failed with HTTP ${response.status}.`,
        mailboxId: params.mailboxId,
        retryable: response.status >= 500,
        status: response.status,
        title: "Gmail token refresh failed",
      });
    }

    const payload = await response.json();

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("access_token" in payload) ||
      typeof payload.access_token !== "string" ||
      payload.access_token.length === 0
    ) {
      throw makeGmailProblem({
        code: "gmail_token_refresh_failed",
        detail: "Refreshing the Gmail access token returned no access token.",
        mailboxId: params.mailboxId,
        retryable: false,
        status: 502,
        title: "Gmail token refresh failed",
      });
    }

    return payload.access_token;
  };

  const getJson = async (params: {
    readonly accessToken: string;
    readonly pathname: string;
    readonly searchParams?: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>;
  }) => {
    const response = await fetchImpl(
      createFetchUrl(apiBaseUrl, params.pathname, params.searchParams ?? {}),
      {
        headers: {
          authorization: `Bearer ${params.accessToken}`,
        },
      },
    );

    return {
      response,
      responseBody: await response.json(),
    };
  };

  const getProfile = async (params: {
    readonly accessToken: string;
    readonly mailboxId: string;
  }) => {
    const { response, responseBody } = await getJson({
      accessToken: params.accessToken,
      pathname: "/users/me/profile",
    });

    if (!response.ok) {
      throw makeGmailProblem({
        code: "gmail_profile_fetch_failed",
        detail: `Fetching the Gmail mailbox profile failed with HTTP ${response.status}.`,
        mailboxId: params.mailboxId,
        retryable: response.status >= 500,
        status: response.status,
        title: "Gmail profile fetch failed",
      });
    }

    return parseGmailProfileResponse(responseBody, params.mailboxId);
  };

  const getMessage = async (params: {
    readonly accessToken: string;
    readonly mailboxId: string;
    readonly messageId: string;
  }) => {
    const { response, responseBody } = await getJson({
      accessToken: params.accessToken,
      pathname: `/users/me/messages/${params.messageId}`,
      searchParams: {
        format: "metadata",
        metadataHeaders: ["From", "Subject"],
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw makeGmailProblem({
        code: "gmail_message_fetch_failed",
        detail: `Fetching Gmail message ${params.messageId} failed with HTTP ${response.status}.`,
        mailboxId: params.mailboxId,
        retryable: response.status >= 500,
        status: response.status,
        title: "Gmail message fetch failed",
      });
    }

    return parseGmailMessageResponse(responseBody, params.mailboxId, params.messageId);
  };

  const listAllMessages = async (params: {
    readonly accessToken: string;
    readonly mailboxId: string;
  }) => {
    const messageIds: string[] = [];
    let pageToken: string | undefined;

    do {
      const { response, responseBody } = await getJson({
        accessToken: params.accessToken,
        pathname: "/users/me/messages",
        searchParams: {
          maxResults: "100",
          pageToken,
        },
      });

      if (!response.ok) {
        throw makeGmailProblem({
          code: "gmail_message_list_failed",
          detail: `Listing Gmail messages failed with HTTP ${response.status}.`,
          mailboxId: params.mailboxId,
          retryable: response.status >= 500,
          status: response.status,
          title: "Gmail message list failed",
        });
      }

      const parsedResponse = parseGmailListMessagesResponse(responseBody, params.mailboxId);

      for (const message of parsedResponse.messages ?? []) {
        messageIds.push(message.id);
      }

      pageToken = parsedResponse.nextPageToken;
    } while (pageToken !== undefined);

    const messages = await Promise.all(
      messageIds.map((messageId) =>
        getMessage({
          accessToken: params.accessToken,
          mailboxId: params.mailboxId,
          messageId,
        }),
      ),
    );

    return messages.filter((message): message is GmailMessageResponse => message !== null);
  };

  const listHistoryDelta = async (params: {
    readonly accessToken: string;
    readonly cursor: string;
    readonly mailboxId: string;
  }) => {
    const changedMessageIds = new Set<string>();
    const deletedMessageIds = new Set<string>();
    let nextCursor = params.cursor;
    let pageToken: string | undefined;

    do {
      const { response, responseBody } = await getJson({
        accessToken: params.accessToken,
        pathname: "/users/me/history",
        searchParams: {
          historyTypes: ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
          maxResults: "100",
          pageToken,
          startHistoryId: params.cursor,
        },
      });

      if (response.status === 404) {
        throw makeGmailProblem({
          code: "gmail_history_cursor_invalid",
          detail: `Stored Gmail history cursor ${params.cursor} is invalid or expired and requires a full resync.`,
          mailboxId: params.mailboxId,
          retryable: false,
          status: 409,
          title: "Gmail history cursor invalid",
        });
      }

      if (!response.ok) {
        throw makeGmailProblem({
          code: "gmail_history_fetch_failed",
          detail: `Fetching Gmail history failed with HTTP ${response.status}.`,
          mailboxId: params.mailboxId,
          retryable: response.status >= 500,
          status: response.status,
          title: "Gmail history fetch failed",
        });
      }

      const parsedResponse = parseGmailHistoryListResponse(responseBody, params.mailboxId);

      nextCursor = parsedResponse.historyId;

      for (const historyRecord of parsedResponse.history ?? []) {
        for (const messageAdded of historyRecord.messagesAdded ?? []) {
          if (!deletedMessageIds.has(messageAdded.message.id)) {
            changedMessageIds.add(messageAdded.message.id);
          }
        }

        for (const labelAdded of historyRecord.labelsAdded ?? []) {
          if (!deletedMessageIds.has(labelAdded.message.id)) {
            changedMessageIds.add(labelAdded.message.id);
          }
        }

        for (const labelRemoved of historyRecord.labelsRemoved ?? []) {
          if (!deletedMessageIds.has(labelRemoved.message.id)) {
            changedMessageIds.add(labelRemoved.message.id);
          }
        }

        for (const messageDeleted of historyRecord.messagesDeleted ?? []) {
          deletedMessageIds.add(messageDeleted.message.id);
          changedMessageIds.delete(messageDeleted.message.id);
        }
      }

      pageToken = parsedResponse.nextPageToken;
    } while (pageToken !== undefined);

    const messages = await Promise.all(
      [...changedMessageIds].map((messageId) =>
        getMessage({
          accessToken: params.accessToken,
          mailboxId: params.mailboxId,
          messageId,
        }),
      ),
    );

    return {
      deletedMessageIds: [...deletedMessageIds],
      messages: messages.filter((message): message is GmailMessageResponse => message !== null),
      nextCursor,
    };
  };

  return {
    fetchAccessToken,
    getProfile,
    listAllMessages,
    listHistoryDelta,
  };
};

export const createStubMailboxSyncProviderLayer = Layer.succeed(MailboxSyncProvider, {
  syncMailbox: (request) => {
    return Effect.succeed(createStubSyncResult(request));
  },
});

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
                  const [profile, messages] = await Promise.all([
                    gmailApi.getProfile({
                      accessToken,
                      mailboxId: mailbox.id,
                    }),
                    gmailApi.listAllMessages({
                      accessToken,
                      mailboxId: mailbox.id,
                    }),
                  ]);

                  return {
                    eventsEmitted: messages.length,
                    nextCursor: profile.historyId,
                    snapshot: toSyncSnapshot(mailbox.id, messages, []),
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
