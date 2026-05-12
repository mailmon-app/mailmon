import { makeGmailConnectProblem, makeGmailProblem, isRecord } from "./problems.js";

export interface GmailProfileResponse {
  readonly emailAddress: string;
  readonly historyId: string;
}

export interface GmailHeader {
  readonly name: string;
  readonly value: string;
}

export interface GmailMessageResponse {
  readonly id: string;
  readonly internalDate?: string;
  readonly labelIds?: string[];
  readonly payload?: Readonly<{
    readonly headers?: ReadonlyArray<GmailHeader>;
  }>;
  readonly snippet?: string;
  readonly threadId: string;
}

export interface GmailListMessagesResponse {
  readonly messages?: ReadonlyArray<{
    readonly id: string;
  }>;
  readonly nextPageToken?: string;
}

export interface GmailHistoryListResponse {
  readonly history?: ReadonlyArray<GmailHistoryRecord>;
  readonly historyId: string;
  readonly nextPageToken?: string;
}

export interface GmailWatchResponse {
  readonly expiration: string;
  readonly historyId: string;
}

export interface GmailHistoryRecord {
  readonly labelsAdded?: ReadonlyArray<GmailHistoryChange>;
  readonly labelsRemoved?: ReadonlyArray<GmailHistoryChange>;
  readonly messagesAdded?: ReadonlyArray<GmailHistoryChange>;
  readonly messagesDeleted?: ReadonlyArray<GmailHistoryChange>;
}

export interface GmailHistoryChange {
  readonly message: Readonly<{
    readonly id: string;
  }>;
}

const isStringArray = (value: unknown): value is ReadonlyArray<string> => {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
};

const isGmailHeader = (value: unknown): value is GmailHeader => {
  return isRecord(value) && typeof value.name === "string" && typeof value.value === "string";
};

export const parseGmailProfileResponse = (
  payload: unknown,
  mailboxId: string,
): GmailProfileResponse => {
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

export const parseGmailConnectProfileResponse = (
  payload: unknown,
  connectSessionId: string,
): GmailProfileResponse => {
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

  throw makeGmailConnectProblem({
    code: "gmail_profile_response_invalid",
    connectSessionId,
    detail: "Fetching the Gmail mailbox profile returned an invalid response body.",
    retryable: false,
    status: 502,
    title: "Gmail profile response invalid",
  });
};

export const parseGmailMessageResponse = (
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

export const parseGmailListMessagesResponse = (
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

export const parseGmailHistoryListResponse = (
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

export const parseGmailWatchResponse = (
  payload: unknown,
  mailboxId: string,
): GmailWatchResponse => {
  if (
    isRecord(payload) &&
    typeof payload.historyId === "string" &&
    typeof payload.expiration === "string" &&
    !Number.isNaN(Number.parseInt(payload.expiration, 10))
  ) {
    return {
      expiration: payload.expiration,
      historyId: payload.historyId,
    };
  }

  throw makeGmailProblem({
    code: "gmail_watch_response_invalid",
    detail: "Renewing the Gmail mailbox watch returned an invalid response body.",
    mailboxId,
    retryable: false,
    status: 502,
    title: "Gmail watch response invalid",
  });
};
