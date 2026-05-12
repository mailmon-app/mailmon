import type { GmailHttpClient } from "./http-client.js";
import {
  type GmailHistoryListResponse,
  type GmailHistoryRecord,
  type GmailMessageResponse,
  parseGmailHistoryListResponse,
} from "./parsers.js";
import {
  isGmailRateLimitedResponse,
  makeGmailProblem,
  makeGmailRateLimitedProblem,
} from "./problems.js";

export interface GmailHistoryDelta {
  readonly deletedMessageIds: ReadonlyArray<string>;
  readonly messages: ReadonlyArray<GmailMessageResponse>;
  readonly nextCursor: string;
}

interface GmailHistoryCompaction {
  readonly changedMessageIds: ReadonlyArray<string>;
  readonly deletedMessageIds: ReadonlyArray<string>;
}

const compactGmailHistoryRecords = (
  historyRecords: ReadonlyArray<GmailHistoryRecord>,
): GmailHistoryCompaction => {
  const changedMessageIds = new Set<string>();
  const deletedMessageIds = new Set<string>();

  for (const historyRecord of historyRecords) {
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

  return {
    changedMessageIds: [...changedMessageIds],
    deletedMessageIds: [...deletedMessageIds],
  };
};

const listGmailHistoryPages = async (params: {
  readonly accessToken: string;
  readonly cursor: string;
  readonly httpClient: GmailHttpClient;
  readonly mailboxId: string;
}): Promise<{
  readonly historyRecords: ReadonlyArray<GmailHistoryRecord>;
  readonly nextCursor: string;
}> => {
  const historyRecords: GmailHistoryRecord[] = [];
  let nextCursor = params.cursor;
  let pageToken: string | undefined;

  do {
    const { response, responseBody } = await params.httpClient.getJson({
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
      if (isGmailRateLimitedResponse(response.status, responseBody)) {
        throw makeGmailRateLimitedProblem({
          mailboxId: params.mailboxId,
          operation: "sync operations",
          status: response.status,
        });
      }

      throw makeGmailProblem({
        code: "gmail_history_fetch_failed",
        detail: `Fetching Gmail history failed with HTTP ${response.status}.`,
        mailboxId: params.mailboxId,
        retryable: response.status >= 500,
        status: response.status,
        title: "Gmail history fetch failed",
      });
    }

    const parsedResponse: GmailHistoryListResponse = parseGmailHistoryListResponse(
      responseBody,
      params.mailboxId,
    );

    nextCursor = parsedResponse.historyId;
    historyRecords.push(...(parsedResponse.history ?? []));
    pageToken = parsedResponse.nextPageToken;
  } while (pageToken !== undefined);

  return {
    historyRecords,
    nextCursor,
  };
};

export const listGmailHistoryDelta = async (params: {
  readonly accessToken: string;
  readonly cursor: string;
  readonly getMessage: (messageId: string) => Promise<GmailMessageResponse | null>;
  readonly httpClient: GmailHttpClient;
  readonly mailboxId: string;
}): Promise<GmailHistoryDelta> => {
  const pages = await listGmailHistoryPages({
    accessToken: params.accessToken,
    cursor: params.cursor,
    httpClient: params.httpClient,
    mailboxId: params.mailboxId,
  });
  const compaction = compactGmailHistoryRecords(pages.historyRecords);
  const messages = await Promise.all(
    compaction.changedMessageIds.map((messageId) => params.getMessage(messageId)),
  );

  return {
    deletedMessageIds: compaction.deletedMessageIds,
    messages: messages.filter((message): message is GmailMessageResponse => message !== null),
    nextCursor: pages.nextCursor,
  };
};
